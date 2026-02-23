"""
Background tasks for scheduled report generation and emailing.
Uses Django-Q2 for daily/weekly/monthly execution across all tenants.
"""
import logging
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Sum, Count, Q, F
from django.db.models.functions import Coalesce
from django.utils import timezone
from django_tenants.utils import tenant_context, get_tenant_model

logger = logging.getLogger(__name__)


# ─── Date helpers ────────────────────────────────────────────────────────────

def _previous_month_range():
    """Return (start, end, label) for the previous calendar month."""
    today = timezone.now().date()
    if today.month == 1:
        start = date(today.year - 1, 12, 1)
        end = date(today.year - 1, 12, 31)
    else:
        start = date(today.year, today.month - 1, 1)
        end = date(today.year, today.month, 1) - timedelta(days=1)
    return start, end, start.strftime('%B %Y')


def _previous_week_range():
    """Return (start, end, label) for the previous Mon-Sun week."""
    today = timezone.now().date()
    end = today - timedelta(days=today.weekday() + 1)   # last Sunday
    start = end - timedelta(days=6)                      # last Monday
    return start, end, f"{start.strftime('%d %b')} – {end.strftime('%d %b %Y')}"


# ─── Formatting helpers ─────────────────────────────────────────────────────

def _fmt(value):
    """Format a number as $X,XXX.XX."""
    return f"${value:,.2f}"


_NO_DATA_MSG = 'No activity recorded for this reporting period.'


# ─── Generic wrapper ────────────────────────────────────────────────────────

def _run_report_for_all_tenants(report_name, generate_fn, build_body_fn, subject_template):
    """
    Generic driver: iterate active tenants, generate data, email staff.
    Always sends — never skips a tenant (no_data flag is passed to formatter).
    """
    TenantModel = get_tenant_model()
    tenants = TenantModel.objects.filter(is_active=True).exclude(schema_name='public')

    results = {'success': [], 'failed': [], 'skipped': []}

    for tenant in tenants:
        try:
            with tenant_context(tenant):
                data = generate_fn()
                period = data.pop('_period_label', '')
                no_data = data.pop('_no_data', False)
                subject = subject_template.format(period=period) if '{period}' in subject_template else subject_template
                body = build_body_fn(data, no_data=no_data)
                from apps.notifications.utils import send_staff_email
                send_staff_email(subject, body)
                results['success'].append(tenant.name)
        except Exception as e:
            logger.error(f"[{report_name}] Failed for {tenant.name}: {e}")
            results['failed'].append({'tenant': tenant.name, 'error': str(e)})

    logger.info(f"[{report_name}] Done — success={len(results['success'])}, "
                f"skipped={len(results['skipped'])}, failed={len(results['failed'])}")

    if results['failed']:
        try:
            from apps.notifications.tasks import send_system_alert_email
            lines = '\n'.join(f"  - {f['tenant']}: {f['error']}" for f in results['failed'])
            send_system_alert_email(
                f'{report_name} Failures: {len(results["failed"])} companies',
                f"{report_name} had failures:\n\n{lines}\n\nPlease investigate.",
            )
        except Exception:
            pass

    return results


# ═══════════════════════════════════════════════════════════════════════════
# DATA GENERATORS — each always returns a dict (never None).
# '_no_data' flag indicates empty data; '_period_label' is for subject.
# ═══════════════════════════════════════════════════════════════════════════

def _generate_dashboard_data():
    """Dashboard KPIs: occupancy, collections, alerts."""
    from apps.billing.models import Invoice, Receipt
    from apps.masterfile.models import Property, Unit, LeaseAgreement, RentalTenant, Landlord

    today = timezone.now().date()
    total_properties = Property.objects.count()

    if total_properties == 0:
        return {
            '_period_label': today.strftime('%d %b %Y'),
            '_no_data': True,
            'total_properties': 0, 'total_units': 0, 'vacant_units': 0,
            'occupancy_rate': 0, 'monthly_invoiced': 0, 'monthly_collected': 0,
            'overdue_count': 0, 'overdue_amount': 0, 'active_leases': 0,
            'expiring_leases': 0, 'landlords': 0, 'tenants': 0,
        }

    month_start = today.replace(day=1)

    unit_stats = Unit.objects.aggregate(
        total=Count('id'),
        vacant=Count('id', filter=Q(is_occupied=False)),
    )
    total_units = unit_stats['total'] or 0
    vacant = unit_stats['vacant'] or 0
    occupancy = round(((total_units - vacant) / total_units * 100), 1) if total_units else 0

    inv = Invoice.objects.aggregate(
        overdue_count=Count('id', filter=Q(status__in=['sent', 'partial'], due_date__lt=today)),
        overdue_amount=Coalesce(Sum('balance', filter=Q(status__in=['sent', 'partial'], due_date__lt=today)), Decimal('0')),
        monthly_invoiced=Coalesce(Sum('total_amount', filter=Q(date__gte=month_start)), Decimal('0')),
    )
    rcpt = Receipt.objects.aggregate(
        monthly_collected=Coalesce(Sum('amount', filter=Q(date__gte=month_start)), Decimal('0')),
    )

    thirty_days = today + timedelta(days=30)
    lease_stats = LeaseAgreement.objects.aggregate(
        active=Count('id', filter=Q(status='active')),
        expiring=Count('id', filter=Q(status='active', end_date__lte=thirty_days)),
    )

    return {
        '_period_label': today.strftime('%d %b %Y'),
        '_no_data': False,
        'total_properties': total_properties,
        'total_units': total_units,
        'vacant_units': vacant,
        'occupancy_rate': occupancy,
        'monthly_invoiced': float(inv['monthly_invoiced']),
        'monthly_collected': float(rcpt['monthly_collected']),
        'overdue_count': inv['overdue_count'],
        'overdue_amount': float(inv['overdue_amount']),
        'active_leases': lease_stats['active'],
        'expiring_leases': lease_stats['expiring'],
        'landlords': Landlord.objects.count(),
        'tenants': RentalTenant.objects.count(),
    }


def _generate_aged_analysis_data():
    """Aging buckets and top debtors."""
    from apps.billing.models import Invoice

    today = timezone.now().date()
    invoices = Invoice.objects.filter(
        status__in=['sent', 'partial', 'overdue'],
        balance__gt=0,
    ).select_related('tenant')

    total_outstanding = Decimal('0')
    buckets = {
        'current':  {'label': '0-30 days', 'amount': Decimal('0'), 'count': 0},
        '31_60':    {'label': '31-60 days', 'amount': Decimal('0'), 'count': 0},
        '61_90':    {'label': '61-90 days', 'amount': Decimal('0'), 'count': 0},
        '91_120':   {'label': '91-120 days', 'amount': Decimal('0'), 'count': 0},
        'over_120': {'label': '120+ days', 'amount': Decimal('0'), 'count': 0},
    }
    tenant_totals = {}

    for inv in invoices:
        days = max((today - inv.due_date).days, 0)
        if days <= 30:
            key = 'current'
        elif days <= 60:
            key = '31_60'
        elif days <= 90:
            key = '61_90'
        elif days <= 120:
            key = '91_120'
        else:
            key = 'over_120'

        bal = inv.balance
        buckets[key]['amount'] += bal
        buckets[key]['count'] += 1
        total_outstanding += bal

        tname = inv.tenant.name if inv.tenant else 'Unknown'
        tenant_totals[tname] = tenant_totals.get(tname, Decimal('0')) + bal

    no_data = total_outstanding == 0
    top_debtors = sorted(tenant_totals.items(), key=lambda x: x[1], reverse=True)[:20]

    return {
        '_period_label': today.strftime('%d %b %Y'),
        '_no_data': no_data,
        'total_outstanding': float(total_outstanding),
        'total_invoices': sum(b['count'] for b in buckets.values()),
        'buckets': {k: {'label': v['label'], 'amount': float(v['amount']), 'count': v['count']}
                    for k, v in buckets.items()},
        'top_debtors': [{'name': n, 'balance': float(b)} for n, b in top_debtors],
    }


def _generate_vacancy_data():
    """Vacant units by property."""
    from apps.masterfile.models import Property, Unit

    properties = Property.objects.select_related('landlord').annotate(
        unit_count=Count('units'),
        vacant_count=Count('units', filter=Q(units__is_occupied=False)),
    )

    if not properties.exists():
        return {
            '_period_label': timezone.now().date().strftime('%d %b %Y'),
            '_no_data': True,
            'properties': [], 'total_properties': 0,
            'total_units': 0, 'total_vacant': 0, 'overall_vacancy_rate': 0,
        }

    total_units = 0
    total_vacant = 0
    rows = []
    for p in properties:
        rate = round((p.vacant_count / p.unit_count * 100), 1) if p.unit_count else 0
        rows.append({
            'name': p.name,
            'landlord': p.landlord.name,
            'total_units': p.unit_count,
            'vacant': p.vacant_count,
            'vacancy_rate': rate,
        })
        total_units += p.unit_count
        total_vacant += p.vacant_count

    overall_rate = round((total_vacant / total_units * 100), 1) if total_units else 0

    return {
        '_period_label': timezone.now().date().strftime('%d %b %Y'),
        '_no_data': False,
        'properties': rows,
        'total_properties': len(rows),
        'total_units': total_units,
        'total_vacant': total_vacant,
        'overall_vacancy_rate': overall_rate,
    }


def _generate_rent_roll_data():
    """Active leases with monthly rent."""
    from apps.masterfile.models import LeaseAgreement

    leases = LeaseAgreement.objects.filter(
        status='active',
    ).select_related('tenant', 'unit', 'unit__property')

    _, _, period = _previous_week_range()

    if not leases.exists():
        return {
            '_period_label': period,
            '_no_data': True,
            'leases': [], 'total_leases': 0,
            'total_monthly_rent': 0, 'truncated': False,
        }

    total_rent = Decimal('0')
    rows = []
    for lease in leases:
        rows.append({
            'tenant': lease.tenant.name,
            'property': lease.unit.property.name,
            'unit': lease.unit.unit_number,
            'monthly_rent': float(lease.monthly_rent),
            'currency': lease.currency,
            'end_date': str(lease.end_date),
        })
        total_rent += lease.monthly_rent

    return {
        '_period_label': period,
        '_no_data': False,
        'leases': rows[:20],
        'total_leases': len(rows),
        'total_monthly_rent': float(total_rent),
        'truncated': len(rows) > 20,
    }


def _generate_receipt_listing_data():
    """Collections by bank/type for the previous week."""
    from apps.billing.models import Receipt

    start, end, period = _previous_week_range()
    receipts = Receipt.objects.filter(
        date__gte=start, date__lte=end,
    ).select_related('bank_account', 'invoice')

    if not receipts.exists():
        return {
            '_period_label': period,
            '_no_data': True,
            'total_amount': 0, 'total_receipts': 0,
            'by_bank': {}, 'by_income_type': {},
        }

    total = Decimal('0')
    by_bank = {}
    by_type = {}
    count = 0

    for r in receipts:
        total += r.amount
        count += 1
        bank = r.bank_account.name if r.bank_account else (r.bank_name or 'Cash')
        by_bank[bank] = float(by_bank.get(bank, 0)) + float(r.amount)
        itype = r.invoice.get_invoice_type_display() if r.invoice else 'Other'
        by_type[itype] = float(by_type.get(itype, 0)) + float(r.amount)

    return {
        '_period_label': period,
        '_no_data': False,
        'total_amount': float(total),
        'total_receipts': count,
        'by_bank': by_bank,
        'by_income_type': by_type,
    }


def _generate_bank_to_income_data():
    """Matrix: bank account x income type for the previous week."""
    from apps.billing.models import Receipt

    start, end, period = _previous_week_range()
    receipts = Receipt.objects.filter(
        date__gte=start, date__lte=end,
    ).select_related('bank_account', 'invoice')

    if not receipts.exists():
        return {
            '_period_label': period,
            '_no_data': True,
            'banks': [], 'rows': [],
            'bank_totals': {}, 'grand_total': 0,
        }

    matrix = {}
    banks = set()
    types = set()
    grand_total = Decimal('0')

    for r in receipts:
        bank = r.bank_account.name if r.bank_account else (r.bank_name or 'Cash')
        itype = r.invoice.get_invoice_type_display() if r.invoice else 'Other'
        banks.add(bank)
        types.add(itype)
        key = (bank, itype)
        matrix[key] = float(matrix.get(key, 0)) + float(r.amount)
        grand_total += r.amount

    bank_list = sorted(banks)
    type_list = sorted(types)

    rows = []
    for itype in type_list:
        row = {'income_type': itype}
        row_total = 0
        for bank in bank_list:
            val = matrix.get((bank, itype), 0)
            row[bank] = val
            row_total += val
        row['total'] = row_total
        rows.append(row)

    bank_totals = {b: sum(matrix.get((b, t), 0) for t in type_list) for b in bank_list}

    return {
        '_period_label': period,
        '_no_data': False,
        'banks': bank_list,
        'rows': rows,
        'bank_totals': bank_totals,
        'grand_total': float(grand_total),
    }


def _generate_trial_balance_data():
    """Debit/credit balances for all active accounts."""
    _, _, period = _previous_month_range()
    _empty = {
        '_period_label': period,
        '_no_data': True,
        'accounts': [], 'total_accounts': 0,
        'total_debits': 0, 'total_credits': 0,
        'balanced': True, 'difference': 0, 'truncated': False,
    }
    try:
        from apps.accounting.models import ChartOfAccount
        accounts = list(ChartOfAccount.objects.filter(is_active=True).order_by('code'))
    except Exception as e:
        logger.warning(f"[Trial Balance] Could not access accounting tables: {e}")
        return _empty

    if not accounts:
        return _empty

    rows = []
    total_debits = Decimal('0')
    total_credits = Decimal('0')

    for acc in accounts:
        bal = acc.current_balance
        if acc.normal_balance == 'debit':
            debit = bal if bal >= 0 else Decimal('0')
            credit = abs(bal) if bal < 0 else Decimal('0')
        else:
            credit = bal if bal >= 0 else Decimal('0')
            debit = abs(bal) if bal < 0 else Decimal('0')
        if debit or credit:
            rows.append({
                'code': acc.code, 'name': acc.name, 'type': acc.account_type,
                'debit': float(debit), 'credit': float(credit),
            })
            total_debits += debit
            total_credits += credit

    return {
        '_period_label': period,
        '_no_data': len(rows) == 0,
        'accounts': rows[:20],
        'total_accounts': len(rows),
        'total_debits': float(total_debits),
        'total_credits': float(total_credits),
        'balanced': total_debits == total_credits,
        'difference': float(abs(total_debits - total_credits)),
        'truncated': len(rows) > 20,
    }


def _generate_income_statement_data():
    """Revenue minus expenses."""
    _, _, period = _previous_month_range()
    _empty = {
        '_period_label': period,
        '_no_data': True,
        'revenue_items': [], 'expense_items': [],
        'total_revenue': 0, 'total_expenses': 0,
        'net_income': 0, 'is_profit': True,
        'truncated_rev': False, 'truncated_exp': False,
    }
    try:
        from apps.accounting.models import ChartOfAccount
        rev_accounts = list(ChartOfAccount.objects.filter(account_type='revenue', is_active=True))
        exp_accounts = list(ChartOfAccount.objects.filter(account_type='expense', is_active=True))
    except Exception as e:
        logger.warning(f"[Income Statement] Could not access accounting tables: {e}")
        return _empty

    rev_items = [{'code': a.code, 'name': a.name, 'balance': float(a.current_balance)}
                 for a in rev_accounts if a.current_balance]
    exp_items = [{'code': a.code, 'name': a.name, 'balance': float(a.current_balance)}
                 for a in exp_accounts if a.current_balance]

    total_rev = sum(i['balance'] for i in rev_items)
    total_exp = sum(i['balance'] for i in exp_items)
    net_income = total_rev - total_exp

    return {
        '_period_label': period,
        '_no_data': total_rev == 0 and total_exp == 0,
        'revenue_items': rev_items[:20],
        'expense_items': exp_items[:20],
        'total_revenue': total_rev,
        'total_expenses': total_exp,
        'net_income': net_income,
        'is_profit': net_income >= 0,
        'truncated_rev': len(rev_items) > 20,
        'truncated_exp': len(exp_items) > 20,
    }


def _generate_balance_sheet_data():
    """Assets / liabilities / equity snapshot."""
    _, _, period = _previous_month_range()
    _empty = {
        '_period_label': period,
        '_no_data': True,
        'asset_items': [], 'liability_items': [], 'equity_items': [],
        'total_assets': 0, 'total_liabilities': 0, 'total_equity': 0,
        'balanced': True,
    }
    try:
        from apps.accounting.models import ChartOfAccount

        def _section(acct_type):
            accts = list(ChartOfAccount.objects.filter(account_type=acct_type, is_active=True))
            items = [{'code': a.code, 'name': a.name, 'balance': float(a.current_balance)}
                     for a in accts if a.current_balance]
            total = sum(i['balance'] for i in items)
            return items[:20], total, len(items) > 20

        asset_items, total_assets, trunc_a = _section('asset')
        liab_items, total_liab, trunc_l = _section('liability')
        eq_items, total_eq, trunc_e = _section('equity')
    except Exception as e:
        logger.warning(f"[Balance Sheet] Could not access accounting tables: {e}")
        return _empty

    no_data = not asset_items and not liab_items and not eq_items

    return {
        '_period_label': period,
        '_no_data': no_data,
        'asset_items': asset_items,
        'liability_items': liab_items,
        'equity_items': eq_items,
        'total_assets': total_assets,
        'total_liabilities': total_liab,
        'total_equity': total_eq,
        'balanced': abs(total_assets - (total_liab + total_eq)) < 0.01,
    }


def _generate_cash_flow_data():
    """Operating / investing / financing cash flows."""
    start, end, period = _previous_month_range()
    try:
        from apps.billing.models import Receipt
        from apps.accounting.models import ChartOfAccount, GeneralLedger

        date_filter = Q(date__gte=start, date__lte=end)

        # Operating
        tenant_receipts = Receipt.objects.filter(date_filter).aggregate(
            total=Coalesce(Sum('amount'), Decimal('0')),
        )['total']

        expense_payments = GeneralLedger.objects.filter(
            date_filter,
            account__account_type='expense', account__is_active=True,
        ).aggregate(total=Coalesce(Sum('debit_amount'), Decimal('0')))['total']

        landlord_payments = GeneralLedger.objects.filter(
            date_filter,
            account__code__startswith='2',
        ).aggregate(total=Coalesce(Sum('credit_amount'), Decimal('0')))['total']

        operating_in = tenant_receipts
        operating_out = expense_payments + landlord_payments
        net_operating = operating_in - operating_out

        # Investing
        asset_txns = GeneralLedger.objects.filter(
            date_filter,
            account__account_type='asset', account__is_active=True, account__code__startswith='15',
        ).aggregate(
            purchases=Coalesce(Sum('debit_amount'), Decimal('0')),
            sales=Coalesce(Sum('credit_amount'), Decimal('0')),
        )
        net_investing = asset_txns['sales'] - asset_txns['purchases']

        # Financing
        equity_txns = GeneralLedger.objects.filter(
            date_filter,
            account__account_type='equity', account__is_active=True,
        ).aggregate(
            contributions=Coalesce(Sum('credit_amount'), Decimal('0')),
            withdrawals=Coalesce(Sum('debit_amount'), Decimal('0')),
        )
        net_financing = equity_txns['contributions'] - equity_txns['withdrawals']

        net_change = net_operating + net_investing + net_financing

        no_data = net_operating == 0 and net_investing == 0 and net_financing == 0

        cash_accounts = ChartOfAccount.objects.filter(code__startswith='1000', is_active=True)
        ending_cash = sum(a.current_balance for a in cash_accounts)
        beginning_cash = ending_cash - net_change

    except Exception as e:
        logger.warning(f"[Cash Flow] Could not access accounting tables: {e}")
        return {
            '_period_label': period,
            '_no_data': True,
            'operating_in': 0, 'operating_out': 0, 'net_operating': 0,
            'investing_in': 0, 'investing_out': 0, 'net_investing': 0,
            'financing_in': 0, 'financing_out': 0, 'net_financing': 0,
            'net_change': 0, 'beginning_cash': 0, 'ending_cash': 0,
        }

    return {
        '_period_label': period,
        '_no_data': no_data,
        'operating_in': float(operating_in),
        'operating_out': float(operating_out),
        'net_operating': float(net_operating),
        'investing_in': float(asset_txns['sales']),
        'investing_out': float(asset_txns['purchases']),
        'net_investing': float(net_investing),
        'financing_in': float(equity_txns['contributions']),
        'financing_out': float(equity_txns['withdrawals']),
        'net_financing': float(net_financing),
        'net_change': float(net_change),
        'beginning_cash': float(beginning_cash),
        'ending_cash': float(ending_cash),
    }


def _generate_lease_charge_summary_data():
    """Charges per lease for the previous month."""
    from apps.billing.models import Invoice
    from apps.masterfile.models import LeaseAgreement

    start, end, period = _previous_month_range()
    leases = LeaseAgreement.objects.filter(
        status='active',
    ).select_related('tenant', 'unit', 'unit__property')

    if not leases.exists():
        return {
            '_period_label': period,
            '_no_data': True,
            'leases': [], 'total_leases': 0,
            'grand_total': 0, 'truncated': False,
        }

    charge_data = Invoice.objects.filter(
        lease__in=leases, date__gte=start, date__lte=end,
    ).values('lease_id', 'invoice_type').annotate(
        total=Coalesce(Sum('total_amount'), Decimal('0')),
        paid=Coalesce(Sum('amount_paid'), Decimal('0')),
    )

    charges_by_lease = {}
    for row in charge_data:
        lid = row['lease_id']
        if lid not in charges_by_lease:
            charges_by_lease[lid] = {}
        charges_by_lease[lid][row['invoice_type']] = {
            'total': float(row['total']),
            'paid': float(row['paid']),
        }

    rows = []
    grand_total = 0
    for lease in leases:
        breakdown = charges_by_lease.get(lease.id, {})
        lease_total = sum(c['total'] for c in breakdown.values())
        lease_paid = sum(c['paid'] for c in breakdown.values())
        types_str = ', '.join(sorted(breakdown.keys())) or '\u2014'
        rows.append({
            'tenant': lease.tenant.name,
            'property': lease.unit.property.name,
            'unit': lease.unit.unit_number,
            'charge_types': types_str,
            'total_charged': lease_total,
            'total_paid': lease_paid,
            'balance': lease_total - lease_paid,
        })
        grand_total += lease_total

    return {
        '_period_label': period,
        '_no_data': False,
        'leases': rows[:20],
        'total_leases': len(rows),
        'grand_total': grand_total,
        'truncated': len(rows) > 20,
    }


# ═══════════════════════════════════════════════════════════════════════════
# EMAIL BODY FORMATTERS — each returns text (with embedded HTML tables/SVG)
# understood by build_html_email() via _text_to_html() passthrough.
# ═══════════════════════════════════════════════════════════════════════════

def _build_dashboard_email_body(data, no_data=False):
    from apps.notifications.utils import build_svg_bar_chart
    if no_data:
        return _NO_DATA_MSG

    occupied = data['total_units'] - data['vacant_units']
    chart = build_svg_bar_chart([
        ('Occupied', occupied),
        ('Vacant', data['vacant_units']),
    ], title='Unit Occupancy', width=620)

    lines = [
        '=== Portfolio Overview ===\n',
        f"- Properties: {data['total_properties']}",
        f"- Total Units: {data['total_units']}",
        f"- Vacant Units: {data['vacant_units']}",
        f"- Occupancy Rate: {data['occupancy_rate']}%",
        '',
        chart,
        '',
        '=== Monthly Financial Summary ===\n',
        f"- Invoiced This Month: {_fmt(data['monthly_invoiced'])}",
        f"- Collected This Month: {_fmt(data['monthly_collected'])}",
        '',
        '=== Alerts ===\n',
        f"- Overdue Invoices: {data['overdue_count']}",
        f"- Overdue Amount: {_fmt(data['overdue_amount'])}",
        f"- Expiring Leases (30 days): {data['expiring_leases']}",
        '',
        '=== Entity Counts ===\n',
        f"- Active Leases: {data['active_leases']}",
        f"- Landlords: {data['landlords']}",
        f"- Tenants: {data['tenants']}",
    ]
    return '\n'.join(lines)


def _build_aged_analysis_email_body(data, no_data=False):
    from apps.notifications.utils import build_email_table, build_svg_bar_chart
    if no_data:
        return _NO_DATA_MSG

    lines = [
        '=== Aging Summary ===\n',
        f"- Total Outstanding: {_fmt(data['total_outstanding'])}",
        f"- Total Invoices: {data['total_invoices']}",
        '',
    ]

    # Buckets table
    bucket_headers = ['Period', 'Amount', 'Invoices']
    bucket_rows = []
    chart_items = []
    for key in ('current', '31_60', '61_90', '91_120', 'over_120'):
        b = data['buckets'][key]
        bucket_rows.append([b['label'], _fmt(b['amount']), str(b['count'])])
        if b['amount'] > 0:
            chart_items.append((b['label'], b['amount']))

    table = build_email_table(bucket_headers, bucket_rows)
    lines.append(table)

    # Bar chart for aging distribution
    if chart_items:
        chart = build_svg_bar_chart(chart_items, title='Aging Distribution', width=620)
        lines += ['', chart]

    # Top debtors table
    if data['top_debtors']:
        lines += ['', '=== Top Debtors ===\n']
        debtor_headers = ['Tenant', 'Balance']
        debtor_rows = [[d['name'], _fmt(d['balance'])] for d in data['top_debtors']]
        lines.append(build_email_table(debtor_headers, debtor_rows))

    return '\n'.join(lines)


def _build_vacancy_email_body(data, no_data=False):
    from apps.notifications.utils import build_email_table, build_svg_bar_chart
    if no_data:
        return _NO_DATA_MSG

    lines = [
        '=== Vacancy Summary ===\n',
        f"- Total Properties: {data['total_properties']}",
        f"- Total Units: {data['total_units']}",
        f"- Total Vacant: {data['total_vacant']}",
        f"- Overall Vacancy Rate: {data['overall_vacancy_rate']}%",
        '',
    ]

    # Vacancy table
    headers = ['Property', 'Landlord', 'Units', 'Vacant', 'Rate']
    rows = [
        [p['name'], p['landlord'], str(p['total_units']), str(p['vacant']),
         f"{p['vacancy_rate']}%"]
        for p in data['properties'][:20]
    ]
    footer = ['Total', '', str(data['total_units']), str(data['total_vacant']),
              f"{data['overall_vacancy_rate']}%"]
    lines.append(build_email_table(headers, rows, footer_row=footer))

    # Bar chart — vacant units by property (top 10)
    chart_items = [
        (p['name'], p['vacant'])
        for p in sorted(data['properties'], key=lambda x: x['vacant'], reverse=True)[:10]
        if p['vacant'] > 0
    ]
    if chart_items:
        chart = build_svg_bar_chart(chart_items, title='Vacant Units by Property', width=620)
        lines += ['', chart]

    return '\n'.join(lines)


def _build_rent_roll_email_body(data, no_data=False):
    from apps.notifications.utils import build_email_table
    if no_data:
        return _NO_DATA_MSG

    lines = [
        '=== Rent Roll Summary ===\n',
        f"- Active Leases: {data['total_leases']}",
        f"- Total Monthly Rent: {_fmt(data['total_monthly_rent'])}",
        '',
        '=== Lease Details ===\n',
    ]

    headers = ['Tenant', 'Property / Unit', 'Monthly Rent', 'Ends']
    rows = [
        [l['tenant'], f"{l['property']} - {l['unit']}",
         f"{_fmt(l['monthly_rent'])} {l['currency']}", l['end_date']]
        for l in data['leases']
    ]
    footer = ['Total', '', _fmt(data['total_monthly_rent']), '']
    trunc = f"... and {data['total_leases'] - 20} more leases" if data.get('truncated') else None
    lines.append(build_email_table(headers, rows, footer_row=footer, truncated_msg=trunc))

    return '\n'.join(lines)


def _build_receipt_listing_email_body(data, no_data=False):
    from apps.notifications.utils import build_email_table
    if no_data:
        return _NO_DATA_MSG

    lines = [
        '=== Receipt Summary ===\n',
        f"- Total Receipts: {data['total_receipts']}",
        f"- Total Amount: {_fmt(data['total_amount'])}",
        '',
    ]

    # By Bank table
    if data['by_bank']:
        lines.append('=== By Bank Account ===\n')
        bank_sorted = sorted(data['by_bank'].items(), key=lambda x: x[1], reverse=True)
        bank_rows = [[bank, _fmt(amt)] for bank, amt in bank_sorted]
        bank_footer = ['Total', _fmt(data['total_amount'])]
        lines.append(build_email_table(['Bank Account', 'Amount'], bank_rows, footer_row=bank_footer))

    # By Income Type table
    if data['by_income_type']:
        lines += ['', '=== By Income Type ===\n']
        type_sorted = sorted(data['by_income_type'].items(), key=lambda x: x[1], reverse=True)
        type_rows = [[itype, _fmt(amt)] for itype, amt in type_sorted]
        type_footer = ['Total', _fmt(data['total_amount'])]
        lines.append(build_email_table(['Income Type', 'Amount'], type_rows, footer_row=type_footer))

    return '\n'.join(lines)


def _build_bank_to_income_email_body(data, no_data=False):
    from apps.notifications.utils import build_email_table
    if no_data:
        return _NO_DATA_MSG

    lines = [
        '=== Bank to Income Analysis ===\n',
        f"- Grand Total: {_fmt(data['grand_total'])}",
        '',
    ]

    banks = data['banks']
    if banks and data['rows']:
        headers = ['Income Type'] + banks + ['Total']
        rows = []
        for row in data['rows']:
            r = [row['income_type']]
            for bank in banks:
                r.append(_fmt(row.get(bank, 0)))
            r.append(_fmt(row['total']))
            rows.append(r)

        footer = ['Total']
        for bank in banks:
            footer.append(_fmt(data['bank_totals'].get(bank, 0)))
        footer.append(_fmt(data['grand_total']))
        lines.append(build_email_table(headers, rows, footer_row=footer))

    return '\n'.join(lines)


def _build_trial_balance_email_body(data, no_data=False):
    from apps.notifications.utils import build_email_table
    if no_data:
        return _NO_DATA_MSG

    lines = [
        '=== Trial Balance Summary ===\n',
        f"- Total Debits: {_fmt(data['total_debits'])}",
        f"- Total Credits: {_fmt(data['total_credits'])}",
        f"- Balanced: {'Yes' if data['balanced'] else 'No'}",
    ]
    if not data['balanced']:
        lines.append(f"- Difference: {_fmt(data['difference'])}")
    lines += ['', '=== Account Details ===\n']

    headers = ['Code', 'Account', 'Debit', 'Credit']
    rows = [
        [a['code'], a['name'], _fmt(a['debit']), _fmt(a['credit'])]
        for a in data['accounts']
    ]
    footer = ['', 'Total', _fmt(data['total_debits']), _fmt(data['total_credits'])]
    trunc = f"... and {data['total_accounts'] - 20} more accounts" if data.get('truncated') else None
    lines.append(build_email_table(headers, rows, footer_row=footer, truncated_msg=trunc))

    return '\n'.join(lines)


def _build_income_statement_email_body(data, no_data=False):
    from apps.notifications.utils import build_email_table
    if no_data:
        return _NO_DATA_MSG

    lines = ['=== Revenue ===\n']
    if data['revenue_items']:
        rev_rows = [[a['code'], a['name'], _fmt(a['balance'])] for a in data['revenue_items']]
        rev_footer = ['', 'Total Revenue', _fmt(data['total_revenue'])]
        trunc_rev = '... more revenue accounts' if data.get('truncated_rev') else None
        lines.append(build_email_table(['Code', 'Account', 'Balance'], rev_rows,
                                       footer_row=rev_footer, truncated_msg=trunc_rev))
    else:
        lines.append(f"Total Revenue: {_fmt(data['total_revenue'])}")

    lines += ['', '=== Expenses ===\n']
    if data['expense_items']:
        exp_rows = [[a['code'], a['name'], _fmt(a['balance'])] for a in data['expense_items']]
        exp_footer = ['', 'Total Expenses', _fmt(data['total_expenses'])]
        trunc_exp = '... more expense accounts' if data.get('truncated_exp') else None
        lines.append(build_email_table(['Code', 'Account', 'Balance'], exp_rows,
                                       footer_row=exp_footer, truncated_msg=trunc_exp))
    else:
        lines.append(f"Total Expenses: {_fmt(data['total_expenses'])}")

    label = 'Net Profit' if data['is_profit'] else 'Net Loss'
    lines += ['', f"=== {label} ===\n", f"- {label}: {_fmt(abs(data['net_income']))}"]
    return '\n'.join(lines)


def _build_balance_sheet_email_body(data, no_data=False):
    from apps.notifications.utils import build_email_table
    if no_data:
        return _NO_DATA_MSG

    acct_headers = ['Code', 'Account', 'Balance']

    lines = ['=== Assets ===\n']
    if data['asset_items']:
        asset_rows = [[a['code'], a['name'], _fmt(a['balance'])] for a in data['asset_items']]
        lines.append(build_email_table(acct_headers, asset_rows,
                                       footer_row=['', 'Total Assets', _fmt(data['total_assets'])]))
    else:
        lines.append(f"Total Assets: {_fmt(data['total_assets'])}")

    lines += ['', '=== Liabilities ===\n']
    if data['liability_items']:
        liab_rows = [[a['code'], a['name'], _fmt(a['balance'])] for a in data['liability_items']]
        lines.append(build_email_table(acct_headers, liab_rows,
                                       footer_row=['', 'Total Liabilities', _fmt(data['total_liabilities'])]))
    else:
        lines.append(f"Total Liabilities: {_fmt(data['total_liabilities'])}")

    lines += ['', '=== Equity ===\n']
    if data['equity_items']:
        eq_rows = [[a['code'], a['name'], _fmt(a['balance'])] for a in data['equity_items']]
        lines.append(build_email_table(acct_headers, eq_rows,
                                       footer_row=['', 'Total Equity', _fmt(data['total_equity'])]))
    else:
        lines.append(f"Total Equity: {_fmt(data['total_equity'])}")

    lines += ['', '---', f"Balanced: {'Yes' if data['balanced'] else 'No'}"]
    return '\n'.join(lines)


def _build_cash_flow_email_body(data, no_data=False):
    if no_data:
        return _NO_DATA_MSG

    lines = [
        '=== Operating Activities ===\n',
        f"- Cash Inflows (Tenant Receipts): {_fmt(data['operating_in'])}",
        f"- Cash Outflows (Expenses + Landlord): {_fmt(data['operating_out'])}",
        f"- Net Operating Cash Flow: {_fmt(data['net_operating'])}",
        '',
        '=== Investing Activities ===\n',
        f"- Asset Sales: {_fmt(data['investing_in'])}",
        f"- Asset Purchases: {_fmt(data['investing_out'])}",
        f"- Net Investing Cash Flow: {_fmt(data['net_investing'])}",
        '',
        '=== Financing Activities ===\n',
        f"- Owner Contributions: {_fmt(data['financing_in'])}",
        f"- Owner Withdrawals: {_fmt(data['financing_out'])}",
        f"- Net Financing Cash Flow: {_fmt(data['net_financing'])}",
        '',
        '=== Cash Summary ===\n',
        f"- Beginning Cash: {_fmt(data['beginning_cash'])}",
        f"- Net Change in Cash: {_fmt(data['net_change'])}",
        f"- Ending Cash: {_fmt(data['ending_cash'])}",
    ]
    return '\n'.join(lines)


def _build_lease_charge_summary_email_body(data, no_data=False):
    from apps.notifications.utils import build_email_table
    if no_data:
        return _NO_DATA_MSG

    lines = [
        '=== Lease Charge Summary ===\n',
        f"- Total Leases: {data['total_leases']}",
        f"- Grand Total Charged: {_fmt(data['grand_total'])}",
        '',
        '=== Lease Details ===\n',
    ]

    headers = ['Tenant', 'Property / Unit', 'Charged', 'Paid', 'Balance']
    rows = [
        [l['tenant'], f"{l['property']} - {l['unit']}",
         _fmt(l['total_charged']), _fmt(l['total_paid']), _fmt(l['balance'])]
        for l in data['leases']
    ]
    grand_paid = sum(l['total_paid'] for l in data['leases'])
    grand_bal = sum(l['balance'] for l in data['leases'])
    footer = ['Total', '', _fmt(data['grand_total']), _fmt(grand_paid), _fmt(grand_bal)]
    trunc = f"... and {data['total_leases'] - 20} more leases" if data.get('truncated') else None
    lines.append(build_email_table(headers, rows, footer_row=footer, truncated_msg=trunc))

    return '\n'.join(lines)


# ═══════════════════════════════════════════════════════════════════════════
# REPORT REGISTRY — used by the management command and task entry points
# ═══════════════════════════════════════════════════════════════════════════

REPORT_REGISTRY = {
    'dashboard': ('daily', _generate_dashboard_data, _build_dashboard_email_body, 'Dashboard KPIs'),
    'aged_analysis': ('daily', _generate_aged_analysis_data, _build_aged_analysis_email_body, 'Aged Analysis'),
    'vacancy': ('daily', _generate_vacancy_data, _build_vacancy_email_body, 'Vacancy Report'),
    'rent_roll': ('weekly', _generate_rent_roll_data, _build_rent_roll_email_body, 'Rent Roll'),
    'receipt_listing': ('weekly', _generate_receipt_listing_data, _build_receipt_listing_email_body, 'Receipt Listing'),
    'bank_to_income': ('weekly', _generate_bank_to_income_data, _build_bank_to_income_email_body, 'Bank to Income Analysis'),
    'trial_balance': ('monthly', _generate_trial_balance_data, _build_trial_balance_email_body, 'Trial Balance'),
    'income_statement': ('monthly', _generate_income_statement_data, _build_income_statement_email_body, 'Income Statement'),
    'balance_sheet': ('monthly', _generate_balance_sheet_data, _build_balance_sheet_email_body, 'Balance Sheet'),
    'cash_flow': ('monthly', _generate_cash_flow_data, _build_cash_flow_email_body, 'Cash Flow Statement'),
    'lease_charges': ('monthly', _generate_lease_charge_summary_data, _build_lease_charge_summary_email_body, 'Lease Charge Summary'),
    'commission': ('monthly', None, None, 'Commission Report'),
}


# ═══════════════════════════════════════════════════════════════════════════
# TASK ENTRY POINTS — thin functions called by Django-Q2 schedules
# ═══════════════════════════════════════════════════════════════════════════

def send_daily_dashboard_report_all_tenants():
    """Daily dashboard KPI email to admin staff."""
    return _run_report_for_all_tenants(
        'Dashboard KPIs',
        _generate_dashboard_data,
        _build_dashboard_email_body,
        'Dashboard KPIs — {period}',
    )


def send_daily_aged_analysis_all_tenants():
    """Daily aged analysis email to admin staff."""
    return _run_report_for_all_tenants(
        'Aged Analysis',
        _generate_aged_analysis_data,
        _build_aged_analysis_email_body,
        'Aged Analysis — {period}',
    )


def send_daily_vacancy_report_all_tenants():
    """Daily vacancy report email to admin staff."""
    return _run_report_for_all_tenants(
        'Vacancy Report',
        _generate_vacancy_data,
        _build_vacancy_email_body,
        'Vacancy Report — {period}',
    )


def send_weekly_rent_roll_all_tenants():
    """Weekly rent roll email to admin staff."""
    return _run_report_for_all_tenants(
        'Rent Roll',
        _generate_rent_roll_data,
        _build_rent_roll_email_body,
        'Rent Roll — {period}',
    )


def send_weekly_receipt_listing_all_tenants():
    """Weekly receipt listing email to admin staff."""
    return _run_report_for_all_tenants(
        'Receipt Listing',
        _generate_receipt_listing_data,
        _build_receipt_listing_email_body,
        'Receipt Listing — {period}',
    )


def send_weekly_bank_to_income_all_tenants():
    """Weekly bank-to-income analysis email to admin staff."""
    return _run_report_for_all_tenants(
        'Bank to Income Analysis',
        _generate_bank_to_income_data,
        _build_bank_to_income_email_body,
        'Bank to Income Analysis — {period}',
    )


def send_monthly_trial_balance_all_tenants():
    """Monthly trial balance email to admin staff."""
    return _run_report_for_all_tenants(
        'Trial Balance',
        _generate_trial_balance_data,
        _build_trial_balance_email_body,
        'Trial Balance — {period}',
    )


def send_monthly_income_statement_all_tenants():
    """Monthly income statement email to admin staff."""
    return _run_report_for_all_tenants(
        'Income Statement',
        _generate_income_statement_data,
        _build_income_statement_email_body,
        'Income Statement — {period}',
    )


def send_monthly_balance_sheet_all_tenants():
    """Monthly balance sheet email to admin staff."""
    return _run_report_for_all_tenants(
        'Balance Sheet',
        _generate_balance_sheet_data,
        _build_balance_sheet_email_body,
        'Balance Sheet — {period}',
    )


def send_monthly_cash_flow_all_tenants():
    """Monthly cash flow statement email to admin staff."""
    return _run_report_for_all_tenants(
        'Cash Flow Statement',
        _generate_cash_flow_data,
        _build_cash_flow_email_body,
        'Cash Flow Statement — {period}',
    )


def send_monthly_lease_charge_summary_all_tenants():
    """Monthly lease charge summary email to admin staff."""
    return _run_report_for_all_tenants(
        'Lease Charge Summary',
        _generate_lease_charge_summary_data,
        _build_lease_charge_summary_email_body,
        'Lease Charge Summary — {period}',
    )


# ═══════════════════════════════════════════════════════════════════════════
# EXISTING: Commission report (unchanged)
# ═══════════════════════════════════════════════════════════════════════════

def send_monthly_commission_reports_all_tenants():
    """
    Generate and email commission reports for all active tenants.
    Runs monthly — covers the previous calendar month.
    """
    TenantModel = get_tenant_model()
    tenants = TenantModel.objects.filter(is_active=True).exclude(schema_name='public')

    prev_month_start, prev_month_end, period_label = _previous_month_range()

    results = {
        'success': [],
        'failed': [],
    }

    for tenant in tenants:
        try:
            with tenant_context(tenant):
                report_data = _generate_commission_report_data(prev_month_start, prev_month_end)
                if report_data['summary']['total_commission'] == 0:
                    continue
                body = _build_commission_email_body(report_data, period_label)
                from apps.notifications.utils import send_staff_email
                send_staff_email(
                    f'Commission Report — {period_label}',
                    body
                )
                results['success'].append({
                    'tenant': tenant.name,
                    'total_commission': report_data['summary']['total_commission'],
                })
        except Exception as e:
            logger.error(f"Failed to send commission report for {tenant.name}: {e}")
            results['failed'].append({
                'tenant': tenant.name,
                'error': str(e),
            })

    logger.info(f"Monthly commission reports complete: {results}")

    if results['failed']:
        try:
            from apps.notifications.tasks import send_system_alert_email
            failed_lines = '\n'.join(
                f"  - {f['tenant']}: {f['error']}" for f in results['failed']
            )
            send_system_alert_email(
                f'Commission Report Failures: {len(results["failed"])} companies failed',
                f"Monthly commission report generation had failures:\n\n{failed_lines}\n\nPlease investigate."
            )
        except Exception:
            pass

    return results


def _generate_commission_report_data(start_date, end_date):
    """
    Build commission report data for the current tenant schema.
    Same logic as CommissionReportView but callable without an HTTP request.
    """
    from apps.billing.models import Receipt

    receipts = Receipt.objects.filter(
        date__gte=start_date,
        date__lte=end_date,
    ).select_related(
        'invoice', 'invoice__unit', 'invoice__unit__property',
        'invoice__unit__property__landlord'
    )

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

        # By property
        if prop.id not in property_commissions:
            property_commissions[prop.id] = {
                'property_name': prop.name,
                'landlord_name': landlord.name,
                'commission_rate': float(landlord.commission_rate),
                'collected': Decimal('0'),
                'commission': Decimal('0'),
            }
        property_commissions[prop.id]['collected'] += receipt.amount
        property_commissions[prop.id]['commission'] += commission

        # By income type
        income_type = receipt.invoice.invoice_type
        if income_type not in income_type_commissions:
            income_type_commissions[income_type] = {
                'label': receipt.invoice.get_invoice_type_display(),
                'income': Decimal('0'),
                'commission': Decimal('0'),
            }
        income_type_commissions[income_type]['income'] += receipt.amount
        income_type_commissions[income_type]['commission'] += commission

        total_collected += receipt.amount
        total_commission += commission

    # Convert to sorted lists with rank/percentage
    total_comm_float = float(total_commission)

    property_list = sorted(
        [
            {**pc, 'collected': float(pc['collected']), 'commission': float(pc['commission'])}
            for pc in property_commissions.values()
        ],
        key=lambda x: x['commission'],
        reverse=True,
    )
    for rank, item in enumerate(property_list, 1):
        item['rank'] = rank
        item['percentage'] = round(item['commission'] / total_comm_float * 100, 1) if total_comm_float else 0

    income_list = sorted(
        [
            {**itc, 'income': float(itc['income']), 'commission': float(itc['commission'])}
            for itc in income_type_commissions.values()
        ],
        key=lambda x: x['commission'],
        reverse=True,
    )
    for rank, item in enumerate(income_list, 1):
        item['rank'] = rank
        item['percentage'] = round(item['commission'] / total_comm_float * 100, 1) if total_comm_float else 0

    return {
        'summary': {
            'total_collected': float(total_collected),
            'total_commission': total_comm_float,
        },
        'by_property': property_list,
        'by_income_type': income_list,
    }


def _build_commission_email_body(report_data, period_label):
    """
    Format commission data into plain text.
    send_staff_email() wraps this in branded HTML via build_html_email().
    """
    lines = []

    # Property section
    lines.append('=== Commission by Property ===\n')
    for item in report_data['by_property']:
        lines.append(
            f"- Rank {item['rank']}: {item['property_name']}\n"
            f"  Landlord: {item['landlord_name']} | "
            f"Rate: {item['commission_rate']}% | "
            f"Revenue: ${item['collected']:,.2f} | "
            f"Commission: ${item['commission']:,.2f} | "
            f"Share: {item['percentage']}%\n"
        )
    lines.append(f"Total Commission: ${report_data['summary']['total_commission']:,.2f}\n")

    # Income category section
    lines.append('\n=== Commission by Income Category ===\n')
    for item in report_data['by_income_type']:
        lines.append(
            f"- Rank {item['rank']}: {item['label']}\n"
            f"  Revenue: ${item['income']:,.2f} | "
            f"Commission: ${item['commission']:,.2f} | "
            f"Share: {item['percentage']}%\n"
        )
    total_income_commission = sum(i['commission'] for i in report_data['by_income_type'])
    lines.append(f"Total Commission: ${total_income_commission:,.2f}\n")

    return '\n'.join(lines)
