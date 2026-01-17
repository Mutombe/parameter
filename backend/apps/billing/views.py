"""Views for billing module."""
from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import date
from calendar import monthrange
from .models import Invoice, Receipt, Expense
from .serializers import (
    InvoiceSerializer, InvoiceCreateSerializer,
    ReceiptSerializer, ReceiptCreateSerializer,
    ExpenseSerializer, BulkInvoiceSerializer, BulkReceiptSerializer
)
from apps.masterfile.models import LeaseAgreement


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
