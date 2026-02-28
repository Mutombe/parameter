"""Views for maintenance module."""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db.models import Count, Q
from .models import MaintenanceRequest, WorkOrder
from .serializers import (
    MaintenanceRequestSerializer, MaintenanceRequestListSerializer,
    WorkOrderSerializer,
)
from apps.soft_delete import SoftDeleteMixin
from apps.accounts.mixins import TenantSchemaValidationMixin


class MaintenanceRequestViewSet(TenantSchemaValidationMixin, SoftDeleteMixin, viewsets.ModelViewSet):
    """CRUD for Maintenance Requests."""
    queryset = MaintenanceRequest.objects.select_related(
        'property', 'unit', 'reported_by'
    ).prefetch_related('work_orders').all()
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ['property', 'unit', 'priority', 'status']
    search_fields = ['title', 'description', 'property__name', 'unit__unit_number']
    ordering_fields = ['created_at', 'priority', 'status']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return MaintenanceRequestListSerializer
        return MaintenanceRequestSerializer

    def perform_create(self, serializer):
        serializer.save(reported_by=self.request.user)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get maintenance request summary statistics."""
        qs = self.get_queryset()
        by_status = dict(
            qs.values_list('status').annotate(count=Count('id')).values_list('status', 'count')
        )
        by_priority = dict(
            qs.values_list('priority').annotate(count=Count('id')).values_list('priority', 'count')
        )
        return Response({
            'total': qs.count(),
            'by_status': by_status,
            'by_priority': by_priority,
        })


class WorkOrderViewSet(TenantSchemaValidationMixin, SoftDeleteMixin, viewsets.ModelViewSet):
    """CRUD for Work Orders."""
    queryset = WorkOrder.objects.select_related(
        'request', 'request__property', 'assigned_to'
    ).all()
    serializer_class = WorkOrderSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['request', 'status', 'assigned_to']
    search_fields = ['vendor_name', 'notes', 'request__title']
    ordering_fields = ['created_at', 'scheduled_date', 'status']
    ordering = ['-created_at']

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark a work order as completed and optionally update the parent request."""
        work_order = self.get_object()
        work_order.status = WorkOrder.Status.COMPLETED
        work_order.completed_date = request.data.get(
            'completed_date',
            __import__('datetime').date.today()
        )
        if 'actual_cost' in request.data:
            from decimal import Decimal
            work_order.actual_cost = Decimal(str(request.data['actual_cost']))
        work_order.save()

        # If all work orders are completed, mark the request as completed
        maintenance_request = work_order.request
        all_completed = not maintenance_request.work_orders.exclude(
            status=WorkOrder.Status.COMPLETED
        ).exclude(status=WorkOrder.Status.CANCELLED).exists()

        if all_completed:
            maintenance_request.status = MaintenanceRequest.Status.COMPLETED
            maintenance_request.save(update_fields=['status', 'updated_at'])

        return Response(WorkOrderSerializer(work_order).data)
