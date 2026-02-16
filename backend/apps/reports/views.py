"""Views for financial reports."""
from decimal import Decimal
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q, F, Avg, Case, When, Value, CharField
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone
from django.http import HttpResponse
from datetime import timedelta, date
import csv
import io
from apps.accounting.models import ChartOfAccount, GeneralLedger, Journal, BankAccount, IncomeType
from apps.billing.models import Invoice, Receipt, Expense
from apps.masterfile.models import Property, Unit, Landlord, RentalTenant, LeaseAgreement


class DashboardStatsView(APIView):
    """Dashboard KPIs and statistics. Optimized to ~5 queries instead of 15+."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.now().date()
        month_start = today.replace(day=1)
        thirty_days = today + timedelta(days=30)
        six_months_ago = (today - timedelta(days=180)).replace(day=1)

        # === Query 1: All property/unit stats in one query ===
        unit_stats = Unit.objects.aggregate(
            total_units=Count('id'),
            vacant_units=Count('id', filter=Q(is_occupied=False)),
        )
        total_units = unit_stats['total_units'] or 0
        vacant_units = unit_stats['vacant_units'] or 0
        occupancy_rate = ((total_units - vacant_units) / total_units * 100) if total_units else 0

        # === Query 2: All invoice stats in one query ===
        inv_stats = Invoice.objects.aggregate(
            total_invoiced=Coalesce(Sum('total_amount'), Decimal('0')),
            monthly_invoiced=Coalesce(Sum('total_amount', filter=Q(date__gte=month_start)), Decimal('0')),
            overdue_count=Count('id', filter=Q(status__in=['sent', 'partial'], due_date__lt=today)),
            overdue_amount=Coalesce(Sum('balance', filter=Q(status__in=['sent', 'partial'], due_date__lt=today)), Decimal('0')),
        )

        # === Query 3: All receipt stats in one query ===
        rcpt_stats = Receipt.objects.aggregate(
            total_collected=Coalesce(Sum('amount'), Decimal('0')),
            monthly_collected=Coalesce(Sum('amount', filter=Q(date__gte=month_start)), Decimal('0')),
        )

        total_invoiced = inv_stats['total_invoiced']
        total_collected = rcpt_stats['total_collected']

        # === Query 4: All entity counts in one pass ===
        total_properties = Property.objects.count()
        landlord_count = Landlord.objects.count()
        tenant_count = RentalTenant.objects.count()
        lease_stats = LeaseAgreement.objects.aggregate(
            active=Count('id', filter=Q(status='active')),
            expiring=Count('id', filter=Q(status='active', end_date__lte=thirty_days)),
        )

        # === Query 5 & 6: Revenue trend (already efficient aggregations) ===
        monthly_invoices = Invoice.objects.filter(
            date__gte=six_months_ago
        ).annotate(
            month=TruncMonth('date')
        ).values('month').annotate(
            total=Coalesce(Sum('total_amount'), Decimal('0'))
        ).order_by('month')

        monthly_receipts = Receipt.objects.filter(
            date__gte=six_months_ago
        ).annotate(
            month=TruncMonth('date')
        ).values('month').annotate(
            total=Coalesce(Sum('amount'), Decimal('0'))
        ).order_by('month')

        invoice_by_month = {r['month'].strftime('%b'): float(r['total']) for r in monthly_invoices}
        receipt_by_month = {r['month'].strftime('%b'): float(r['total']) for r in monthly_receipts}

        revenue_trend = []
        current = six_months_ago
        while current <= today:
            label = current.strftime('%b')
            revenue_trend.append({
                'month': label,
                'invoiced': invoice_by_month.get(label, 0),
                'collected': receipt_by_month.get(label, 0),
            })
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

        return Response({
            'properties': {
                'total': total_properties,
                'units': total_units,
                'vacant': vacant_units,
                'occupancy_rate': round(occupancy_rate, 1)
            },
            'financial': {
                'total_invoiced': float(total_invoiced),
                'total_collected': float(total_collected),
                'outstanding': float(total_invoiced - total_collected),
                'collection_rate': round((float(total_collected) / float(total_invoiced) * 100), 1) if total_invoiced else 0
            },
            'monthly': {
                'invoiced': float(inv_stats['monthly_invoiced']),
                'collected': float(rcpt_stats['monthly_collected'])
            },
            'alerts': {
                'overdue_invoices': inv_stats['overdue_count'],
                'overdue_amount': float(inv_stats['overdue_amount']),
                'expiring_leases': lease_stats['expiring']
            },
            'counts': {
                'landlords': landlord_count,
                'tenants': tenant_count,
                'active_leases': lease_stats['active']
            },
            'revenue_trend': revenue_trend,
        })


class TrialBalanceReportView(APIView):
    """Trial Balance Report."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        as_of_date = request.query_params.get('as_of_date', timezone.now().date())

        accounts = ChartOfAccount.objects.filter(is_active=True).order_by('code')

        report_data = []
        total_debits = Decimal('0')
        total_credits = Decimal('0')

        for account in accounts:
            balance = account.current_balance

            if account.normal_balance == 'debit':
                debit = balance if balance >= 0 else Decimal('0')
                credit = abs(balance) if balance < 0 else Decimal('0')
            else:
                credit = balance if balance >= 0 else Decimal('0')
                debit = abs(balance) if balance < 0 else Decimal('0')

            if debit or credit:
                report_data.append({
                    'code': account.code,
                    'name': account.name,
                    'type': account.account_type,
                    'debit': float(debit),
                    'credit': float(credit)
                })
                total_debits += debit
                total_credits += credit

        return Response({
            'report_name': 'Trial Balance',
            'as_of_date': str(as_of_date),
            'accounts': report_data,
            'totals': {
                'debits': float(total_debits),
                'credits': float(total_credits),
                'balanced': total_debits == total_credits,
                'difference': float(abs(total_debits - total_credits))
            }
        })


class IncomeStatementView(APIView):
    """Profit & Loss Statement."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date', timezone.now().date())

        # Revenue accounts
        revenue_accounts = ChartOfAccount.objects.filter(
            account_type='revenue', is_active=True
        )
        total_revenue = sum(acc.current_balance for acc in revenue_accounts)

        # Expense accounts
        expense_accounts = ChartOfAccount.objects.filter(
            account_type='expense', is_active=True
        )
        total_expenses = sum(acc.current_balance for acc in expense_accounts)

        net_income = total_revenue - total_expenses

        return Response({
            'report_name': 'Income Statement',
            'period': {
                'start': start_date,
                'end': str(end_date)
            },
            'revenue': {
                'accounts': [
                    {'code': a.code, 'name': a.name, 'balance': float(a.current_balance)}
                    for a in revenue_accounts if a.current_balance
                ],
                'total': float(total_revenue)
            },
            'expenses': {
                'accounts': [
                    {'code': a.code, 'name': a.name, 'balance': float(a.current_balance)}
                    for a in expense_accounts if a.current_balance
                ],
                'total': float(total_expenses)
            },
            'net_income': float(net_income),
            'is_profit': net_income >= 0
        })


class BalanceSheetView(APIView):
    """Balance Sheet Report."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        as_of_date = request.query_params.get('as_of_date', timezone.now().date())

        # Assets
        asset_accounts = ChartOfAccount.objects.filter(
            account_type='asset', is_active=True
        )
        total_assets = sum(acc.current_balance for acc in asset_accounts)

        # Liabilities
        liability_accounts = ChartOfAccount.objects.filter(
            account_type='liability', is_active=True
        )
        total_liabilities = sum(acc.current_balance for acc in liability_accounts)

        # Equity
        equity_accounts = ChartOfAccount.objects.filter(
            account_type='equity', is_active=True
        )
        total_equity = sum(acc.current_balance for acc in equity_accounts)

        # Check balance
        total_liab_equity = total_liabilities + total_equity

        return Response({
            'report_name': 'Balance Sheet',
            'as_of_date': str(as_of_date),
            'assets': {
                'accounts': [
                    {'code': a.code, 'name': a.name, 'balance': float(a.current_balance)}
                    for a in asset_accounts if a.current_balance
                ],
                'total': float(total_assets)
            },
            'liabilities': {
                'accounts': [
                    {'code': a.code, 'name': a.name, 'balance': float(a.current_balance)}
                    for a in liability_accounts if a.current_balance
                ],
                'total': float(total_liabilities)
            },
            'equity': {
                'accounts': [
                    {'code': a.code, 'name': a.name, 'balance': float(a.current_balance)}
                    for a in equity_accounts if a.current_balance
                ],
                'total': float(total_equity)
            },
            'totals': {
                'assets': float(total_assets),
                'liabilities_equity': float(total_liab_equity),
                'balanced': abs(total_assets - total_liab_equity) < Decimal('0.01')
            }
        })


class VacancyReportView(APIView):
    """Vacancy Report by Property."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        properties = Property.objects.select_related('landlord').annotate(
            unit_count=Count('units'),
            vacant_count=Count('units', filter=Q(units__is_occupied=False)),
            occupied_count=Count('units', filter=Q(units__is_occupied=True))
        )

        report_data = []
        total_units = 0
        total_vacant = 0

        for prop in properties:
            vacancy_rate = (prop.vacant_count / prop.unit_count * 100) if prop.unit_count else 0
            report_data.append({
                'property_id': prop.id,
                'code': prop.code,
                'name': prop.name,
                'landlord': prop.landlord.name,
                'total_units': prop.unit_count,
                'occupied': prop.occupied_count,
                'vacant': prop.vacant_count,
                'vacancy_rate': round(vacancy_rate, 1)
            })
            total_units += prop.unit_count
            total_vacant += prop.vacant_count

        return Response({
            'report_name': 'Vacancy Report',
            'generated_at': timezone.now().isoformat(),
            'properties': report_data,
            'summary': {
                'total_properties': len(report_data),
                'total_units': total_units,
                'total_vacant': total_vacant,
                'overall_vacancy_rate': round((total_vacant / total_units * 100), 1) if total_units else 0
            }
        })


class RentRollView(APIView):
    """Rent Roll Report - All active leases with rental amounts."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        leases = LeaseAgreement.objects.filter(
            status='active'
        ).select_related('tenant', 'unit', 'unit__property')

        report_data = []
        total_rent = Decimal('0')

        for lease in leases:
            report_data.append({
                'lease_number': lease.lease_number,
                'tenant': lease.tenant.name,
                'property': lease.unit.property.name,
                'unit': lease.unit.unit_number,
                'monthly_rent': float(lease.monthly_rent),
                'currency': lease.currency,
                'start_date': str(lease.start_date),
                'end_date': str(lease.end_date)
            })
            total_rent += lease.monthly_rent

        return Response({
            'report_name': 'Rent Roll',
            'generated_at': timezone.now().isoformat(),
            'leases': report_data,
            'summary': {
                'total_leases': len(report_data),
                'total_monthly_rent': float(total_rent)
            }
        })


class LandlordStatementView(APIView):
    """Landlord Statement - Income and disbursements."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        landlord_id = request.query_params.get('landlord_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date', timezone.now().date())

        if not landlord_id:
            return Response({'error': 'landlord_id is required'}, status=400)

        try:
            landlord = Landlord.objects.get(id=landlord_id)
        except Landlord.DoesNotExist:
            return Response({'error': 'Landlord not found'}, status=404)

        # Get properties
        properties = landlord.properties.all()
        units = Unit.objects.filter(property__in=properties)

        # Get invoices for these units
        invoices = Invoice.objects.filter(unit__in=units)
        if start_date:
            invoices = invoices.filter(date__gte=start_date)
        invoices = invoices.filter(date__lte=end_date)

        # Get receipts
        total_invoiced = invoices.aggregate(Sum('total_amount'))['total_amount__sum'] or 0
        total_collected = invoices.aggregate(Sum('amount_paid'))['amount_paid__sum'] or 0

        # Calculate commission
        commission_rate = landlord.commission_rate / 100
        commission = total_collected * commission_rate
        net_payable = total_collected - commission

        return Response({
            'report_name': 'Landlord Statement',
            'landlord': {
                'id': landlord.id,
                'code': landlord.code,
                'name': landlord.name
            },
            'period': {
                'start': start_date,
                'end': str(end_date)
            },
            'summary': {
                'total_invoiced': float(total_invoiced),
                'total_collected': float(total_collected),
                'commission_rate': float(landlord.commission_rate),
                'commission_amount': float(commission),
                'net_payable': float(net_payable)
            },
            'properties': [
                {
                    'name': p.name,
                    'units': p.unit_count
                }
                for p in properties.annotate(unit_count=Count('units'))
            ]
        })


class CashFlowStatementView(APIView):
    """Cash Flow Statement Report."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date', timezone.now().date())

        # Build date filter
        date_filter = Q(date__lte=end_date)
        if start_date:
            date_filter &= Q(date__gte=start_date)

        # Operating Activities - Cash Inflows
        # Receipts from tenants
        tenant_receipts = Receipt.objects.filter(date_filter).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')

        # Operating Activities - Cash Outflows
        # Get expense-related journal entries (payments)
        expense_accounts = ChartOfAccount.objects.filter(
            account_type='expense', is_active=True
        )

        expense_payments = GeneralLedger.objects.filter(
            date_filter,
            account__in=expense_accounts
        ).aggregate(
            total=Sum('debit_amount')
        )['total'] or Decimal('0')

        # Landlord payments (commission settlements)
        landlord_payments = GeneralLedger.objects.filter(
            date_filter,
            account__code__startswith='2'  # Liability accounts
        ).aggregate(
            total=Sum('credit_amount')
        )['total'] or Decimal('0')

        # Calculate Operating Cash Flow
        operating_inflows = tenant_receipts
        operating_outflows = expense_payments + landlord_payments
        net_operating = operating_inflows - operating_outflows

        # Investing Activities
        # Property/Asset purchases (debit to asset accounts)
        asset_accounts = ChartOfAccount.objects.filter(
            account_type='asset',
            is_active=True,
            code__startswith='15'  # Fixed assets typically 15xx
        )

        asset_purchases = GeneralLedger.objects.filter(
            date_filter,
            account__in=asset_accounts
        ).aggregate(
            purchases=Sum('debit_amount'),
            sales=Sum('credit_amount')
        )

        investing_outflows = asset_purchases['purchases'] or Decimal('0')
        investing_inflows = asset_purchases['sales'] or Decimal('0')
        net_investing = investing_inflows - investing_outflows

        # Financing Activities
        # Owner contributions/withdrawals, loan proceeds/payments
        equity_accounts = ChartOfAccount.objects.filter(
            account_type='equity', is_active=True
        )

        equity_transactions = GeneralLedger.objects.filter(
            date_filter,
            account__in=equity_accounts
        ).aggregate(
            contributions=Sum('credit_amount'),
            withdrawals=Sum('debit_amount')
        )

        financing_inflows = equity_transactions['contributions'] or Decimal('0')
        financing_outflows = equity_transactions['withdrawals'] or Decimal('0')
        net_financing = financing_inflows - financing_outflows

        # Net Change in Cash
        net_change = net_operating + net_investing + net_financing

        # Get beginning and ending cash balances
        cash_accounts = ChartOfAccount.objects.filter(
            code__startswith='1000',  # Cash accounts
            is_active=True
        )

        ending_cash = sum(acc.current_balance for acc in cash_accounts)
        beginning_cash = ending_cash - net_change

        return Response({
            'report_name': 'Cash Flow Statement',
            'period': {
                'start': start_date,
                'end': str(end_date)
            },
            'operating_activities': {
                'inflows': {
                    'tenant_receipts': float(tenant_receipts),
                    'total': float(operating_inflows)
                },
                'outflows': {
                    'expense_payments': float(expense_payments),
                    'landlord_payments': float(landlord_payments),
                    'total': float(operating_outflows)
                },
                'net_cash': float(net_operating)
            },
            'investing_activities': {
                'inflows': {
                    'asset_sales': float(investing_inflows),
                    'total': float(investing_inflows)
                },
                'outflows': {
                    'asset_purchases': float(investing_outflows),
                    'total': float(investing_outflows)
                },
                'net_cash': float(net_investing)
            },
            'financing_activities': {
                'inflows': {
                    'owner_contributions': float(financing_inflows),
                    'total': float(financing_inflows)
                },
                'outflows': {
                    'owner_withdrawals': float(financing_outflows),
                    'total': float(financing_outflows)
                },
                'net_cash': float(net_financing)
            },
            'summary': {
                'net_change_in_cash': float(net_change),
                'beginning_cash': float(beginning_cash),
                'ending_cash': float(ending_cash)
            }
        })


class AgedAnalysisView(APIView):
    """
    Aged Analysis Report - 30-day increments.
    Buckets: Current (0-30), 31-60, 61-90, 91-120, 120+ days
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.now().date()
        as_of_date = request.query_params.get('as_of_date', today)
        if isinstance(as_of_date, str):
            as_of_date = date.fromisoformat(as_of_date)

        tenant_id = request.query_params.get('tenant_id')
        property_id = request.query_params.get('property_id')
        landlord_id = request.query_params.get('landlord_id')

        # Base queryset - unpaid invoices
        invoices = Invoice.objects.filter(
            status__in=['sent', 'partial', 'overdue'],
            balance__gt=0
        ).select_related('tenant', 'unit', 'unit__property', 'unit__property__landlord')

        # Apply filters
        if tenant_id:
            invoices = invoices.filter(tenant_id=tenant_id)
        if property_id:
            invoices = invoices.filter(unit__property_id=property_id)
        if landlord_id:
            invoices = invoices.filter(unit__property__landlord_id=landlord_id)

        # Calculate aging buckets
        buckets = {
            'current': {'label': '0-30 days', 'min': 0, 'max': 30, 'amount': Decimal('0'), 'count': 0, 'invoices': []},
            '31_60': {'label': '31-60 days', 'min': 31, 'max': 60, 'amount': Decimal('0'), 'count': 0, 'invoices': []},
            '61_90': {'label': '61-90 days', 'min': 61, 'max': 90, 'amount': Decimal('0'), 'count': 0, 'invoices': []},
            '91_120': {'label': '91-120 days', 'min': 91, 'max': 120, 'amount': Decimal('0'), 'count': 0, 'invoices': []},
            'over_120': {'label': '120+ days', 'min': 121, 'max': 9999, 'amount': Decimal('0'), 'count': 0, 'invoices': []},
        }

        tenant_summary = {}
        total_outstanding = Decimal('0')

        for invoice in invoices:
            days_overdue = (as_of_date - invoice.due_date).days
            if days_overdue < 0:
                days_overdue = 0

            # Determine bucket
            if days_overdue <= 30:
                bucket_key = 'current'
            elif days_overdue <= 60:
                bucket_key = '31_60'
            elif days_overdue <= 90:
                bucket_key = '61_90'
            elif days_overdue <= 120:
                bucket_key = '91_120'
            else:
                bucket_key = 'over_120'

            balance = invoice.balance
            buckets[bucket_key]['amount'] += balance
            buckets[bucket_key]['count'] += 1
            buckets[bucket_key]['invoices'].append({
                'invoice_number': invoice.invoice_number,
                'tenant': invoice.tenant.name,
                'due_date': str(invoice.due_date),
                'days_overdue': days_overdue,
                'balance': float(balance)
            })

            total_outstanding += balance

            # Build tenant summary
            tenant_key = invoice.tenant_id
            if tenant_key not in tenant_summary:
                tenant_summary[tenant_key] = {
                    'tenant_id': invoice.tenant.id,
                    'tenant_code': invoice.tenant.code,
                    'tenant_name': invoice.tenant.name,
                    'current': Decimal('0'),
                    '31_60': Decimal('0'),
                    '61_90': Decimal('0'),
                    '91_120': Decimal('0'),
                    'over_120': Decimal('0'),
                    'total': Decimal('0')
                }
            tenant_summary[tenant_key][bucket_key] += balance
            tenant_summary[tenant_key]['total'] += balance

        # Convert tenant summary to list and serialize
        tenant_list = []
        for ts in tenant_summary.values():
            tenant_list.append({
                'tenant_id': ts['tenant_id'],
                'tenant_code': ts['tenant_code'],
                'tenant_name': ts['tenant_name'],
                'current': float(ts['current']),
                '31_60': float(ts['31_60']),
                '61_90': float(ts['61_90']),
                '91_120': float(ts['91_120']),
                'over_120': float(ts['over_120']),
                'total': float(ts['total'])
            })

        # Sort by total descending
        tenant_list.sort(key=lambda x: x['total'], reverse=True)

        # Prepare bucket summary (without invoice details for summary view)
        bucket_summary = {
            key: {
                'label': bucket['label'],
                'amount': float(bucket['amount']),
                'count': bucket['count'],
                'percentage': round(float(bucket['amount']) / float(total_outstanding) * 100, 1) if total_outstanding else 0
            }
            for key, bucket in buckets.items()
        }

        return Response({
            'report_name': 'Aged Analysis',
            'as_of_date': str(as_of_date),
            'filters': {
                'tenant_id': tenant_id,
                'property_id': property_id,
                'landlord_id': landlord_id
            },
            'summary': {
                'total_outstanding': float(total_outstanding),
                'total_invoices': sum(b['count'] for b in buckets.values()),
                'buckets': bucket_summary
            },
            'by_tenant': tenant_list,
            # Chart data for visualization
            'chart_data': {
                'labels': [b['label'] for b in bucket_summary.values()],
                'amounts': [b['amount'] for b in bucket_summary.values()],
                'counts': [b['count'] for b in bucket_summary.values()]
            }
        })


class TenantAccountSummaryView(APIView):
    """
    Tenant Account Summary - Full account history for a tenant.
    Shows invoices, receipts, and running balance.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = request.query_params.get('tenant_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date', timezone.now().date())

        if not tenant_id:
            return Response({'error': 'tenant_id is required'}, status=400)

        try:
            tenant = RentalTenant.objects.get(id=tenant_id)
        except RentalTenant.DoesNotExist:
            return Response({'error': 'Tenant not found'}, status=404)

        # Get invoices
        invoices = Invoice.objects.filter(tenant=tenant)
        if start_date:
            invoices = invoices.filter(date__gte=start_date)
        invoices = invoices.filter(date__lte=end_date).order_by('date')

        # Get receipts
        receipts = Receipt.objects.filter(tenant=tenant)
        if start_date:
            receipts = receipts.filter(date__gte=start_date)
        receipts = receipts.filter(date__lte=end_date).order_by('date')

        # Build transaction list
        transactions = []

        for inv in invoices:
            transactions.append({
                'date': str(inv.date),
                'type': 'invoice',
                'reference': inv.invoice_number,
                'description': inv.description or f'{inv.get_invoice_type_display()} - {inv.period_start} to {inv.period_end}',
                'debit': float(inv.total_amount),
                'credit': 0,
                'invoice_type': inv.invoice_type
            })

        for rcpt in receipts:
            transactions.append({
                'date': str(rcpt.date),
                'type': 'receipt',
                'reference': rcpt.receipt_number,
                'description': rcpt.description or f'Payment - {rcpt.get_payment_method_display()}',
                'debit': 0,
                'credit': float(rcpt.amount),
                'payment_method': rcpt.payment_method
            })

        # Sort by date
        transactions.sort(key=lambda x: x['date'])

        # Calculate running balance
        running_balance = Decimal('0')
        for txn in transactions:
            running_balance += Decimal(str(txn['debit'])) - Decimal(str(txn['credit']))
            txn['balance'] = float(running_balance)

        # Summary
        total_invoiced = invoices.aggregate(Sum('total_amount'))['total_amount__sum'] or 0
        total_paid = receipts.aggregate(Sum('amount'))['amount__sum'] or 0

        # Active lease info
        active_lease = LeaseAgreement.objects.filter(
            tenant=tenant, status='active'
        ).select_related('unit', 'unit__property').first()

        return Response({
            'report_name': 'Tenant Account Summary',
            'tenant': {
                'id': tenant.id,
                'code': tenant.code,
                'name': tenant.name,
                'email': tenant.email,
                'phone': tenant.phone,
                'account_type': tenant.account_type
            },
            'active_lease': {
                'lease_number': active_lease.lease_number,
                'unit': str(active_lease.unit),
                'property': active_lease.unit.property.name,
                'monthly_rent': float(active_lease.monthly_rent),
                'start_date': str(active_lease.start_date),
                'end_date': str(active_lease.end_date)
            } if active_lease else None,
            'period': {
                'start': start_date,
                'end': str(end_date)
            },
            'summary': {
                'total_invoiced': float(total_invoiced),
                'total_paid': float(total_paid),
                'current_balance': float(total_invoiced - total_paid),
                'transaction_count': len(transactions)
            },
            'transactions': transactions
        })


class DepositAccountSummaryView(APIView):
    """
    Deposit Account Summary - Tenant deposit tracking.
    Shows deposits held, refunds, and current deposit balance.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = request.query_params.get('tenant_id')
        property_id = request.query_params.get('property_id')

        # Build queryset for active leases with deposits
        leases = LeaseAgreement.objects.filter(
            deposit_amount__gt=0
        ).select_related('tenant', 'unit', 'unit__property')

        if tenant_id:
            leases = leases.filter(tenant_id=tenant_id)
        if property_id:
            leases = leases.filter(unit__property_id=property_id)

        # Get deposit invoices
        deposit_invoices = Invoice.objects.filter(
            invoice_type='deposit'
        ).select_related('tenant', 'unit')

        if tenant_id:
            deposit_invoices = deposit_invoices.filter(tenant_id=tenant_id)
        if property_id:
            deposit_invoices = deposit_invoices.filter(unit__property_id=property_id)

        # Build deposit summary
        deposits = []
        total_deposits_required = Decimal('0')
        total_deposits_paid = Decimal('0')
        total_deposits_held = Decimal('0')

        for lease in leases:
            # Find related deposit invoice
            deposit_inv = deposit_invoices.filter(
                tenant=lease.tenant, lease=lease
            ).first()

            deposit_paid = deposit_inv.amount_paid if deposit_inv else Decimal('0')
            deposit_required = lease.deposit_amount

            deposits.append({
                'lease_number': lease.lease_number,
                'tenant_id': lease.tenant.id,
                'tenant_name': lease.tenant.name,
                'property': lease.unit.property.name,
                'unit': lease.unit.unit_number,
                'deposit_required': float(deposit_required),
                'deposit_paid': float(deposit_paid),
                'deposit_outstanding': float(deposit_required - deposit_paid),
                'lease_status': lease.status,
                'is_fully_paid': deposit_paid >= deposit_required
            })

            total_deposits_required += deposit_required
            total_deposits_paid += deposit_paid
            if lease.status == 'active':
                total_deposits_held += deposit_paid

        return Response({
            'report_name': 'Deposit Account Summary',
            'generated_at': timezone.now().isoformat(),
            'filters': {
                'tenant_id': tenant_id,
                'property_id': property_id
            },
            'summary': {
                'total_deposits_required': float(total_deposits_required),
                'total_deposits_paid': float(total_deposits_paid),
                'total_deposits_outstanding': float(total_deposits_required - total_deposits_paid),
                'total_deposits_held': float(total_deposits_held),
                'deposit_count': len(deposits)
            },
            'deposits': deposits
        })


class CommissionReportView(APIView):
    """
    Commission Report - Commission earned from managed properties.
    Breaks down commission by landlord, property, and income type.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date', timezone.now().date())
        landlord_id = request.query_params.get('landlord_id')

        # Get receipts for the period
        receipts = Receipt.objects.filter(
            date__lte=end_date
        ).select_related(
            'tenant', 'invoice', 'invoice__unit', 'invoice__unit__property',
            'invoice__unit__property__landlord'
        )

        if start_date:
            receipts = receipts.filter(date__gte=start_date)
        if landlord_id:
            receipts = receipts.filter(invoice__unit__property__landlord_id=landlord_id)

        # Calculate commissions by landlord
        landlord_commissions = {}
        property_commissions = {}
        income_type_commissions = {}
        total_collected = Decimal('0')
        total_commission = Decimal('0')

        for receipt in receipts:
            if not receipt.invoice or not receipt.invoice.unit:
                continue

            prop = receipt.invoice.unit.property
            landlord = prop.landlord
            commission_rate = landlord.commission_rate / 100
            commission = receipt.amount * commission_rate

            # By landlord
            if landlord.id not in landlord_commissions:
                landlord_commissions[landlord.id] = {
                    'landlord_id': landlord.id,
                    'landlord_name': landlord.name,
                    'landlord_code': landlord.code,
                    'commission_rate': float(landlord.commission_rate),
                    'collected': Decimal('0'),
                    'commission': Decimal('0')
                }
            landlord_commissions[landlord.id]['collected'] += receipt.amount
            landlord_commissions[landlord.id]['commission'] += commission

            # By property
            if prop.id not in property_commissions:
                property_commissions[prop.id] = {
                    'property_id': prop.id,
                    'property_name': prop.name,
                    'landlord_name': landlord.name,
                    'collected': Decimal('0'),
                    'commission': Decimal('0')
                }
            property_commissions[prop.id]['collected'] += receipt.amount
            property_commissions[prop.id]['commission'] += commission

            # By income type
            income_type = receipt.invoice.invoice_type
            if income_type not in income_type_commissions:
                income_type_commissions[income_type] = {
                    'income_type': income_type,
                    'income_type_display': receipt.invoice.get_invoice_type_display(),
                    'collected': Decimal('0'),
                    'commission': Decimal('0')
                }
            income_type_commissions[income_type]['collected'] += receipt.amount
            income_type_commissions[income_type]['commission'] += commission

            total_collected += receipt.amount
            total_commission += commission

        # Convert to lists and serialize decimals
        landlord_list = [
            {**lc, 'collected': float(lc['collected']), 'commission': float(lc['commission'])}
            for lc in landlord_commissions.values()
        ]
        property_list = [
            {**pc, 'collected': float(pc['collected']), 'commission': float(pc['commission'])}
            for pc in property_commissions.values()
        ]
        income_type_list = [
            {**itc, 'collected': float(itc['collected']), 'commission': float(itc['commission'])}
            for itc in income_type_commissions.values()
        ]

        # Sort by commission descending
        landlord_list.sort(key=lambda x: x['commission'], reverse=True)
        property_list.sort(key=lambda x: x['commission'], reverse=True)
        income_type_list.sort(key=lambda x: x['commission'], reverse=True)

        return Response({
            'report_name': 'Commission Report',
            'period': {
                'start': start_date,
                'end': str(end_date)
            },
            'summary': {
                'total_collected': float(total_collected),
                'total_commission': float(total_commission),
                'effective_rate': round(float(total_commission) / float(total_collected) * 100, 2) if total_collected else 0
            },
            'by_landlord': landlord_list,
            'by_property': property_list,
            'by_income_type': income_type_list,
            # Chart data
            'chart_data': {
                'by_landlord': {
                    'labels': [l['landlord_name'] for l in landlord_list[:10]],
                    'values': [l['commission'] for l in landlord_list[:10]]
                },
                'by_income_type': {
                    'labels': [i['income_type_display'] for i in income_type_list],
                    'values': [i['commission'] for i in income_type_list]
                }
            }
        })


class LeaseChargeSummaryView(APIView):
    """
    Lease Charge Summary - Summary of all charges per lease.
    Shows rent, levies, utilities, etc. by lease.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        property_id = request.query_params.get('property_id')
        landlord_id = request.query_params.get('landlord_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date', timezone.now().date())

        # Get active leases
        leases = LeaseAgreement.objects.filter(
            status='active'
        ).select_related('tenant', 'unit', 'unit__property', 'unit__property__landlord')

        if property_id:
            leases = leases.filter(unit__property_id=property_id)
        if landlord_id:
            leases = leases.filter(unit__property__landlord_id=landlord_id)

        # Batch query: get all invoice aggregations in one query instead of per-lease
        inv_filter = Q(invoice__lease__in=leases, invoice__date__lte=end_date)
        if start_date:
            inv_filter &= Q(invoice__date__gte=start_date)

        # Aggregate all invoices grouped by lease + type in a single query
        charge_data = Invoice.objects.filter(
            lease__in=leases, date__lte=end_date,
            **({'date__gte': start_date} if start_date else {})
        ).values('lease_id', 'invoice_type').annotate(
            total=Coalesce(Sum('total_amount'), Decimal('0')),
            paid=Coalesce(Sum('amount_paid'), Decimal('0')),
            count=Count('id')
        )

        # Index charge data by lease_id
        charges_by_lease = {}
        for row in charge_data:
            lid = row['lease_id']
            if lid not in charges_by_lease:
                charges_by_lease[lid] = {}
            charges_by_lease[lid][row['invoice_type']] = {
                'total': float(row['total']),
                'paid': float(row['paid']),
                'count': row['count']
            }

        lease_charges = []
        total_rent = Decimal('0')
        total_other = Decimal('0')

        for lease in leases:
            charge_breakdown = charges_by_lease.get(lease.id, {})
            lease_total = sum(c['total'] for c in charge_breakdown.values())
            lease_paid = sum(c['paid'] for c in charge_breakdown.values())

            for inv_type, data in charge_breakdown.items():
                if inv_type == 'rent':
                    total_rent += Decimal(str(data['total']))
                else:
                    total_other += Decimal(str(data['total']))

            lease_charges.append({
                'lease_number': lease.lease_number,
                'tenant_name': lease.tenant.name,
                'property': lease.unit.property.name,
                'unit': lease.unit.unit_number,
                'monthly_rent': float(lease.monthly_rent),
                'charges': charge_breakdown,
                'total_charged': lease_total,
                'total_paid': lease_paid,
                'balance': lease_total - lease_paid
            })

        return Response({
            'report_name': 'Lease Charge Summary',
            'period': {
                'start': start_date,
                'end': str(end_date)
            },
            'summary': {
                'total_leases': len(lease_charges),
                'total_rent_charged': float(total_rent),
                'total_other_charges': float(total_other),
                'grand_total': float(total_rent + total_other)
            },
            'leases': lease_charges
        })


class ReceiptListingView(APIView):
    """
    Receipt Listing - Comprehensive receipt report.
    Shows all receipts with bank account, income type, tenant, property details.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date', timezone.now().date())
        bank_account_id = request.query_params.get('bank_account_id')
        income_type = request.query_params.get('income_type')
        payment_method = request.query_params.get('payment_method')
        export = request.query_params.get('export')  # 'csv' or 'excel'
        limit = min(int(request.query_params.get('limit', 500)), 2000)

        # Build queryset
        receipts = Receipt.objects.select_related(
            'tenant', 'invoice', 'invoice__unit', 'invoice__unit__property',
            'invoice__unit__property__landlord', 'bank_account', 'created_by'
        ).filter(date__lte=end_date)

        if start_date:
            receipts = receipts.filter(date__gte=start_date)
        if bank_account_id:
            receipts = receipts.filter(bank_account_id=bank_account_id)
        if income_type:
            receipts = receipts.filter(invoice__invoice_type=income_type)
        if payment_method:
            receipts = receipts.filter(payment_method=payment_method)

        receipts = receipts.order_by('-date', '-created_at')[:limit]

        # Build receipt list
        receipt_list = []
        total_amount = Decimal('0')
        totals_by_bank = {}
        totals_by_income_type = {}

        for rcpt in receipts:
            landlord_name = None
            property_name = None
            unit_number = None
            inv_type = None

            if rcpt.invoice and rcpt.invoice.unit:
                unit_number = rcpt.invoice.unit.unit_number
                property_name = rcpt.invoice.unit.property.name
                landlord_name = rcpt.invoice.unit.property.landlord.name
                inv_type = rcpt.invoice.invoice_type

            bank_name = rcpt.bank_account.name if rcpt.bank_account else rcpt.bank_name

            receipt_list.append({
                'date': str(rcpt.date),
                'receipt_number': rcpt.receipt_number,
                'tenant_id': rcpt.tenant.id,
                'tenant_code': rcpt.tenant.code,
                'tenant_name': rcpt.tenant.name,
                'landlord_name': landlord_name,
                'property_name': property_name,
                'unit_number': unit_number,
                'income_type': inv_type,
                'income_type_display': rcpt.invoice.get_invoice_type_display() if rcpt.invoice else None,
                'bank_account': bank_name,
                'payment_method': rcpt.payment_method,
                'payment_method_display': rcpt.get_payment_method_display(),
                'reference': rcpt.reference,
                'currency': rcpt.currency,
                'amount': float(rcpt.amount)
            })

            total_amount += rcpt.amount

            # Aggregate by bank
            bank_key = bank_name or 'Unknown'
            if bank_key not in totals_by_bank:
                totals_by_bank[bank_key] = Decimal('0')
            totals_by_bank[bank_key] += rcpt.amount

            # Aggregate by income type
            type_key = inv_type or 'other'
            if type_key not in totals_by_income_type:
                totals_by_income_type[type_key] = Decimal('0')
            totals_by_income_type[type_key] += rcpt.amount

        # Handle export
        if export == 'csv':
            return self._export_csv(receipt_list)

        return Response({
            'report_name': 'Receipt Listing',
            'period': {
                'start': start_date,
                'end': str(end_date)
            },
            'filters': {
                'bank_account_id': bank_account_id,
                'income_type': income_type,
                'payment_method': payment_method
            },
            'summary': {
                'total_receipts': len(receipt_list),
                'total_amount': float(total_amount),
                'by_bank': {k: float(v) for k, v in totals_by_bank.items()},
                'by_income_type': {k: float(v) for k, v in totals_by_income_type.items()}
            },
            'receipts': receipt_list,
            'chart_data': {
                'by_bank': {
                    'labels': list(totals_by_bank.keys()),
                    'values': [float(v) for v in totals_by_bank.values()]
                },
                'by_income_type': {
                    'labels': list(totals_by_income_type.keys()),
                    'values': [float(v) for v in totals_by_income_type.values()]
                }
            }
        })

    def _export_csv(self, receipt_list):
        """Export receipt listing to CSV."""
        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow([
            'Date', 'Receipt Number', 'Tenant Code', 'Tenant Name',
            'Landlord', 'Property', 'Unit', 'Income Type',
            'Bank Account', 'Payment Method', 'Reference', 'Currency', 'Amount'
        ])

        # Data
        for rcpt in receipt_list:
            writer.writerow([
                rcpt['date'], rcpt['receipt_number'], rcpt['tenant_code'],
                rcpt['tenant_name'], rcpt['landlord_name'], rcpt['property_name'],
                rcpt['unit_number'], rcpt['income_type_display'],
                rcpt['bank_account'], rcpt['payment_method_display'],
                rcpt['reference'], rcpt['currency'], rcpt['amount']
            ])

        response = HttpResponse(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="receipt_listing.csv"'
        return response


class CommissionAnalysisView(APIView):
    """
    Commission Analysis - Detailed commission breakdown.
    Includes pie charts and bar charts data for visualization.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date', timezone.now().date())

        # Get receipts with commission calculations
        receipts = Receipt.objects.filter(
            date__lte=end_date
        ).select_related(
            'invoice', 'invoice__unit', 'invoice__unit__property',
            'invoice__unit__property__landlord'
        )

        if start_date:
            receipts = receipts.filter(date__gte=start_date)

        # Calculate commissions
        by_income_type = {}
        by_property = {}
        by_month = {}
        total_income = Decimal('0')
        total_commission = Decimal('0')

        for rcpt in receipts:
            if not rcpt.invoice or not rcpt.invoice.unit:
                continue

            landlord = rcpt.invoice.unit.property.landlord
            commission_rate = landlord.commission_rate / 100
            commission = rcpt.amount * commission_rate
            income_type = rcpt.invoice.invoice_type
            prop = rcpt.invoice.unit.property
            month_key = rcpt.date.strftime('%Y-%m')

            # By income type
            if income_type not in by_income_type:
                by_income_type[income_type] = {
                    'label': rcpt.invoice.get_invoice_type_display(),
                    'income': Decimal('0'),
                    'commission': Decimal('0')
                }
            by_income_type[income_type]['income'] += rcpt.amount
            by_income_type[income_type]['commission'] += commission

            # By property
            if prop.id not in by_property:
                by_property[prop.id] = {
                    'property_id': prop.id,
                    'property_name': prop.name,
                    'income': Decimal('0'),
                    'commission': Decimal('0')
                }
            by_property[prop.id]['income'] += rcpt.amount
            by_property[prop.id]['commission'] += commission

            # By month (for trend chart)
            if month_key not in by_month:
                by_month[month_key] = {
                    'month': month_key,
                    'income': Decimal('0'),
                    'commission': Decimal('0')
                }
            by_month[month_key]['income'] += rcpt.amount
            by_month[month_key]['commission'] += commission

            total_income += rcpt.amount
            total_commission += commission

        # Serialize and prepare chart data
        income_type_data = [
            {
                'income_type': k,
                'label': v['label'],
                'income': float(v['income']),
                'commission': float(v['commission']),
                'percentage': round(float(v['commission']) / float(total_commission) * 100, 1) if total_commission else 0
            }
            for k, v in by_income_type.items()
        ]
        income_type_data.sort(key=lambda x: x['commission'], reverse=True)

        property_data = [
            {
                'property_id': v['property_id'],
                'property_name': v['property_name'],
                'income': float(v['income']),
                'commission': float(v['commission']),
                'percentage': round(float(v['commission']) / float(total_commission) * 100, 1) if total_commission else 0
            }
            for v in by_property.values()
        ]
        property_data.sort(key=lambda x: x['commission'], reverse=True)

        month_data = [
            {
                'month': k,
                'income': float(v['income']),
                'commission': float(v['commission'])
            }
            for k, v in sorted(by_month.items())
        ]

        return Response({
            'report_name': 'Commission Analysis',
            'period': {
                'start': start_date,
                'end': str(end_date)
            },
            'summary': {
                'total_income': float(total_income),
                'total_commission': float(total_commission),
                'effective_rate': round(float(total_commission) / float(total_income) * 100, 2) if total_income else 0
            },
            'by_income_type': income_type_data,
            'by_property': property_data,
            'by_month': month_data,
            # Pie chart data
            'pie_chart': {
                'by_income_type': {
                    'labels': [d['label'] for d in income_type_data],
                    'values': [d['commission'] for d in income_type_data]
                },
                'by_property': {
                    'labels': [d['property_name'] for d in property_data[:10]],
                    'values': [d['commission'] for d in property_data[:10]]
                }
            },
            # Bar chart data
            'bar_chart': {
                'monthly_trend': {
                    'labels': [d['month'] for d in month_data],
                    'income': [d['income'] for d in month_data],
                    'commission': [d['commission'] for d in month_data]
                }
            }
        })


class IncomeItemAnalysisView(APIView):
    """
    Income Item Analysis - Analysis by income type and bank account.
    Shows which bank accounts hold transactions for specific income items.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date', timezone.now().date())
        income_type = request.query_params.get('income_type')
        bank_account_id = request.query_params.get('bank_account_id')

        # Get receipts
        receipts = Receipt.objects.filter(date__lte=end_date)
        if start_date:
            receipts = receipts.filter(date__gte=start_date)
        if income_type:
            receipts = receipts.filter(invoice__invoice_type=income_type)
        if bank_account_id:
            receipts = receipts.filter(bank_account_id=bank_account_id)

        receipts = receipts.select_related('invoice', 'bank_account')

        # Build analysis matrix: income_type x bank_account
        matrix = {}
        income_types = set()
        bank_accounts = set()
        totals_by_type = {}
        totals_by_bank = {}
        grand_total = Decimal('0')

        for rcpt in receipts:
            inv_type = rcpt.invoice.invoice_type if rcpt.invoice else 'other'
            inv_type_display = rcpt.invoice.get_invoice_type_display() if rcpt.invoice else 'Other'
            bank_name = rcpt.bank_account.name if rcpt.bank_account else (rcpt.bank_name or 'Cash')

            income_types.add((inv_type, inv_type_display))
            bank_accounts.add(bank_name)

            matrix_key = (inv_type, bank_name)
            if matrix_key not in matrix:
                matrix[matrix_key] = Decimal('0')
            matrix[matrix_key] += rcpt.amount

            # Totals
            if inv_type not in totals_by_type:
                totals_by_type[inv_type] = {'label': inv_type_display, 'amount': Decimal('0')}
            totals_by_type[inv_type]['amount'] += rcpt.amount

            if bank_name not in totals_by_bank:
                totals_by_bank[bank_name] = Decimal('0')
            totals_by_bank[bank_name] += rcpt.amount

            grand_total += rcpt.amount

        # Build matrix table
        bank_list = sorted(bank_accounts)
        type_list = sorted(income_types, key=lambda x: x[1])

        matrix_data = []
        for inv_type, inv_type_display in type_list:
            row = {
                'income_type': inv_type,
                'income_type_display': inv_type_display,
                'banks': {},
                'total': float(totals_by_type.get(inv_type, {}).get('amount', 0))
            }
            for bank in bank_list:
                row['banks'][bank] = float(matrix.get((inv_type, bank), 0))
            matrix_data.append(row)

        return Response({
            'report_name': 'Income Item Analysis',
            'period': {
                'start': start_date,
                'end': str(end_date)
            },
            'filters': {
                'income_type': income_type,
                'bank_account_id': bank_account_id
            },
            'summary': {
                'grand_total': float(grand_total),
                'income_types_count': len(type_list),
                'bank_accounts_count': len(bank_list)
            },
            'totals_by_income_type': [
                {'income_type': k, 'label': v['label'], 'amount': float(v['amount'])}
                for k, v in totals_by_type.items()
            ],
            'totals_by_bank': [
                {'bank': k, 'amount': float(v)}
                for k, v in totals_by_bank.items()
            ],
            'matrix': matrix_data,
            'bank_columns': bank_list,
            # Heatmap data for visualization
            'heatmap_data': {
                'x_labels': bank_list,
                'y_labels': [t[1] for t in type_list],
                'values': [
                    [float(matrix.get((t[0], b), 0)) for b in bank_list]
                    for t in type_list
                ]
            }
        })


class IncomeExpenditureReportView(APIView):
    """
    Income & Expenditure Report - For landlords and residential associations.
    Shows SURPLUS or EXCESS OF EXPENDITURE OVER INCOME (not Profit/Loss).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        landlord_id = request.query_params.get('landlord_id')
        property_id = request.query_params.get('property_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date', timezone.now().date())

        if not landlord_id and not property_id:
            return Response({'error': 'landlord_id or property_id is required'}, status=400)

        # Get properties
        if landlord_id:
            try:
                landlord = Landlord.objects.get(id=landlord_id)
                properties = landlord.properties.all()
                entity_name = landlord.name
                entity_type = 'landlord'
            except Landlord.DoesNotExist:
                return Response({'error': 'Landlord not found'}, status=404)
        else:
            try:
                prop = Property.objects.get(id=property_id)
                properties = Property.objects.filter(id=property_id)
                landlord = prop.landlord
                entity_name = prop.name
                entity_type = 'property'
            except Property.DoesNotExist:
                return Response({'error': 'Property not found'}, status=404)

        # Get income (from receipts)
        receipts = Receipt.objects.filter(
            invoice__unit__property__in=properties,
            date__lte=end_date
        )
        if start_date:
            receipts = receipts.filter(date__gte=start_date)

        # Group income by type
        income_by_type = receipts.values('invoice__invoice_type').annotate(
            total=Sum('amount')
        )

        income_items = []
        total_income = Decimal('0')
        for item in income_by_type:
            inv_type = item['invoice__invoice_type']
            amount = item['total'] or Decimal('0')
            income_items.append({
                'type': inv_type,
                'label': dict(Invoice.InvoiceType.choices).get(inv_type, inv_type),
                'amount': float(amount)
            })
            total_income += amount

        # Get expenses (from expense model)
        expenses = Expense.objects.filter(
            payee_type='landlord',
            payee_id=landlord.id,
            status='paid',
            date__lte=end_date
        )
        if start_date:
            expenses = expenses.filter(date__gte=start_date)

        expense_by_type = expenses.values('expense_type').annotate(
            total=Sum('amount')
        )

        expense_items = []
        total_expenditure = Decimal('0')
        for item in expense_by_type:
            exp_type = item['expense_type']
            amount = item['total'] or Decimal('0')
            expense_items.append({
                'type': exp_type,
                'label': dict(Expense.ExpenseType.choices).get(exp_type, exp_type),
                'amount': float(amount)
            })
            total_expenditure += amount

        # Calculate result
        difference = total_income - total_expenditure
        if difference >= 0:
            result_label = 'SURPLUS'
        else:
            result_label = 'EXCESS OF EXPENDITURE OVER INCOME'

        return Response({
            'report_name': 'Income & Expenditure Report',
            'entity': {
                'type': entity_type,
                'id': landlord_id or property_id,
                'name': entity_name
            },
            'period': {
                'start': start_date,
                'end': str(end_date)
            },
            'income': {
                'items': income_items,
                'total': float(total_income)
            },
            'expenditure': {
                'items': expense_items,
                'total': float(total_expenditure)
            },
            'result': {
                'label': result_label,
                'amount': float(abs(difference)),
                'is_surplus': difference >= 0
            }
        })


class DataVisualizationView(APIView):
    """
    Data Visualization Endpoints - Aggregated data for charts and graphs.
    Provides data for:
    - Tenant payment trends (pie charts)
    - Property occupancy timeline
    - Revenue trends
    - Collection rates over time
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        chart_type = request.query_params.get('chart_type')

        if chart_type == 'tenant_payments':
            return self._tenant_payment_chart(request)
        elif chart_type == 'occupancy_timeline':
            return self._occupancy_timeline(request)
        elif chart_type == 'revenue_trend':
            return self._revenue_trend(request)
        elif chart_type == 'collection_rates':
            return self._collection_rates(request)
        elif chart_type == 'income_distribution':
            return self._income_distribution(request)
        else:
            return Response({
                'available_charts': [
                    'tenant_payments', 'occupancy_timeline', 'revenue_trend',
                    'collection_rates', 'income_distribution'
                ]
            })

    def _tenant_payment_chart(self, request):
        """Tenant payment analysis - pie chart data."""
        tenant_id = request.query_params.get('tenant_id')

        if tenant_id:
            receipts = Receipt.objects.filter(tenant_id=tenant_id)
        else:
            receipts = Receipt.objects.all()

        # Payment methods distribution
        by_method = receipts.values('payment_method').annotate(
            total=Sum('amount'),
            count=Count('id')
        )

        return Response({
            'chart_type': 'tenant_payments',
            'pie_chart': {
                'labels': [dict(Receipt.PaymentMethod.choices).get(m['payment_method'], m['payment_method']) for m in by_method],
                'values': [float(m['total'] or 0) for m in by_method],
                'counts': [m['count'] for m in by_method]
            }
        })

    def _occupancy_timeline(self, request):
        """Property occupancy over time - timeline chart. Single query approach."""
        property_id = request.query_params.get('property_id')
        months = int(request.query_params.get('months', 12))

        today = timezone.now().date()
        start_date = today - timedelta(days=months * 30)

        # Get total units once
        if property_id:
            total_units = Unit.objects.filter(property_id=property_id).count()
        else:
            total_units = Unit.objects.count()

        # Get all relevant leases in one query
        lease_qs = LeaseAgreement.objects.filter(
            start_date__lte=today,
            status__in=['active', 'expired']
        )
        if property_id:
            lease_qs = lease_qs.filter(unit__property_id=property_id)

        leases = list(lease_qs.values_list('start_date', 'end_date', 'status'))

        # Build monthly occupancy by iterating in Python (avoids N queries)
        timeline = []
        current_date = start_date.replace(day=1)
        while current_date <= today:
            month_end = (current_date + timedelta(days=32)).replace(day=1) - timedelta(days=1)
            active_count = sum(
                1 for start, end, st in leases
                if start <= month_end and (end >= current_date or st == 'active')
            )
            occupancy_rate = (active_count / total_units * 100) if total_units else 0
            timeline.append({
                'month': current_date.strftime('%Y-%m'),
                'active_leases': active_count,
                'total_units': total_units,
                'occupancy_rate': round(occupancy_rate, 1)
            })
            current_date = (current_date + timedelta(days=32)).replace(day=1)

        return Response({
            'chart_type': 'occupancy_timeline',
            'timeline': timeline,
            'line_chart': {
                'labels': [t['month'] for t in timeline],
                'occupancy_rates': [t['occupancy_rate'] for t in timeline]
            }
        })

    def _revenue_trend(self, request):
        """Revenue trend over time - bar/line chart."""
        months = int(request.query_params.get('months', 12))

        # Monthly revenue from receipts
        receipts = Receipt.objects.filter(
            date__gte=timezone.now().date() - timedelta(days=months * 30)
        ).annotate(
            month=TruncMonth('date')
        ).values('month').annotate(
            total=Sum('amount')
        ).order_by('month')

        # Monthly invoiced from invoices
        invoices = Invoice.objects.filter(
            date__gte=timezone.now().date() - timedelta(days=months * 30)
        ).annotate(
            month=TruncMonth('date')
        ).values('month').annotate(
            total=Sum('total_amount')
        ).order_by('month')

        # Merge data
        revenue_data = {r['month'].strftime('%Y-%m'): float(r['total'] or 0) for r in receipts}
        invoice_data = {i['month'].strftime('%Y-%m'): float(i['total'] or 0) for i in invoices}

        all_months = sorted(set(revenue_data.keys()) | set(invoice_data.keys()))

        return Response({
            'chart_type': 'revenue_trend',
            'bar_chart': {
                'labels': all_months,
                'invoiced': [invoice_data.get(m, 0) for m in all_months],
                'collected': [revenue_data.get(m, 0) for m in all_months]
            }
        })

    def _collection_rates(self, request):
        """Collection rates over time."""
        months = int(request.query_params.get('months', 12))

        # Get monthly totals
        today = timezone.now().date()
        start_date = today - timedelta(days=months * 30)

        invoices = Invoice.objects.filter(date__gte=start_date).annotate(
            month=TruncMonth('date')
        ).values('month').annotate(
            invoiced=Sum('total_amount'),
            collected=Sum('amount_paid')
        ).order_by('month')

        rates = []
        for inv in invoices:
            invoiced = float(inv['invoiced'] or 0)
            collected = float(inv['collected'] or 0)
            rate = (collected / invoiced * 100) if invoiced else 0
            rates.append({
                'month': inv['month'].strftime('%Y-%m'),
                'invoiced': invoiced,
                'collected': collected,
                'rate': round(rate, 1)
            })

        return Response({
            'chart_type': 'collection_rates',
            'data': rates,
            'line_chart': {
                'labels': [r['month'] for r in rates],
                'rates': [r['rate'] for r in rates]
            }
        })

    def _income_distribution(self, request):
        """Income distribution by type - pie chart."""
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date', timezone.now().date())

        receipts = Receipt.objects.filter(date__lte=end_date)
        if start_date:
            receipts = receipts.filter(date__gte=start_date)

        by_type = receipts.values('invoice__invoice_type').annotate(
            total=Sum('amount')
        )

        labels = []
        values = []
        for item in by_type:
            inv_type = item['invoice__invoice_type']
            if inv_type:
                labels.append(dict(Invoice.InvoiceType.choices).get(inv_type, inv_type))
                values.append(float(item['total'] or 0))

        return Response({
            'chart_type': 'income_distribution',
            'pie_chart': {
                'labels': labels,
                'values': values
            }
        })
