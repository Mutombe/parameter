"""
Celery tasks for masterfile operations.
Handles lease expiry reminders and property maintenance alerts.
"""
import logging
from datetime import timedelta
from celery import shared_task
from django.utils import timezone
from django_tenants.utils import tenant_context, get_tenant_model

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def send_lease_expiry_reminders(self):
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
    from apps.accounts.models import User

    today = timezone.now().date()
    notifications_created = 0

    # Get admin users for notifications
    admin_users = User.objects.filter(role__in=[User.Role.ADMIN, User.Role.ACCOUNTANT])

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


@shared_task(bind=True)
def update_unit_occupancy_status(self, unit_id):
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


@shared_task(bind=True)
def calculate_property_statistics(self, property_id):
    """Calculate and cache property statistics."""
    from apps.masterfile.models import Property
    from django.db.models import Count, Sum

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
