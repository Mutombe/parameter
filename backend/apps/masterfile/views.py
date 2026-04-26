"""Views for masterfile module."""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db import transaction
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
from apps.accounts.mixins import TenantSchemaValidationMixin


class LandlordViewSet(TenantSchemaValidationMixin, SoftDeleteMixin, viewsets.ModelViewSet):
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


class PropertyViewSet(TenantSchemaValidationMixin, SoftDeleteMixin, viewsets.ModelViewSet):
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


class UnitViewSet(TenantSchemaValidationMixin, SoftDeleteMixin, viewsets.ModelViewSet):
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


class RentalTenantViewSet(TenantSchemaValidationMixin, SoftDeleteMixin, viewsets.ModelViewSet):
    """CRUD for Rental Tenants."""
    permission_classes = [IsAuthenticated]
    filterset_fields = ['tenant_type', 'is_active', 'account_type', 'unit', 'unit__property', 'id_type']
    search_fields = ['code', 'name', 'email', 'phone', 'id_number', 'employer_name', 'occupation']
    ordering_fields = ['name', 'created_at', 'code', 'email']
    ordering = ['-created_at']

    def get_queryset(self):
        """Use lightweight queryset for list, full prefetch for detail, with lease_status filtering."""
        base = RentalTenant.objects.select_related(
            'unit', 'unit__property', 'unit__property__landlord'
        ).annotate(
            _lease_count=Count('leases'),
            _has_active_lease=Count('leases', filter=Q(leases__status='active')),
        )
        active_lease_prefetch = Prefetch(
            'leases',
            queryset=LeaseAgreement.objects.filter(status='active').select_related(
                'unit', 'unit__property', 'unit__property__landlord',
                'property', 'property__landlord',
            ),
            to_attr='_active_leases_list',
        )
        if self.action == 'list':
            queryset = base.prefetch_related(active_lease_prefetch).all()
        else:
            queryset = base.prefetch_related(
                active_lease_prefetch,
                'leases', 'leases__unit', 'leases__unit__property',
                'leases__unit__property__landlord',
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
        """Get tenant's financial ledger with optional date range."""
        tenant = self.get_object()
        period_start = request.query_params.get('period_start')
        period_end = request.query_params.get('period_end')
        ledger_data = get_tenant_ledger(tenant, period_start=period_start, period_end=period_end)
        return Response({
            'tenant': RentalTenantSerializer(tenant).data,
            **ledger_data,
        })

    @action(detail=True, methods=['get'], url_path='export_statement')
    def export_statement(self, request, pk=None):
        """Download tenant's statement as CSV or PDF — bank-statement style."""
        import csv
        import logging
        import traceback
        from django.http import HttpResponse
        from django.utils import timezone

        try:
            tenant = self.get_object()
            period_start = request.query_params.get('period_start') or ''
            period_end = request.query_params.get('period_end') or ''
            export_format = (request.query_params.get('format') or 'csv').lower()
            ledger = get_tenant_ledger(
                tenant,
                period_start=period_start or None,
                period_end=period_end or None,
            )

            period_label = (
                f'{period_start}_to_{period_end}'
                if period_start and period_end
                else timezone.now().strftime('%Y-%m-%d')
            )
            base_filename = f'{tenant.code}_statement_{period_label}'.replace('/', '-')

            if export_format == 'pdf':
                from apps.accounting.pdf_utils import render_pdf
                entries = []
                for e in ledger['entries']:
                    entries.append({
                        'date': e['date'],
                        'type': e['type'],
                        'reference': e.get('reference') or '',
                        'description': e.get('description') or '',
                        'debit': f'{e["debit"]:.2f}' if e['debit'] else '',
                        'credit': f'{e["credit"]:.2f}' if e['credit'] else '',
                        'balance': f'{e.get("balance", 0):.2f}',
                    })
                context = {
                    'tenant': tenant,
                    'period_start': period_start or '',
                    'period_end': period_end or '',
                    'opening_balance': f'{ledger["opening_balance"]:.2f}',
                    'entries': entries,
                    'total_debits': f'{ledger["total_debits"]:.2f}',
                    'total_credits': f'{ledger["total_credits"]:.2f}',
                    'closing_balance': f'{ledger["closing_balance"]:.2f}',
                    'generated_at': timezone.now().strftime('%Y-%m-%d %H:%M'),
                }
                return render_pdf('pdf/tenant_statement.html', context, f'{base_filename}.pdf')

            # CSV (default)
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="{base_filename}.csv"'
            writer = csv.writer(response)
            writer.writerow(['TENANT STATEMENT'])
            writer.writerow([f'Tenant: {tenant.code} - {tenant.name}'])
            if period_start or period_end:
                writer.writerow([f'Period: {period_start or "—"} to {period_end or "—"}'])
            writer.writerow([f'Generated: {timezone.now().strftime("%Y-%m-%d %H:%M")}'])
            writer.writerow([])

            writer.writerow(['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'])
            writer.writerow(['', '', '', 'Balance brought forward', '', '',
                             f'{ledger["opening_balance"]:.2f}'])

            for e in ledger['entries']:
                writer.writerow([
                    e['date'],
                    e['type'],
                    e['reference'] or '',
                    e['description'] or '',
                    f'{e["debit"]:.2f}' if e['debit'] else '',
                    f'{e["credit"]:.2f}' if e['credit'] else '',
                    f'{e.get("balance", 0):.2f}',
                ])

            writer.writerow([])
            writer.writerow(['', '', '', 'Totals',
                             f'{ledger["total_debits"]:.2f}',
                             f'{ledger["total_credits"]:.2f}',
                             f'{ledger["closing_balance"]:.2f}'])
            return response
        except Exception as e:
            logging.getLogger(__name__).error(
                f'export_statement failed for tenant {pk}: {e}', exc_info=True
            )
            return Response(
                {
                    'error': f'{type(e).__name__}: {e}',
                    'traceback': traceback.format_exc().splitlines()[-6:],
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class AccountHolderViewSet(RentalTenantViewSet):
    """CRUD for Account Holders — levy-side payers.

    Backed by the same RentalTenant table as tenants, but locked to
    account_type='levy'. Account holders pay levies, special levies,
    rates, maintenance, and parking (vs. tenants who pay rent + extras).
    """

    def get_queryset(self):
        return super().get_queryset().filter(account_type='levy')

    def perform_create(self, serializer):
        serializer.save(account_type='levy')


class LeaseAgreementViewSet(TenantSchemaValidationMixin, SoftDeleteMixin, viewsets.ModelViewSet):
    """CRUD for Lease Agreements."""
    queryset = LeaseAgreement.objects.select_related(
        'tenant', 'unit', 'unit__property', 'property'
    ).all()
    serializer_class = LeaseAgreementSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ['tenant', 'unit', 'unit__property', 'status', 'lease_type', 'currency', 'property']
    search_fields = ['lease_number', 'tenant__name', 'tenant__code']
    ordering_fields = ['start_date', 'end_date', 'created_at', 'monthly_rent', 'lease_number']
    ordering = ['-created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        # Only add heavy joins for detail view
        if self.action == 'retrieve':
            qs = qs.select_related(
                'unit__property__landlord', 'property__landlord', 'created_by'
            )
        # Property filter for PropertyDetail billing
        prop = self.request.query_params.get('property')
        if prop:
            qs = qs.filter(Q(unit__property_id=prop) | Q(property_id=prop))
        # Landlord filter
        landlord = self.request.query_params.get('landlord')
        if landlord:
            qs = qs.filter(Q(unit__property__landlord_id=landlord) | Q(property__landlord_id=landlord))
        return qs

    def create(self, request, *args, **kwargs):
        """Override create to catch unexpected exceptions and return JSON."""
        import logging, traceback
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            self.perform_create(serializer)
        except Exception as e:
            logging.getLogger(__name__).error(f"Lease create error: {e}", exc_info=True)
            return Response(
                {'error': f'{type(e).__name__}: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        """Create the lease as ACTIVE and mark its unit occupied.

        New leases default to active per business rule — edits can change the
        status later. Wrapped in a transaction so the 1:1 active-lease
        constraints validated in LeaseAgreement.save() roll back the unit
        occupancy update if they fail.
        """
        from django.db import transaction
        with transaction.atomic():
            instance = serializer.save(
                created_by=self.request.user,
                status=LeaseAgreement.Status.ACTIVE,
            )
            if instance.unit and instance.lease_type != LeaseAgreement.LeaseType.LEVY:
                if not instance.unit.is_occupied:
                    instance.unit.is_occupied = True
                    instance.unit.save(update_fields=['is_occupied'])

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

        # Check if unit is already occupied (skip for levy leases — they don't occupy units)
        if lease.lease_type != 'levy' and lease.unit and lease.unit.is_occupied:
            return Response(
                {'error': 'Unit is already occupied'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            lease.activate()
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e.messages[0]) if e.messages else str(e)
            return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import logging, traceback
            logging.getLogger(__name__).exception(f'[LEASE ACTIVATE] Failed: {e}')
            return Response({'error': f'{type(e).__name__}: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            send_lease_activation_emails(lease, request.user)
        except Exception:
            pass  # Don't fail activation because of email

        return Response(LeaseAgreementSerializer(lease).data)

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def bulk_activate(self, request):
        """Activate all draft leases for a given property."""
        property_id = request.data.get('property_id')
        lease_ids = request.data.get('lease_ids', [])

        if not property_id and not lease_ids:
            return Response(
                {'error': 'Provide property_id or lease_ids'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.db.models import Q
        leases = LeaseAgreement.objects.filter(status=LeaseAgreement.Status.DRAFT)
        if property_id:
            leases = leases.filter(
                Q(unit__property_id=property_id) | Q(property_id=property_id)
            )
        if lease_ids:
            leases = leases.filter(id__in=lease_ids)

        activated = []
        errors = []
        for lease in leases:
            try:
                lease.activate()
                activated.append(lease.lease_number)
            except Exception as e:
                errors.append(f'{lease.lease_number}: {str(e)}')

        return Response({
            'activated': len(activated),
            'activated_leases': activated,
            'errors': errors,
        })

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

    @action(detail=False, methods=['post'])
    def bulk_rent_adjustment(self, request):
        """Bulk adjust monthly rent for multiple leases."""
        from django.db import transaction
        from decimal import Decimal

        lease_ids = request.data.get('lease_ids', [])
        adjustment_type = request.data.get('adjustment_type')  # 'percentage' or 'fixed'
        value = request.data.get('value')

        if not lease_ids or not adjustment_type or value is None:
            return Response(
                {'error': 'lease_ids, adjustment_type, and value are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if adjustment_type not in ('percentage', 'fixed'):
            return Response(
                {'error': 'adjustment_type must be "percentage" or "fixed"'},
                status=status.HTTP_400_BAD_REQUEST
            )

        value = Decimal(str(value))
        updated = []
        errors = []

        with transaction.atomic():
            leases = LeaseAgreement.objects.filter(
                id__in=lease_ids, status='active'
            ).select_for_update()

            for lease in leases:
                try:
                    old_rent = lease.monthly_rent
                    if adjustment_type == 'percentage':
                        lease.monthly_rent = old_rent * (1 + value / 100)
                    else:
                        lease.monthly_rent = old_rent + value
                    lease.save(update_fields=['monthly_rent', 'updated_at'])
                    updated.append({
                        'lease_id': lease.id,
                        'lease_number': lease.lease_number,
                        'old_rent': str(old_rent),
                        'new_rent': str(lease.monthly_rent),
                    })
                except Exception as e:
                    errors.append({
                        'lease_id': lease.id,
                        'error': str(e),
                    })

        return Response({
            'updated': len(updated),
            'details': updated,
            'errors': errors,
        })

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
