"""Views for financial reports."""
from decimal import Decimal
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q, F
from django.utils import timezone
from datetime import timedelta
from apps.accounting.models import ChartOfAccount, GeneralLedger, Journal
from apps.billing.models import Invoice, Receipt
from apps.masterfile.models import Property, Unit, Landlord, RentalTenant, LeaseAgreement


class DashboardStatsView(APIView):
    """Dashboard KPIs and statistics."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.now().date()
        month_start = today.replace(day=1)

        # Property stats
        total_properties = Property.objects.count()
        total_units = Unit.objects.count()
        vacant_units = Unit.objects.filter(is_occupied=False).count()
        occupancy_rate = ((total_units - vacant_units) / total_units * 100) if total_units else 0

        # Financial stats
        total_invoiced = Invoice.objects.aggregate(Sum('total_amount'))['total_amount__sum'] or 0
        total_collected = Receipt.objects.aggregate(Sum('amount'))['amount__sum'] or 0
        outstanding = total_invoiced - total_collected

        # Monthly stats
        monthly_invoiced = Invoice.objects.filter(
            date__gte=month_start
        ).aggregate(Sum('total_amount'))['total_amount__sum'] or 0

        monthly_collected = Receipt.objects.filter(
            date__gte=month_start
        ).aggregate(Sum('amount'))['amount__sum'] or 0

        # Overdue invoices
        overdue_count = Invoice.objects.filter(
            status__in=['sent', 'partial'],
            due_date__lt=today
        ).count()

        overdue_amount = Invoice.objects.filter(
            status__in=['sent', 'partial'],
            due_date__lt=today
        ).aggregate(Sum('balance'))['balance__sum'] or 0

        # Leases expiring soon
        thirty_days = today + timedelta(days=30)
        expiring_leases = LeaseAgreement.objects.filter(
            status='active',
            end_date__lte=thirty_days
        ).count()

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
                'outstanding': float(outstanding),
                'collection_rate': round((float(total_collected) / float(total_invoiced) * 100), 1) if total_invoiced else 0
            },
            'monthly': {
                'invoiced': float(monthly_invoiced),
                'collected': float(monthly_collected)
            },
            'alerts': {
                'overdue_invoices': overdue_count,
                'overdue_amount': float(overdue_amount),
                'expiring_leases': expiring_leases
            },
            'counts': {
                'landlords': Landlord.objects.count(),
                'tenants': RentalTenant.objects.count(),
                'active_leases': LeaseAgreement.objects.filter(status='active').count()
            }
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
        properties = Property.objects.annotate(
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
                    'units': p.units.count()
                }
                for p in properties
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
