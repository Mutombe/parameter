"""Views for billing module."""
from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.db.models import Sum, Count, Q
from django.utils import timezone
from django.conf import settings
from datetime import date, datetime
from calendar import monthrange
import logging
from .models import Invoice, Receipt, Expense, LatePenaltyConfig, LatePenaltyExclusion
from .serializers import (
    InvoiceSerializer, InvoiceCreateSerializer,
    ReceiptSerializer, ReceiptCreateSerializer,
    ExpenseSerializer, BulkInvoiceSerializer, BulkReceiptSerializer,
    LatePenaltyConfigSerializer, LatePenaltyExclusionSerializer
)
from apps.masterfile.models import LeaseAgreement, Property, RentalTenant
from apps.accounting.models import AuditTrail
from apps.soft_delete import SoftDeleteMixin
from apps.accounts.mixins import TenantSchemaValidationMixin

logger = logging.getLogger(__name__)


class InvoiceViewSet(TenantSchemaValidationMixin, SoftDeleteMixin, viewsets.ModelViewSet):
    """CRUD for Invoices."""
    queryset = Invoice.objects.select_related(
        'tenant', 'unit', 'unit__property', 'unit__property__landlord',
        'lease', 'lease__unit', 'lease__unit__property',
        'lease__unit__property__landlord',
        'lease__property', 'lease__property__landlord',
        'property', 'property__landlord',
    ).all()
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        # Date range filtering
        date_gte = self.request.query_params.get('date__gte')
        date_lte = self.request.query_params.get('date__lte')
        if date_gte:
            qs = qs.filter(date__gte=date_gte)
        if date_lte:
            qs = qs.filter(date__lte=date_lte)
        return qs
    filterset_fields = [
        'tenant', 'unit', 'unit__property', 'lease', 'invoice_type',
        'status', 'date', 'due_date', 'currency', 'property',
        'period_start', 'period_end',
    ]
    search_fields = [
        'invoice_number', 'tenant__name', 'tenant__code',
        'description', 'unit__unit_number', 'unit__property__name',
    ]
    ordering_fields = ['date', 'due_date', 'total_amount', 'amount_paid', 'balance', 'created_at', 'invoice_number']
    ordering = ['-date', '-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return InvoiceCreateSerializer
        return InvoiceSerializer

    def perform_create(self, serializer):
        """Save the invoice and post it to the GL immediately.

        Auto-posting matches the user-facing flow: an invoice is recognized
        debt the moment it is created. If posting fails, log it but keep the
        invoice — the user can retry from the detail page.
        """
        import logging
        invoice = serializer.save(created_by=self.request.user)
        try:
            invoice.post_to_ledger(self.request.user)
        except Exception as e:
            logging.getLogger(__name__).warning(
                f'Auto-post failed for invoice {invoice.invoice_number}: {e}',
                exc_info=True,
            )

    @action(detail=True, methods=['post'])
    def post_to_ledger(self, request, pk=None):
        """Post invoice to General Ledger."""
        invoice = self.get_object()

        if invoice.journal:
            return Response(
                {'error': 'Invoice already posted to ledger'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            journal = invoice.post_to_ledger(request.user)
            return Response({
                'message': 'Invoice posted successfully',
                'invoice': InvoiceSerializer(invoice).data,
                'journal_number': journal.journal_number
            })
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def generate_monthly(self, request):
        """
        Generate monthly rent invoices for active leases.
        This is the automated billing cron job (Activity 1).
        """
        from .services import generate_monthly_invoices

        serializer = BulkInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        month = serializer.validated_data['month']
        year = serializer.validated_data['year']
        lease_ids = serializer.validated_data.get('lease_ids', [])
        property_id = serializer.validated_data.get('property_id')
        invoice_date = serializer.validated_data.get('invoice_date')
        due_date_val = serializer.validated_data.get('due_date')

        try:
            created_invoices, errors = generate_monthly_invoices(
                month, year,
                lease_ids=lease_ids or None,
                property_id=property_id,
                created_by=request.user,
                invoice_date_override=invoice_date,
                due_date_override=due_date_val,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).exception(f'[BILLING] Failed: {e}')
            return Response(
                {'error': f'{type(e).__name__}: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        import logging
        logger = logging.getLogger(__name__)
        logger.info(f'[BILLING] month={month}, year={year}, property={property_id}, '
                    f'invoice_date={invoice_date}, due_date={due_date_val}, '
                    f'created={len(created_invoices)}, errors={len(errors)}')

        return Response({
            'created': len(created_invoices),
            'invoices': InvoiceSerializer(created_invoices, many=True).data,
            'errors': errors
        })

    @action(detail=False, methods=['get'])
    def billing_status(self, request):
        """
        Billing progress per property for a given month/year.
        Shows which properties are fully billed, partially billed, or unbilled.
        """
        from apps.masterfile.models import Property
        from django.db.models import Q, Count
        from calendar import monthrange

        month = int(request.query_params.get('month', timezone.now().month))
        year = int(request.query_params.get('year', timezone.now().year))
        period_start = date(year, month, 1)
        period_end = date(year, month, monthrange(year, month)[1])

        from apps.masterfile.models import LeaseAgreement

        # Fast: get active lease counts per property using lease table directly
        from django.db.models import F
        lease_counts = {}
        for row in (LeaseAgreement.objects.filter(status='active')
            .values(prop_id=F('unit__property_id'))
            .annotate(cnt=Count('id'))
        ):
            if row['prop_id']:
                lease_counts[row['prop_id']] = lease_counts.get(row['prop_id'], 0) + row['cnt']
        # Also count levy leases (property FK, no unit)
        for row in (LeaseAgreement.objects.filter(status='active', lease_type='levy', unit__isnull=True)
            .values(prop_id=F('property_id'))
            .annotate(cnt=Count('id'))
        ):
            if row['prop_id']:
                lease_counts[row['prop_id']] = lease_counts.get(row['prop_id'], 0) + row['cnt']

        # Fast: get billed counts per property for this period
        from .models import Invoice
        billed_counts = {}
        for row in (Invoice.objects.filter(period_start=period_start, period_end=period_end)
            .values(prop_id=F('property_id'))
            .annotate(cnt=Count('id'))
        ):
            if row['prop_id']:
                billed_counts[row['prop_id']] = row['cnt']

        # Only fetch properties that have active leases
        prop_ids = set(lease_counts.keys())
        properties = Property.objects.filter(id__in=prop_ids).select_related('landlord').order_by('name')

        results = []
        for prop in properties:
            total_active = lease_counts.get(prop.id, 0)
            billed = billed_counts.get(prop.id, 0)
            if total_active == 0 and billed == 0:
                continue
            if billed >= total_active and total_active > 0:
                status = 'complete'
            elif billed > 0:
                status = 'partial'
            else:
                status = 'pending'
            results.append({
                'property_id': prop.id,
                'property_name': prop.name,
                'landlord_name': prop.landlord.name if prop.landlord else None,
                'management_type': prop.management_type,
                'active_leases': total_active,
                'billed': billed,
                'unbilled': max(total_active - billed, 0),
                'status': status,
            })

        summary = {
            'month': month, 'year': year,
            'total_properties': len(results),
            'complete': sum(1 for r in results if r['status'] == 'complete'),
            'partial': sum(1 for r in results if r['status'] == 'partial'),
            'pending': sum(1 for r in results if r['status'] == 'pending'),
            'total_leases': sum(r['active_leases'] for r in results),
            'total_billed': sum(r['billed'] for r in results),
        }

        return Response({'summary': summary, 'properties': results})

    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """Get all overdue invoices."""
        today = timezone.now().date()
        invoices = self.get_queryset().filter(
            status__in=['sent', 'partial'],
            due_date__lt=today
        )

        # Update status to overdue
        invoices.update(status='overdue')

        serializer = self.get_serializer(invoices, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def bulk_generate_statements(self, request):
        """Generate statements for multiple tenants at once."""
        from apps.accounts.throttles import BulkOperationThrottle
        tenant_ids = request.data.get('tenant_ids', [])
        period = request.data.get('period')  # e.g., "2026-02"

        if not tenant_ids or not period:
            return Response(
                {'error': 'tenant_ids and period are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            year, month = int(period.split('-')[0]), int(period.split('-')[1])
        except (ValueError, IndexError):
            return Response(
                {'error': 'period must be in YYYY-MM format'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from .services import generate_monthly_invoices
        created, errors = generate_monthly_invoices(
            month, year,
            lease_ids=list(
                LeaseAgreement.objects.filter(
                    tenant_id__in=tenant_ids, status='active'
                ).values_list('id', flat=True)
            ),
            created_by=request.user
        )

        return Response({
            'created': len(created),
            'invoices': InvoiceSerializer(created, many=True).data,
            'errors': errors,
        })

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get invoice summary statistics."""
        queryset = self.get_queryset()

        total_invoiced = queryset.aggregate(Sum('total_amount'))['total_amount__sum'] or 0
        total_paid = queryset.aggregate(Sum('amount_paid'))['amount_paid__sum'] or 0
        outstanding = total_invoiced - total_paid

        by_status = queryset.values('status').annotate(
            count=Count('id'),
            total=Sum('total_amount')
        )

        return Response({
            'total_invoiced': total_invoiced,
            'total_paid': total_paid,
            'outstanding': outstanding,
            'by_status': list(by_status)
        })

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def uniform_charge(self, request):
        """
        Apply uniform charge to all leases under a property.
        Useful for setting the same levy amount for all units in a residential association.
        """
        property_id = request.data.get('property_id')
        invoice_type = request.data.get('invoice_type', 'levy')
        amount = request.data.get('amount')
        description = request.data.get('description', '')
        due_date = request.data.get('due_date')
        period_start = request.data.get('period_start')
        period_end = request.data.get('period_end')

        if not property_id or not amount:
            return Response(
                {'error': 'property_id and amount are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            property_obj = Property.objects.get(id=property_id)
        except Property.DoesNotExist:
            return Response({'error': 'Property not found'}, status=404)

        amount = Decimal(str(amount))

        # Get all active leases for this property
        leases = LeaseAgreement.objects.filter(
            unit__property=property_obj,
            status='active'
        ).select_related('tenant', 'unit')

        if not leases.exists():
            return Response({'error': 'No active leases found for this property'}, status=400)

        # Batch check: get all lease IDs that already have this charge type for the period
        existing_lease_ids = set(
            Invoice.objects.filter(
                lease__in=leases,
                invoice_type=invoice_type,
                period_start=period_start,
                period_end=period_end
            ).values_list('lease_id', flat=True)
        )

        created_invoices = []
        errors = []
        today = timezone.now().date()

        for lease in leases:
            if lease.id in existing_lease_ids:
                errors.append(f'Invoice already exists for lease {lease.lease_number}')
                continue

            try:
                invoice = Invoice(
                    tenant=lease.tenant,
                    lease=lease,
                    unit=lease.unit,
                    property=property_obj,
                    invoice_type=invoice_type,
                    date=today,
                    due_date=due_date or (today + timezone.timedelta(days=15)),
                    period_start=period_start,
                    period_end=period_end,
                    amount=amount,
                    vat_amount=Decimal('0'),
                    currency=lease.currency,
                    description=description or (
                        f'{datetime.strptime(period_start, "%Y-%m-%d").strftime("%B")} '
                        f'{Invoice.InvoiceType(invoice_type).label} Charge'
                        if period_start else
                        f'{Invoice.InvoiceType(invoice_type).label} Charge'
                    ),
                    created_by=request.user
                )
                invoice.save()
                created_invoices.append(invoice)
            except Exception as e:
                errors.append(f'Error creating invoice for {lease.lease_number}: {str(e)}')

        # Audit trail
        AuditTrail.objects.create(
            action='uniform_charge_applied',
            model_name='Invoice',
            record_id=property_id,
            changes={
                'property': property_obj.name,
                'invoice_type': invoice_type,
                'amount': str(amount),
                'invoices_created': len(created_invoices)
            },
            user=request.user
        )

        return Response({
            'message': f'Uniform charge applied successfully',
            'property': property_obj.name,
            'created': len(created_invoices),
            'invoices': InvoiceSerializer(created_invoices, many=True).data,
            'errors': errors
        })

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def delete_billing(self, request):
        """
        Delete billing for a specific month.
        Can delete by property (for all leases) or by specific lease_id.
        Only deletes DRAFT invoices that haven't been posted to ledger.
        """
        property_id = request.data.get('property_id')
        lease_id = request.data.get('lease_id')
        year = request.data.get('year')
        month = request.data.get('month')
        invoice_type = request.data.get('invoice_type')  # Optional filter

        if not year or not month:
            return Response(
                {'error': 'year and month are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not property_id and not lease_id:
            return Response(
                {'error': 'property_id or lease_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Build date range for the month
        _, last_day = monthrange(int(year), int(month))
        period_start = date(int(year), int(month), 1)
        period_end = date(int(year), int(month), last_day)

        # Build queryset
        invoices = Invoice.objects.filter(
            status='draft',  # Only delete draft invoices
            journal__isnull=True,  # Not posted to ledger
            period_start__gte=period_start,
            period_end__lte=period_end
        )

        if property_id:
            invoices = invoices.filter(unit__property_id=property_id)
        if lease_id:
            invoices = invoices.filter(lease_id=lease_id)
        if invoice_type:
            invoices = invoices.filter(invoice_type=invoice_type)

        count = invoices.count()
        invoice_numbers = list(invoices.values_list('invoice_number', flat=True))

        if count == 0:
            return Response({
                'message': 'No draft invoices found for the specified criteria',
                'deleted': 0
            })

        # Delete the invoices
        invoices.delete()

        # Audit trail
        AuditTrail.objects.create(
            action='billing_deleted',
            model_name='Invoice',
            record_id=property_id or lease_id,
            changes={
                'property_id': property_id,
                'lease_id': lease_id,
                'year': year,
                'month': month,
                'deleted_count': count,
                'invoice_numbers': invoice_numbers
            },
            user=request.user
        )

        return Response({
            'message': f'Successfully deleted {count} invoice(s)',
            'deleted': count,
            'invoice_numbers': invoice_numbers
        })

    @action(detail=False, methods=['post'])
    def send_invoices(self, request):
        """
        Send invoice emails to tenants.
        Can send to all tenants, specific properties, or specific tenants.
        Emails are sent asynchronously via background tasks.
        """
        tenant_ids = request.data.get('tenant_ids', [])
        property_ids = request.data.get('property_ids', [])
        invoice_ids = request.data.get('invoice_ids', [])
        send_all = request.data.get('send_all', False)
        subject_template = request.data.get('subject', 'Invoice from {company_name}')
        message_template = request.data.get('message', '')

        # Build queryset
        invoices = Invoice.objects.filter(
            status__in=['draft', 'sent'],
            balance__gt=0
        ).select_related('tenant', 'unit', 'unit__property')

        if invoice_ids:
            invoices = invoices.filter(id__in=invoice_ids)
        elif tenant_ids:
            invoices = invoices.filter(tenant_id__in=tenant_ids)
        elif property_ids:
            invoices = invoices.filter(unit__property_id__in=property_ids)
        elif not send_all:
            return Response(
                {'error': 'Specify tenant_ids, property_ids, invoice_ids, or set send_all=true'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get tenant info
        tenant_org = getattr(request, 'tenant', None)
        company_name = tenant_org.name if tenant_org else 'Property Management'

        # Collect invoice IDs and validate emails synchronously
        queued = []
        failed = []

        for invoice in invoices:
            if not invoice.tenant.email:
                failed.append({
                    'invoice': invoice.invoice_number,
                    'error': 'No email address'
                })
                continue

            # Mark draft invoices as sent immediately
            if invoice.status == 'draft':
                invoice.status = 'sent'
                invoice.save(update_fields=['status', 'updated_at'])

            queued.append({
                'invoice': invoice.invoice_number,
                'email': invoice.tenant.email
            })

        # Queue email sending as a background task
        if queued:
            invoice_id_list = list(
                invoices.filter(tenant__email__isnull=False)
                    .exclude(tenant__email='')
                    .values_list('id', flat=True)
            )
            try:
                from django_q.tasks import async_task
                async_task(
                    'apps.billing.tasks.send_invoice_emails_task',
                    invoice_id_list,
                    subject_template,
                    message_template,
                    company_name,
                )
            except Exception as e:
                logger.error(f'Failed to queue email task: {e}')

        return Response({
            'message': f'Queued {len(queued)} invoice email(s) for delivery',
            'queued': queued,
            'failed': failed
        })


class BulkMailingViewSet(viewsets.ViewSet):
    """
    Bulk mailing functionality for tenants.
    Send emails to all tenants or selected groups.
    """
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['post'])
    def send_bulk_email(self, request):
        """
        Send bulk email to tenants.
        Options:
        - send_all: Send to all active tenants
        - tenant_ids: Send to specific tenants
        - property_ids: Send to tenants of specific properties
        - account_type: Filter by rental/levy account type
        """
        tenant_ids = request.data.get('tenant_ids', [])
        property_ids = request.data.get('property_ids', [])
        account_type = request.data.get('account_type')  # 'rental', 'levy', 'both'
        send_all = request.data.get('send_all', False)

        subject = request.data.get('subject')
        message = request.data.get('message')

        if not subject or not message:
            return Response(
                {'error': 'subject and message are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Build recipient queryset
        tenants = RentalTenant.objects.filter(
            is_active=True,
            email__isnull=False
        ).exclude(email='')

        if tenant_ids:
            tenants = tenants.filter(id__in=tenant_ids)
        elif property_ids:
            # Get tenants with active leases in specified properties
            lease_tenant_ids = LeaseAgreement.objects.filter(
                unit__property_id__in=property_ids,
                status='active'
            ).values_list('tenant_id', flat=True)
            tenants = tenants.filter(id__in=lease_tenant_ids)
        elif not send_all:
            return Response(
                {'error': 'Specify tenant_ids, property_ids, or set send_all=true'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if account_type:
            tenants = tenants.filter(account_type=account_type)

        # Get company info
        tenant_org = getattr(request, 'tenant', None)
        company_name = tenant_org.name if tenant_org else 'Property Management'

        # Collect recipient IDs and queue background task
        recipient_ids = list(tenants.values_list('id', flat=True))
        recipient_count = len(recipient_ids)

        if recipient_count == 0:
            return Response({
                'message': 'No recipients found',
                'queued_count': 0,
            })

        # Queue email sending as a background task
        try:
            from django_q.tasks import async_task
            async_task(
                'apps.billing.tasks.send_bulk_email_task',
                recipient_ids,
                subject,
                message,
                company_name,
                request.user.id,
            )
        except Exception as e:
            logger.error(f'Failed to queue bulk email task: {e}')

        # Audit trail
        AuditTrail.objects.create(
            action='bulk_email_queued',
            model_name='RentalTenant',
            record_id=0,
            changes={
                'subject': subject,
                'recipients_count': recipient_count,
            },
            user=request.user
        )

        return Response({
            'message': f'Queued {recipient_count} email(s) for delivery',
            'queued_count': recipient_count,
        })

    @action(detail=False, methods=['get'])
    def preview_recipients(self, request):
        """Preview list of recipients before sending bulk email."""
        tenant_ids = request.query_params.getlist('tenant_ids')
        property_ids = request.query_params.getlist('property_ids')
        account_type = request.query_params.get('account_type')
        send_all = request.query_params.get('send_all', 'false').lower() == 'true'

        tenants = RentalTenant.objects.filter(
            is_active=True,
            email__isnull=False
        ).exclude(email='')

        if tenant_ids:
            tenants = tenants.filter(id__in=tenant_ids)
        elif property_ids:
            lease_tenant_ids = LeaseAgreement.objects.filter(
                unit__property_id__in=property_ids,
                status='active'
            ).values_list('tenant_id', flat=True)
            tenants = tenants.filter(id__in=lease_tenant_ids)
        elif not send_all:
            tenants = tenants.none()

        if account_type:
            tenants = tenants.filter(account_type=account_type)

        return Response({
            'count': tenants.count(),
            'recipients': [
                {
                    'id': t.id,
                    'code': t.code,
                    'name': t.name,
                    'email': t.email,
                    'account_type': t.account_type
                }
                for t in tenants[:100]  # Limit preview to 100
            ]
        })


class ReceiptViewSet(TenantSchemaValidationMixin, SoftDeleteMixin, viewsets.ModelViewSet):
    """CRUD for Receipts."""
    queryset = Receipt.objects.select_related(
        'tenant', 'invoice', 'income_type', 'journal'
    ).all()
    permission_classes = [IsAuthenticated]
    filterset_fields = [
        'tenant', 'invoice', 'invoice__unit', 'invoice__unit__property',
        'payment_method', 'date', 'currency', 'bank_account', 'income_type',
    ]
    search_fields = [
        'receipt_number', 'tenant__name', 'tenant__code',
        'reference', 'description', 'bank_name',
    ]
    ordering_fields = ['date', 'amount', 'created_at', 'receipt_number']
    ordering = ['-date', '-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return ReceiptCreateSerializer
        return ReceiptSerializer

    def perform_create(self, serializer):
        import logging
        logger = logging.getLogger(__name__)
        try:
            logger.info(f'[RECEIPT CREATE] Data: {serializer.validated_data}')
            serializer.save(created_by=self.request.user)
        except Exception as e:
            logger.exception(f'[RECEIPT CREATE] Failed: {e}')
            raise

    def create(self, request, *args, **kwargs):
        """Override create to return detailed errors."""
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f'[RECEIPT CREATE] Raw request data: {request.data}')
        try:
            return super().create(request, *args, **kwargs)
        except Exception as e:
            logger.exception(f'[RECEIPT CREATE] Unhandled error: {e}')
            import traceback
            return Response(
                {'error': f'{type(e).__name__}: {str(e)}', 'traceback': traceback.format_exc().split('\n')[-5:]},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['post'])
    def owner_contribution(self, request):
        """Record an owner (landlord) contribution — the owner injects funds
        into their trust account. Credits the landlord's sub-account (raising
        Funds Held in Trust) and posts a matching GL entry (Dr Bank, Cr
        Landlord Trust Payable). Marked 'OCT' so the Cash Flow can surface it
        as a financing inflow. This is the mirror image of a Post Withdrawal.
        """
        from decimal import Decimal as _D
        from django.utils import timezone as _tz
        from apps.masterfile.models import Landlord
        from apps.accounting.models import (
            SubsidiaryAccount, SubsidiaryTransaction, ChartOfAccount,
            Journal, JournalEntry, BankAccount,
        )
        landlord_id = request.data.get('landlord')
        raw_amount = request.data.get('amount')
        if not landlord_id:
            return Response({'error': 'landlord is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = _D(str(raw_amount))
        except Exception:
            amount = _D('0')
        if amount <= 0:
            return Response({'error': 'A positive amount is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            landlord = Landlord.objects.get(id=landlord_id)
        except Landlord.DoesNotExist:
            return Response({'error': 'Landlord not found'}, status=status.HTTP_404_NOT_FOUND)

        dt = request.data.get('date') or _tz.now().date()
        currency = (request.data.get('currency') or 'USD').upper()
        description = request.data.get('description') or f'Owner contribution — {landlord.name}'

        # Resolve the cash/bank GL account (chosen bank → its GL, else 1100).
        bank_gl = None
        bank_account_id = request.data.get('bank_account')
        if bank_account_id:
            ba = BankAccount.objects.filter(id=bank_account_id).select_related('gl_account').first()
            if ba and ba.gl_account_id:
                bank_gl = ba.gl_account
        if bank_gl is None:
            bank_gl, _ = ChartOfAccount.objects.get_or_create(
                code='1100', defaults={'name': 'Bank Account', 'account_type': 'asset',
                                       'account_subtype': 'bank', 'is_system': True})
        trust_gl, _ = ChartOfAccount.objects.get_or_create(
            code='2300', defaults={'name': 'Landlord Trust Payable', 'account_type': 'liability',
                                   'account_subtype': 'accounts_payable', 'is_system': True})

        # GL: Dr Bank, Cr Landlord Trust Payable (cash in, trust liability up).
        journal = Journal.objects.create(
            journal_type=Journal.JournalType.RECEIPTS, date=dt,
            description=description, reference='OCT', currency=currency,
            created_by=request.user,
        )
        je_dr = JournalEntry.objects.create(
            journal=journal, account=bank_gl, description=description, debit_amount=amount)
        JournalEntry.objects.create(
            journal=journal, account=trust_gl, description=description, credit_amount=amount)
        journal.post(request.user)

        # Sub-ledger: credit the chosen landlord pocket → raises Funds Held.
        pocket = (request.data.get('sub_account_category') or 'rent').lower()
        sub = SubsidiaryAccount.get_or_create_for_landlord_category(
            landlord, category=pocket, currency=currency)
        txn = SubsidiaryTransaction.create_entry(
            account=sub, date=dt, contra_account='OCT',
            reference=f'OCT-{journal.journal_number}', description=description,
            credit_amount=amount, journal_entry=je_dr,
        )
        return Response({
            'message': 'Owner contribution recorded',
            'journal_number': journal.journal_number,
            'landlord': landlord.name,
            'amount': float(amount),
            'transaction_id': txn.id,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def post_to_ledger(self, request, pk=None):
        """Post receipt to General Ledger."""
        receipt = self.get_object()

        if receipt.journal:
            return Response(
                {'error': 'Receipt already posted to ledger'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            journal = receipt.post_to_ledger(request.user)
            return Response({
                'message': 'Receipt posted successfully',
                'receipt': ReceiptSerializer(receipt).data,
                'journal_number': journal.journal_number
            })
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def batch_process(self, request):
        """
        Batch process multiple receipts.
        Handles 100+ receipts in a single transaction block.
        """
        serializer = BulkReceiptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        receipts_data = serializer.validated_data['receipts']
        today = timezone.now().date()
        created_receipts = []
        errors = []

        for receipt_data in receipts_data:
            try:
                receipt = Receipt(
                    tenant_id=receipt_data['tenant_id'],
                    invoice_id=receipt_data.get('invoice_id'),
                    date=receipt_data.get('date', today),
                    amount=Decimal(str(receipt_data['amount'])),
                    currency=receipt_data.get('currency', 'USD'),
                    payment_method=receipt_data.get('payment_method', 'cash'),
                    reference=receipt_data.get('reference', ''),
                    bank_name=receipt_data.get('bank_name', ''),
                    description=receipt_data.get('description', ''),
                    created_by=request.user
                )
                receipt.save()
                # Auto-post to ledger
                receipt.post_to_ledger(request.user)
                created_receipts.append(receipt)
            except Exception as e:
                errors.append({
                    'data': receipt_data,
                    'error': str(e)
                })

        return Response({
            'created': len(created_receipts),
            'receipts': ReceiptSerializer(created_receipts, many=True).data,
            'errors': errors
        })

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def bulk_receipts(self, request):
        """Create multiple receipts in a single transaction."""
        receipts_data = request.data.get('receipts', [])
        if not receipts_data:
            return Response(
                {'error': 'receipts array is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        today = timezone.now().date()
        created_receipts = []
        errors = []

        for idx, receipt_data in enumerate(receipts_data):
            try:
                receipt = Receipt(
                    tenant_id=receipt_data['tenant_id'],
                    invoice_id=receipt_data.get('invoice_id'),
                    date=receipt_data.get('date', today),
                    amount=Decimal(str(receipt_data['amount'])),
                    currency=receipt_data.get('currency', 'USD'),
                    payment_method=receipt_data.get('payment_method', 'cash'),
                    reference=receipt_data.get('reference', ''),
                    bank_name=receipt_data.get('bank_name', ''),
                    description=receipt_data.get('description', ''),
                    created_by=request.user
                )
                receipt.save()
                created_receipts.append(receipt)
            except Exception as e:
                errors.append({
                    'index': idx,
                    'error': str(e)
                })

        return Response({
            'created': len(created_receipts),
            'receipts': ReceiptSerializer(created_receipts, many=True).data,
            'errors': errors,
        })

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get receipt summary statistics."""
        queryset = self.get_queryset()

        total_received = queryset.aggregate(Sum('amount'))['amount__sum'] or 0

        by_method = queryset.values('payment_method').annotate(
            count=Count('id'),
            total=Sum('amount')
        )

        by_currency = queryset.values('currency').annotate(
            count=Count('id'),
            total=Sum('amount')
        )

        return Response({
            'total_received': total_received,
            'by_payment_method': list(by_method),
            'by_currency': list(by_currency)
        })

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def reverse(self, request, pk=None):
        """Reverse a receipt -- creates negative entries on same sides."""
        receipt = self.get_object()
        if not receipt.journal:
            return Response(
                {'error': 'Receipt not yet posted'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = request.data.get('reason', 'Mispost reversed')

        # Create reversal receipt with negative amount
        reversal = Receipt(
            tenant=receipt.tenant,
            invoice=receipt.invoice,
            amount=-receipt.amount,  # NEGATIVE
            currency=receipt.currency,
            payment_method=receipt.payment_method,
            reference=receipt.reference,
            bank_account=receipt.bank_account,
            income_type=receipt.income_type,
            description=f'Mispost reversed-{receipt.description}',
            date=receipt.date,  # Same date as original
            created_by=request.user,
        )
        reversal.save()

        # Post reversal -- the negative amount will create negative entries on SAME sides
        reversal.post_to_ledger(request.user)

        # Mark subsidiary entries as reversals and link to originals
        from apps.accounting.models import SubsidiaryTransaction
        original_sub_txns = list(SubsidiaryTransaction.objects.filter(
            journal_entry__journal=receipt.journal
        ).order_by('id'))
        reversal_sub_txns = list(SubsidiaryTransaction.objects.filter(
            journal_entry__journal=reversal.journal
        ).order_by('id'))

        for rev_txn in reversal_sub_txns:
            rev_txn.is_reversal = True
            # Try to link to matching original by account
            for orig_txn in original_sub_txns:
                if orig_txn.account_id == rev_txn.account_id:
                    rev_txn.reversed_transaction = orig_txn
                    break
            rev_txn.save(update_fields=['is_reversal', 'reversed_transaction'])

        return Response({
            'message': f'Receipt reversed successfully. Reason: {reason}',
            'original_receipt': ReceiptSerializer(receipt).data,
            'reversal_receipt': ReceiptSerializer(reversal).data,
        })


class ExpenseViewSet(TenantSchemaValidationMixin, SoftDeleteMixin, viewsets.ModelViewSet):
    """CRUD for Expenses."""
    # Eager-load every FK the serializer dereferences. Without this each
    # row becomes 5+ extra queries (journal/bank/landlord/supplier/etc.)
    # and a list of 25 expenses balloons into 100+ round-trips.
    queryset = Expense.objects.select_related(
        'expense_category', 'expense_category__gl_account',
        'income_type', 'bank_account', 'landlord', 'supplier', 'journal',
        'approved_by', 'created_by',
    ).all()
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = [
        'expense_type', 'expense_kind', 'status', 'date', 'currency', 'payee_type',
        'expense_category', 'bank_account', 'landlord', 'sub_account_category',
        'supplier',
    ]
    search_fields = ['expense_number', 'payee_name', 'description', 'reference']
    ordering_fields = ['date', 'amount', 'created_at', 'expense_number', 'status']
    ordering = ['-date', '-created_at']

    def get_queryset(self):
        """Adds inclusive start_date/end_date range filtering on top of the
        exact `date` filter, used by the expenditure list and account
        drill-downs."""
        qs = super().get_queryset()
        start = self.request.query_params.get('start_date')
        end = self.request.query_params.get('end_date')
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)
        return qs

    def perform_destroy(self, instance):
        """Reverse the expense's ledger footprint before (soft-)deleting it, so
        a deleted expense never leaves a phantom balance on the landlord's
        statement or in the GL."""
        try:
            instance.reverse_postings(user=self.request.user)
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                'Failed to reverse postings for expense %s on delete', instance.pk)
        super().perform_destroy(instance)

    def perform_create(self, serializer):
        """Save the expense; optionally auto-post to ledger when the form
        passed `auto_post=true`. Auto-posting takes the expense straight
        from `pending` → `paid` (via approval) so users don't have to
        click through a two-step dance for routine entries.

        When a `supplier` was picked, auto-mirror its name/id into the
        legacy payee_* fields so existing reports + filters still work
        without needing every reader to learn about the supplier FK.
        """
        import logging
        save_kwargs = {'created_by': self.request.user}
        supplier = serializer.validated_data.get('supplier')
        if supplier is not None:
            # Only override payee_name when the user hasn't typed one.
            if not serializer.validated_data.get('payee_name'):
                save_kwargs['payee_name'] = supplier.name
            save_kwargs['payee_type'] = 'vendor'
            save_kwargs['payee_id'] = supplier.id
        expense = serializer.save(**save_kwargs)
        # Read the flag from the raw initial_data (it isn't a model field).
        raw = self.request.data
        auto_post = False
        if isinstance(raw, dict):
            auto_post = bool(raw.get('auto_post'))
        else:
            try:
                auto_post = bool(raw.get('auto_post'))  # type: ignore[union-attr]
            except Exception:
                auto_post = False
        if auto_post:
            try:
                expense.approved_by = self.request.user
                expense.approved_at = timezone.now()
                expense.status = Expense.Status.APPROVED
                expense.save(update_fields=['approved_by', 'approved_at', 'status'])
                expense.post_to_ledger(self.request.user)
            except Exception as e:
                logging.getLogger(__name__).warning(
                    f'Auto-post failed for expense {expense.expense_number}: {e}',
                    exc_info=True,
                )

    @action(detail=False, methods=['post'], url_path='bulk_create')
    def bulk_create(self, request):
        """Record multiple expenses sharing a date + bank account in one go.

        Body shape:
            {
                "date": "2026-05-02",
                "bank_account": 1,
                "lines": [
                    {
                        "expense_category": 7,
                        "landlord": 12,            // optional
                        "amount": "150.00",
                        "description": "Lawn mower hire",
                        "reference": ""            // optional
                    },
                    ...
                ]
            }

        Each line creates its own Expense and is posted to the GL
        independently. The action does NOT roll back the whole batch on
        a per-line failure — it returns whatever succeeded plus a list of
        error messages, so partial batches don't waste the user's typing.
        """
        from apps.accounting.models import BankAccount, ExpenseCategory
        from apps.masterfile.models import Landlord

        date = request.data.get('date')
        bank_account_id = request.data.get('bank_account')
        # Per-batch default; each line can still override. 'cash' / 'non_cash'.
        batch_kind = (request.data.get('expense_kind') or 'cash').lower()
        # Currency override only used when bank_account isn't provided
        # (i.e. non-cash batches). Cash batches always derive from the bank.
        batch_currency_override = request.data.get('currency')
        lines = request.data.get('lines') or []

        if not date:
            return Response({'error': 'date is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(lines, list) or len(lines) == 0:
            return Response({'error': 'lines must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)

        bank_account = None
        if bank_account_id:
            try:
                bank_account = BankAccount.objects.get(pk=bank_account_id)
            except BankAccount.DoesNotExist:
                return Response({'error': f'Bank account {bank_account_id} not found'}, status=status.HTTP_400_BAD_REQUEST)
        elif batch_kind == 'cash':
            return Response(
                {'error': 'bank_account is required for cash expenses'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Currency: prefer bank account; else explicit override; else USD.
        currency = (
            (bank_account.currency if bank_account else None)
            or batch_currency_override
            or 'USD'
        )
        created = []
        errors = []

        for idx, line in enumerate(lines):
            cat_id = line.get('expense_category')
            amount = line.get('amount')
            description = (line.get('description') or '').strip()
            reference = line.get('reference') or ''
            landlord_id = line.get('landlord')

            if not cat_id or not amount or not description:
                errors.append({
                    'line': idx + 1,
                    'error': 'expense_category, amount, and description are required',
                })
                continue

            try:
                category = ExpenseCategory.objects.get(pk=cat_id)
            except ExpenseCategory.DoesNotExist:
                errors.append({'line': idx + 1, 'error': f'Expense category {cat_id} not found'})
                continue

            landlord = None
            if landlord_id:
                landlord = Landlord.objects.filter(pk=landlord_id).first()
                if not landlord:
                    errors.append({'line': idx + 1, 'error': f'Landlord {landlord_id} not found'})
                    continue

            try:
                # Per-line kind override falls back to the batch default.
                line_kind = (line.get('expense_kind') or batch_kind).lower()
                if line_kind not in ('cash', 'non_cash'):
                    line_kind = 'cash'

                line_sub_account = (line.get('sub_account_category') or '').strip()
                expense = Expense.objects.create(
                    date=date,
                    # Non-cash rows leave bank_account null even if the batch
                    # passed one in — keeps the trust ledger from being touched.
                    bank_account=bank_account if line_kind == 'cash' else None,
                    currency=currency,
                    expense_category=category,
                    landlord=landlord,
                    sub_account_category=line_sub_account,
                    amount=amount,
                    description=description,
                    reference=reference,
                    payee_name=(landlord.name if landlord else 'Vendor'),
                    payee_type=('landlord' if landlord else 'vendor'),
                    payee_id=(landlord.id if landlord else None),
                    expense_type='other',
                    expense_kind=line_kind,
                    created_by=request.user,
                )
                # Auto-post each row so the batch lands in the GL immediately,
                # matching the single-expense flow.
                try:
                    expense.post_to_ledger(request.user)
                except Exception as post_err:
                    errors.append({
                        'line': idx + 1,
                        'expense_number': expense.expense_number,
                        'error': f'Created but post-to-ledger failed: {post_err}',
                    })
                created.append(ExpenseSerializer(expense).data)
            except Exception as create_err:
                errors.append({'line': idx + 1, 'error': str(create_err)})

        return Response({
            'created': created,
            'errors': errors,
            'created_count': len(created),
            'error_count': len(errors),
        }, status=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve an expense."""
        expense = self.get_object()

        if expense.status != Expense.Status.PENDING:
            return Response(
                {'error': 'Only pending expenses can be approved'},
                status=status.HTTP_400_BAD_REQUEST
            )

        expense.status = Expense.Status.APPROVED
        expense.approved_by = request.user
        expense.approved_at = timezone.now()
        expense.save()

        # Email staff about expense approval
        try:
            from apps.notifications.utils import send_staff_email
            send_staff_email(
                f'Expense Approved: {expense.currency} {expense.amount:,.2f} - {expense.expense_number}',
                f"""An expense has been approved.

Expense Details:
- Expense Number: {expense.expense_number}
- Type: {expense.get_expense_type_display()}
- Payee: {expense.payee_name}
- Amount: {expense.currency} {expense.amount:,.2f}
- Description: {expense.description}
- Approved By: {request.user.get_full_name() or request.user.email}

This expense is now ready for payment.

Best regards,
Parameter System
"""
            )
        except Exception:
            pass

        return Response(ExpenseSerializer(expense).data)

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        """Pay an approved expense."""
        expense = self.get_object()

        if expense.status != Expense.Status.APPROVED:
            return Response(
                {'error': 'Only approved expenses can be paid'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            journal = expense.post_to_ledger(request.user)

            # Email staff about expense payment
            try:
                from apps.notifications.utils import send_staff_email
                send_staff_email(
                    f'Expense Paid: {expense.currency} {expense.amount:,.2f} - {expense.expense_number}',
                    f"""An expense has been paid and posted to the ledger.

Expense Details:
- Expense Number: {expense.expense_number}
- Type: {expense.get_expense_type_display()}
- Payee: {expense.payee_name}
- Amount: {expense.currency} {expense.amount:,.2f}
- Journal: {journal.journal_number}
- Paid By: {request.user.get_full_name() or request.user.email}

Best regards,
Parameter System
"""
                )
            except Exception:
                pass

            # Email landlord if expense is on their property (maintenance/utility)
            if expense.expense_type in ('maintenance', 'utility') and expense.payee_type == 'landlord' and expense.payee_id:
                try:
                    from apps.notifications.utils import send_landlord_email
                    from apps.masterfile.models import Landlord
                    landlord = Landlord.objects.filter(id=expense.payee_id).first()
                    if landlord:
                        send_landlord_email(
                            landlord,
                            f'Expense on Your Property: {expense.currency} {expense.amount:,.2f}',
                            f"""Dear {landlord.name},

An expense has been incurred on your property.

Expense Details:
- Expense Number: {expense.expense_number}
- Type: {expense.get_expense_type_display()}
- Amount: {expense.currency} {expense.amount:,.2f}
- Description: {expense.description}
- Date: {expense.date}
- Reference: {expense.reference or 'N/A'}

This amount may be deducted from your rental income as per your management agreement.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
                        )
                except Exception:
                    pass

            return Response({
                'message': 'Expense paid successfully',
                'expense': ExpenseSerializer(expense).data,
                'journal_number': journal.journal_number
            })
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class LatePenaltyConfigViewSet(viewsets.ModelViewSet):
    """CRUD for late penalty configurations."""
    queryset = LatePenaltyConfig.objects.select_related('property', 'tenant').all()
    serializer_class = LatePenaltyConfigSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['property', 'tenant', 'penalty_type', 'is_enabled', 'currency']
    search_fields = ['property__name', 'tenant__name', 'tenant__code']
    ordering_fields = ['created_at', 'percentage_rate', 'flat_fee']
    ordering = ['-created_at']

    @action(detail=False, methods=['get'])
    def for_property(self, request):
        """Get penalty config applicable to a property."""
        property_id = request.query_params.get('property_id')
        if not property_id:
            return Response({'error': 'property_id required'}, status=400)

        configs = self.get_queryset().filter(
            Q(property_id=property_id) | Q(property__isnull=True, tenant__isnull=True),
            is_enabled=True
        )
        return Response(LatePenaltyConfigSerializer(configs, many=True).data)

    @action(detail=False, methods=['get'])
    def penalty_invoices(self, request):
        """Get all auto-generated penalty invoices."""
        invoices = Invoice.objects.filter(
            invoice_type='penalty'
        ).select_related('tenant', 'unit', 'property').order_by('-created_at')

        property_id = request.query_params.get('property_id')
        if property_id:
            invoices = invoices.filter(property_id=property_id)

        return Response(InvoiceSerializer(invoices[:100], many=True).data)

    @action(detail=False, methods=['post'])
    def apply_now(self, request):
        """Manually trigger late penalty processing for overdue invoices."""
        from .tasks import _apply_late_penalties
        try:
            # First mark overdue invoices (sent/partial with past due dates)
            today = timezone.now().date()
            marked = Invoice.objects.filter(
                due_date__lt=today,
                status__in=['sent', 'partial'],
                balance__gt=0
            ).exclude(invoice_type='penalty').update(status='overdue')

            count = _apply_late_penalties()
            return Response({
                'message': f'Applied {count} late {"penalty" if count == 1 else "penalties"}'
                           + (f' ({marked} invoices marked overdue)' if marked else ''),
                'penalties_created': count,
                'invoices_marked_overdue': marked,
            })
        except Exception as e:
            logger.error(f"Failed to apply penalties: {e}")
            return Response(
                {'error': f'Failed to apply penalties: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def overdue_summary(self, request):
        """Get summary of overdue invoices eligible for penalties."""
        overdue = Invoice.objects.filter(
            status='overdue', balance__gt=0
        ).exclude(invoice_type='penalty')

        excluded_tenant_ids = LatePenaltyExclusion.objects.filter(
            Q(excluded_until__isnull=True) | Q(excluded_until__gte=timezone.now().date())
        ).values_list('tenant_id', flat=True)

        eligible = overdue.exclude(tenant_id__in=excluded_tenant_ids)

        return Response({
            'total_overdue': overdue.count(),
            'excluded': overdue.filter(tenant_id__in=excluded_tenant_ids).count(),
            'eligible_for_penalty': eligible.count(),
            'total_overdue_amount': str(overdue.aggregate(total=Sum('balance'))['total'] or 0),
        })


class LatePenaltyExclusionViewSet(viewsets.ModelViewSet):
    """CRUD for late penalty exclusions."""
    queryset = LatePenaltyExclusion.objects.select_related('tenant', 'excluded_by').all()
    serializer_class = LatePenaltyExclusionSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['tenant', 'excluded_by']
    search_fields = ['tenant__name', 'tenant__code', 'reason']
    ordering_fields = ['created_at', 'excluded_until']
    ordering = ['-created_at']

    def perform_create(self, serializer):
        serializer.save(excluded_by=self.request.user)
