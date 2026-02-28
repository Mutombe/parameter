"""Views for masterfile module."""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db.models import Sum, Count, Q, Prefetch
from .models import Landlord, Property, Unit, RentalTenant, LeaseAgreement, PropertyManager
from .serializers import (
    LandlordSerializer, PropertySerializer, PropertyListSerializer,
    UnitSerializer, RentalTenantSerializer, RentalTenantListSerializer,
    LeaseAgreementSerializer,
    LeaseActivateSerializer, LeaseTerminateSerializer, PropertyManagerSerializer
)
from .services import (
    send_lease_activation_emails, send_lease_termination_emails,
    get_landlord_summary, get_tenant_detail, get_tenant_ledger,
)
from apps.soft_delete import SoftDeleteMixin


class LandlordViewSet(SoftDeleteMixin, viewsets.ModelViewSet):
    """CRUD for Landlords."""
    queryset = Landlord.objects.annotate(
        _property_count=Count('properties')
    ).prefetch_related('properties', 'properties__units').all()
    serializer_class = LandlordSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['landlord_type', 'is_active', 'preferred_currency', 'payment_frequency', 'vat_registered']
    search_fields = ['code', 'name', 'email', 'phone', 'address', 'bank_name', 'tax_id']
    ordering_fields = ['name', 'created_at', 'commission_rate', 'code']
    ordering = ['-created_at']  # Default ordering

    @action(detail=True, methods=['get'])
    def statement(self, request, pk=None):
        """Get landlord statement summary."""
        landlord = self.get_object()
        summary = get_landlord_summary(landlord)
        return Response({
            'landlord': LandlordSerializer(landlord).data,
            'summary': summary,
        })


class PropertyViewSet(SoftDeleteMixin, viewsets.ModelViewSet):
    """CRUD for Properties."""
    queryset = Property.objects.select_related('landlord').prefetch_related(
        'units',
        Prefetch('managers', queryset=PropertyManager.objects.filter(is_primary=True).select_related('user'), to_attr='_primary_managers'),
        Prefetch('managers', queryset=PropertyManager.objects.select_related('user')),
    ).annotate(
        _unit_count=Count('units'),
        _vacant_units=Count('units', filter=Q(units__is_occupied=False)),
    ).all()
    permission_classes = [IsAuthenticated]
    filterset_fields = ['landlord', 'property_type', 'management_type', 'city', 'is_active', 'country']
    search_fields = ['code', 'name', 'address', 'city', 'suburb', 'landlord__name', 'landlord__code']
    ordering_fields = ['name', 'created_at', 'code', 'city', 'total_units', 'property_type']
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

        if property_obj.management_type == 'levy':
            return Response(
                {'error': 'Unit generation is not available for levy-managed properties'},
                status=status.HTTP_400_BAD_REQUEST
            )

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


class UnitViewSet(SoftDeleteMixin, viewsets.ModelViewSet):
    """CRUD for Units."""
    queryset = Unit.objects.select_related('property', 'property__landlord').prefetch_related(
        Prefetch('leases', queryset=LeaseAgreement.objects.filter(status='active').select_related('tenant'), to_attr='_active_leases'),
    ).all()
    serializer_class = UnitSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['property', 'property__landlord', 'unit_type', 'is_occupied', 'is_active', 'currency']
    search_fields = ['code', 'unit_number', 'property__name', 'property__code']
    ordering_fields = ['unit_number', 'rental_amount', 'created_at', 'floor', 'size_sqm']
    ordering = ['unit_number', 'id']

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


class RentalTenantViewSet(SoftDeleteMixin, viewsets.ModelViewSet):
    """CRUD for Rental Tenants."""
    permission_classes = [IsAuthenticated]
    filterset_fields = ['tenant_type', 'is_active', 'account_type', 'unit', 'unit__property', 'id_type']
    search_fields = ['code', 'name', 'email', 'phone', 'id_number', 'employer_name', 'occupation']
    ordering_fields = ['name', 'created_at', 'code', 'email']
    ordering = ['-created_at']

    def get_queryset(self):
        """Use lightweight queryset for list, full prefetch for detail, with lease_status filtering."""
        base = RentalTenant.objects.select_related('unit', 'unit__property').annotate(
            _lease_count=Count('leases'),
            _has_active_lease=Count('leases', filter=Q(leases__status='active')),
        )
        if self.action == 'list':
            queryset = base.prefetch_related('leases').all()
        else:
            queryset = base.prefetch_related(
                Prefetch('leases', queryset=LeaseAgreement.objects.filter(status='active').select_related('unit', 'unit__property'), to_attr='_active_leases'),
                'leases', 'leases__unit', 'leases__unit__property',
            ).all()

        # Filter by lease_status (active/inactive based on having active leases)
        lease_status = self.request.query_params.get('lease_status')
        if lease_status == 'active':
            queryset = queryset.filter(leases__status='active').distinct()
        elif lease_status == 'inactive':
            queryset = queryset.exclude(leases__status='active').distinct()

        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return RentalTenantListSerializer
        return RentalTenantSerializer

    @action(detail=True, methods=['get'])
    def detail_view(self, request, pk=None):
        """Get comprehensive tenant details including lease history and billing summary."""
        tenant = self.get_object()
        detail = get_tenant_detail(tenant)
        return Response({
            'tenant': RentalTenantSerializer(tenant).data,
            **detail,
        })

    @action(detail=True, methods=['get'])
    def ledger(self, request, pk=None):
        """Get tenant's financial ledger (invoices and receipts)."""
        tenant = self.get_object()
        ledger_data = get_tenant_ledger(tenant)
        return Response({
            'tenant': RentalTenantSerializer(tenant).data,
            **ledger_data,
        })


class LeaseAgreementViewSet(SoftDeleteMixin, viewsets.ModelViewSet):
    """CRUD for Lease Agreements."""
    queryset = LeaseAgreement.objects.select_related(
        'tenant', 'unit', 'unit__property', 'unit__property__landlord', 'created_by'
    ).all()
    serializer_class = LeaseAgreementSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ['tenant', 'unit', 'unit__property', 'status', 'lease_type', 'currency']
    search_fields = ['lease_number', 'tenant__name', 'tenant__code', 'unit__unit_number', 'unit__property__name']
    ordering_fields = ['start_date', 'end_date', 'created_at', 'monthly_rent', 'lease_number']
    ordering = ['-created_at']

    def create(self, request, *args, **kwargs):
        """Override create to add DEBUG logging."""
        import logging, traceback
        logger = logging.getLogger('lease.debug')
        logger.setLevel(logging.DEBUG)
        if not logger.handlers:
            handler = logging.StreamHandler()
            handler.setLevel(logging.DEBUG)
            logger.addHandler(handler)

        logger.debug("=" * 60)
        logger.debug("LEASE CREATE - RAW REQUEST")
        logger.debug(f"Content-Type: {request.content_type}")
        logger.debug(f"Request data: {dict(request.data)}")
        logger.debug(f"Request user: {request.user} (id={request.user.id})")
        logger.debug(f"Request FILES: {dict(request.FILES)}")

        serializer = self.get_serializer(data=request.data)
        logger.debug(f"Serializer initial_data: {serializer.initial_data}")

        is_valid = serializer.is_valid()
        logger.debug(f"Serializer is_valid: {is_valid}")
        if not is_valid:
            logger.debug(f"Serializer ERRORS: {serializer.errors}")
            logger.debug("=" * 60)
            from rest_framework.response import Response
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        logger.debug(f"Validated data: {serializer.validated_data}")

        try:
            self.perform_create(serializer)
            logger.debug(f"LEASE CREATED OK: {serializer.data.get('lease_number', 'unknown')}")
            logger.debug("=" * 60)
        except Exception as e:
            logger.error(f"LEASE CREATE EXCEPTION: {e}")
            logger.error(traceback.format_exc())
            logger.debug("=" * 60)
            raise

        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

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
        from django.core.exceptions import ValidationError as DjangoValidationError
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

        try:
            lease.activate()
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e.messages[0]) if e.messages else str(e)
            return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)

        send_lease_activation_emails(lease, request.user)
        return Response(LeaseAgreementSerializer(lease).data)

    @action(detail=True, methods=['post'])
    def terminate(self, request, pk=None):
        """Terminate a lease agreement."""
        from django.core.exceptions import ValidationError as DjangoValidationError
        lease = self.get_object()
        serializer = LeaseTerminateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if lease.status != LeaseAgreement.Status.ACTIVE:
            return Response(
                {'error': 'Only active leases can be terminated'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reason = serializer.validated_data['reason']
        try:
            lease.terminate(reason)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e.messages[0]) if e.messages else str(e)
            return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)

        send_lease_termination_emails(lease, reason, request.user)
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
    filterset_fields = ['property', 'property__landlord', 'user', 'is_primary']
    search_fields = ['user__first_name', 'user__last_name', 'user__email', 'property__name', 'property__code']
    ordering_fields = ['assigned_at', 'is_primary', 'property__name']
    ordering = ['-is_primary', 'assigned_at']

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)
