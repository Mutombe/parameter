"""
Background tasks for automated billing operations.
Uses Django-Q2 for async task execution.
Handles monthly invoice generation and overdue marking.
"""
import logging
from datetime import date, timedelta
from decimal import Decimal
from django.db import models, transaction
from django.utils import timezone
from django_tenants.utils import tenant_context, get_tenant_model

logger = logging.getLogger(__name__)


def generate_monthly_invoices_all_tenants():
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


def mark_overdue_invoices_all_tenants():
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
    """Mark overdue invoices for a specific tenant and create notifications."""
    from apps.billing.models import Invoice
    from apps.notifications.models import Notification
    from apps.accounts.models import User

    today = timezone.now().date()

    # Find invoices that are about to become overdue
    newly_overdue = list(Invoice.objects.filter(
        due_date__lt=today,
        status__in=['sent', 'partial']
    ).select_related('tenant', 'unit'))

    # Mark them overdue
    updated = Invoice.objects.filter(
        due_date__lt=today,
        status__in=['sent', 'partial']
    ).update(status='overdue')

    # Audit trail for each overdue invoice
    from apps.accounting.models import AuditTrail
    for invoice in newly_overdue:
        try:
            AuditTrail.objects.create(
                action='invoice_marked_overdue',
                model_name='Invoice',
                record_id=invoice.id,
                changes={
                    'invoice_number': invoice.invoice_number,
                    'tenant_name': invoice.tenant.name,
                    'due_date': str(invoice.due_date),
                    'balance': str(invoice.balance),
                },
                user=None
            )
        except Exception:
            pass

    # Create notifications for admins/accountants
    if newly_overdue:
        admin_users = User.objects.filter(
            role__in=[User.Role.ADMIN, User.Role.ACCOUNTANT],
            is_active=True, notifications_enabled=True
        )
        from apps.notifications.utils import push_notification_to_user
        for invoice in newly_overdue:
            for admin_user in admin_users:
                try:
                    notif = Notification.objects.create(
                        user=admin_user,
                        notification_type='invoice_overdue',
                        priority='high',
                        title=f'Invoice {invoice.invoice_number} is Overdue',
                        message=f'{invoice.tenant.name} has not paid {invoice.currency} {invoice.balance:,.2f} (due {invoice.due_date}).',
                        data={
                            'invoice_id': invoice.id,
                            'invoice_number': invoice.invoice_number,
                            'tenant_name': invoice.tenant.name,
                            'amount': str(invoice.balance),
                            'due_date': str(invoice.due_date),
                        }
                    )
                    try:
                        push_notification_to_user(admin_user.id, {
                            'id': notif.id, 'title': notif.title,
                            'message': notif.message, 'notification_type': notif.notification_type,
                            'created_at': notif.created_at.isoformat(),
                        })
                    except Exception:
                        pass
                except Exception:
                    pass

    return updated


def generate_invoices_for_tenant_task(tenant_id, month=None, year=None):
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


def send_invoice_reminder(invoice_id):
    """Send reminder for a specific invoice."""
    from apps.billing.models import Invoice
    from apps.notifications.tasks import create_notification

    try:
        invoice = Invoice.objects.select_related('tenant').get(id=invoice_id)

        # Create notification for tenant
        portal_user_id = invoice.tenant.portal_user_id if hasattr(invoice.tenant, 'portal_user') and invoice.tenant.portal_user else None
        if portal_user_id:
            from django_q.tasks import async_task
            async_task(
                'apps.notifications.tasks.create_notification',
                portal_user_id,
                'invoice_reminder',
                f'Invoice {invoice.invoice_number} Reminder',
                f'Your invoice for {invoice.amount} {invoice.currency} is due on {invoice.due_date}.',
                {'invoice_id': invoice.id, 'amount': str(invoice.amount)}
            )

        return {'success': True, 'invoice': invoice.invoice_number}
    except Invoice.DoesNotExist:
        return {'success': False, 'error': 'Invoice not found'}


def send_rental_due_reminders_all_tenants():
    """
    Send reminders for invoices due in 3 days.
    Runs daily.
    """
    TenantModel = get_tenant_model()
    tenants = TenantModel.objects.filter(is_active=True).exclude(schema_name='public')

    total_reminders = 0

    for tenant in tenants:
        try:
            with tenant_context(tenant):
                count = _send_rental_due_reminders()
                total_reminders += count
        except Exception as e:
            logger.error(f"Failed to send due reminders for {tenant.name}: {e}")

    logger.info(f"Sent {total_reminders} rental due reminders across all tenants")
    return {'total_reminders': total_reminders}


def _send_rental_due_reminders():
    """Send reminders for invoices due in 3 days for current tenant schema."""
    from apps.billing.models import Invoice
    from apps.notifications.models import Notification
    from apps.accounts.models import User

    today = timezone.now().date()
    due_in_3_days = today + timedelta(days=3)

    # Find unpaid invoices due in 3 days
    upcoming_invoices = Invoice.objects.filter(
        due_date=due_in_3_days,
        status__in=['sent', 'partial'],
        balance__gt=0
    ).select_related('tenant', 'unit')

    admin_users = User.objects.filter(
        role__in=[User.Role.ADMIN, User.Role.ACCOUNTANT],
        is_active=True, notifications_enabled=True
    )

    from apps.notifications.utils import push_notification_to_user
    count = 0
    for invoice in upcoming_invoices:
        for admin_user in admin_users:
            try:
                notif = Notification.objects.create(
                    user=admin_user,
                    notification_type='rental_due',
                    priority='medium',
                    title=f'Invoice {invoice.invoice_number} Due in 3 Days',
                    message=f'{invoice.tenant.name} owes {invoice.currency} {invoice.balance:,.2f}, due on {invoice.due_date}.',
                    data={
                        'invoice_id': invoice.id,
                        'invoice_number': invoice.invoice_number,
                        'tenant_name': invoice.tenant.name,
                        'amount': str(invoice.balance),
                        'due_date': str(invoice.due_date),
                    }
                )
                try:
                    push_notification_to_user(admin_user.id, {
                        'id': notif.id, 'title': notif.title,
                        'message': notif.message, 'notification_type': notif.notification_type,
                        'created_at': notif.created_at.isoformat(),
                    })
                except Exception:
                    pass
                count += 1
            except Exception:
                pass

    return count


def apply_late_penalties_all_tenants():
    """
    Apply late penalties to overdue invoices across all tenants.
    Runs daily.
    """
    TenantModel = get_tenant_model()
    tenants = TenantModel.objects.filter(is_active=True).exclude(schema_name='public')

    total_penalties = 0

    for tenant in tenants:
        try:
            with tenant_context(tenant):
                count = _apply_late_penalties()
                total_penalties += count
        except Exception as e:
            logger.error(f"Failed to apply penalties for {tenant.name}: {e}")

    logger.info(f"Applied {total_penalties} late penalties across all tenants")
    return {'total_penalties': total_penalties}


def _apply_late_penalties():
    """Apply late penalties for overdue invoices in the current tenant schema."""
    from apps.billing.models import Invoice, LatePenaltyConfig, LatePenaltyExclusion
    from apps.accounts.models import User

    today = timezone.now().date()
    penalties_created = 0

    # Get all overdue invoices (exclude penalty invoices themselves)
    overdue_invoices = list(Invoice.objects.filter(
        status='overdue',
        balance__gt=0
    ).exclude(
        invoice_type='penalty'
    ).select_related('tenant', 'unit', 'property'))

    system_user = User.objects.filter(role=User.Role.ADMIN).first()

    for invoice in overdue_invoices:
        try:
            # Check for exclusion
            active_exclusion = LatePenaltyExclusion.objects.filter(
                tenant=invoice.tenant
            ).filter(
                models.Q(excluded_until__isnull=True) | models.Q(excluded_until__gte=today)
            ).exists()

            if active_exclusion:
                continue

            # Find applicable config: tenant override > property default > system default
            config = LatePenaltyConfig.objects.filter(
                tenant=invoice.tenant, is_enabled=True
            ).first()

            if not config and invoice.property:
                config = LatePenaltyConfig.objects.filter(
                    property=invoice.property, tenant__isnull=True, is_enabled=True
                ).first()

            if not config:
                config = LatePenaltyConfig.objects.filter(
                    property__isnull=True, tenant__isnull=True, is_enabled=True
                ).first()

            if not config:
                continue

            # Check grace period
            grace_deadline = invoice.due_date + timedelta(days=config.grace_period_days)
            if today <= grace_deadline:
                continue

            # Calculate penalty
            penalty_amount = config.calculate_penalty(invoice.balance)
            if penalty_amount <= 0:
                continue

            # Check existing penalty count (prevent duplicates)
            existing_penalty_count = Invoice.objects.filter(
                invoice_type='penalty',
                tenant=invoice.tenant,
                description__contains=invoice.invoice_number
            ).count()

            if config.max_penalties_per_invoice > 0 and existing_penalty_count >= config.max_penalties_per_invoice:
                continue

            # Create penalty invoice
            penalty_invoice = Invoice(
                tenant=invoice.tenant,
                unit=invoice.unit,
                property=invoice.property,
                invoice_type='penalty',
                status='sent',
                date=today,
                due_date=today,
                amount=penalty_amount,
                vat_amount=Decimal('0'),
                currency=config.currency or invoice.currency,
                description=f'Late payment penalty for {invoice.invoice_number} ({config.get_penalty_type_display()})',
                created_by=system_user
            )
            penalty_invoice.save()
            penalties_created += 1

            logger.info(f"Applied penalty {penalty_invoice.invoice_number} ({penalty_amount}) for {invoice.invoice_number}")

        except Exception as e:
            logger.error(f"Failed to apply penalty for invoice {invoice.invoice_number}: {e}")

    return penalties_created
