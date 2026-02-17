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


def _send_landlord_monthly_reports():
    """Send monthly income reports to landlords in the current tenant schema."""
    from apps.masterfile.models import Landlord, Property
    from apps.billing.models import Receipt, Invoice, Expense
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

        property_lines = []
        total_rent_collected = 0
        total_invoiced = 0
        total_expenses = 0
        total_units = 0
        total_occupied = 0

        for prop in properties:
            unit_ids = list(prop.units.values_list('id', flat=True))
            total_units += len(unit_ids)
            total_occupied += prop.units.filter(is_occupied=True).count()

            # Rent collected (receipts)
            collected = Receipt.objects.filter(
                invoice__unit_id__in=unit_ids,
                date__gte=period_start,
                date__lte=period_end
            ).aggregate(total=Sum('amount'))['total'] or 0

            # Invoiced amount
            invoiced = Invoice.objects.filter(
                unit_id__in=unit_ids,
                period_start__gte=period_start,
                period_start__lte=period_end,
                invoice_type='rent'
            ).aggregate(total=Sum('amount'))['total'] or 0

            # Expenses on property
            expenses = Expense.objects.filter(
                payee_type='landlord',
                payee_id=landlord.id,
                date__gte=period_start,
                date__lte=period_end,
                status='paid'
            ).aggregate(total=Sum('amount'))['total'] or 0

            total_rent_collected += float(collected)
            total_invoiced += float(invoiced)
            total_expenses += float(expenses)

            vacant = prop.units.filter(is_occupied=False).count()
            property_lines.append(
                f"  {prop.name}:\n"
                f"    - Units: {len(unit_ids)} ({len(unit_ids) - vacant} occupied, {vacant} vacant)\n"
                f"    - Invoiced: {landlord.preferred_currency} {float(invoiced):,.2f}\n"
                f"    - Collected: {landlord.preferred_currency} {float(collected):,.2f}\n"
                f"    - Expenses: {landlord.preferred_currency} {float(expenses):,.2f}"
            )

        net_income = total_rent_collected - total_expenses
        commission = total_rent_collected * float(landlord.commission_rate) / 100
        net_after_commission = net_income - commission

        report = f"""Dear {landlord.name},

Here is your monthly income report for {month_name}.

=== SUMMARY ===
- Total Invoiced: {landlord.preferred_currency} {total_invoiced:,.2f}
- Total Collected: {landlord.preferred_currency} {total_rent_collected:,.2f}
- Total Expenses: {landlord.preferred_currency} {total_expenses:,.2f}
- Management Fee ({landlord.commission_rate}%): {landlord.preferred_currency} {commission:,.2f}
- Net Income: {landlord.preferred_currency} {net_after_commission:,.2f}

=== OCCUPANCY ===
- Total Units: {total_units}
- Occupied: {total_occupied}
- Vacant: {total_units - total_occupied}
- Occupancy Rate: {(total_occupied / total_units * 100) if total_units > 0 else 0:.0f}%

=== PROPERTY BREAKDOWN ===
{chr(10).join(property_lines)}

For detailed statements, please contact your property management office.

Best regards,
Property Management
Powered by Parameter.co.zw
"""

        try:
            send_landlord_email(landlord, f'Monthly Income Report - {month_name}', report)
            reports_sent += 1
        except Exception as e:
            logger.error(f"Failed to send report to {landlord.name}: {e}")

    return reports_sent
