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

    @action(detail=True, methods=['get'])
    def preview_units(self, request, pk=None):
        """Preview what units would be generated from the unit_definition."""
        property_obj = self.get_object()

        if not property_obj.unit_definition:
            return Response(
                {'error': 'No unit definition set for this property'},
                status=status.HTTP_400_BAD_REQUEST
            )

        valid_units = property_obj.get_valid_units()
        existing_units = list(property_obj.units.values_list('unit_number', flat=True))

        # Determine which units would be created vs already exist
        to_create = [u for u in valid_units if u not in existing_units]
        already_exist = [u for u in valid_units if u in existing_units]

        return Response({
            'unit_definition': property_obj.unit_definition,
            'total_defined': len(valid_units),
            'valid_units': valid_units[:100],  # Limit preview to 100
            'to_create': to_create[:100],
            'already_exist': already_exist,
            'create_count': len(to_create),
            'existing_count': len(already_exist),
        })

    @action(detail=True, methods=['post'])
    def generate_units(self, request, pk=None):
        """Generate Unit records from the unit_definition."""
        property_obj = self.get_object()

        if not property_obj.unit_definition:
            return Response(
                {'error': 'No unit definition set for this property'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get optional parameters from request
        default_rent = request.data.get('default_rent', 0)
        currency = request.data.get('currency', 'USD')
        unit_type = request.data.get('unit_type', 'residential')

        try:
            from decimal import Decimal
            default_rent = Decimal(str(default_rent))
        except (ValueError, TypeError):
            default_rent = Decimal('0')

        # Generate units
        created_units = property_obj.generate_units_from_definition(
            default_rent=default_rent,
            currency=currency,
            unit_type=unit_type
        )

        return Response({
            'message': f'Successfully created {len(created_units)} units',
            'created_count': len(created_units),
            'units': UnitSerializer(created_units, many=True).data
        }, status=status.HTTP_201_CREATED)


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

    def get_queryset(self):
        """Enhanced queryset with lease_status filtering."""
        queryset = super().get_queryset()

        # Filter by lease_status (active/inactive based on having active leases)
        lease_status = self.request.query_params.get('lease_status')
        if lease_status == 'active':
            # Tenants with at least one active lease
            queryset = queryset.filter(leases__status='active').distinct()
        elif lease_status == 'inactive':
            # Tenants without any active lease
            queryset = queryset.exclude(leases__status='active').distinct()

        return queryset

    @action(detail=True, methods=['get'])
    def detail_view(self, request, pk=None):
        """Get comprehensive tenant details including lease history and billing summary."""
        tenant = self.get_object()

        # Import here to avoid circular imports
        from apps.billing.models import Invoice, Receipt
        from apps.billing.serializers import InvoiceSerializer, ReceiptSerializer

        # Get all leases (not just active)
        all_leases = tenant.leases.select_related('unit', 'unit__property').order_by('-start_date')
        active_leases = all_leases.filter(status='active')
        past_leases = all_leases.exclude(status='active')

        # Get billing summary
        invoices = Invoice.objects.filter(tenant=tenant).order_by('-date')
        receipts = Receipt.objects.filter(tenant=tenant).order_by('-date')

        total_invoiced = invoices.aggregate(Sum('amount'))['amount__sum'] or 0
        total_paid = receipts.aggregate(Sum('amount'))['amount__sum'] or 0
        overdue = invoices.filter(status='overdue').aggregate(Sum('amount'))['amount__sum'] or 0

        return Response({
            'tenant': RentalTenantSerializer(tenant).data,
            'active_leases': [{
                'id': l.id,
                'lease_number': l.lease_number,
                'unit': str(l.unit),
                'property': l.unit.property.name,
                'monthly_rent': str(l.monthly_rent),
                'currency': l.currency,
                'start_date': l.start_date,
                'end_date': l.end_date,
                'status': l.status,
            } for l in active_leases],
            'lease_history': [{
                'id': l.id,
                'lease_number': l.lease_number,
                'unit': str(l.unit),
                'property': l.unit.property.name,
                'monthly_rent': str(l.monthly_rent),
                'start_date': l.start_date,
                'end_date': l.end_date,
                'status': l.status,
                'termination_reason': l.termination_reason,
            } for l in past_leases],
            'billing_summary': {
                'total_invoiced': total_invoiced,
                'total_paid': total_paid,
                'balance_due': total_invoiced - total_paid,
                'overdue_amount': overdue,
                'invoice_count': invoices.count(),
                'receipt_count': receipts.count(),
            },
            'recent_invoices': InvoiceSerializer(invoices[:5], many=True).data,
            'recent_receipts': ReceiptSerializer(receipts[:5], many=True).data,
        })

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
