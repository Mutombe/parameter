"""
Background tasks for notification operations.
Uses Django-Q2 for async task execution.
Handles email sending, cleanup, and notification creation.
"""
import logging
from datetime import timedelta
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from django_tenants.utils import tenant_context, get_tenant_model

logger = logging.getLogger(__name__)


def create_notification(user_id, notification_type, title, message, data=None, send_email_flag=True):
    """
    Create a notification for a user.
    Can be called from any task to create notifications.
    """
    from apps.notifications.models import Notification
    from apps.accounts.models import User

    try:
        user = User.objects.get(id=user_id)

        notification = Notification.objects.create(
            user=user,
            notification_type=notification_type,
            title=title,
            message=message,
            data=data or {}
        )

        # Push via WebSocket
        try:
            from apps.notifications.utils import push_notification_to_user
            push_notification_to_user(user.id, {
                'id': notification.id,
                'title': notification.title,
                'message': notification.message,
                'notification_type': notification.notification_type,
                'created_at': notification.created_at.isoformat(),
            })
        except Exception:
            pass  # WebSocket push is best-effort

        # Send email if enabled
        if send_email_flag and user.notifications_enabled:
            from django_q.tasks import async_task
            async_task(
                'apps.notifications.tasks.send_notification_email',
                notification.id
            )

        return {'success': True, 'notification_id': notification.id}
    except User.DoesNotExist:
        return {'success': False, 'error': 'User not found'}
    except Exception as e:
        logger.error(f"Failed to create notification: {e}")
        return {'success': False, 'error': str(e)}


def send_notification_email(notification_id):
    """Send email for a notification."""
    from apps.notifications.models import Notification

    try:
        notification = Notification.objects.select_related('user').get(id=notification_id)

        if notification.email_sent:
            return {'success': True, 'message': 'Email already sent'}

        # Check user preferences
        prefs = getattr(notification.user, 'notification_preferences', None)
        if prefs:
            pref_map = {
                'masterfile_created': prefs.email_masterfile_changes,
                'masterfile_updated': prefs.email_masterfile_changes,
                'masterfile_deleted': prefs.email_masterfile_changes,
                'invoice_created': prefs.email_invoice_alerts,
                'invoice_overdue': prefs.email_invoice_alerts,
                'invoice_reminder': prefs.email_invoice_alerts,
                'payment_received': prefs.email_payment_received,
                'lease_expiring': prefs.email_lease_alerts,
                'lease_activated': prefs.email_lease_alerts,
                'lease_terminated': prefs.email_lease_alerts,
                'rental_due': prefs.email_rental_due,
                'late_penalty': prefs.email_late_penalty,
                'system_alert': prefs.email_system_alerts,
            }

            if not pref_map.get(notification.notification_type, True):
                return {'success': True, 'message': 'Email disabled by user preference'}

        # Send branded HTML email
        subject = f"[Parameter] {notification.title}"
        message = notification.message

        try:
            from apps.notifications.utils import build_html_email
            from django.core.mail import EmailMultiAlternatives

            html_body, plain_text = build_html_email(notification.title, message)
            msg = EmailMultiAlternatives(
                subject=subject,
                body=plain_text,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[notification.user.email],
            )
            msg.attach_alternative(html_body, 'text/html')
            msg.send(fail_silently=False)

            notification.email_sent = True
            notification.email_sent_at = timezone.now()
            notification.save(update_fields=['email_sent', 'email_sent_at'])

            return {'success': True, 'email': notification.user.email}
        except Exception as e:
            logger.error(f"Email send failed: {e}")
            raise

    except Notification.DoesNotExist:
        return {'success': False, 'error': 'Notification not found'}


def cleanup_old_notifications():
    """
    Clean up old read notifications (older than 90 days).
    Runs weekly.
    """
    TenantModel = get_tenant_model()
    tenants = TenantModel.objects.filter(is_active=True).exclude(schema_name='public')

    total_deleted = 0
    cutoff_date = timezone.now() - timedelta(days=90)

    for tenant in tenants:
        try:
            with tenant_context(tenant):
                from apps.notifications.models import Notification

                deleted, _ = Notification.objects.filter(
                    is_read=True,
                    created_at__lt=cutoff_date
                ).delete()

                total_deleted += deleted
        except Exception as e:
            logger.error(f"Failed to cleanup for {tenant.name}: {e}")

    logger.info(f"Cleaned up {total_deleted} old notifications")
    return {'total_deleted': total_deleted}


def send_daily_digest():
    """
    Send daily digest of notifications to users who have it enabled.
    """
    TenantModel = get_tenant_model()
    tenants = TenantModel.objects.filter(is_active=True).exclude(schema_name='public')

    digests_sent = 0

    for tenant in tenants:
        try:
            with tenant_context(tenant):
                from apps.notifications.models import Notification, NotificationPreference
                from apps.accounts.utils import get_tenant_users

                # Get users with daily digest enabled (scoped to tenant)
                users_with_digest = get_tenant_users(
                    tenant_schema=tenant.schema_name
                ).filter(notification_preferences__daily_digest=True)

                yesterday = timezone.now() - timedelta(days=1)

                for user in users_with_digest:
                    # Get unread notifications from last 24 hours
                    notifications = Notification.objects.filter(
                        user=user,
                        is_read=False,
                        created_at__gte=yesterday
                    ).order_by('-created_at')

                    if notifications.exists():
                        # Send branded digest email
                        notif_count = notifications.count()
                        subject = f"[Parameter] Your Daily Digest - {notif_count} notifications"
                        message_lines = [f"You have {notif_count} unread notification(s) from the last 24 hours:\n"]

                        for notif in notifications[:20]:
                            message_lines.append(f"- {notif.title}: {notif.message}")

                        message = "\n".join(message_lines)

                        try:
                            from apps.notifications.utils import build_html_email
                            from django.core.mail import EmailMultiAlternatives

                            html_body, plain_text = build_html_email(
                                f'Daily Digest - {notif_count} Notifications', message
                            )
                            msg = EmailMultiAlternatives(
                                subject=subject, body=plain_text,
                                from_email=settings.DEFAULT_FROM_EMAIL,
                                to=[user.email],
                            )
                            msg.attach_alternative(html_body, 'text/html')
                            msg.send(fail_silently=False)
                            digests_sent += 1
                        except Exception as e:
                            logger.error(f"Digest send failed for {user.email}: {e}")

        except Exception as e:
            logger.error(f"Failed to process digest for {tenant.name}: {e}")

    return {'digests_sent': digests_sent}


def broadcast_notification(notification_type, title, message, data=None, roles=None):
    """
    Broadcast a notification to all users or users with specific roles.
    Scoped to the current tenant.
    """
    from apps.accounts.utils import get_tenant_users
    from apps.notifications.models import Notification

    query = get_tenant_users(roles=roles, notifications_enabled_only=True)

    notifications_created = 0

    for user in query:
        try:
            notif = Notification.objects.create(
                user=user,
                notification_type=notification_type,
                title=title,
                message=message,
                data=data or {}
            )
            # Push via WebSocket
            try:
                from apps.notifications.utils import push_notification_to_user
                push_notification_to_user(user.id, {
                    'id': notif.id, 'title': notif.title,
                    'message': notif.message, 'notification_type': notif.notification_type,
                    'created_at': notif.created_at.isoformat(),
                })
            except Exception:
                pass
            notifications_created += 1
        except Exception as e:
            logger.error(f"Failed to create broadcast notification for {user.email}: {e}")

    return {'notifications_created': notifications_created}


def send_system_alert_email(subject, message):
    """
    Send an alert email to system administrators.
    Used for failed tasks, system errors, and critical alerts.
    """
    try:
        admin_email = getattr(settings, 'ADMIN_EMAIL', None) or settings.DEFAULT_FROM_EMAIL
        send_mail(
            subject=f"[Parameter System Alert] {subject}",
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[admin_email],
            fail_silently=True,
        )
        logger.info(f"System alert email sent: {subject}")
    except Exception as e:
        logger.error(f"Failed to send system alert: {e}")
