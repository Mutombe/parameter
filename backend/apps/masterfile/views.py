"""Views for masterfile module."""
from decimal import Decimal, InvalidOperation
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.negotiation import DefaultContentNegotiation
from django.db import transaction
from django.db.models import Sum, Count, Q, Prefetch


class IgnoreFormatNegotiation(DefaultContentNegotiation):
    """Don't raise Http404 when ?format= is unknown.

    DRF's default behavior is to filter registered renderers to those whose
    `format` attribute matches the request's `?format=` query — and raise
    Http404 if none match. That breaks export endpoints that use `?format=`
    (or `?fmt=`) as their own action param: the request 404s before the
    view ever runs. Returning the unfiltered renderer list lets the action
    handle format selection itself.
    """

    def filter_renderers(self, renderers, format):
        return renderers
from .models import (
    Landlord, Property, Unit, RentalTenant, LeaseAgreement, PropertyManager,
    Supplier, PropertyIncomeCommission, LeaseCharge, PropertyBillingConfig,
)
from .serializers import (
    LandlordSerializer, PropertySerializer, PropertyListSerializer,
    UnitSerializer, RentalTenantSerializer, RentalTenantListSerializer,
    LeaseAgreementSerializer,
    LeaseActivateSerializer, LeaseTerminateSerializer, PropertyManagerSerializer,
    SupplierSerializer, PropertyIncomeCommissionSerializer, LeaseChargeSerializer,
    PropertyBillingConfigSerializer,
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


class SupplierViewSet(TenantSchemaValidationMixin, SoftDeleteMixin, viewsets.ModelViewSet):
    """CRUD for Suppliers — third-party vendors paid via expenses."""
    queryset = Supplier.objects.select_related('default_expense_category').all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['is_active', 'default_expense_category']
    search_fields = ['code', 'name', 'email', 'phone', 'tax_id']
    ordering_fields = ['name', 'code', 'created_at']
    ordering = ['name']


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
    # Override DRF's default content negotiation so the export_statement
    # action's ?format=pdf|csv (or ?fmt=) doesn't get intercepted as a
    # renderer-selector and 404 the request before the view runs.
    content_negotiation_class = IgnoreFormatNegotiation
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

        # Filter by landlord — tenants tied to a landlord's properties via
        # the tenant's direct unit OR through any lease (unit→property or
        # property-level lease). Drives the "View Tenants" link from the
        # Landlord detail page.
        landlord_id = self.request.query_params.get('landlord')
        if landlord_id:
            queryset = queryset.filter(
                Q(unit__property__landlord_id=landlord_id) |
                Q(leases__unit__property__landlord_id=landlord_id) |
                Q(leases__property__landlord_id=landlord_id)
            ).distinct()

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
            # Accept both `?fmt=` (preferred) and `?format=` (legacy/cached
            # frontends). The viewset's content_negotiation_class prevents
            # `?format=` from being intercepted as a renderer selector.
            export_format = (
                request.query_params.get('fmt')
                or request.query_params.get('format')
                or 'csv'
            ).lower()
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

    @action(detail=True, methods=['get', 'post'])
    def charges(self, request, pk=None):
        """The lease's recurring billing items (rent, levy, maintenance, …).

        GET  → current charge schedule.
        POST → upsert: {"charges": [{"charge_type", "amount", "is_active"}]}.
               Amounts are editable at ANY time — reviewed charges apply from
               the next billing run, irrespective of lease expiry. The rent
               (rental) / levy (levy) amount is mirrored onto
               lease.monthly_rent so legacy reports stay correct.
        """
        lease = self.get_object()
        valid_types = {c[0] for c in LeaseCharge.ChargeType.choices}
        if request.method == 'POST':
            items = request.data.get('charges', [])
            if not isinstance(items, list):
                return Response({'error': 'charges must be a list'},
                                status=status.HTTP_400_BAD_REQUEST)
            for item in items:
                ctype = item.get('charge_type')
                if ctype not in valid_types:
                    return Response({'error': f'Invalid charge_type: {ctype}'},
                                    status=status.HTTP_400_BAD_REQUEST)
                try:
                    # Tolerate formatted input like "1,100" or "$1 100".
                    raw = str(item.get('amount') or 0)
                    cleaned = raw.replace(',', '').replace('$', '').replace(' ', '')
                    amount = Decimal(cleaned or '0')
                except (InvalidOperation, ValueError, TypeError):
                    return Response({'error': f'Invalid amount for {ctype}'},
                                    status=status.HTTP_400_BAD_REQUEST)
                if amount < 0:
                    return Response({'error': f'Amount for {ctype} cannot be negative'},
                                    status=status.HTTP_400_BAD_REQUEST)
                LeaseCharge.objects.update_or_create(
                    lease=lease, charge_type=ctype,
                    currency=item.get('currency') or lease.currency or 'USD',
                    defaults={
                        'amount': amount,
                        'is_active': bool(item.get('is_active', True)),
                    },
                )
            # Mirror the headline amount so rent-roll style reports that read
            # monthly_rent keep showing the reviewed figure.
            headline_type = 'levy' if lease.lease_type == 'levy' else 'rent'
            headline = lease.charges.filter(
                charge_type=headline_type, is_active=True).first()
            if headline and headline.amount and headline.amount != lease.monthly_rent:
                lease.monthly_rent = headline.amount
                lease.save(update_fields=['monthly_rent', 'updated_at'])
        rows = lease.charges.order_by('charge_type')
        return Response({
            'lease': lease.id,
            'lease_type': lease.lease_type,
            'currency': lease.currency,
            'monthly_rent': str(lease.monthly_rent),
            'charges': LeaseChargeSerializer(rows, many=True).data,
        })
    queryset = LeaseAgreement.objects.select_related(
        'tenant', 'unit', 'unit__property', 'unit__property__landlord',
        'property', 'property__landlord',
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

    @action(detail=False, methods=['get'])
    def staff_options(self, request):
        """Staff users eligible to be property managers (for the picker)."""
        from apps.accounts.models import User
        from django.db import connection as _conn
        users = User.objects.filter(
            role__in=['super_admin', 'admin', 'accountant', 'clerk'],
            is_active=True,
            tenant_schema=_conn.schema_name,
        ).order_by('first_name', 'last_name')
        return Response([
            {'id': u.id, 'name': (u.get_full_name() or u.email), 'email': u.email,
             'role': u.role}
            for u in users
        ])

    @action(detail=False, methods=['post'])
    def quick_create_user(self, request):
        """Just-in-time creation of a property manager who isn't a system
        user yet. Creates a staff (clerk) account with an unusable password
        — they get access later via the normal invite / password-reset flow.
        Body: first_name, last_name, email."""
        from apps.accounts.models import User
        from django.db import connection as _conn
        email = (request.data.get('email') or '').strip().lower()
        first = (request.data.get('first_name') or '').strip()
        last = (request.data.get('last_name') or '').strip()
        if not email or not first:
            return Response({'error': 'first_name and email are required'},
                            status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(email=email).exists():
            return Response({'error': f'A user with email {email} already exists'},
                            status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.create_user(
            email=email, password=None,  # unusable until invited/reset
            first_name=first, last_name=last,
            role='clerk', is_staff=False,
            tenant_schema=_conn.schema_name or '',
        )
        return Response({'id': user.id, 'name': user.get_full_name() or email,
                         'email': email}, status=status.HTTP_201_CREATED)


class PropertyIncomeCommissionViewSet(viewsets.ModelViewSet):
    """CRUD for per-(property, income_type) commission rate overrides.

    Plus a `grid` action that returns one row per IncomeType for a given
    property — overrides where they exist, defaults where they don't —
    so the frontend can render a single editable matrix.
    """
    queryset = PropertyIncomeCommission.objects.select_related(
        'property', 'income_type'
    ).all()
    serializer_class = PropertyIncomeCommissionSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['property', 'income_type']
    ordering_fields = ['property__name', 'income_type__name', 'rate']
    ordering = ['property__name', 'income_type__name']

    @action(detail=False, methods=['get'], url_path='grid')
    def grid(self, request):
        """Return the full commission matrix for a single property.

        Each row is one IncomeType with:
          - default_rate: IncomeType.default_commission_rate (raw)
          - override_rate: PropertyIncomeCommission.rate or null
          - effective_rate: what the resolver actually returns —
              override_rate if set; else default_rate when commissionable;
              else 0. Mirrors the backend resolver chain so the UI shows
              the true rate that will hit the GL.
          - is_commissionable: from IncomeType (informational; override
              still applies even when False)
          - override_id: the row id when overridden, else null
        """
        from apps.accounting.models import IncomeType
        property_id = request.query_params.get('property')
        if not property_id:
            return Response(
                {'error': 'property is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            prop = Property.objects.get(pk=property_id)
        except Property.DoesNotExist:
            return Response({'error': 'Property not found'}, status=status.HTTP_404_NOT_FOUND)

        overrides = {
            r.income_type_id: r
            for r in PropertyIncomeCommission.objects.filter(property_id=prop.id)
        }

        rows = []
        for it in IncomeType.objects.filter(is_active=True).order_by('name'):
            ovr = overrides.get(it.id)
            if ovr is not None:
                effective = float(ovr.rate)
            elif it.is_commissionable:
                effective = float(it.default_commission_rate)
            else:
                effective = 0.0
            rows.append({
                'income_type_id': it.id,
                'income_type_code': it.code,
                'income_type_name': it.name,
                'is_commissionable': it.is_commissionable,
                'default_rate': float(it.default_commission_rate),
                'override_rate': float(ovr.rate) if ovr else None,
                'effective_rate': effective,
                'override_id': ovr.id if ovr else None,
            })

        return Response({
            'property_id': prop.id,
            'property_name': prop.name,
            'rows': rows,
        })

    @action(detail=False, methods=['get'], url_path='draft-grid', permission_classes=[IsAuthenticated])
    def draft_grid(self, request):
        """Return the same row shape as `grid` but without a property —
        used by the new-property modal where rates are configured BEFORE
        the property is saved. Every row has override_rate=null,
        effective_rate=default_rate (when commissionable) else 0.
        """
        from apps.accounting.models import IncomeType
        rows = []
        for it in IncomeType.objects.filter(is_active=True).order_by('name'):
            effective = float(it.default_commission_rate) if it.is_commissionable else 0.0
            rows.append({
                'income_type_id': it.id,
                'income_type_code': it.code,
                'income_type_name': it.name,
                'is_commissionable': it.is_commissionable,
                'default_rate': float(it.default_commission_rate),
                'override_rate': None,
                'effective_rate': effective,
                'override_id': None,
            })
        return Response({
            'property_id': None,
            'property_name': '',
            'rows': rows,
        })

    @action(detail=False, methods=['post'], url_path='upsert')
    def upsert(self, request):
        """Create-or-update an override row by (property, income_type).

        Body: {property: <id>, income_type: <id>, rate: <decimal>, notes?: ""}
        Sending rate=null/blank deletes the override and reverts to default.
        """
        from decimal import Decimal, InvalidOperation
        property_id = request.data.get('property')
        income_type_id = request.data.get('income_type')
        rate = request.data.get('rate')
        notes = request.data.get('notes', '') or ''

        if not property_id or not income_type_id:
            return Response(
                {'error': 'property and income_type are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # null/empty rate -> delete the override (revert to default)
        if rate is None or rate == '':
            PropertyIncomeCommission.objects.filter(
                property_id=property_id, income_type_id=income_type_id,
            ).delete()
            return Response({'deleted': True})

        try:
            rate_dec = Decimal(str(rate))
        except (InvalidOperation, TypeError):
            return Response({'error': 'rate must be a number'}, status=status.HTTP_400_BAD_REQUEST)

        obj, _ = PropertyIncomeCommission.objects.update_or_create(
            property_id=property_id, income_type_id=income_type_id,
            defaults={'rate': rate_dec, 'notes': notes},
        )
        return Response(PropertyIncomeCommissionSerializer(obj).data)


# ---------------------------------------------------------------------------
# Property-Level Billing Configuration
# ---------------------------------------------------------------------------
def _leases_under_property(property_id):
    """Active leases attached to a property, either directly or via a unit."""
    from django.db.models import Q as _Q
    return (LeaseAgreement.objects.filter(status='active')
            .filter(_Q(unit__property_id=property_id) | _Q(property_id=property_id))
            .select_related('tenant', 'unit', 'unit__property', 'property')
            .prefetch_related('charges'))


def _resolve_lease_amount(config, lease):
    """Effective charge for one lease under a Property billing config.

    Precedence (spec §Resolution):
      lease-level override (LeaseCharge for this category+currency) →
      the Property config amount → nothing.
    Returns (amount, source) where source is 'override' | 'property' | None.
    The amount is None when the lease should not be billed.
    """
    override = next(
        (c for c in lease.charges.all()
         if c.is_active and c.charge_type == config.category
         and (c.currency or 'USD') == config.currency),
        None,
    )
    if override and override.amount and override.amount > 0:
        return override.amount, 'override'
    if config.amount and config.amount > 0:
        return config.amount, 'property'
    return None, None


class PropertyBillingConfigViewSet(TenantSchemaValidationMixin, viewsets.ModelViewSet):
    """Configure a billing rule ONCE at property level and apply it to every
    eligible lease under that property.

    CRUD plus:
      - affected_leases (GET, detail): dry-run preview of who this config bills,
        who is excluded by payer type, and who has a lease-level override.
      - generate (POST, detail): create one invoice per eligible lease for a
        given billing date, honouring lease overrides and effective-dating.
      - bulk_delete_preview / bulk_delete (POST, list): remove generated billing
        for a property/period/category, protecting anything paid or posted.
    """
    queryset = PropertyBillingConfig.objects.select_related(
        'property', 'created_by', 'updated_by'
    ).all()
    serializer_class = PropertyBillingConfigSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['property', 'category', 'currency', 'is_active']
    search_fields = ['property__name', 'notes']
    ordering_fields = ['effective_from', 'created_at', 'category', 'amount']
    ordering = ['property__name', 'category', '-effective_from']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    # -- preview -----------------------------------------------------------
    @action(detail=True, methods=['get'], url_path='affected-leases')
    def affected_leases(self, request, pk=None):
        """Dry run: classify every active lease under the property for this
        config without creating anything.

        Optional `date` query param (YYYY-MM-DD) checks the effective window;
        defaults to today. Returns eligible/overridden/excluded buckets.
        """
        from datetime import date as _date
        config = self.get_object()

        period_raw = request.query_params.get('date')
        try:
            period_date = _date.fromisoformat(period_raw) if period_raw else _date.today()
        except ValueError:
            return Response({'error': 'date must be YYYY-MM-DD'},
                            status=status.HTTP_400_BAD_REQUEST)

        in_window = config.applies_on(period_date)
        eligible, overrides, excluded = [], [], []
        for lease in _leases_under_property(config.property_id):
            acct_type = getattr(lease.tenant, 'account_type', 'rental') or 'rental'
            if not config.eligible_for_account_type(acct_type):
                excluded.append({
                    'lease_number': lease.lease_number,
                    'tenant': lease.tenant.name,
                    'account_type': acct_type,
                    'reason': 'payer type not eligible for this category',
                })
                continue
            amount, source = _resolve_lease_amount(config, lease)
            row = {
                'lease_number': lease.lease_number,
                'tenant': lease.tenant.name,
                'account_type': acct_type,
                'amount': str(amount) if amount is not None else None,
                'currency': config.currency,
                'source': source,
            }
            if amount is None:
                row['reason'] = 'no positive amount configured'
                excluded.append(row)
            elif source == 'override':
                overrides.append(row)
            else:
                eligible.append(row)

        return Response({
            'config_id': config.id,
            'category': config.category,
            'currency': config.currency,
            'period_date': period_date.isoformat(),
            'applies_on_period': in_window,
            'counts': {
                'eligible': len(eligible),
                'overrides': len(overrides),
                'excluded': len(excluded),
                'billable': len(eligible) + len(overrides) if in_window else 0,
            },
            'eligible': eligible,
            'overrides': overrides,
            'excluded': excluded,
        })

    # -- generate ----------------------------------------------------------
    @action(detail=True, methods=['post'])
    def generate(self, request, pk=None):
        """Create one invoice per eligible lease under this config's property.

        Body: date (billing date, required), due_date (required).
        Applies lease overrides, respects payer-type eligibility, and skips
        the effective window / duplicates. Uses the existing sub-account
        structure — never creates pockets. Invoices are left unposted so the
        cashier can review before posting to the ledger.
        """
        from datetime import date as _date
        from apps.billing.models import Invoice
        from apps.accounting.models import AuditTrail

        config = self.get_object()
        inv_date_raw = request.data.get('date')
        due_raw = request.data.get('due_date')
        if not inv_date_raw or not due_raw:
            return Response({'error': 'date and due_date are required'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            inv_date = _date.fromisoformat(str(inv_date_raw))
            due_date = _date.fromisoformat(str(due_raw))
        except ValueError:
            return Response({'error': 'date and due_date must be YYYY-MM-DD'},
                            status=status.HTTP_400_BAD_REQUEST)

        if not config.applies_on(inv_date):
            return Response({
                'error': 'This configuration is not effective for %s '
                         '(effective %s to %s, active=%s).' % (
                             inv_date, config.effective_from,
                             config.effective_to or 'open', config.is_active),
            }, status=status.HTTP_400_BAD_REQUEST)

        created, skipped, override_count = [], [], 0
        with transaction.atomic():
            for lease in _leases_under_property(config.property_id):
                acct_type = getattr(lease.tenant, 'account_type', 'rental') or 'rental'
                if not config.eligible_for_account_type(acct_type):
                    continue
                amount, source = _resolve_lease_amount(config, lease)
                if amount is None:
                    skipped.append('%s: no amount' % lease.lease_number)
                    continue
                # Duplicate guard: one charge of this type/currency per lease per day.
                if Invoice.objects.filter(
                    lease=lease, invoice_type=config.category,
                    currency=config.currency, date=inv_date,
                ).exists():
                    skipped.append('%s: already billed on %s' % (lease.lease_number, inv_date))
                    continue
                if source == 'override':
                    override_count += 1
                inv = Invoice.objects.create(
                    tenant=lease.tenant, lease=lease, unit=lease.unit,
                    property=lease.property or (lease.unit.property if lease.unit else None),
                    invoice_type=config.category,
                    date=inv_date, due_date=due_date,
                    amount=amount, vat_amount=Decimal('0'), currency=config.currency,
                    description='%s Charge (property config #%s)' % (
                        config.get_category_display(), config.id),
                    created_by=request.user,
                )
                created.append(inv.invoice_number)

            AuditTrail.objects.create(
                action='property_billing_generate',
                model_name='PropertyBillingConfig',
                record_id=config.id,
                changes={
                    'property_id': config.property_id,
                    'category': config.category,
                    'currency': config.currency,
                    'date': inv_date.isoformat(),
                    'created': len(created),
                    'skipped': len(skipped),
                    'overrides_applied': override_count,
                },
                user=request.user if request.user.is_authenticated else None,
            )

        return Response({
            'created': len(created),
            'invoice_numbers': created[:50],
            'overrides_applied': override_count,
            'skipped': skipped[:50],
            'skipped_count': len(skipped),
        })

    # -- bulk deletion -----------------------------------------------------
    @staticmethod
    def _bulk_delete_filters(data):
        """Parse/validate the shared filter body for the two delete actions.

        Returns (queryset, error_response). Filters: property_id (required),
        category (optional), and a period given as either date_from/date_to or
        month+year.
        """
        from datetime import date as _date
        from calendar import monthrange
        from apps.billing.models import Invoice

        property_id = data.get('property_id')
        if not property_id:
            return None, Response({'error': 'property_id is required'},
                                  status=status.HTTP_400_BAD_REQUEST)

        date_from = data.get('date_from')
        date_to = data.get('date_to')
        month = data.get('month')
        year = data.get('year')
        try:
            if month and year:
                month, year = int(month), int(year)
                start = _date(year, month, 1)
                end = _date(year, month, monthrange(year, month)[1])
            elif date_from and date_to:
                start = _date.fromisoformat(str(date_from))
                end = _date.fromisoformat(str(date_to))
            else:
                return None, Response(
                    {'error': 'Provide either month+year or date_from+date_to'},
                    status=status.HTTP_400_BAD_REQUEST)
        except (ValueError, TypeError):
            return None, Response({'error': 'invalid period'},
                                  status=status.HTTP_400_BAD_REQUEST)

        qs = Invoice.objects.filter(
            property_id=property_id, date__gte=start, date__lte=end,
        ).select_related('tenant')
        category = data.get('category')
        if category:
            qs = qs.filter(invoice_type=category)
        return {'qs': qs, 'start': start, 'end': end}, None

    @staticmethod
    def _classify_for_delete(inv):
        """Deletable only when nothing depends on it: unpaid and unposted.
        Anything paid/partially paid or already posted to the ledger is
        protected and reported, never silently removed."""
        from apps.billing.models import Invoice
        if inv.amount_paid and inv.amount_paid > 0:
            return 'protected', 'has payments'
        if inv.status in (Invoice.Status.PAID, Invoice.Status.PARTIAL):
            return 'protected', 'paid status'
        if inv.journal_id:
            return 'protected', 'posted to ledger'
        return 'deletable', None

    @action(detail=False, methods=['post'], url_path='bulk-delete-preview')
    def bulk_delete_preview(self, request):
        """Dry run for bulk deletion: show what would be removed vs protected."""
        parsed, err = self._bulk_delete_filters(request.data)
        if err:
            return err
        deletable, protected = [], []
        for inv in parsed['qs']:
            bucket, reason = self._classify_for_delete(inv)
            row = {
                'invoice_number': inv.invoice_number,
                'tenant': inv.tenant.name,
                'invoice_type': inv.invoice_type,
                'amount': str(inv.amount),
                'currency': inv.currency,
                'date': inv.date.isoformat(),
                'status': inv.status,
            }
            if bucket == 'deletable':
                deletable.append(row)
            else:
                row['reason'] = reason
                protected.append(row)
        return Response({
            'period': {'from': parsed['start'].isoformat(), 'to': parsed['end'].isoformat()},
            'counts': {'deletable': len(deletable), 'protected': len(protected)},
            'deletable': deletable,
            'protected': protected,
            'note': 'Sub-accounts are never deleted; only invoices are removed.',
        })

    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        """Delete unpaid/unposted billing for a property/period/category.

        Protects anything paid or posted (skipped and reported). Sub-accounts
        are left intact. Every run is recorded in the immutable audit trail.
        Pass confirm=true to actually delete; otherwise behaves as a preview.
        """
        from apps.accounting.models import AuditTrail

        parsed, err = self._bulk_delete_filters(request.data)
        if err:
            return err
        confirm = request.data.get('confirm') in (True, 'true', 'True', 1, '1')

        to_delete, protected = [], []
        for inv in parsed['qs']:
            bucket, reason = self._classify_for_delete(inv)
            if bucket == 'deletable':
                to_delete.append(inv)
            else:
                protected.append({'invoice_number': inv.invoice_number, 'reason': reason})

        if not confirm:
            return Response({
                'confirmed': False,
                'would_delete': len(to_delete),
                'protected': len(protected),
                'message': 'Set confirm=true to delete.',
            })

        deleted_numbers = [inv.invoice_number for inv in to_delete]
        with transaction.atomic():
            for inv in to_delete:
                inv.delete()  # soft delete (SoftDeleteModel)
            AuditTrail.objects.create(
                action='property_billing_bulk_delete',
                model_name='Invoice',
                record_id=int(request.data.get('property_id')),
                changes={
                    'property_id': request.data.get('property_id'),
                    'category': request.data.get('category') or 'all',
                    'period_from': parsed['start'].isoformat(),
                    'period_to': parsed['end'].isoformat(),
                    'deleted_count': len(deleted_numbers),
                    'deleted_invoices': deleted_numbers[:200],
                    'protected_count': len(protected),
                },
                user=request.user if request.user.is_authenticated else None,
            )
        return Response({
            'confirmed': True,
            'deleted': len(deleted_numbers),
            'deleted_invoices': deleted_numbers[:100],
            'protected': len(protected),
            'protected_detail': protected[:100],
            'note': 'Sub-accounts were not modified.',
        })
