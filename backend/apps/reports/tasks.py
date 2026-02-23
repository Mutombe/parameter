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


# ─── Generic wrapper ────────────────────────────────────────────────────────

def _run_report_for_all_tenants(report_name, generate_fn, build_body_fn, subject_template):
    """
    Generic driver: iterate active tenants, generate data, email staff.

    Args:
        report_name: Human label for logging / alerts.
        generate_fn: Callable() -> dict | None. Return None to skip tenant.
        build_body_fn: Callable(data) -> str plain-text body.
        subject_template: str with optional {period} placeholder.
    """
    TenantModel = get_tenant_model()
    tenants = TenantModel.objects.filter(is_active=True).exclude(schema_name='public')

    results = {'success': [], 'failed': [], 'skipped': []}

    for tenant in tenants:
        try:
            with tenant_context(tenant):
                data = generate_fn()
                if data is None:
                    results['skipped'].append(tenant.name)
                    continue
                period = data.pop('_period_label', '')
                subject = subject_template.format(period=period) if '{period}' in subject_template else subject_template
                body = build_body_fn(data)
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
# DATA GENERATORS — each returns a plain dict (or None to skip tenant).
# The key '_period_label' is popped by the wrapper for subject formatting.
# ═══════════════════════════════════════════════════════════════════════════

def _generate_dashboard_data():
    """Dashboard KPIs: occupancy, collections, alerts."""
    from apps.billing.models import Invoice, Receipt
    from apps.masterfile.models import Property, Unit, LeaseAgreement, RentalTenant, Landlord

    total_properties = Property.objects.count()
    if total_properties == 0:
        return None

    today = timezone.now().date()
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

    if total_outstanding == 0:
        return None

    top_debtors = sorted(tenant_totals.items(), key=lambda x: x[1], reverse=True)[:20]

    return {
        '_period_label': today.strftime('%d %b %Y'),
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
        return None

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

    if not leases.exists():
        return None

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

    _, _, period = _previous_week_range()
    return {
        '_period_label': period,
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
        return None

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
        'total_amount': float(total),
        'total_receipts': count,
        'by_bank': by_bank,
        'by_income_type': by_type,
    }


def _generate_bank_to_income_data():
    """Matrix: bank account × income type for the previous week."""
    from apps.billing.models import Receipt

    start, end, period = _previous_week_range()
    receipts = Receipt.objects.filter(
        date__gte=start, date__lte=end,
    ).select_related('bank_account', 'invoice')

    if not receipts.exists():
        return None

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
        'banks': bank_list,
        'rows': rows,
        'bank_totals': bank_totals,
        'grand_total': float(grand_total),
    }


def _generate_trial_balance_data():
    """Debit/credit balances for all active accounts."""
    from apps.accounting.models import ChartOfAccount

    accounts = ChartOfAccount.objects.filter(is_active=True).order_by('code')
    if not accounts.exists():
        return None

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

    _, _, period = _previous_month_range()
    return {
        '_period_label': period,
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
    from apps.accounting.models import ChartOfAccount

    rev_accounts = ChartOfAccount.objects.filter(account_type='revenue', is_active=True)
    exp_accounts = ChartOfAccount.objects.filter(account_type='expense', is_active=True)

    rev_items = [{'code': a.code, 'name': a.name, 'balance': float(a.current_balance)}
                 for a in rev_accounts if a.current_balance]
    exp_items = [{'code': a.code, 'name': a.name, 'balance': float(a.current_balance)}
                 for a in exp_accounts if a.current_balance]

    total_rev = sum(i['balance'] for i in rev_items)
    total_exp = sum(i['balance'] for i in exp_items)

    if total_rev == 0 and total_exp == 0:
        return None

    net_income = total_rev - total_exp
    _, _, period = _previous_month_range()

    return {
        '_period_label': period,
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
    from apps.accounting.models import ChartOfAccount

    def _section(acct_type):
        accts = ChartOfAccount.objects.filter(account_type=acct_type, is_active=True)
        items = [{'code': a.code, 'name': a.name, 'balance': float(a.current_balance)}
                 for a in accts if a.current_balance]
        total = sum(i['balance'] for i in items)
        return items[:20], total, len(items) > 20

    asset_items, total_assets, trunc_a = _section('asset')
    liab_items, total_liab, trunc_l = _section('liability')
    eq_items, total_eq, trunc_e = _section('equity')

    if not asset_items and not liab_items and not eq_items:
        return None

    _, _, period = _previous_month_range()
    return {
        '_period_label': period,
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
    from apps.billing.models import Receipt
    from apps.accounting.models import ChartOfAccount, GeneralLedger

    start, end, period = _previous_month_range()
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

    if net_operating == 0 and net_investing == 0 and net_financing == 0:
        return None

    cash_accounts = ChartOfAccount.objects.filter(code__startswith='1000', is_active=True)
    ending_cash = sum(a.current_balance for a in cash_accounts)
    beginning_cash = ending_cash - net_change

    return {
        '_period_label': period,
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
        return None

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
        types_str = ', '.join(sorted(breakdown.keys())) or '—'
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
        'leases': rows[:20],
        'total_leases': len(rows),
        'grand_total': grand_total,
        'truncated': len(rows) > 20,
    }


# ═══════════════════════════════════════════════════════════════════════════
# EMAIL BODY FORMATTERS — each returns plain text understood by
# build_html_email() (=== headers ===, - key: value, etc.)
# ═══════════════════════════════════════════════════════════════════════════

def _build_dashboard_email_body(data):
    lines = [
        '=== Portfolio Overview ===\n',
        f"- Properties: {data['total_properties']}",
        f"- Total Units: {data['total_units']}",
        f"- Vacant Units: {data['vacant_units']}",
        f"- Occupancy Rate: {data['occupancy_rate']}%",
        '',
        '=== Monthly Financial Summary ===\n',
        f"- Invoiced This Month: ${data['monthly_invoiced']:,.2f}",
        f"- Collected This Month: ${data['monthly_collected']:,.2f}",
        '',
        '=== Alerts ===\n',
        f"- Overdue Invoices: {data['overdue_count']}",
        f"- Overdue Amount: ${data['overdue_amount']:,.2f}",
        f"- Expiring Leases (30 days): {data['expiring_leases']}",
        '',
        '=== Entity Counts ===\n',
        f"- Active Leases: {data['active_leases']}",
        f"- Landlords: {data['landlords']}",
        f"- Tenants: {data['tenants']}",
    ]
    return '\n'.join(lines)


def _build_aged_analysis_email_body(data):
    lines = [
        '=== Aging Summary ===\n',
        f"- Total Outstanding: ${data['total_outstanding']:,.2f}",
        f"- Total Invoices: {data['total_invoices']}",
        '',
    ]
    for key in ('current', '31_60', '61_90', '91_120', 'over_120'):
        b = data['buckets'][key]
        lines.append(f"- {b['label']}: ${b['amount']:,.2f} ({b['count']} invoices)")
    lines += ['', '=== Top Debtors ===\n']
    for d in data['top_debtors']:
        lines.append(f"- {d['name']}: ${d['balance']:,.2f}")
    return '\n'.join(lines)


def _build_vacancy_email_body(data):
    lines = [
        '=== Vacancy Summary ===\n',
        f"- Total Properties: {data['total_properties']}",
        f"- Total Units: {data['total_units']}",
        f"- Total Vacant: {data['total_vacant']}",
        f"- Overall Vacancy Rate: {data['overall_vacancy_rate']}%",
        '',
        '=== By Property ===\n',
    ]
    for p in data['properties'][:20]:
        lines.append(f"- {p['name']}: {p['vacant']}/{p['total_units']} vacant ({p['vacancy_rate']}%)")
    return '\n'.join(lines)


def _build_rent_roll_email_body(data):
    lines = [
        '=== Rent Roll Summary ===\n',
        f"- Active Leases: {data['total_leases']}",
        f"- Total Monthly Rent: ${data['total_monthly_rent']:,.2f}",
        '',
        '=== Lease Details ===\n',
    ]
    for l in data['leases']:
        lines.append(
            f"- {l['tenant']} | {l['property']} - {l['unit']} | "
            f"${l['monthly_rent']:,.2f} {l['currency']} | Ends: {l['end_date']}"
        )
    if data.get('truncated'):
        lines.append(f"\n... and {data['total_leases'] - 20} more leases")
    return '\n'.join(lines)


def _build_receipt_listing_email_body(data):
    lines = [
        '=== Receipt Summary ===\n',
        f"- Total Receipts: {data['total_receipts']}",
        f"- Total Amount: ${data['total_amount']:,.2f}",
        '',
        '=== By Bank Account ===\n',
    ]
    for bank, amt in sorted(data['by_bank'].items(), key=lambda x: x[1], reverse=True):
        lines.append(f"- {bank}: ${amt:,.2f}")
    lines += ['', '=== By Income Type ===\n']
    for itype, amt in sorted(data['by_income_type'].items(), key=lambda x: x[1], reverse=True):
        lines.append(f"- {itype}: ${amt:,.2f}")
    return '\n'.join(lines)


def _build_bank_to_income_email_body(data):
    lines = [
        '=== Bank to Income Analysis ===\n',
        f"- Grand Total: ${data['grand_total']:,.2f}",
        '',
        '=== Bank Totals ===\n',
    ]
    for bank, amt in sorted(data['bank_totals'].items(), key=lambda x: x[1], reverse=True):
        lines.append(f"- {bank}: ${amt:,.2f}")
    lines += ['', '=== Income Type Breakdown ===\n']
    for row in data['rows']:
        lines.append(f"- {row['income_type']}: ${row['total']:,.2f}")
    return '\n'.join(lines)


def _build_trial_balance_email_body(data):
    lines = [
        '=== Trial Balance Summary ===\n',
        f"- Total Debits: ${data['total_debits']:,.2f}",
        f"- Total Credits: ${data['total_credits']:,.2f}",
        f"- Balanced: {'Yes' if data['balanced'] else 'No'}",
    ]
    if not data['balanced']:
        lines.append(f"- Difference: ${data['difference']:,.2f}")
    lines += ['', '=== Account Details ===\n']
    for a in data['accounts']:
        lines.append(f"- {a['code']} {a['name']}: Dr ${a['debit']:,.2f} | Cr ${a['credit']:,.2f}")
    if data.get('truncated'):
        lines.append(f"\n... and {data['total_accounts'] - 20} more accounts")
    return '\n'.join(lines)


def _build_income_statement_email_body(data):
    lines = ['=== Revenue ===\n']
    for a in data['revenue_items']:
        lines.append(f"- {a['code']} {a['name']}: ${a['balance']:,.2f}")
    if data.get('truncated_rev'):
        lines.append('  ... more revenue accounts')
    lines.append(f"\nTotal Revenue: ${data['total_revenue']:,.2f}")

    lines += ['', '=== Expenses ===\n']
    for a in data['expense_items']:
        lines.append(f"- {a['code']} {a['name']}: ${a['balance']:,.2f}")
    if data.get('truncated_exp'):
        lines.append('  ... more expense accounts')
    lines.append(f"\nTotal Expenses: ${data['total_expenses']:,.2f}")

    label = 'Net Profit' if data['is_profit'] else 'Net Loss'
    lines += ['', f"=== {label} ===\n", f"- {label}: ${abs(data['net_income']):,.2f}"]
    return '\n'.join(lines)


def _build_balance_sheet_email_body(data):
    lines = ['=== Assets ===\n']
    for a in data['asset_items']:
        lines.append(f"- {a['code']} {a['name']}: ${a['balance']:,.2f}")
    lines.append(f"\nTotal Assets: ${data['total_assets']:,.2f}")

    lines += ['', '=== Liabilities ===\n']
    for a in data['liability_items']:
        lines.append(f"- {a['code']} {a['name']}: ${a['balance']:,.2f}")
    lines.append(f"\nTotal Liabilities: ${data['total_liabilities']:,.2f}")

    lines += ['', '=== Equity ===\n']
    for a in data['equity_items']:
        lines.append(f"- {a['code']} {a['name']}: ${a['balance']:,.2f}")
    lines.append(f"\nTotal Equity: ${data['total_equity']:,.2f}")

    lines += [
        '',
        '---',
        f"Balanced: {'Yes' if data['balanced'] else 'No'}",
    ]
    return '\n'.join(lines)


def _build_cash_flow_email_body(data):
    lines = [
        '=== Operating Activities ===\n',
        f"- Cash Inflows (Tenant Receipts): ${data['operating_in']:,.2f}",
        f"- Cash Outflows (Expenses + Landlord): ${data['operating_out']:,.2f}",
        f"- Net Operating Cash Flow: ${data['net_operating']:,.2f}",
        '',
        '=== Investing Activities ===\n',
        f"- Asset Sales: ${data['investing_in']:,.2f}",
        f"- Asset Purchases: ${data['investing_out']:,.2f}",
        f"- Net Investing Cash Flow: ${data['net_investing']:,.2f}",
        '',
        '=== Financing Activities ===\n',
        f"- Owner Contributions: ${data['financing_in']:,.2f}",
        f"- Owner Withdrawals: ${data['financing_out']:,.2f}",
        f"- Net Financing Cash Flow: ${data['net_financing']:,.2f}",
        '',
        '=== Cash Summary ===\n',
        f"- Beginning Cash: ${data['beginning_cash']:,.2f}",
        f"- Net Change in Cash: ${data['net_change']:,.2f}",
        f"- Ending Cash: ${data['ending_cash']:,.2f}",
    ]
    return '\n'.join(lines)


def _build_lease_charge_summary_email_body(data):
    lines = [
        '=== Lease Charge Summary ===\n',
        f"- Total Leases: {data['total_leases']}",
        f"- Grand Total Charged: ${data['grand_total']:,.2f}",
        '',
        '=== Lease Details ===\n',
    ]
    for l in data['leases']:
        lines.append(
            f"- {l['tenant']} | {l['property']} - {l['unit']} | "
            f"Charged: ${l['total_charged']:,.2f} | Paid: ${l['total_paid']:,.2f} | "
            f"Balance: ${l['balance']:,.2f}"
        )
    if data.get('truncated'):
        lines.append(f"\n... and {data['total_leases'] - 20} more leases")
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
