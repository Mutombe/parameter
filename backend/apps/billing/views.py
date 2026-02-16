"""Views for billing module."""
from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.db.models import Sum, Count, Q
from django.utils import timezone
from django.core.mail import send_mass_mail, send_mail
from django.conf import settings
from datetime import date
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

logger = logging.getLogger(__name__)


class InvoiceViewSet(viewsets.ModelViewSet):
    """CRUD for Invoices."""
    queryset = Invoice.objects.select_related(
        'tenant', 'unit', 'lease', 'unit__property', 'created_by', 'journal'
    ).all()
    permission_classes = [IsAuthenticated]
    filterset_fields = ['tenant', 'unit', 'invoice_type', 'status', 'date', 'currency']
    search_fields = ['invoice_number', 'tenant__name', 'description']
    ordering_fields = ['date', 'due_date', 'total_amount']
    ordering = ['-date', '-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return InvoiceCreateSerializer
        return InvoiceSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

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
        Generate monthly rent invoices for all active leases.
        This is the automated billing cron job (Activity 1).
        """
        serializer = BulkInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        month = serializer.validated_data['month']
        year = serializer.validated_data['year']
        lease_ids = serializer.validated_data.get('lease_ids', [])

        # Get active leases
        leases = LeaseAgreement.objects.filter(status='active')
        if lease_ids:
            leases = leases.filter(id__in=lease_ids)

        # Get date range for the period
        _, last_day = monthrange(year, month)
        period_start = date(year, month, 1)
        period_end = date(year, month, last_day)
        invoice_date = date.today()
        due_date = date(year, month, 15)  # Due on 15th

        created_invoices = []
        errors = []

        for lease in leases:
            # Check if invoice already exists for this period
            existing = Invoice.objects.filter(
                lease=lease,
                period_start=period_start,
                period_end=period_end
            ).exists()

            if existing:
                errors.append(f'Invoice already exists for {lease.lease_number}')
                continue

            try:
                invoice = Invoice.objects.create(
                    tenant=lease.tenant,
                    lease=lease,
                    unit=lease.unit,
                    invoice_type=Invoice.InvoiceType.RENT,
                    date=invoice_date,
                    due_date=due_date,
                    period_start=period_start,
                    period_end=period_end,
                    amount=lease.monthly_rent,
                    vat_amount=Decimal('0'),
                    currency=lease.currency,
                    description=f'Rent for {period_start.strftime("%B %Y")} - {lease.unit}',
                    created_by=request.user
                )
                created_invoices.append(invoice)
            except Exception as e:
                errors.append(f'Error creating invoice for {lease.lease_number}: {str(e)}')

        return Response({
            'created': len(created_invoices),
            'invoices': InvoiceSerializer(created_invoices, many=True).data,
            'errors': errors
        })

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

        created_invoices = []
        errors = []

        for lease in leases:
            try:
                # Check for duplicate
                existing = Invoice.objects.filter(
                    lease=lease,
                    invoice_type=invoice_type,
                    period_start=period_start,
                    period_end=period_end
                ).exists()

                if existing:
                    errors.append(f'Invoice already exists for lease {lease.lease_number}')
                    continue

                invoice = Invoice.objects.create(
                    tenant=lease.tenant,
                    lease=lease,
                    unit=lease.unit,
                    property=property_obj,
                    invoice_type=invoice_type,
                    date=timezone.now().date(),
                    due_date=due_date or (timezone.now().date() + timezone.timedelta(days=15)),
                    period_start=period_start,
                    period_end=period_end,
                    amount=amount,
                    vat_amount=Decimal('0'),
                    currency=lease.currency,
                    description=description or f'{invoice_type.title()} charge for {lease.unit}',
                    created_by=request.user
                )
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
        tenant = getattr(request, 'tenant', None)
        company_name = tenant.name if tenant else 'Property Management'
        site_url = getattr(settings, 'SITE_URL', 'https://parameter.co.zw')

        sent = []
        failed = []

        for invoice in invoices:
            if not invoice.tenant.email:
                failed.append({
                    'invoice': invoice.invoice_number,
                    'error': 'No email address'
                })
                continue

            try:
                subject = subject_template.format(
                    company_name=company_name,
                    invoice_number=invoice.invoice_number
                )

                default_message = f"""
Dear {invoice.tenant.name},

Please find your invoice details below:

Invoice Number: {invoice.invoice_number}
Amount Due: {invoice.currency} {invoice.balance:,.2f}
Due Date: {invoice.due_date}
Description: {invoice.description}

Property: {invoice.unit.property.name if invoice.unit else 'N/A'}
Unit: {invoice.unit.unit_number if invoice.unit else 'N/A'}

Please ensure payment is made by the due date to avoid any late fees.

Thank you for your prompt attention.

Best regards,
{company_name}
"""
                message = message_template or default_message

                send_mail(
                    subject=subject,
                    message=message,
                    from_email=f'{company_name} <{settings.DEFAULT_FROM_EMAIL}>',
                    recipient_list=[invoice.tenant.email],
                    fail_silently=False
                )

                # Update status
                if invoice.status == 'draft':
                    invoice.status = 'sent'
                    invoice.save()

                sent.append({
                    'invoice': invoice.invoice_number,
                    'email': invoice.tenant.email
                })

            except Exception as e:
                logger.error(f'Failed to send invoice {invoice.invoice_number}: {e}')
                failed.append({
                    'invoice': invoice.invoice_number,
                    'error': str(e)
                })

        return Response({
            'message': f'Sent {len(sent)} invoice(s)',
            'sent': sent,
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

        sent = []
        failed = []

        for recipient in tenants:
            try:
                personalized_message = message.format(
                    tenant_name=recipient.name,
                    company_name=company_name
                )

                send_mail(
                    subject=subject,
                    message=personalized_message,
                    from_email=f'{company_name} <{settings.DEFAULT_FROM_EMAIL}>',
                    recipient_list=[recipient.email],
                    fail_silently=False
                )

                sent.append({
                    'tenant_id': recipient.id,
                    'name': recipient.name,
                    'email': recipient.email
                })

            except Exception as e:
                logger.error(f'Failed to send email to {recipient.email}: {e}')
                failed.append({
                    'tenant_id': recipient.id,
                    'name': recipient.name,
                    'email': recipient.email,
                    'error': str(e)
                })

        # Audit trail
        AuditTrail.objects.create(
            action='bulk_email_sent',
            model_name='RentalTenant',
            record_id=0,
            changes={
                'subject': subject,
                'recipients_count': len(sent),
                'failed_count': len(failed)
            },
            user=request.user
        )

        return Response({
            'message': f'Email sent to {len(sent)} recipient(s)',
            'sent_count': len(sent),
            'failed_count': len(failed),
            'sent': sent,
            'failed': failed
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


class ReceiptViewSet(viewsets.ModelViewSet):
    """CRUD for Receipts."""
    queryset = Receipt.objects.select_related(
        'tenant', 'invoice', 'invoice__unit', 'created_by', 'journal'
    ).all()
    permission_classes = [IsAuthenticated]
    filterset_fields = ['tenant', 'invoice', 'payment_method', 'date', 'currency']
    search_fields = ['receipt_number', 'tenant__name', 'reference']
    ordering_fields = ['date', 'amount']
    ordering = ['-date', '-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return ReceiptCreateSerializer
        return ReceiptSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

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
        created_receipts = []
        errors = []

        for receipt_data in receipts_data:
            try:
                receipt = Receipt.objects.create(
                    tenant_id=receipt_data['tenant_id'],
                    invoice_id=receipt_data.get('invoice_id'),
                    date=receipt_data.get('date', timezone.now().date()),
                    amount=Decimal(str(receipt_data['amount'])),
                    currency=receipt_data.get('currency', 'USD'),
                    payment_method=receipt_data.get('payment_method', 'cash'),
                    reference=receipt_data.get('reference', ''),
                    bank_name=receipt_data.get('bank_name', ''),
                    description=receipt_data.get('description', ''),
                    created_by=request.user
                )
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


class ExpenseViewSet(viewsets.ModelViewSet):
    """CRUD for Expenses."""
    queryset = Expense.objects.select_related(
        'created_by', 'approved_by', 'journal'
    ).all()
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['expense_type', 'status', 'date', 'currency']
    search_fields = ['expense_number', 'payee_name', 'description']
    ordering_fields = ['date', 'amount']
    ordering = ['-date', '-created_at']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

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
    filterset_fields = ['property', 'tenant', 'penalty_type', 'is_enabled']
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
    filterset_fields = ['tenant']
    ordering = ['-created_at']

    def perform_create(self, serializer):
        serializer.save(excluded_by=self.request.user)
