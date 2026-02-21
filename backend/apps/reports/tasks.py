"""
Background tasks for commission report generation and emailing.
Uses Django-Q2 for scheduled monthly execution.
"""
import logging
from datetime import date
from decimal import Decimal

from django.utils import timezone
from django_tenants.utils import tenant_context, get_tenant_model

logger = logging.getLogger(__name__)


def send_monthly_commission_reports_all_tenants():
    """
    Generate and email commission reports for all active tenants.
    Runs monthly — covers the previous calendar month.
    """
    TenantModel = get_tenant_model()
    tenants = TenantModel.objects.filter(is_active=True).exclude(schema_name='public')

    today = timezone.now().date()
    # Previous month
    if today.month == 1:
        prev_month_start = date(today.year - 1, 12, 1)
        prev_month_end = date(today.year - 1, 12, 31)
    else:
        prev_month_start = date(today.year, today.month - 1, 1)
        prev_month_end = date(today.year, today.month, 1) - __import__('datetime').timedelta(days=1)

    period_label = prev_month_start.strftime('%B %Y')

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
