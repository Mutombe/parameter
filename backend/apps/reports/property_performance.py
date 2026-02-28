"""Property-level Profit & Loss report."""
from decimal import Decimal
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q
from datetime import date


class PropertyPerformanceView(APIView):
    """Returns income, expenses, net, and occupancy for a property over a date range."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.masterfile.models import Property
        from apps.billing.models import Invoice, Receipt, Expense

        try:
            property_obj = Property.objects.get(pk=pk)
        except Property.DoesNotExist:
            return Response({'error': 'Property not found'}, status=404)

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        if not date_from or not date_to:
            today = date.today()
            date_from = date(today.year, 1, 1).isoformat()
            date_to = today.isoformat()

        # Income: receipts linked to invoices for this property
        receipt_filter = Q(
            invoice__unit__property=property_obj,
            date__gte=date_from,
            date__lte=date_to,
        )
        receipts = Receipt.objects.filter(receipt_filter)

        income_breakdown = list(
            receipts.values('invoice__invoice_type')
            .annotate(total=Sum('amount'), count=Count('id'))
            .order_by('-total')
        )
        total_income = receipts.aggregate(total=Sum('amount'))['total'] or Decimal('0')

        # Expenses linked to this property
        expense_filter = Q(date__gte=date_from, date__lte=date_to)
        # Try to filter expenses by property if there's a property field
        expenses = Expense.objects.filter(expense_filter)
        # If expenses have a property relation, filter by it
        if hasattr(Expense, 'property'):
            expenses = expenses.filter(property=property_obj)

        expense_breakdown = list(
            expenses.values('expense_type')
            .annotate(total=Sum('amount'), count=Count('id'))
            .order_by('-total')
        )
        total_expenses = expenses.aggregate(total=Sum('amount'))['total'] or Decimal('0')

        # Invoiced amount
        invoice_filter = Q(
            unit__property=property_obj,
            date__gte=date_from,
            date__lte=date_to,
        )
        invoices = Invoice.objects.filter(invoice_filter)
        total_invoiced = invoices.aggregate(total=Sum('total_amount'))['total'] or Decimal('0')

        # Occupancy
        total_units = property_obj.units.count()
        occupied_units = property_obj.units.filter(is_occupied=True).count()
        occupancy_rate = (Decimal(occupied_units) / Decimal(total_units) * 100) if total_units > 0 else Decimal('0')

        net_income = total_income - total_expenses

        return Response({
            'property': {
                'id': property_obj.id,
                'code': property_obj.code,
                'name': property_obj.name,
            },
            'period': {'from': date_from, 'to': date_to},
            'income_breakdown': [
                {
                    'type': item['invoice__invoice_type'] or 'Other',
                    'total': str(item['total']),
                    'count': item['count'],
                }
                for item in income_breakdown
            ],
            'expense_breakdown': [
                {
                    'type': item['expense_type'] or 'Other',
                    'total': str(item['total']),
                    'count': item['count'],
                }
                for item in expense_breakdown
            ],
            'total_invoiced': str(total_invoiced),
            'total_income': str(total_income),
            'total_expenses': str(total_expenses),
            'net_income': str(net_income),
            'occupancy': {
                'total_units': total_units,
                'occupied_units': occupied_units,
                'occupancy_rate': str(occupancy_rate),
            },
        })
