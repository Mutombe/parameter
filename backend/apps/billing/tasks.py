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

    # Email system alert for cross-tenant summary (runs outside tenant context)
    if results['total_invoices'] > 0 or results['failed']:
        try:
            from apps.notifications.tasks import send_system_alert_email
            success_lines = '\n'.join(
                f"  - {s['tenant']}: {s['invoices_created']} invoices"
                for s in results['success'] if s['invoices_created'] > 0
            )
            failed_lines = '\n'.join(
                f"  - {f['tenant']}: {f['error']}"
                for f in results['failed']
            ) if results['failed'] else '  None'

            send_system_alert_email(
                f'Monthly Billing Complete: {results["total_invoices"]} Invoices Generated',
                f"""Monthly invoice generation has completed.

Summary:
- Total Invoices Created: {results['total_invoices']}
- Companies Processed: {len(results['success'])}
- Failures: {len(results['failed'])}

Successful:
{success_lines or '  None'}

Failed:
{failed_lines}
"""
            )
        except Exception:
            pass

    # System alert if there were failures
    if results['failed']:
        try:
            from apps.notifications.tasks import send_system_alert_email
            failed_lines = '\n'.join(f"  - {f['tenant']}: {f['error']}" for f in results['failed'])
            send_system_alert_email(
                f'Invoice Generation Failures: {len(results["failed"])} companies failed',
                f"""Monthly invoice generation had failures:\n\n{failed_lines}\n\nPlease investigate."""
            )
        except Exception:
            pass

    return results


def generate_monthly_invoices_for_tenant(tenant):
    """Generate invoices for a specific tenant's active leases."""
    from apps.masterfile.models import LeaseAgreement
    from apps.billing.models import Invoice
    from apps.accounts.models import User
    from apps.accounts.utils import get_tenant_users

    today = timezone.now().date()
    # Get first day of current month
    period_start = today.replace(day=1)
    # Get last day of current month
    if period_start.month == 12:
        period_end = period_start.replace(year=period_start.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        period_end = period_start.replace(month=period_start.month + 1, day=1) - timedelta(days=1)

    # Get system user for created_by (scoped to tenant)
    system_user = get_tenant_users(roles=[User.Role.ADMIN]).first()

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

                # Email tenant about the new invoice
                try:
                    from apps.notifications.utils import send_tenant_email
                    unit_name = lease.unit.unit_number if lease.unit else 'N/A'
                    send_tenant_email(
                        lease.tenant,
                        f'New Invoice - {invoice.invoice_number}',
                        f"""Dear {lease.tenant.name},

A new rent invoice has been generated for your account.

Invoice Details:
- Invoice Number: {invoice.invoice_number}
- Period: {period_start.strftime("%B %Y")}
- Unit: {unit_name}
- Amount Due: {invoice.currency} {invoice.amount:,.2f}
- Due Date: {invoice.due_date}

Please ensure payment is made by the due date to avoid late fees.

Thank you for your prompt attention.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
                    )
                except Exception:
                    pass

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

    # Email system alert for cross-tenant summary (runs outside tenant context)
    if total_marked > 0:
        try:
            from apps.notifications.tasks import send_system_alert_email
            send_system_alert_email(
                f'Daily Overdue Report: {total_marked} Invoices Marked Overdue',
                f"""The daily overdue check has completed.

{total_marked} invoice(s) have been marked as overdue across all companies.

Tenants have been notified by email.
"""
            )
        except Exception:
            pass

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

    # Email tenants about overdue invoices
    if newly_overdue:
        from apps.notifications.utils import send_tenant_email
        for invoice in newly_overdue:
            try:
                send_tenant_email(
                    invoice.tenant,
                    f'Invoice {invoice.invoice_number} is Now Overdue',
                    f"""Dear {invoice.tenant.name},

This is to inform you that your invoice {invoice.invoice_number} is now overdue.

Invoice Details:
- Invoice Number: {invoice.invoice_number}
- Amount Due: {invoice.currency} {invoice.balance:,.2f}
- Due Date: {invoice.due_date}
- Unit: {invoice.unit.unit_number if invoice.unit else 'N/A'}

Please settle this invoice immediately to avoid late payment penalties.

If you have already made this payment, please disregard this notice and contact us with your proof of payment.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
                )
            except Exception:
                pass

    # Create notifications for admins/accountants (scoped to tenant)
    if newly_overdue:
        from apps.accounts.utils import get_tenant_staff
        admin_users = get_tenant_staff()
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

    # Email tenants about upcoming due invoices
    from apps.notifications.utils import send_tenant_email, push_notification_to_user
    for invoice in upcoming_invoices:
        try:
            send_tenant_email(
                invoice.tenant,
                f'Payment Reminder - Invoice {invoice.invoice_number} Due in 3 Days',
                f"""Dear {invoice.tenant.name},

This is a friendly reminder that your invoice is due in 3 days.

Invoice Details:
- Invoice Number: {invoice.invoice_number}
- Amount Due: {invoice.currency} {invoice.balance:,.2f}
- Due Date: {invoice.due_date}
- Unit: {invoice.unit.unit_number if invoice.unit else 'N/A'}

Please ensure timely payment to avoid late fees.

Thank you.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
            )
        except Exception:
            pass

    from apps.accounts.utils import get_tenant_staff
    admin_users = get_tenant_staff()

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

    # Email system alert for cross-tenant summary (runs outside tenant context)
    if total_penalties > 0:
        try:
            from apps.notifications.tasks import send_system_alert_email
            send_system_alert_email(
                f'Late Penalties Applied: {total_penalties} Penalty Invoice(s) Created',
                f"""The daily late penalty processing has completed.

{total_penalties} penalty invoice(s) have been created across all companies.

Affected tenants have been notified by email.
"""
            )
        except Exception:
            pass

    return {'total_penalties': total_penalties}


def _apply_late_penalties():
    """Apply late penalties for overdue invoices in the current tenant schema."""
    from apps.billing.models import Invoice, LatePenaltyConfig, LatePenaltyExclusion
    from apps.accounts.models import User
    from apps.accounts.utils import get_tenant_users

    today = timezone.now().date()
    penalties_created = 0

    # Get all overdue invoices (exclude penalty invoices themselves)
    overdue_invoices = list(Invoice.objects.filter(
        status='overdue',
        balance__gt=0
    ).exclude(
        invoice_type='penalty'
    ).select_related('tenant', 'unit', 'property'))

    # Get system user for created_by (scoped to tenant)
    system_user = get_tenant_users(roles=[User.Role.ADMIN]).first()

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

            # Email tenant about the penalty
            try:
                from apps.notifications.utils import send_tenant_email
                send_tenant_email(
                    invoice.tenant,
                    f'Late Payment Penalty Applied - {penalty_invoice.invoice_number}',
                    f"""Dear {invoice.tenant.name},

A late payment penalty has been applied to your account for overdue invoice {invoice.invoice_number}.

Penalty Details:
- Penalty Invoice: {penalty_invoice.invoice_number}
- Original Invoice: {invoice.invoice_number}
- Penalty Amount: {penalty_invoice.currency} {penalty_amount:,.2f}
- Outstanding Balance: {invoice.currency} {invoice.balance:,.2f}
- Penalty Type: {config.get_penalty_type_display()}

Please settle your outstanding balance as soon as possible to avoid further penalties.

If you believe this is an error or need to discuss payment arrangements, please contact your property management office.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
                )
            except Exception:
                pass

        except Exception as e:
            logger.error(f"Failed to apply penalty for invoice {invoice.invoice_number}: {e}")

    return penalties_created


def send_invoice_emails_task(invoice_ids, subject_template, message_template, company_name):
    """
    Background task: Send invoice emails to tenants.
    Called via Django-Q async_task from InvoiceViewSet.send_invoices.
    """
    from apps.billing.models import Invoice
    from apps.notifications.utils import send_email

    invoices = Invoice.objects.filter(
        id__in=invoice_ids
    ).select_related('tenant', 'unit', 'unit__property')

    sent = 0
    failed = 0

    for invoice in invoices:
        if not invoice.tenant.email:
            continue

        try:
            subject = subject_template.format(
                company_name=company_name,
                invoice_number=invoice.invoice_number
            )

            default_message = f"""Dear {invoice.tenant.name},

Please find your invoice details below:

- Invoice Number: {invoice.invoice_number}
- Amount Due: {invoice.currency} {invoice.balance:,.2f}
- Due Date: {invoice.due_date}
- Description: {invoice.description}
- Property: {invoice.unit.property.name if invoice.unit else 'N/A'}
- Unit: {invoice.unit.unit_number if invoice.unit else 'N/A'}

Please ensure payment is made by the due date to avoid any late fees.

Thank you for your prompt attention.

Best regards,
{company_name}
"""
            message = message_template or default_message
            send_email(invoice.tenant.email, subject, message, blocking=True)
            sent += 1

        except Exception as e:
            logger.error(f'Failed to send invoice {invoice.invoice_number}: {e}')
            failed += 1

    logger.info(f"Invoice email task complete: {sent} sent, {failed} failed")
    return {'sent': sent, 'failed': failed}


def send_bulk_email_task(recipient_ids, subject, message, company_name, user_id):
    """
    Background task: Send bulk email to tenants.
    Called via Django-Q async_task from BulkMailingViewSet.send_bulk_email.
    """
    from apps.masterfile.models import RentalTenant
    from apps.notifications.utils import send_email
    from apps.accounting.models import AuditTrail
    from apps.accounts.models import User

    recipients = RentalTenant.objects.filter(id__in=recipient_ids)
    user = User.objects.filter(id=user_id).first()

    sent = 0
    failed = 0

    for recipient in recipients:
        try:
            personalized_message = message.format(
                tenant_name=recipient.name,
                company_name=company_name
            )
            send_email(recipient.email, subject, personalized_message, blocking=True)
            sent += 1
        except Exception as e:
            logger.error(f'Failed to send email to {recipient.email}: {e}')
            failed += 1

    # Update audit trail with final results
    try:
        AuditTrail.objects.create(
            action='bulk_email_completed',
            model_name='RentalTenant',
            record_id=0,
            changes={
                'subject': subject,
                'sent_count': sent,
                'failed_count': failed,
                'total_recipients': len(recipient_ids),
            },
            user=user
        )
    except Exception:
        pass

    logger.info(f"Bulk email task complete: {sent} sent, {failed} failed")
    return {'sent': sent, 'failed': failed}
