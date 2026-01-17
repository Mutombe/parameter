"""
Celery tasks for automated billing operations.
Handles monthly invoice generation and overdue marking.
"""
import logging
from datetime import date, timedelta
from decimal import Decimal
from celery import shared_task
from django.utils import timezone
from django.db import transaction
from django_tenants.utils import tenant_context, get_tenant_model

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def generate_monthly_invoices_all_tenants(self):
    """
    Generate monthly rent invoices for all active tenants.
    Runs on the 1st of each month.
    """
    TenantModel = get_tenant_model()
    tenants = TenantModel.objects.filter(is_active=True).exclude(schema_name='public')

    results = {
        'success': [],
        'failed': [],
        'total_invoices': 0
    }

    for tenant in tenants:
        try:
            with tenant_context(tenant):
                count = generate_monthly_invoices_for_tenant(tenant)
                results['success'].append({
                    'tenant': tenant.name,
                    'invoices_created': count
                })
                results['total_invoices'] += count
        except Exception as e:
            logger.error(f"Failed to generate invoices for {tenant.name}: {e}")
            results['failed'].append({
                'tenant': tenant.name,
                'error': str(e)
            })

    logger.info(f"Monthly invoice generation complete: {results}")
    return results


def generate_monthly_invoices_for_tenant(tenant):
    """Generate invoices for a specific tenant's active leases."""
    from apps.masterfile.models import LeaseAgreement
    from apps.billing.models import Invoice
    from apps.accounts.models import User

    today = timezone.now().date()
    # Get first day of current month
    period_start = today.replace(day=1)
    # Get last day of current month
    if period_start.month == 12:
        period_end = period_start.replace(year=period_start.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        period_end = period_start.replace(month=period_start.month + 1, day=1) - timedelta(days=1)

    # Get system user for created_by
    system_user = User.objects.filter(role=User.Role.ADMIN).first()

    active_leases = LeaseAgreement.objects.filter(
        status='active',
        start_date__lte=today,
        end_date__gte=today
    ).select_related('tenant', 'unit')

    invoices_created = 0

    for lease in active_leases:
        # Check if invoice already exists for this period
        existing = Invoice.objects.filter(
            lease=lease,
            period_start=period_start
        ).exists()

        if not existing:
            with transaction.atomic():
                invoice = Invoice.objects.create(
                    tenant=lease.tenant,
                    lease=lease,
                    unit=lease.unit,
                    invoice_type='rent',
                    status='sent',
                    date=today,
                    due_date=today.replace(day=min(lease.billing_day + lease.grace_period_days, 28)),
                    period_start=period_start,
                    period_end=period_end,
                    amount=lease.monthly_rent,
                    vat_amount=Decimal('0'),
                    currency=lease.currency,
                    description=f'Rent for {period_start.strftime("%B %Y")} - {lease.unit.unit_number}',
                    created_by=system_user
                )
                invoices_created += 1
                logger.info(f"Created invoice {invoice.invoice_number} for {lease.tenant.name}")

    return invoices_created


@shared_task(bind=True, max_retries=3)
def mark_overdue_invoices_all_tenants(self):
    """
    Mark overdue invoices for all tenants.
    Runs daily at midnight.
    """
    TenantModel = get_tenant_model()
    tenants = TenantModel.objects.filter(is_active=True).exclude(schema_name='public')

    total_marked = 0

    for tenant in tenants:
        try:
            with tenant_context(tenant):
                count = mark_overdue_invoices_for_tenant()
                total_marked += count
        except Exception as e:
            logger.error(f"Failed to mark overdue for {tenant.name}: {e}")

    logger.info(f"Marked {total_marked} invoices as overdue across all tenants")
    return {'total_marked': total_marked}


def mark_overdue_invoices_for_tenant():
    """Mark overdue invoices for a specific tenant."""
    from apps.billing.models import Invoice

    today = timezone.now().date()

    # Update invoices that are past due
    updated = Invoice.objects.filter(
        due_date__lt=today,
        status__in=['sent', 'partial']
    ).update(status='overdue')

    return updated


@shared_task(bind=True)
def generate_invoices_for_tenant_task(self, tenant_id, month=None, year=None):
    """
    Task to generate invoices for a specific tenant (manual trigger).
    """
    TenantModel = get_tenant_model()

    try:
        tenant = TenantModel.objects.get(id=tenant_id)
        with tenant_context(tenant):
            count = generate_monthly_invoices_for_tenant(tenant)
            return {
                'success': True,
                'tenant': tenant.name,
                'invoices_created': count
            }
    except TenantModel.DoesNotExist:
        return {'success': False, 'error': 'Tenant not found'}
    except Exception as e:
        logger.error(f"Invoice generation failed: {e}")
        return {'success': False, 'error': str(e)}


@shared_task(bind=True)
def send_invoice_reminder(self, invoice_id):
    """Send reminder for a specific invoice."""
    from apps.billing.models import Invoice
    from apps.notifications.tasks import create_notification

    try:
        invoice = Invoice.objects.select_related('tenant').get(id=invoice_id)

        # Create notification for tenant
        create_notification.delay(
            user_id=invoice.tenant.portal_user_id if invoice.tenant.portal_user else None,
            notification_type='invoice_reminder',
            title=f'Invoice {invoice.invoice_number} Reminder',
            message=f'Your invoice for {invoice.amount} {invoice.currency} is due on {invoice.due_date}.',
            data={'invoice_id': invoice.id, 'amount': str(invoice.amount)}
        )

        return {'success': True, 'invoice': invoice.invoice_number}
    except Invoice.DoesNotExist:
        return {'success': False, 'error': 'Invoice not found'}
