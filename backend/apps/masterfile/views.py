"""Views for masterfile module."""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q
from .models import Landlord, Property, Unit, RentalTenant, LeaseAgreement
from .serializers import (
    LandlordSerializer, PropertySerializer, PropertyListSerializer,
    UnitSerializer, RentalTenantSerializer, LeaseAgreementSerializer,
    LeaseActivateSerializer, LeaseTerminateSerializer
)


class LandlordViewSet(viewsets.ModelViewSet):
    """CRUD for Landlords."""
    queryset = Landlord.objects.prefetch_related('properties').all()
    serializer_class = LandlordSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['landlord_type', 'is_active', 'preferred_currency']
    search_fields = ['code', 'name', 'email', 'phone']
    ordering_fields = ['name', 'created_at']
    ordering = ['-created_at']  # Default ordering

    @action(detail=True, methods=['get'])
    def statement(self, request, pk=None):
        """Get landlord statement summary."""
        landlord = self.get_object()

        # Get all properties and units
        properties = landlord.properties.all()
        total_units = Unit.objects.filter(property__landlord=landlord).count()
        occupied_units = Unit.objects.filter(
            property__landlord=landlord, is_occupied=True
        ).count()

        return Response({
            'landlord': LandlordSerializer(landlord).data,
            'summary': {
                'total_properties': properties.count(),
                'total_units': total_units,
                'occupied_units': occupied_units,
                'vacant_units': total_units - occupied_units,
                'occupancy_rate': (occupied_units / total_units * 100) if total_units else 0
            }
        })


class PropertyViewSet(viewsets.ModelViewSet):
    """CRUD for Properties."""
    queryset = Property.objects.select_related('landlord').prefetch_related('units').all()
    permission_classes = [IsAuthenticated]
    filterset_fields = ['landlord', 'property_type', 'city', 'is_active']
    search_fields = ['code', 'name', 'address', 'city']
    ordering_fields = ['name', 'created_at']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return PropertyListSerializer
        return PropertySerializer

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get property statistics."""
        total = self.get_queryset().count()
        by_type = self.get_queryset().values('property_type').annotate(
            count=Count('id')
        )

        total_units = Unit.objects.count()
        vacant_units = Unit.objects.filter(is_occupied=False).count()

        return Response({
            'total_properties': total,
            'by_type': list(by_type),
            'total_units': total_units,
            'vacant_units': vacant_units,
            'overall_vacancy_rate': (vacant_units / total_units * 100) if total_units else 0
        })


class UnitViewSet(viewsets.ModelViewSet):
    """CRUD for Units."""
    queryset = Unit.objects.select_related('property', 'property__landlord').all()
    serializer_class = UnitSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['property', 'unit_type', 'is_occupied', 'is_active', 'currency']
    search_fields = ['code', 'unit_number']
    ordering_fields = ['unit_number', 'rental_amount']
    ordering = ['unit_number']

    @action(detail=False, methods=['get'])
    def vacant(self, request):
        """Get all vacant units."""
        vacant_units = self.get_queryset().filter(is_occupied=False, is_active=True)
        serializer = self.get_serializer(vacant_units, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_property(self, request):
        """Get units grouped by property."""
        property_id = request.query_params.get('property')
        if not property_id:
            return Response(
                {'error': 'property parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        units = self.get_queryset().filter(property_id=property_id)
        serializer = self.get_serializer(units, many=True)
        return Response(serializer.data)


class RentalTenantViewSet(viewsets.ModelViewSet):
    """CRUD for Rental Tenants."""
    queryset = RentalTenant.objects.prefetch_related('leases', 'invoices').all()
    serializer_class = RentalTenantSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['tenant_type', 'is_active']
    search_fields = ['code', 'name', 'email', 'phone', 'id_number']
    ordering_fields = ['name', 'created_at']
    ordering = ['-created_at']

    @action(detail=True, methods=['get'])
    def ledger(self, request, pk=None):
        """Get tenant's financial ledger (invoices and receipts)."""
        tenant = self.get_object()

        # Import here to avoid circular imports
        from apps.billing.models import Invoice, Receipt
        from apps.billing.serializers import InvoiceSerializer, ReceiptSerializer

        invoices = Invoice.objects.filter(tenant=tenant).order_by('-date')
        receipts = Receipt.objects.filter(tenant=tenant).order_by('-date')

        total_invoiced = invoices.aggregate(Sum('amount'))['amount__sum'] or 0
        total_paid = receipts.aggregate(Sum('amount'))['amount__sum'] or 0

        return Response({
            'tenant': RentalTenantSerializer(tenant).data,
            'invoices': InvoiceSerializer(invoices, many=True).data,
            'receipts': ReceiptSerializer(receipts, many=True).data,
            'summary': {
                'total_invoiced': total_invoiced,
                'total_paid': total_paid,
                'balance_due': total_invoiced - total_paid
            }
        })


class LeaseAgreementViewSet(viewsets.ModelViewSet):
    """CRUD for Lease Agreements."""
    queryset = LeaseAgreement.objects.select_related(
        'tenant', 'unit', 'unit__property', 'created_by'
    ).all()
    serializer_class = LeaseAgreementSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['tenant', 'unit', 'status']
    search_fields = ['lease_number', 'tenant__name', 'unit__unit_number']
    ordering_fields = ['start_date', 'end_date', 'created_at']
    ordering = ['-created_at']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Activate a lease agreement."""
        lease = self.get_object()

        if lease.status != LeaseAgreement.Status.DRAFT:
            return Response(
                {'error': 'Only draft leases can be activated'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if unit is already occupied
        if lease.unit.is_occupied:
            return Response(
                {'error': 'Unit is already occupied'},
                status=status.HTTP_400_BAD_REQUEST
            )

        lease.activate()

        return Response(LeaseAgreementSerializer(lease).data)

    @action(detail=True, methods=['post'])
    def terminate(self, request, pk=None):
        """Terminate a lease agreement."""
        lease = self.get_object()
        serializer = LeaseTerminateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if lease.status != LeaseAgreement.Status.ACTIVE:
            return Response(
                {'error': 'Only active leases can be terminated'},
                status=status.HTTP_400_BAD_REQUEST
            )

        lease.terminate(serializer.validated_data['reason'])

        return Response(LeaseAgreementSerializer(lease).data)

    @action(detail=False, methods=['get'])
    def expiring_soon(self, request):
        """Get leases expiring in the next 30 days."""
        from django.utils import timezone
        from datetime import timedelta

        today = timezone.now().date()
        end_date = today + timedelta(days=30)

        leases = self.get_queryset().filter(
            status='active',
            end_date__gte=today,
            end_date__lte=end_date
        )

        serializer = self.get_serializer(leases, many=True)
        return Response(serializer.data)
