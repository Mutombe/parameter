"""Views for financial reports."""
import hashlib
import logging
from decimal import Decimal
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q, F, Avg, Case, When, Value, CharField, DecimalField
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone
from django.core.cache import cache
from django.http import HttpResponse
from datetime import timedelta, date
import csv
import io
from apps.accounting.models import ChartOfAccount, GeneralLedger, Journal, BankAccount, IncomeType
from apps.billing.models import Invoice, Receipt, Expense
from apps.masterfile.models import Property, Unit, Landlord, RentalTenant, LeaseAgreement

logger = logging.getLogger(__name__)


def _cache_report(cache_key, ttl=60):
    """
    Decorator for caching report responses.
    cache_key can contain {param} placeholders resolved from request.query_params.
    """
    def decorator(view_method):
        def wrapper(self, request, *args, **kwargs):
            # Build final cache key from request params
            params = dict(request.query_params)
            key_parts = [cache_key]
            for k, v in sorted(params.items()):
                key_parts.append(f"{k}={v}")
            # Include schema name for multi-tenancy
            schema = getattr(getattr(request, 'tenant', None), 'schema_name', 'public')
            full_key = f"report:{schema}:{':'.join(key_parts)}"
            # Hash to keep key length safe
            hashed_key = hashlib.md5(full_key.encode()).hexdigest()

            try:
                cached = cache.get(hashed_key)
                if cached is not None:
                    return Response(cached)
            except Exception:
                pass

            response = view_method(self, request, *args, **kwargs)

            try:
                cache.set(hashed_key, response.data, ttl)
            except Exception:
                pass

            return response
        return wrapper
    return decorator


class DashboardStatsView(APIView):
    """Dashboard KPIs and statistics. Optimized to ~5 queries instead of 15+."""
    permission_classes = [IsAuthenticated]

    @_cache_report('dashboard', ttl=30)
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

    @_cache_report('trial_balance', ttl=60)
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

    @_cache_report('income_statement', ttl=60)
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

    @_cache_report('balance_sheet', ttl=60)
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

    @_cache_report('vacancy', ttl=120)
    def get(self, request):
        properties = Property.objects.filter(
            management_type='rental'
        ).select_related('landlord').annotate(
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
                'landlord_id': prop.landlord.id,
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

    @_cache_report('rent_roll', ttl=120)
    def get(self, request):
        leases = LeaseAgreement.objects.filter(
            status='active'
        ).select_related('tenant', 'unit', 'unit__property')

        report_data = []
        total_rent = Decimal('0')

        for lease in leases:
            report_data.append({
                'lease_id': lease.id,
                'lease_number': lease.lease_number,
                'tenant_id': lease.tenant_id,
                'tenant': lease.tenant.name,
                'property_id': lease.unit.property_id,
                'property': lease.unit.property.name,
                'unit_id': lease.unit_id,
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


class RentRolloverView(APIView):
    """Rent Rollover Report — period-based balance movements.

    Level 1 (no property_id): property summary rows.
    Level 2 (with property_id): individual lease rows for that property.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        property_id = request.query_params.get('property_id')

        if not start_date or not end_date:
            return Response({'error': 'start_date and end_date required'}, status=400)

        leases = LeaseAgreement.objects.filter(status='active').select_related(
            'tenant', 'unit', 'unit__property', 'unit__property__landlord'
        )
        if property_id:
            leases = leases.filter(unit__property_id=property_id)

        lease_list = list(leases)
        lease_ids = [l.id for l in lease_list]

        if not lease_ids:
            empty_summary = {
                'total_balance_bf': 0, 'total_charged': 0, 'total_due': 0,
                'total_paid': 0, 'total_carried_forward': 0,
            }
            if property_id:
                return Response({
                    'level': 2, 'property_id': int(property_id),
                    'property_name': '', 'landlord_name': '', 'currency': '',
                    'period': {'start': start_date, 'end': end_date},
                    'leases': [], 'summary': empty_summary,
                })
            return Response({
                'level': 1,
                'period': {'start': start_date, 'end': end_date},
                'properties': [], 'summary': empty_summary,
            })

        # Batch queries — invoices/receipts × before/during period
        inv_before = dict(Invoice.objects.filter(
            lease_id__in=lease_ids, date__lt=start_date
        ).values('lease_id').annotate(
            t=Coalesce(Sum('total_amount'), Decimal('0'))
        ).values_list('lease_id', 't'))

        rcpt_before = dict(Receipt.objects.filter(
            invoice__lease_id__in=lease_ids, date__lt=start_date
        ).values('invoice__lease_id').annotate(
            t=Coalesce(Sum('amount'), Decimal('0'))
        ).values_list('invoice__lease_id', 't'))

        inv_period = dict(Invoice.objects.filter(
            lease_id__in=lease_ids, date__gte=start_date, date__lte=end_date
        ).values('lease_id').annotate(
            t=Coalesce(Sum('total_amount'), Decimal('0'))
        ).values_list('lease_id', 't'))

        rcpt_period = dict(Receipt.objects.filter(
            invoice__lease_id__in=lease_ids, date__gte=start_date, date__lte=end_date
        ).values('invoice__lease_id').annotate(
            t=Coalesce(Sum('amount'), Decimal('0'))
        ).values_list('invoice__lease_id', 't'))

        # Build per-lease rows
        lease_rows = []
        for lease in lease_list:
            ib = float(inv_before.get(lease.id, Decimal('0')))
            rb = float(rcpt_before.get(lease.id, Decimal('0')))
            ip = float(inv_period.get(lease.id, Decimal('0')))
            rp = float(rcpt_period.get(lease.id, Decimal('0')))

            balance_bf = round(ib - rb, 2)
            amount_charged = round(ip, 2)
            amount_due = round(balance_bf + amount_charged, 2)
            amount_paid = round(rp, 2)
            carried_forward = round(amount_due - amount_paid, 2)

            lease_rows.append({
                'lease_id': lease.id,
                'lease_number': lease.lease_number,
                'tenant_id': lease.tenant_id,
                'tenant_name': lease.tenant.name,
                'unit_id': lease.unit_id,
                'unit_number': lease.unit.unit_number,
                'property_id': lease.unit.property_id,
                'property_name': lease.unit.property.name,
                'landlord_id': lease.unit.property.landlord_id,
                'landlord_name': lease.unit.property.landlord.name if lease.unit.property.landlord else '',
                'currency': lease.currency,
                'balance_bf': balance_bf,
                'amount_charged': amount_charged,
                'amount_due': amount_due,
                'amount_paid': amount_paid,
                'carried_forward': carried_forward,
            })

        def _summary(rows):
            return {
                'total_balance_bf': round(sum(r['balance_bf'] for r in rows), 2),
                'total_charged': round(sum(r['amount_charged'] for r in rows), 2),
                'total_due': round(sum(r['amount_due'] for r in rows), 2),
                'total_paid': round(sum(r['amount_paid'] for r in rows), 2),
                'total_carried_forward': round(sum(r['carried_forward'] for r in rows), 2),
            }

        if property_id:
            # Level 2 — individual lease rows
            first = lease_rows[0] if lease_rows else {}
            return Response({
                'level': 2,
                'property_id': int(property_id),
                'property_name': first.get('property_name', ''),
                'landlord_name': first.get('landlord_name', ''),
                'currency': first.get('currency', ''),
                'period': {'start': start_date, 'end': end_date},
                'leases': lease_rows,
                'summary': _summary(lease_rows),
            })

        # Level 1 — group by property
        from collections import defaultdict
        by_prop = defaultdict(list)
        for row in lease_rows:
            by_prop[row['property_id']].append(row)

        properties = []
        for pid, rows in by_prop.items():
            first = rows[0]
            s = _summary(rows)
            properties.append({
                'property_id': pid,
                'property_name': first['property_name'],
                'landlord_id': first['landlord_id'],
                'landlord_name': first['landlord_name'],
                'currency': first['currency'],
                'lease_count': len(rows),
                'balance_bf': s['total_balance_bf'],
                'amount_charged': s['total_charged'],
                'amount_due': s['total_due'],
                'amount_paid': s['total_paid'],
                'carried_forward': s['total_carried_forward'],
            })

        properties.sort(key=lambda p: p['property_name'])

        return Response({
            'level': 1,
            'period': {'start': start_date, 'end': end_date},
            'properties': properties,
            'summary': _summary(lease_rows),
        })


class LandlordStatementView(APIView):
    """Landlord Account Summary - receipts, commissions and expenses."""
    permission_classes = [IsAuthenticated]

    def _compute_commission(self, receipt, landlord):
        """Compute commission for a single receipt."""
        if receipt.income_type and receipt.income_type.is_commissionable:
            rate = receipt.income_type.default_commission_rate / 100
        else:
            rate = landlord.commission_rate / 100
        return receipt.amount * rate

    def get(self, request):
        landlord_id = request.query_params.get('landlord_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        if not landlord_id:
            return Response({'error': 'landlord_id is required'}, status=400)

        try:
            landlord = Landlord.objects.get(id=landlord_id)
        except Landlord.DoesNotExist:
            return Response({'error': 'Landlord not found'}, status=404)

        # Default date range: current month
        today = timezone.now().date()
        if not end_date:
            end_date = today
        else:
            end_date = date.fromisoformat(str(end_date))
        if not start_date:
            start_date = end_date.replace(day=1)
        else:
            start_date = date.fromisoformat(str(start_date))

        # Get properties and units
        properties = landlord.properties.all()
        units = Unit.objects.filter(property__in=properties)

        # ── Opening balance (all transactions before start_date) ──
        prior_receipts = Receipt.objects.filter(
            invoice__unit__in=units, date__lt=start_date
        ).select_related('income_type')
        prior_receipts_total = Decimal('0')
        prior_commissions_total = Decimal('0')
        for r in prior_receipts:
            prior_receipts_total += r.amount
            prior_commissions_total += self._compute_commission(r, landlord)

        prior_expenses_total = Expense.objects.filter(
            payee_type='landlord', payee_id=landlord.id,
            status='paid', date__lt=start_date,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        opening_balance = prior_receipts_total - prior_commissions_total - prior_expenses_total

        # ── Period transactions ──
        receipts = Receipt.objects.filter(
            invoice__unit__in=units,
            date__gte=start_date, date__lte=end_date,
        ).select_related(
            'tenant', 'invoice', 'invoice__unit', 'invoice__unit__property',
            'invoice__lease', 'income_type',
        ).order_by('date')

        expenses = Expense.objects.filter(
            payee_type='landlord', payee_id=landlord.id,
            status='paid',
            date__gte=start_date, date__lte=end_date,
        ).order_by('date')

        transactions = []
        total_receipts = Decimal('0')
        total_commissions = Decimal('0')
        total_expenses = Decimal('0')
        txn_id = 0

        for rcpt in receipts:
            lease_id = rcpt.invoice.lease_id if rcpt.invoice else ''
            tenant_name = rcpt.tenant.name if rcpt.tenant else ''
            unit_str = str(rcpt.invoice.unit) if rcpt.invoice and rcpt.invoice.unit else ''
            ref = rcpt.reference or rcpt.receipt_number

            # Credit: receipt
            txn_id += 1
            transactions.append({
                'id': txn_id,
                'date': str(rcpt.date),
                'type': 'receipt',
                'description': f"Payment Leaseid-{lease_id} -{tenant_name} {unit_str} Ref-{ref}",
                'debit': 0,
                'credit': float(rcpt.amount),
            })
            total_receipts += rcpt.amount

            # Debit: commission for this receipt
            commission_amt = self._compute_commission(rcpt, landlord)
            if commission_amt > 0:
                income_type_name = rcpt.income_type.name if rcpt.income_type else 'Levy'
                txn_id += 1
                transactions.append({
                    'id': txn_id,
                    'date': str(rcpt.date),
                    'type': 'commission',
                    'description': f"{income_type_name} Commission Leaseid-{lease_id} Ref-{ref}",
                    'debit': float(commission_amt),
                    'credit': 0,
                })
                total_commissions += commission_amt

        for exp in expenses:
            txn_id += 1
            ref_part = f" ref-{exp.reference}" if exp.reference else ''
            transactions.append({
                'id': txn_id,
                'date': str(exp.date),
                'type': 'expense',
                'description': f"Journal{ref_part}-{exp.description}",
                'debit': float(exp.amount),
                'credit': 0,
            })
            total_expenses += exp.amount

        # Sort all transactions by date, keeping receipt before its commission
        transactions.sort(key=lambda x: (x['date'], x['id']))

        # Running balance: opening + credits - debits
        running_balance = opening_balance
        for txn in transactions:
            running_balance += Decimal(str(txn['credit'])) - Decimal(str(txn['debit']))
            txn['balance'] = float(running_balance)

        total_debits = total_commissions + total_expenses
        total_credits = total_receipts

        return Response({
            'report_name': 'Landlord Account Summary',
            'landlord': {
                'id': landlord.id,
                'code': landlord.code,
                'name': landlord.name,
            },
            'period': {
                'start': str(start_date),
                'end': str(end_date),
            },
            'summary': {
                'opening_balance': float(opening_balance),
                'total_receipts': float(total_receipts),
                'total_commissions': float(total_commissions),
                'total_expenses': float(total_expenses),
                'total_debits': float(total_debits),
                'total_credits': float(total_credits),
                'closing_balance': float(running_balance),
                'commission_rate': float(landlord.commission_rate),
            },
            'properties': [
                {
                    'name': p.name,
                    'units': p.unit_count,
                }
                for p in properties.annotate(unit_count=Count('units'))
            ],
            'transactions': transactions,
            'transaction_count': len(transactions),
        })


class CashFlowStatementView(APIView):
    """Cash Flow Statement Report."""
    permission_classes = [IsAuthenticated]

    @_cache_report('cash_flow', ttl=120)
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

    @_cache_report('aged_analysis', ttl=120)
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

        # Pre-fetch deposit invoices into a dict keyed by (tenant_id, lease_id)
        # to avoid N+1 queries (one DB hit per lease).
        deposit_inv_map = {}
        for inv in deposit_invoices:
            key = (inv.tenant_id, inv.lease_id)
            if key not in deposit_inv_map:
                deposit_inv_map[key] = inv

        # Build deposit summary
        deposits = []
        total_deposits_required = Decimal('0')
        total_deposits_paid = Decimal('0')
        total_deposits_held = Decimal('0')

        for lease in leases:
            deposit_inv = deposit_inv_map.get((lease.tenant_id, lease.id))
            deposit_paid = deposit_inv.amount_paid if deposit_inv else Decimal('0')
            deposit_required = lease.deposit_amount

            deposits.append({
                'lease_id': lease.id,
                'lease_number': lease.lease_number,
                'tenant_id': lease.tenant.id,
                'tenant_name': lease.tenant.name,
                'property_id': lease.unit.property_id,
                'property': lease.unit.property.name,
                'unit_id': lease.unit_id,
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

        # Base filter for receipts with valid invoice+unit+property
        base_filter = Q(
            invoice__isnull=False,
            invoice__unit__isnull=False,
            invoice__unit__property__isnull=False,
            date__lte=end_date,
        )
        if start_date:
            base_filter &= Q(date__gte=start_date)
        if landlord_id:
            base_filter &= Q(invoice__unit__property__landlord_id=landlord_id)

        # Use DB-level aggregation instead of Python iteration
        # By landlord - aggregate at DB level
        landlord_qs = Receipt.objects.filter(base_filter).values(
            'invoice__unit__property__landlord__id',
            'invoice__unit__property__landlord__name',
            'invoice__unit__property__landlord__code',
            'invoice__unit__property__landlord__commission_rate',
        ).annotate(
            collected=Sum('amount'),
        ).order_by('-collected')

        landlord_list = []
        for row in landlord_qs:
            rate = row['invoice__unit__property__landlord__commission_rate'] or Decimal('0')
            collected = row['collected'] or Decimal('0')
            commission = collected * rate / 100
            landlord_list.append({
                'landlord_id': row['invoice__unit__property__landlord__id'],
                'landlord_name': row['invoice__unit__property__landlord__name'],
                'landlord_code': row['invoice__unit__property__landlord__code'],
                'commission_rate': float(rate),
                'collected': float(collected),
                'commission': float(commission),
            })
        landlord_list.sort(key=lambda x: x['commission'], reverse=True)

        # By property - aggregate at DB level
        property_qs = Receipt.objects.filter(base_filter).values(
            'invoice__unit__property__id',
            'invoice__unit__property__name',
            'invoice__unit__property__landlord__id',
            'invoice__unit__property__landlord__name',
            'invoice__unit__property__landlord__commission_rate',
        ).annotate(
            collected=Sum('amount'),
        ).order_by('-collected')

        property_list = []
        for row in property_qs:
            rate = row['invoice__unit__property__landlord__commission_rate'] or Decimal('0')
            collected = row['collected'] or Decimal('0')
            commission = collected * rate / 100
            property_list.append({
                'property_id': row['invoice__unit__property__id'],
                'property_name': row['invoice__unit__property__name'],
                'landlord_id': row['invoice__unit__property__landlord__id'],
                'landlord_name': row['invoice__unit__property__landlord__name'],
                'commission_rate': float(rate),
                'collected': float(collected),
                'commission': float(commission),
            })
        property_list.sort(key=lambda x: x['commission'], reverse=True)

        # By income type - aggregate at DB level
        income_type_qs = Receipt.objects.filter(base_filter).values(
            'invoice__invoice_type',
        ).annotate(
            collected=Sum('amount'),
        ).order_by('-collected')

        # Get display names for invoice types
        invoice_type_choices = dict(Invoice._meta.get_field('invoice_type').flatchoices)

        income_type_list = []
        for row in income_type_qs:
            collected = row['collected'] or Decimal('0')
            income_type_list.append({
                'income_type': row['invoice__invoice_type'],
                'income_type_display': invoice_type_choices.get(row['invoice__invoice_type'], row['invoice__invoice_type']),
                'collected': float(collected),
                'commission': 0,  # Will be calculated below
            })

        # Calculate totals
        total_collected = sum(item['collected'] for item in property_list)
        total_commission = sum(item['commission'] for item in property_list)

        # For income types, calculate commission using average effective rate
        effective_rate = total_commission / total_collected if total_collected else 0
        for item in income_type_list:
            item['commission'] = round(item['collected'] * effective_rate, 2)
        income_type_list.sort(key=lambda x: x['commission'], reverse=True)

        # Add percentage and rank to property list
        for rank, item in enumerate(property_list, 1):
            item['rank'] = rank
            item['percentage'] = round(item['commission'] / total_commission * 100, 1) if total_commission else 0

        # Add percentage and rank to income type list
        for rank, item in enumerate(income_type_list, 1):
            item['rank'] = rank
            item['percentage'] = round(item['commission'] / total_commission * 100, 1) if total_commission else 0

        return Response({
            'report_name': 'Commission Report',
            'period': {
                'start': start_date,
                'end': str(end_date)
            },
            'summary': {
                'total_collected': total_collected,
                'total_commission': total_commission,
                'effective_rate': round(total_commission / total_collected * 100, 2) if total_collected else 0
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


class CommissionPropertyDrilldownView(APIView):
    """Drill-down for a single property's commission by revenue type."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        property_id = request.query_params.get('property_id')
        if not property_id:
            return Response({'error': 'property_id is required'}, status=400)

        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date', str(timezone.now().date()))

        try:
            prop = Property.objects.select_related('landlord').get(id=property_id)
        except Property.DoesNotExist:
            return Response({'error': 'Property not found'}, status=404)

        commission_rate = float(prop.landlord.commission_rate) if prop.landlord and prop.landlord.commission_rate else 0

        # Group receipts by invoice_type for this property
        rcpt_filter = {
            'invoice__unit__property_id': property_id,
            'invoice__isnull': False,
            'date__lte': end_date,
        }
        if start_date:
            rcpt_filter['date__gte'] = start_date

        invoice_type_choices = dict(Invoice._meta.get_field('invoice_type').flatchoices)

        type_qs = Receipt.objects.filter(**rcpt_filter).values(
            'invoice__invoice_type'
        ).annotate(
            collected=Coalesce(Sum('amount'), Decimal('0'))
        ).order_by('-collected')

        total_revenue = Decimal('0')
        revenue_types = []
        for row in type_qs:
            collected = float(row['collected'])
            commission = round(collected * commission_rate / 100, 2)
            total_revenue += Decimal(str(collected))
            revenue_types.append({
                'revenue_type': row['invoice__invoice_type'],
                'revenue_type_display': invoice_type_choices.get(row['invoice__invoice_type'], row['invoice__invoice_type']),
                'revenue': collected,
                'commission_rate': commission_rate,
                'commission': commission,
            })

        total_revenue_f = float(total_revenue)
        total_commission = round(total_revenue_f * commission_rate / 100, 2)

        # Calculate percentage of total for each type
        for item in revenue_types:
            item['percentage'] = round(item['revenue'] / total_revenue_f * 100, 1) if total_revenue_f else 0

        return Response({
            'level': 2,
            'property_id': int(property_id),
            'property_name': prop.name,
            'landlord_name': prop.landlord.name if prop.landlord else '',
            'commission_rate': commission_rate,
            'period': {'start': start_date or '', 'end': end_date},
            'revenue_types': revenue_types,
            'summary': {
                'total_revenue': total_revenue_f,
                'total_commission': total_commission,
            },
        })


class LeaseChargeSummaryView(APIView):
    """
    Lease Charge Summary – masterfile billing configuration.
    Shows how each active lease is set up: charge type, currency,
    amount, and commission rate.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        property_id = request.query_params.get('property_id')
        landlord_id = request.query_params.get('landlord_id')

        # Get active leases
        leases = LeaseAgreement.objects.filter(
            status='active'
        ).select_related(
            'tenant', 'unit', 'unit__property', 'unit__property__landlord',
        ).order_by('unit__property__name', 'unit__unit_number')

        if property_id:
            leases = leases.filter(unit__property_id=property_id)
        if landlord_id:
            leases = leases.filter(unit__property__landlord_id=landlord_id)

        # Determine commission rate per lease from income_type on latest invoice
        lease_ids = [l.id for l in leases]
        # Get the income_type commission for each lease (from most recent invoice)
        from django.db.models import Subquery, OuterRef
        latest_inv_with_income = (
            Invoice.objects.filter(lease_id=OuterRef('pk'), income_type__isnull=False)
            .order_by('-date')
            .values('income_type__default_commission_rate')[:1]
        )
        commission_map = {}
        for row in LeaseAgreement.objects.filter(id__in=lease_ids).annotate(
            income_commission=Subquery(latest_inv_with_income)
        ).values('id', 'income_commission'):
            commission_map[row['id']] = row['income_commission']

        lease_type_labels = dict(LeaseAgreement.LeaseType.choices)
        charges = []
        total_amount = Decimal('0')

        for lease in leases:
            prop = lease.unit.property
            landlord = prop.landlord

            # Commission rate: prefer income_type rate, fallback to landlord rate
            income_commission = commission_map.get(lease.id)
            if income_commission is not None:
                comm_rate = float(income_commission)
            else:
                comm_rate = float(landlord.commission_rate)

            # Build property display: "Name, Suburb, City" (matching spreadsheet)
            parts = [prop.name]
            if prop.suburb:
                parts.append(prop.suburb)
            parts.append(prop.city)
            property_display = ', '.join(parts)

            # Tenant display: "Name UnitNumber PropertyName"
            tenant_display = f"{lease.tenant.name} {lease.unit.unit_number} {prop.name}"

            # Charge type from lease_type
            charge_type = lease_type_labels.get(lease.lease_type, lease.lease_type)
            # Map to friendlier names
            if lease.lease_type == 'levy':
                charge_type = 'Levy'
            elif lease.lease_type == 'rental':
                charge_type = 'Rent'

            charges.append({
                'lease_id': lease.id,
                'lease_number': lease.lease_number,
                'property_id': prop.id,
                'property': property_display,
                'tenant_id': lease.tenant_id,
                'tenant': tenant_display,
                'charge_type': charge_type,
                'charge_currency': lease.currency,
                'charge_amount': float(lease.monthly_rent),
                'charge_commission': comm_rate,
                # Extra fields for navigation/filtering
                'unit_id': lease.unit_id,
                'unit': lease.unit.unit_number,
                'landlord_id': landlord.id,
                'landlord_name': landlord.name,
            })
            total_amount += lease.monthly_rent

        return Response({
            'report_name': 'Lease Charge Summary',
            'summary': {
                'total_leases': len(charges),
                'total_charge_amount': float(total_amount),
            },
            'charges': charges,
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
                'receipt_id': rcpt.id,
                'date': str(rcpt.date),
                'receipt_number': rcpt.receipt_number,
                'tenant_id': rcpt.tenant.id,
                'tenant_code': rcpt.tenant.code,
                'tenant_name': rcpt.tenant.name,
                'landlord_name': landlord_name,
                'property_id': rcpt.invoice.unit.property_id if rcpt.invoice and rcpt.invoice.unit else None,
                'property_name': property_name,
                'unit_id': rcpt.invoice.unit_id if rcpt.invoice and rcpt.invoice.unit else None,
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
        bank_accounts = {}  # bank_name -> bank_id
        totals_by_type = {}
        totals_by_bank = {}
        grand_total = Decimal('0')

        for rcpt in receipts:
            inv_type = rcpt.invoice.invoice_type if rcpt.invoice else 'other'
            inv_type_display = rcpt.invoice.get_invoice_type_display() if rcpt.invoice else 'Other'
            bank_id = rcpt.bank_account_id if rcpt.bank_account else None
            bank_name = rcpt.bank_account.name if rcpt.bank_account else (rcpt.bank_name or 'Cash')

            income_types.add((inv_type, inv_type_display))
            if bank_name not in bank_accounts:
                bank_accounts[bank_name] = bank_id

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

        # Build structured bank columns with id, key, label
        bank_list = sorted(bank_accounts.keys())
        bank_columns = []
        for bank_name in bank_list:
            key = f'bank_{bank_accounts[bank_name]}' if bank_accounts[bank_name] else bank_name.lower().replace(' ', '_')
            bank_columns.append({
                'key': key,
                'label': bank_name,
                'id': bank_accounts[bank_name],
            })

        type_list = sorted(income_types, key=lambda x: x[1])

        # Build flattened matrix rows (amounts at row[col.key])
        matrix_data = []
        for inv_type, inv_type_display in type_list:
            row = {
                'income_type': inv_type,
                'income_type_display': inv_type_display,
                'total': float(totals_by_type.get(inv_type, {}).get('amount', 0))
            }
            for col in bank_columns:
                row[col['key']] = float(matrix.get((inv_type, col['label']), 0))
            matrix_data.append(row)

        # Build totals keyed by column key
        totals = {'grand_total': float(grand_total)}
        for col in bank_columns:
            totals[col['key']] = float(totals_by_bank.get(col['label'], 0))

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
            'bank_columns': bank_columns,
            'totals': totals,
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


class IncomeItemDrilldownView(APIView):
    """
    Drill-down for Income Item Analysis.
    Level 2: Income categories for a specific bank account.
    Level 3: Individual receipts for a bank + income category.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        level = request.query_params.get('level', '2')
        bank_account_id = request.query_params.get('bank_account_id')
        income_type = request.query_params.get('income_type')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date', timezone.now().date())

        if not bank_account_id:
            return Response({'error': 'bank_account_id is required'}, status=400)

        # Base queryset
        receipts = Receipt.objects.filter(
            bank_account_id=bank_account_id,
            date__lte=end_date,
        )
        if start_date:
            receipts = receipts.filter(date__gte=start_date)

        # Get bank account name
        try:
            bank_account = BankAccount.objects.get(pk=bank_account_id)
            bank_account_name = bank_account.name
        except BankAccount.DoesNotExist:
            return Response({'error': 'Bank account not found'}, status=404)

        if level == '3':
            # Level 3: Individual receipts for bank + income type
            if not income_type:
                return Response({'error': 'income_type is required for level 3'}, status=400)

            receipts = receipts.filter(
                invoice__invoice_type=income_type
            ).select_related(
                'tenant', 'invoice__property', 'invoice__unit', 'invoice'
            ).order_by('-date')

            receipt_list = []
            total = Decimal('0')
            for rcpt in receipts:
                prop_name = ''
                unit_name = ''
                if rcpt.invoice:
                    prop_name = rcpt.invoice.property.name if rcpt.invoice.property else ''
                    unit_name = rcpt.invoice.unit.unit_number if rcpt.invoice.unit else ''
                receipt_list.append({
                    'receipt_id': rcpt.id,
                    'date': str(rcpt.date),
                    'receipt_number': rcpt.receipt_number,
                    'property_id': rcpt.invoice.property_id if rcpt.invoice and rcpt.invoice.property else None,
                    'property': prop_name,
                    'unit_id': rcpt.invoice.unit_id if rcpt.invoice and rcpt.invoice.unit else None,
                    'unit': unit_name,
                    'tenant_id': rcpt.tenant_id if rcpt.tenant else None,
                    'tenant': str(rcpt.tenant) if rcpt.tenant else '',
                    'amount': float(rcpt.amount),
                })
                total += rcpt.amount

            # Get display name for income type
            income_type_display = income_type
            for choice_val, choice_label in Invoice.InvoiceType.choices:
                if choice_val == income_type:
                    income_type_display = choice_label
                    break

            return Response({
                'level': 3,
                'bank_account_name': bank_account_name,
                'income_type': income_type,
                'income_type_display': income_type_display,
                'receipts': receipt_list,
                'total': float(total),
                'transaction_count': len(receipt_list),
            })

        else:
            # Level 2: Categories breakdown for a bank
            receipts = receipts.select_related('invoice')
            categories = {}
            grand_total = Decimal('0')

            for rcpt in receipts:
                inv_type = rcpt.invoice.invoice_type if rcpt.invoice else 'other'
                inv_type_display = rcpt.invoice.get_invoice_type_display() if rcpt.invoice else 'Other'

                if inv_type not in categories:
                    categories[inv_type] = {
                        'income_type': inv_type,
                        'income_type_display': inv_type_display,
                        'transaction_count': 0,
                        'total_amount': Decimal('0'),
                    }
                categories[inv_type]['transaction_count'] += 1
                categories[inv_type]['total_amount'] += rcpt.amount
                grand_total += rcpt.amount

            cat_list = sorted(categories.values(), key=lambda x: x['income_type_display'])
            for cat in cat_list:
                cat['total_amount'] = float(cat['total_amount'])

            return Response({
                'level': 2,
                'bank_account_name': bank_account_name,
                'categories': cat_list,
                'grand_total': float(grand_total),
                'total_transactions': sum(c['transaction_count'] for c in cat_list),
            })


class IncomeExpenditureReportView(APIView):
    """
    Income & Expenditure Report – monthly columnar view matching the
    Sunset Financials spreadsheet.

    Sections returned:
    1. months[]        – per-month income, expenditure by category, balance
    2. consolidated    – year-to-date totals
    3. income_summary  – per-tenant account status
    4. working_capital – debtors, creditors, net working capital
    """
    permission_classes = [IsAuthenticated]

    # ── helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _month_range(start_date, end_date):
        """Yield (month_start, month_end, label) for every month in the range."""
        from calendar import monthrange
        cursor = start_date.replace(day=1)
        while cursor <= end_date:
            _, last_day = monthrange(cursor.year, cursor.month)
            month_end = cursor.replace(day=last_day)
            yield cursor, min(month_end, end_date), cursor.strftime('%B %Y')
            if cursor.month == 12:
                cursor = cursor.replace(year=cursor.year + 1, month=1)
            else:
                cursor = cursor.replace(month=cursor.month + 1)

    @staticmethod
    def _compute_commission_amount(receipt, landlord):
        if receipt.income_type and receipt.income_type.is_commissionable:
            rate = receipt.income_type.default_commission_rate / 100
        else:
            rate = landlord.commission_rate / 100
        return receipt.amount * rate

    # ── expense label map ────────────────────────────────────────────
    EXPENSE_LABELS = {
        'maintenance': 'Repairs and Maintenance',
        'utility': 'Utilities',
        'commission': 'Commission',
        'landlord_payment': 'Landlord Payment',
        'other': 'Other Expenses',
    }

    # ── main handler ─────────────────────────────────────────────────

    def get(self, request):
        landlord_id = request.query_params.get('landlord_id')
        property_id = request.query_params.get('property_id')

        if not landlord_id and not property_id:
            return Response({'error': 'landlord_id or property_id is required'}, status=400)

        # Resolve landlord + properties
        if landlord_id:
            try:
                landlord = Landlord.objects.get(id=landlord_id)
            except Landlord.DoesNotExist:
                return Response({'error': 'Landlord not found'}, status=404)
            properties = landlord.properties.all()
            entity_name = landlord.name
            entity_type = 'landlord'
        else:
            try:
                prop = Property.objects.get(id=property_id)
            except Property.DoesNotExist:
                return Response({'error': 'Property not found'}, status=404)
            landlord = prop.landlord
            properties = Property.objects.filter(id=property_id)
            entity_name = prop.name
            entity_type = 'property'

        property_names = list(properties.values_list('name', flat=True))
        units = Unit.objects.filter(property__in=properties)

        # Date range – default to full current year
        today = timezone.now().date()
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        if not start_date:
            start_date = today.replace(month=1, day=1)
        else:
            start_date = date.fromisoformat(str(start_date))
        if not end_date:
            end_date = today
        else:
            end_date = date.fromisoformat(str(end_date))

        commission_rate = float(landlord.commission_rate)

        # ── 1. Opening balance (all transactions BEFORE start_date) ──
        # Pre-evaluate unit IDs to avoid repeated subquery evaluation
        unit_id_list = list(units.values_list('id', flat=True))

        # Aggregate prior receipts total and commission in SQL (avoids loading
        # every historical receipt into Python memory — the old per-receipt loop
        # caused OOM / connection drops for landlords with large history).
        prior_agg = Receipt.objects.filter(
            invoice__unit_id__in=unit_id_list, date__lt=start_date,
        ).aggregate(
            receipts_total=Sum('amount'),
            commissions_total=Sum(
                Case(
                    When(
                        income_type__isnull=False,
                        income_type__is_commissionable=True,
                        then=F('amount') * F('income_type__default_commission_rate') / Value(Decimal('100')),
                    ),
                    default=F('amount') * Value(landlord.commission_rate) / Value(Decimal('100')),
                    output_field=DecimalField(max_digits=18, decimal_places=2),
                )
            ),
        )
        prior_receipts_total = prior_agg['receipts_total'] or Decimal('0')
        prior_commissions_total = prior_agg['commissions_total'] or Decimal('0')

        prior_expenses_total = Expense.objects.filter(
            payee_type='landlord', payee_id=landlord.id,
            status='paid', date__lt=start_date,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        opening_balance = prior_receipts_total - prior_commissions_total - prior_expenses_total

        # ── 2. Period receipts + expenses (eager load once) ──
        period_receipts = list(
            Receipt.objects.filter(
                invoice__unit_id__in=unit_id_list,
                date__gte=start_date, date__lte=end_date,
            ).select_related('income_type', 'tenant', 'invoice', 'invoice__unit')
            .order_by('date')
        )
        period_expenses = list(
            Expense.objects.filter(
                payee_type='landlord', payee_id=landlord.id,
                status='paid',
                date__gte=start_date, date__lte=end_date,
            ).order_by('date')
        )

        # ── 3. Build per-month data ─────────────────────────────────
        months = []
        running_balance_usd = opening_balance
        # Collect all unique expense types seen
        all_expense_types = set()

        for m_start, m_end, m_label in self._month_range(start_date, end_date):
            # Filter receipts and expenses for this month
            m_receipts = [r for r in period_receipts if m_start <= r.date <= m_end]
            m_expenses = [e for e in period_expenses if m_start <= e.date <= m_end]

            levies_usd = sum((r.amount for r in m_receipts), Decimal('0'))
            amount_before = running_balance_usd + levies_usd

            # Expenses grouped by expense_type
            exp_by_type = {}
            for e in m_expenses:
                exp_by_type.setdefault(e.expense_type, Decimal('0'))
                exp_by_type[e.expense_type] += e.amount
            all_expense_types.update(exp_by_type.keys())

            # Management commission (from receipts)
            mgmt_commission = sum(
                (self._compute_commission_amount(r, landlord) for r in m_receipts),
                Decimal('0'),
            )

            total_exp = sum(exp_by_type.values(), Decimal('0')) + mgmt_commission
            balance_cf = amount_before - total_exp
            running_balance_usd = balance_cf

            months.append({
                'month': m_start.strftime('%Y-%m'),
                'label': m_label,
                'balance_bf': float(amount_before - levies_usd),
                'levies': float(levies_usd),
                'amount_before_expenditure': float(amount_before),
                'expenditure_categories': {
                    etype: float(amt) for etype, amt in exp_by_type.items()
                },
                'management_commission': float(mgmt_commission),
                'total_expenditure': float(total_exp),
                'balance_cf': float(balance_cf),
            })

        # Ensure every month has every expense category key (fill missing with 0)
        for m in months:
            for etype in all_expense_types:
                m['expenditure_categories'].setdefault(etype, 0.0)

        # ── 4. Consolidated totals ───────────────────────────────────
        con_levies = sum(m['levies'] for m in months)
        con_exp_by_type = {}
        for m in months:
            for etype, amt in m['expenditure_categories'].items():
                con_exp_by_type[etype] = con_exp_by_type.get(etype, 0.0) + amt
        con_commission = sum(m['management_commission'] for m in months)
        con_total_exp = sum(m['total_expenditure'] for m in months)

        consolidated = {
            'balance_bf': float(opening_balance),
            'levies': con_levies,
            'total_income': float(opening_balance) + con_levies,
            'expenditure_categories': con_exp_by_type,
            'management_commission': con_commission,
            'total_expenditure': con_total_exp,
            'balance_cf': float(running_balance_usd),
        }

        # ── 5. Expense category labels (ordered, with nice names) ────
        expense_category_labels = []
        ordered_types = ['maintenance', 'utility', 'commission', 'landlord_payment', 'other']
        seen = set()
        for etype in ordered_types:
            if etype in all_expense_types:
                expense_category_labels.append({
                    'key': etype,
                    'label': self.EXPENSE_LABELS.get(etype, etype),
                })
                seen.add(etype)
        for etype in sorted(all_expense_types - seen):
            expense_category_labels.append({
                'key': etype,
                'label': self.EXPENSE_LABELS.get(etype, etype.replace('_', ' ').title()),
            })

        # ── 6. Income summary per tenant ─────────────────────────────
        # Batched queries to avoid N+1 (one query per aggregation instead of per-lease)
        leases = LeaseAgreement.objects.filter(
            unit_id__in=unit_id_list,
        ).select_related('tenant', 'unit', 'unit__property')

        # Build deduplicated (tenant_id, unit_id) sets for efficient IN clauses
        lease_list = list(leases)
        unit_ids = list({l.unit_id for l in lease_list})
        tenant_ids = list({l.tenant_id for l in lease_list})

        valid_statuses = ['sent', 'partial', 'overdue', 'paid']

        # Batch: prior invoices total per (tenant, unit)
        prior_inv_qs = Invoice.objects.filter(
            tenant_id__in=tenant_ids, unit_id__in=unit_ids,
            date__lt=start_date, status__in=valid_statuses,
        ).values('tenant_id', 'unit_id').annotate(total=Sum('total_amount'))
        prior_inv_map = {(r['tenant_id'], r['unit_id']): r['total'] or Decimal('0') for r in prior_inv_qs}

        # Batch: prior payments per (tenant, unit)
        prior_pay_qs = Receipt.objects.filter(
            tenant_id__in=tenant_ids, invoice__unit_id__in=unit_ids,
            date__lt=start_date,
        ).values('tenant_id', 'invoice__unit_id').annotate(total=Sum('amount'))
        prior_pay_map = {(r['tenant_id'], r['invoice__unit_id']): r['total'] or Decimal('0') for r in prior_pay_qs}

        # Batch: period charges per (tenant, unit)
        period_inv_qs = Invoice.objects.filter(
            tenant_id__in=tenant_ids, unit_id__in=unit_ids,
            date__gte=start_date, date__lte=end_date, status__in=valid_statuses,
        ).values('tenant_id', 'unit_id').annotate(total=Sum('total_amount'))
        period_inv_map = {(r['tenant_id'], r['unit_id']): r['total'] or Decimal('0') for r in period_inv_qs}

        # Batch: penalties per (tenant, unit)
        penalty_qs = Invoice.objects.filter(
            tenant_id__in=tenant_ids, unit_id__in=unit_ids,
            invoice_type='penalty',
            date__gte=start_date, date__lte=end_date, status__in=valid_statuses,
        ).values('tenant_id', 'unit_id').annotate(total=Sum('total_amount'))
        penalty_map = {(r['tenant_id'], r['unit_id']): r['total'] or Decimal('0') for r in penalty_qs}

        # Build per-receipt lookup: (tenant_id, unit_id) -> total paid
        receipt_paid_map = {}
        for r in period_receipts:
            if r.invoice and r.invoice.unit_id:
                key = (r.tenant_id, r.invoice.unit_id)
                receipt_paid_map[key] = receipt_paid_map.get(key, Decimal('0')) + r.amount

        income_summary_tenants = []
        totals_bf = Decimal('0')
        totals_charge = Decimal('0')
        totals_paid = Decimal('0')
        totals_penalty = Decimal('0')

        for lease in lease_list:
            tid, uid = lease.tenant_id, lease.unit_id
            tenant = lease.tenant
            unit = lease.unit

            prior_invoices_total = prior_inv_map.get((tid, uid), Decimal('0'))
            prior_payments = prior_pay_map.get((tid, uid), Decimal('0'))
            balance_bf = prior_invoices_total - prior_payments

            period_charges = period_inv_map.get((tid, uid), Decimal('0'))
            penalty = penalty_map.get((tid, uid), Decimal('0'))
            charge = period_charges - penalty

            amount_due = balance_bf + charge + penalty
            amount_paid = receipt_paid_map.get((tid, uid), Decimal('0'))
            carried_forward = amount_due - amount_paid

            prop_name = unit.property.name if unit.property else ''
            display_name = f"{tenant.name} {unit.unit_number} {prop_name}".strip()

            income_summary_tenants.append({
                'tenant_id': tid,
                'name': display_name,
                'unit': unit.unit_number,
                'balance_bf': float(balance_bf),
                'charge': float(charge),
                'amount_due': float(amount_due),
                'amount_paid': float(amount_paid),
                'penalty': float(penalty),
                'carried_forward': float(carried_forward),
            })

            totals_bf += balance_bf
            totals_charge += charge
            totals_paid += amount_paid
            totals_penalty += penalty

        income_summary = {
            'as_of': str(end_date),
            'tenants': income_summary_tenants,
            'totals': {
                'balance_bf': float(totals_bf),
                'charge': float(totals_charge),
                'amount_due': float(totals_bf + totals_charge + totals_penalty),
                'amount_paid': float(totals_paid),
                'penalty': float(totals_penalty),
                'carried_forward': float(totals_bf + totals_charge + totals_penalty - totals_paid),
            },
        }

        # ── 7. Working Capital ───────────────────────────────────────
        cash_balance = float(running_balance_usd)
        levies_in_arrears = sum(
            t['carried_forward'] for t in income_summary_tenants if t['carried_forward'] > 0
        )
        prepayments = sum(
            abs(t['carried_forward']) for t in income_summary_tenants if t['carried_forward'] < 0
        )
        overdraft = abs(cash_balance) if cash_balance < 0 else 0.0

        total_debtors = (cash_balance if cash_balance > 0 else 0.0) + levies_in_arrears
        total_creditors = overdraft + prepayments

        working_capital = {
            'as_of': str(end_date),
            'debtors': {
                'cash_balances': cash_balance if cash_balance > 0 else 0.0,
                'levies_in_arrears': levies_in_arrears,
                'subtotal': total_debtors,
            },
            'creditors': {
                'overdraft': overdraft,
                'prepayments': prepayments,
                'subtotal': total_creditors,
            },
            'net_working_capital': total_debtors - total_creditors,
        }

        # ── Response ─────────────────────────────────────────────────
        return Response({
            'report_name': 'Income & Expenditure Report',
            'entity': {
                'type': entity_type,
                'id': int(landlord_id or property_id),
                'name': entity_name,
            },
            'properties': property_names,
            'period': {
                'start': str(start_date),
                'end': str(end_date),
            },
            'commission_rate': commission_rate,
            'expense_category_labels': expense_category_labels,
            'months': months,
            'consolidated': consolidated,
            'income_summary': income_summary,
            'working_capital': working_capital,
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

    @_cache_report('charts', ttl=60)
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


class StreamingCSVExportView(APIView):
    """
    Server-side streaming CSV export for large datasets.
    Avoids loading all data into browser memory.
    Supports: invoices, receipts, tenants, properties, leases, expenses
    """
    permission_classes = [IsAuthenticated]

    EXPORT_CONFIGS = {
        'invoices': {
            'model': Invoice,
            'select_related': ['tenant', 'unit', 'unit__property', 'lease'],
            'fields': [
                ('invoice_number', 'Invoice Number'),
                ('tenant__name', 'Tenant'),
                ('unit__unit_number', 'Unit'),
                ('unit__property__name', 'Property'),
                ('invoice_type', 'Type'),
                ('status', 'Status'),
                ('date', 'Date'),
                ('due_date', 'Due Date'),
                ('amount', 'Amount'),
                ('vat_amount', 'VAT'),
                ('total_amount', 'Total'),
                ('amount_paid', 'Paid'),
                ('balance', 'Balance'),
                ('currency', 'Currency'),
                ('description', 'Description'),
            ],
        },
        'receipts': {
            'model': Receipt,
            'select_related': ['tenant', 'invoice'],
            'fields': [
                ('receipt_number', 'Receipt Number'),
                ('tenant__name', 'Tenant'),
                ('invoice__invoice_number', 'Invoice'),
                ('date', 'Date'),
                ('amount', 'Amount'),
                ('currency', 'Currency'),
                ('payment_method', 'Payment Method'),
                ('reference', 'Reference'),
                ('description', 'Description'),
            ],
        },
        'tenants': {
            'model': RentalTenant,
            'select_related': [],
            'fields': [
                ('code', 'Code'),
                ('name', 'Name'),
                ('email', 'Email'),
                ('phone', 'Phone'),
                ('id_number', 'ID Number'),
                ('account_type', 'Account Type'),
                ('is_active', 'Active'),
            ],
        },
        'properties': {
            'model': Property,
            'select_related': ['landlord'],
            'fields': [
                ('code', 'Code'),
                ('name', 'Name'),
                ('landlord__name', 'Landlord'),
                ('address', 'Address'),
                ('city', 'City'),
                ('property_type', 'Type'),
            ],
        },
        'leases': {
            'model': LeaseAgreement,
            'select_related': ['tenant', 'unit', 'unit__property'],
            'fields': [
                ('lease_number', 'Lease Number'),
                ('tenant__name', 'Tenant'),
                ('unit__unit_number', 'Unit'),
                ('unit__property__name', 'Property'),
                ('monthly_rent', 'Monthly Rent'),
                ('currency', 'Currency'),
                ('start_date', 'Start Date'),
                ('end_date', 'End Date'),
                ('status', 'Status'),
            ],
        },
        'expenses': {
            'model': Expense,
            'select_related': [],
            'fields': [
                ('expense_number', 'Expense Number'),
                ('expense_type', 'Type'),
                ('payee_name', 'Payee'),
                ('date', 'Date'),
                ('amount', 'Amount'),
                ('currency', 'Currency'),
                ('status', 'Status'),
                ('description', 'Description'),
            ],
        },
    }

    def get(self, request):
        export_type = request.query_params.get('type')
        if export_type not in self.EXPORT_CONFIGS:
            return Response(
                {'error': f'Invalid export type. Available: {", ".join(self.EXPORT_CONFIGS.keys())}'},
                status=400
            )

        config = self.EXPORT_CONFIGS[export_type]
        model = config['model']
        queryset = model.objects.all()
        if config['select_related']:
            queryset = queryset.select_related(*config['select_related'])

        # Apply basic filters from query params
        for key, value in request.query_params.items():
            if key in ('type', 'format'):
                continue
            if hasattr(model, key) or '__' in key:
                try:
                    queryset = queryset.filter(**{key: value})
                except Exception:
                    pass

        # Stream CSV response
        import csv

        class Echo:
            """Pseudo-buffer that returns everything written to it."""
            def write(self, value):
                return value

        def csv_rows():
            pseudo_buffer = Echo()
            writer = csv.writer(pseudo_buffer)
            # Header row
            yield writer.writerow([f[1] for f in config['fields']])
            # Data rows — iterate in chunks of 2000
            for obj in queryset.iterator(chunk_size=2000):
                row = []
                for field_path, _ in config['fields']:
                    value = obj
                    for part in field_path.split('__'):
                        value = getattr(value, part, '') if value else ''
                    row.append(str(value) if value is not None else '')
                yield writer.writerow(row)

        from django.http import StreamingHttpResponse

        response = StreamingHttpResponse(csv_rows(), content_type='text/csv')
        timestamp = timezone.now().strftime('%Y%m%d')
        response['Content-Disposition'] = f'attachment; filename="{export_type}_{timestamp}.csv"'
        return response
