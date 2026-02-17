"""Views for masterfile module."""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db.models import Sum, Count, Q
from .models import Landlord, Property, Unit, RentalTenant, LeaseAgreement, PropertyManager
from .serializers import (
    LandlordSerializer, PropertySerializer, PropertyListSerializer,
    UnitSerializer, RentalTenantSerializer, RentalTenantListSerializer,
    LeaseAgreementSerializer,
    LeaseActivateSerializer, LeaseTerminateSerializer, PropertyManagerSerializer
)


class LandlordViewSet(viewsets.ModelViewSet):
    """CRUD for Landlords."""
    queryset = Landlord.objects.prefetch_related('properties', 'properties__units').all()
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

        # Use prefetched properties data, then collect units in Python
        properties = list(landlord.properties.all())
        all_units = []
        for prop in properties:
            all_units.extend(list(prop.units.all()))
        total_units = len(all_units)
        occupied_units = sum(1 for u in all_units if u.is_occupied)

        return Response({
            'landlord': LandlordSerializer(landlord).data,
            'summary': {
                'total_properties': len(properties),
                'total_units': total_units,
                'occupied_units': occupied_units,
                'vacant_units': total_units - occupied_units,
                'occupancy_rate': (occupied_units / total_units * 100) if total_units else 0
            }
        })


class PropertyViewSet(viewsets.ModelViewSet):
    """CRUD for Properties."""
    queryset = Property.objects.select_related('landlord').prefetch_related('units', 'managers__user').all()
    permission_classes = [IsAuthenticated]
    filterset_fields = ['landlord', 'property_type', 'city', 'is_active']
    search_fields = ['code', 'name', 'address', 'city']
    ordering_fields = ['name', 'created_at']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return PropertyListSerializer
        return PropertySerializer

    def list(self, request, *args, **kwargs):
        """Override list to add debugging."""
        import logging
        from django.db import connection
        logger = logging.getLogger(__name__)

        # Log tenant info
        logger.info(f"PropertyViewSet.list - Schema: {connection.schema_name}, User: {request.user}")
        logger.info(f"Property count in current schema: {Property.objects.count()}")

        response = super().list(request, *args, **kwargs)
        logger.info(f"Response data count: {len(response.data.get('results', response.data) if isinstance(response.data, dict) else response.data)}")
        return response

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
    queryset = Unit.objects.select_related('property', 'property__landlord').prefetch_related('leases', 'leases__tenant').all()
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
    permission_classes = [IsAuthenticated]
    filterset_fields = ['tenant_type', 'is_active']
    search_fields = ['code', 'name', 'email', 'phone', 'id_number']
    ordering_fields = ['name', 'created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        """Use lightweight queryset for list, full prefetch for detail."""
        base = RentalTenant.objects.select_related('unit', 'unit__property')
        if self.action == 'list':
            # List view: only prefetch leases (for has_active_lease), skip invoices/receipts
            return base.prefetch_related('leases').all()
        # Detail/retrieve: full prefetch
        return base.prefetch_related(
            'leases', 'leases__unit', 'leases__unit__property', 'invoices', 'receipts'
        ).all()

    def get_serializer_class(self):
        if self.action == 'list':
            return RentalTenantListSerializer
        return RentalTenantSerializer

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
        from apps.billing.serializers import InvoiceSerializer, ReceiptSerializer

        # Use prefetched data - filter/sort in Python to avoid new DB queries
        # that lose django-tenants schema context
        all_leases = sorted(tenant.leases.all(), key=lambda l: l.start_date, reverse=True)
        active_leases = [l for l in all_leases if l.status == 'active']
        past_leases = [l for l in all_leases if l.status != 'active']

        # Use prefetched invoices and receipts - aggregate in Python
        all_invoices = sorted(tenant.invoices.all(), key=lambda i: i.date, reverse=True)
        all_receipts = sorted(tenant.receipts.all(), key=lambda r: r.date, reverse=True)

        total_invoiced = sum(inv.total_amount or 0 for inv in all_invoices)
        total_paid = sum(r.amount or 0 for r in all_receipts)
        overdue = sum(inv.total_amount or 0 for inv in all_invoices if inv.status == 'overdue')

        return Response({
            'tenant': RentalTenantSerializer(tenant).data,
            'active_leases': [{
                'id': l.id,
                'lease_number': l.lease_number,
                'unit': str(l.unit),
                'property': l.unit.property.name if l.unit and l.unit.property else '-',
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
                'property': l.unit.property.name if l.unit and l.unit.property else '-',
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
                'invoice_count': len(all_invoices),
                'receipt_count': len(all_receipts),
            },
            'recent_invoices': InvoiceSerializer(all_invoices[:5], many=True).data,
            'recent_receipts': ReceiptSerializer(all_receipts[:5], many=True).data,
        })

    @action(detail=True, methods=['get'])
    def ledger(self, request, pk=None):
        """Get tenant's financial ledger (invoices and receipts)."""
        tenant = self.get_object()

        # Import here to avoid circular imports
        from apps.billing.serializers import InvoiceSerializer, ReceiptSerializer

        # Use prefetched data - aggregate in Python to avoid schema context loss
        all_invoices = sorted(tenant.invoices.all(), key=lambda i: i.date, reverse=True)
        all_receipts = sorted(tenant.receipts.all(), key=lambda r: r.date, reverse=True)

        total_invoiced = sum(inv.total_amount or 0 for inv in all_invoices)
        total_paid = sum(r.amount or 0 for r in all_receipts)

        return Response({
            'tenant': RentalTenantSerializer(tenant).data,
            'invoices': InvoiceSerializer(all_invoices, many=True).data,
            'receipts': ReceiptSerializer(all_receipts, many=True).data,
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
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ['tenant', 'unit', 'status']
    search_fields = ['lease_number', 'tenant__name', 'unit__unit_number']
    ordering_fields = ['start_date', 'end_date', 'created_at']
    ordering = ['-created_at']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='upload_document')
    def upload_document(self, request, pk=None):
        """Upload or replace a lease document."""
        lease = self.get_object()
        document = request.FILES.get('document')

        if not document:
            return Response(
                {'error': 'No document file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate file size (10MB max)
        if document.size > 10 * 1024 * 1024:
            return Response(
                {'error': 'File size must be under 10MB'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate file type
        allowed_types = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ]
        if document.content_type not in allowed_types:
            return Response(
                {'error': 'Only PDF and Word documents are allowed'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Delete old document if replacing
        if lease.document:
            lease.document.delete(save=False)

        lease.document = document
        lease.save(update_fields=['document'])

        serializer = self.get_serializer(lease)
        return Response(serializer.data)

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

        # Email tenant about lease activation
        try:
            from apps.notifications.utils import send_tenant_email
            send_tenant_email(
                lease.tenant,
                f'Lease Activated - {lease.lease_number}',
                f"""Dear {lease.tenant.name},

Your lease agreement has been activated.

Lease Details:
- Lease Number: {lease.lease_number}
- Unit: {lease.unit.unit_number}
- Start Date: {lease.start_date}
- End Date: {lease.end_date}
- Monthly Rent: {lease.currency} {lease.monthly_rent:,.2f}

Welcome to your new home! If you have any questions, please contact your property management office.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
            )
        except Exception:
            pass

        # Email staff about lease activation
        try:
            from apps.notifications.utils import send_staff_email
            send_staff_email(
                f'Lease Activated: {lease.tenant.name} - {lease.unit.unit_number}',
                f"""A lease has been activated.

Lease Details:
- Lease Number: {lease.lease_number}
- Tenant: {lease.tenant.name}
- Unit: {lease.unit.unit_number}
- Property: {lease.unit.property.name if lease.unit.property else 'N/A'}
- Monthly Rent: {lease.currency} {lease.monthly_rent:,.2f}
- Period: {lease.start_date} to {lease.end_date}
- Activated By: {request.user.get_full_name() or request.user.email}

Best regards,
Parameter System
"""
            )
        except Exception:
            pass

        # Email landlord about new tenant
        try:
            from apps.notifications.utils import send_landlord_email
            landlord = lease.unit.property.landlord if lease.unit.property else None
            if landlord:
                send_landlord_email(
                    landlord,
                    f'New Tenant Moved In - {lease.unit.unit_number}',
                    f"""Dear {landlord.name},

A new tenant has moved into your property.

Details:
- Property: {lease.unit.property.name}
- Unit: {lease.unit.unit_number}
- Tenant: {lease.tenant.name}
- Monthly Rent: {lease.currency} {lease.monthly_rent:,.2f}
- Lease Period: {lease.start_date} to {lease.end_date}

Best regards,
Property Management
Powered by Parameter.co.zw
"""
                )
        except Exception:
            pass

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

        # Email tenant about lease termination
        try:
            from apps.notifications.utils import send_tenant_email
            send_tenant_email(
                lease.tenant,
                f'Lease Terminated - {lease.lease_number}',
                f"""Dear {lease.tenant.name},

Your lease agreement has been terminated.

Lease Details:
- Lease Number: {lease.lease_number}
- Unit: {lease.unit.unit_number}
- Termination Reason: {serializer.validated_data['reason']}

Please contact your property management office for any outstanding matters or questions regarding your move-out process.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
            )
        except Exception:
            pass

        # Email staff about lease termination
        try:
            from apps.notifications.utils import send_staff_email
            send_staff_email(
                f'Lease Terminated: {lease.tenant.name} - {lease.unit.unit_number}',
                f"""A lease has been terminated.

Lease Details:
- Lease Number: {lease.lease_number}
- Tenant: {lease.tenant.name}
- Unit: {lease.unit.unit_number}
- Property: {lease.unit.property.name if lease.unit.property else 'N/A'}
- Reason: {serializer.validated_data['reason']}
- Terminated By: {request.user.get_full_name() or request.user.email}

The unit is now vacant.

Best regards,
Parameter System
"""
            )
        except Exception:
            pass

        # Email landlord about vacancy
        try:
            from apps.notifications.utils import send_landlord_email
            landlord = lease.unit.property.landlord if lease.unit.property else None
            if landlord:
                send_landlord_email(
                    landlord,
                    f'Unit Vacated - {lease.unit.unit_number}',
                    f"""Dear {landlord.name},

A tenant has vacated a unit in your property.

Details:
- Property: {lease.unit.property.name}
- Unit: {lease.unit.unit_number}
- Former Tenant: {lease.tenant.name}
- Termination Reason: {serializer.validated_data['reason']}

The unit is now vacant and available for re-letting.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
                )
        except Exception:
            pass

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


class PropertyManagerViewSet(viewsets.ModelViewSet):
    """CRUD for Property Manager assignments."""
    queryset = PropertyManager.objects.select_related(
        'user', 'property', 'assigned_by'
    ).all()
    serializer_class = PropertyManagerSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['property', 'user', 'is_primary']
    search_fields = ['user__first_name', 'user__last_name', 'user__email', 'property__name']
    ordering = ['-is_primary', 'assigned_at']

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)
