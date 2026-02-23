"""
Background tasks for masterfile operations.
Uses Django-Q2 for async task execution.
Handles lease expiry reminders and property maintenance alerts.
"""
import logging
from datetime import timedelta
from django.utils import timezone
from django_tenants.utils import tenant_context, get_tenant_model

logger = logging.getLogger(__name__)


def send_lease_expiry_reminders():
    """
    Send reminders for leases expiring within 30, 60, and 90 days.
    Runs daily at 8 AM.
    """
    TenantModel = get_tenant_model()
    tenants = TenantModel.objects.filter(is_active=True).exclude(schema_name='public')

    results = {
        'notifications_sent': 0,
        'tenants_processed': 0
    }

    for tenant in tenants:
        try:
            with tenant_context(tenant):
                count = check_expiring_leases_for_tenant()
                results['notifications_sent'] += count
                results['tenants_processed'] += 1
        except Exception as e:
            logger.error(f"Failed to check leases for {tenant.name}: {e}")

    logger.info(f"Lease expiry check complete: {results}")
    return results


def check_expiring_leases_for_tenant():
    """Check for expiring leases and create notifications."""
    from apps.masterfile.models import LeaseAgreement
    from apps.accounts.utils import get_tenant_staff

    today = timezone.now().date()
    notifications_created = 0

    # Get admin users for notifications (scoped to tenant)
    admin_users = get_tenant_staff()

    # Check for leases expiring in 30, 60, and 90 days
    reminder_days = [30, 60, 90]

    for days in reminder_days:
        target_date = today + timedelta(days=days)

        expiring_leases = LeaseAgreement.objects.filter(
            status='active',
            end_date=target_date
        ).select_related('tenant', 'unit')

        for lease in expiring_leases:
            # Import here to avoid circular imports
            from apps.notifications.models import Notification

            # Email the tenant about lease expiry
            try:
                from apps.notifications.utils import send_tenant_email
                if days == 60:
                    # 60-day: positive renewal-focused tone
                    send_tenant_email(
                        lease.tenant,
                        f'Time to Renew Your Lease - {lease.unit.unit_number}',
                        f"""Dear {lease.tenant.name},

We hope you've been enjoying your stay! Your lease agreement is coming up for renewal in {days} days.

Lease Details:
- Unit: {lease.unit.unit_number}
- Lease Number: {lease.lease_number}
- Current Expiry: {lease.end_date}
- Monthly Rent: {lease.currency} {lease.monthly_rent:,.2f}

We'd love to have you continue as our tenant. Please contact your property management office to discuss renewal terms and secure your unit.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
                    )
                else:
                    send_tenant_email(
                        lease.tenant,
                        f'Your Lease Expires in {days} Days',
                        f"""Dear {lease.tenant.name},

This is a reminder that your lease agreement is expiring soon.

Lease Details:
- Unit: {lease.unit.unit_number}
- Lease Number: {lease.lease_number}
- Expiry Date: {lease.end_date}
- Days Remaining: {days}

Please contact your property management office to discuss renewal options or make arrangements for move-out.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
                    )
            except Exception:
                pass

            # Email landlord about expiring lease on their property
            try:
                from apps.notifications.utils import send_landlord_email
                landlord = lease.unit.property.landlord if lease.unit and lease.unit.property else None
                if landlord:
                    send_landlord_email(
                        landlord,
                        f'Lease Expiring in {days} Days - {lease.unit.unit_number}',
                        f"""Dear {landlord.name},

A lease on your property is expiring soon.

Details:
- Property: {lease.unit.property.name}
- Unit: {lease.unit.unit_number}
- Tenant: {lease.tenant.name}
- Expiry Date: {lease.end_date}
- Days Remaining: {days}
- Monthly Rent: {lease.currency} {lease.monthly_rent:,.2f}

Please contact your property management office if you wish to discuss renewal or re-letting options.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
                    )
            except Exception:
                pass

            for admin in admin_users:
                Notification.objects.get_or_create(
                    user=admin,
                    notification_type='lease_expiring',
                    title=f'Lease Expiring in {days} Days',
                    message=f'Lease for {lease.tenant.name} at {lease.unit.unit_number} expires on {lease.end_date}.',
                    defaults={
                        'data': {
                            'lease_id': lease.id,
                            'tenant_name': lease.tenant.name,
                            'unit_number': lease.unit.unit_number,
                            'end_date': str(lease.end_date),
                            'days_until_expiry': days
                        }
                    }
                )
                notifications_created += 1

    return notifications_created


def update_unit_occupancy_status(unit_id):
    """Update unit occupancy status based on active leases."""
    from apps.masterfile.models import Unit, LeaseAgreement

    try:
        unit = Unit.objects.get(id=unit_id)
        active_lease = LeaseAgreement.objects.filter(
            unit=unit,
            status='active'
        ).exists()

        unit.is_occupied = active_lease
        unit.save(update_fields=['is_occupied'])

        return {'success': True, 'unit': unit.unit_number, 'occupied': active_lease}
    except Unit.DoesNotExist:
        return {'success': False, 'error': 'Unit not found'}


def calculate_property_statistics(property_id):
    """Calculate and cache property statistics."""
    from apps.masterfile.models import Property
    from django.db.models import Sum

    try:
        prop = Property.objects.get(id=property_id)
        units = prop.units.all()

        stats = {
            'total_units': units.count(),
            'occupied_units': units.filter(is_occupied=True).count(),
            'vacant_units': units.filter(is_occupied=False).count(),
            'total_monthly_rent': float(units.aggregate(Sum('rental_amount'))['rental_amount__sum'] or 0),
            'vacancy_rate': prop.vacancy_rate,
            'occupancy_rate': prop.occupancy_rate
        }

        return {'success': True, 'property': prop.name, 'stats': stats}
    except Property.DoesNotExist:
        return {'success': False, 'error': 'Property not found'}


def send_landlord_monthly_reports_all_tenants():
    """
    Send monthly income reports to all landlords across all tenants.
    Runs on the 5th of each month (after invoices and receipts are processed).
    """
    TenantModel = get_tenant_model()
    tenants = TenantModel.objects.filter(is_active=True).exclude(schema_name='public')

    total_reports = 0

    for tenant in tenants:
        try:
            with tenant_context(tenant):
                count = _send_landlord_monthly_reports()
                total_reports += count
        except Exception as e:
            logger.error(f"Failed to send landlord reports for {tenant.name}: {e}")

    logger.info(f"Sent {total_reports} landlord monthly reports across all tenants")
    return {'total_reports': total_reports}


def _compute_receipt_commission(receipt, landlord):
    """Compute commission for a single receipt based on income type or landlord rate."""
    from decimal import Decimal
    if receipt.income_type and receipt.income_type.is_commissionable:
        rate = receipt.income_type.default_commission_rate / 100
    else:
        rate = landlord.commission_rate / 100
    return receipt.amount * rate


def _send_landlord_monthly_reports():
    """Send monthly account summary reports to landlords in the current tenant schema."""
    from decimal import Decimal
    from apps.masterfile.models import Landlord, Unit
    from apps.billing.models import Receipt, Expense
    from apps.notifications.utils import send_landlord_email
    from django.db.models import Sum

    today = timezone.now().date()
    # Report for the previous month
    if today.month == 1:
        report_month = 12
        report_year = today.year - 1
    else:
        report_month = today.month - 1
        report_year = today.year

    from calendar import monthrange
    _, last_day = monthrange(report_year, report_month)
    period_start = today.replace(year=report_year, month=report_month, day=1)
    period_end = today.replace(year=report_year, month=report_month, day=last_day)
    month_name = period_start.strftime('%B %Y')

    reports_sent = 0

    landlords = Landlord.objects.filter(is_active=True).prefetch_related('properties__units')

    for landlord in landlords:
        if not landlord.email:
            continue

        properties = landlord.properties.all()
        if not properties.exists():
            continue

        units = Unit.objects.filter(property__in=properties)
        cur = landlord.preferred_currency

        # ── Opening balance (all transactions before period) ──
        prior_receipts = Receipt.objects.filter(
            invoice__unit__in=units, date__lt=period_start,
        ).select_related('income_type')
        prior_receipts_total = Decimal('0')
        prior_commissions_total = Decimal('0')
        for r in prior_receipts:
            prior_receipts_total += r.amount
            prior_commissions_total += _compute_receipt_commission(r, landlord)

        prior_expenses_total = Expense.objects.filter(
            payee_type='landlord', payee_id=landlord.id,
            status='paid', date__lt=period_start,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

        opening_balance = prior_receipts_total - prior_commissions_total - prior_expenses_total

        # ── Period transactions ──
        period_receipts = Receipt.objects.filter(
            invoice__unit__in=units,
            date__gte=period_start, date__lte=period_end,
        ).select_related(
            'tenant', 'invoice', 'invoice__unit', 'invoice__lease', 'income_type',
        ).order_by('date')

        period_expenses = Expense.objects.filter(
            payee_type='landlord', payee_id=landlord.id,
            status='paid',
            date__gte=period_start, date__lte=period_end,
        ).order_by('date')

        total_receipts = Decimal('0')
        total_commissions = Decimal('0')
        total_expenses = Decimal('0')
        transaction_lines = []

        for rcpt in period_receipts:
            lease_id = rcpt.invoice.lease_id if rcpt.invoice else ''
            tenant_name = rcpt.tenant.name if rcpt.tenant else ''
            unit_str = str(rcpt.invoice.unit) if rcpt.invoice and rcpt.invoice.unit else ''
            ref = rcpt.reference or rcpt.receipt_number

            # Credit line
            transaction_lines.append(
                f"  {rcpt.date}  CREDIT  {cur} {float(rcpt.amount):>12,.2f}  "
                f"Payment Leaseid-{lease_id} -{tenant_name} {unit_str} Ref-{ref}"
            )
            total_receipts += rcpt.amount

            # Commission debit line
            comm = _compute_receipt_commission(rcpt, landlord)
            if comm > 0:
                income_type_name = rcpt.income_type.name if rcpt.income_type else 'Levy'
                transaction_lines.append(
                    f"  {rcpt.date}  DEBIT   {cur} {float(comm):>12,.2f}  "
                    f"{income_type_name} Commission Leaseid-{lease_id} Ref-{ref}"
                )
                total_commissions += comm

        for exp in period_expenses:
            ref_part = f" ref-{exp.reference}" if exp.reference else ''
            transaction_lines.append(
                f"  {exp.date}  DEBIT   {cur} {float(exp.amount):>12,.2f}  "
                f"Journal{ref_part}-{exp.description}"
            )
            total_expenses += exp.amount

        total_debits = total_commissions + total_expenses
        total_credits = total_receipts
        closing_balance = opening_balance + total_credits - total_debits

        # ── Occupancy stats ──
        total_units = units.count()
        total_occupied = units.filter(is_occupied=True).count()

        report = f"""Dear {landlord.name},

Here is your Landlord Account Summary for {month_name}.
Transaction Period: {period_start} - {period_end}

=== ACCOUNT SUMMARY ===
- Opening Balance:      {cur} {float(opening_balance):>12,.2f}
- Total Receipts:       {cur} {float(total_credits):>12,.2f}
- Total Commissions:    {cur} {float(total_commissions):>12,.2f}
- Total Expenses:       {cur} {float(total_expenses):>12,.2f}
- Total Debits:         {cur} {float(total_debits):>12,.2f}
- Closing Balance:      {cur} {float(closing_balance):>12,.2f}

=== TRANSACTIONS ===
{chr(10).join(transaction_lines) if transaction_lines else '  No transactions this period.'}

=== OCCUPANCY ===
- Total Units: {total_units}
- Occupied: {total_occupied}
- Vacant: {total_units - total_occupied}
- Occupancy Rate: {(total_occupied / total_units * 100) if total_units > 0 else 0:.0f}%

For detailed statements, please log in to your property management portal.

Best regards,
Property Management
Powered by Parameter.co.zw
"""

        try:
            send_landlord_email(landlord, f'Landlord Account Summary - {month_name}', report)
            reports_sent += 1
        except Exception as e:
            logger.error(f"Failed to send report to {landlord.name}: {e}")

    return reports_sent
