"""ZIMRA Tax Compliance Reports."""
from decimal import Decimal
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q
from datetime import date


class VATReturnView(APIView):
    """Generates VAT return data: output VAT (from receipts), input VAT (from expenses)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.billing.models import Invoice, Receipt, Expense

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        if not date_from or not date_to:
            today = date.today()
            date_from = date(today.year, today.month, 1).isoformat()
            date_to = today.isoformat()

        # Output VAT - from invoices
        invoices = Invoice.objects.filter(
            date__gte=date_from,
            date__lte=date_to,
        )
        output_vat = invoices.aggregate(
            total_vat=Sum('vat_amount'),
            total_amount=Sum('total_amount'),
            total_base=Sum('amount'),
        )

        # Input VAT - from expenses (estimated at 15% VAT rate if not tracked)
        expenses = Expense.objects.filter(
            date__gte=date_from,
            date__lte=date_to,
            status__in=['approved', 'paid'],
        )
        expense_total = expenses.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        # Estimate input VAT at 15% of expenses (standard ZIMRA VAT rate)
        estimated_input_vat = expense_total * Decimal('15') / Decimal('115')

        output_vat_total = output_vat['total_vat'] or Decimal('0')
        net_vat = output_vat_total - estimated_input_vat

        return Response({
            'period': {'from': date_from, 'to': date_to},
            'output_vat': {
                'total_sales': str(output_vat['total_amount'] or 0),
                'base_amount': str(output_vat['total_base'] or 0),
                'vat_amount': str(output_vat_total),
            },
            'input_vat': {
                'total_purchases': str(expense_total),
                'estimated_vat': str(estimated_input_vat),
            },
            'net_vat_payable': str(net_vat),
            'invoice_count': invoices.count(),
            'expense_count': expenses.count(),
        })


class WithholdingTaxView(APIView):
    """Summarizes rental withholding tax at 10% of gross rental income."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.billing.models import Receipt

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        if not date_from or not date_to:
            today = date.today()
            date_from = date(today.year, 1, 1).isoformat()
            date_to = today.isoformat()

        # Rental income receipts
        receipts = Receipt.objects.filter(
            date__gte=date_from,
            date__lte=date_to,
        )

        # Group by month
        from django.db.models.functions import TruncMonth
        monthly = list(
            receipts.annotate(month=TruncMonth('date'))
            .values('month')
            .annotate(
                gross_income=Sum('amount'),
                receipt_count=Count('id'),
            )
            .order_by('month')
        )

        total_gross = receipts.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        withholding_tax_rate = Decimal('10')  # 10% ZIMRA withholding tax
        total_withholding = total_gross * withholding_tax_rate / Decimal('100')

        return Response({
            'period': {'from': date_from, 'to': date_to},
            'withholding_tax_rate': str(withholding_tax_rate),
            'total_gross_income': str(total_gross),
            'total_withholding_tax': str(total_withholding),
            'monthly_breakdown': [
                {
                    'month': item['month'].isoformat() if item['month'] else None,
                    'gross_income': str(item['gross_income']),
                    'withholding_tax': str(item['gross_income'] * withholding_tax_rate / Decimal('100')),
                    'receipt_count': item['receipt_count'],
                }
                for item in monthly
            ],
        })


class AnnualIncomeSummaryView(APIView):
    """Annual income summary grouped by income type for ZIMRA filing."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.billing.models import Invoice, Receipt

        year = request.query_params.get('year', str(date.today().year))
        date_from = f'{year}-01-01'
        date_to = f'{year}-12-31'

        # Income by type from invoices
        invoices = Invoice.objects.filter(
            date__gte=date_from,
            date__lte=date_to,
        )

        by_type = list(
            invoices.values('invoice_type')
            .annotate(
                total_invoiced=Sum('total_amount'),
                total_collected=Sum('amount_paid'),
                count=Count('id'),
            )
            .order_by('-total_invoiced')
        )

        total_invoiced = invoices.aggregate(total=Sum('total_amount'))['total'] or Decimal('0')
        total_collected = invoices.aggregate(total=Sum('amount_paid'))['total'] or Decimal('0')
        total_outstanding = total_invoiced - total_collected

        # Receipts summary
        receipts = Receipt.objects.filter(
            date__gte=date_from,
            date__lte=date_to,
        )
        total_receipts = receipts.aggregate(total=Sum('amount'))['total'] or Decimal('0')

        return Response({
            'year': year,
            'period': {'from': date_from, 'to': date_to},
            'income_by_type': [
                {
                    'type': item['invoice_type'] or 'Other',
                    'total_invoiced': str(item['total_invoiced']),
                    'total_collected': str(item['total_collected'] or 0),
                    'outstanding': str((item['total_invoiced'] or Decimal('0')) - (item['total_collected'] or Decimal('0'))),
                    'count': item['count'],
                }
                for item in by_type
            ],
            'summary': {
                'total_invoiced': str(total_invoiced),
                'total_collected': str(total_collected),
                'total_outstanding': str(total_outstanding),
                'total_receipts': str(total_receipts),
            },
        })
