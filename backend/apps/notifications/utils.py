"""Utility functions for pushing notifications via WebSocket and tenant emails."""
import logging
import threading

from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger(__name__)


def _do_push(group_name, message):
    """Execute the actual channel layer push in a daemon thread."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(group_name, message)
    except Exception as e:
        logger.debug(f"WebSocket push failed for {group_name}: {e}")


def push_notification_to_user(user_id, notification_data):
    """
    Push a notification to a specific user via WebSocket.
    Fire-and-forget using a daemon thread to prevent blocking.
    """
    try:
        group_name = f'notifications_{user_id}'
        t = threading.Thread(
            target=_do_push,
            args=(group_name, {
                'type': 'notification_new',
                'notification': notification_data,
            }),
            daemon=True,
        )
        t.start()
    except Exception as e:
        logger.debug(f"WebSocket push failed for user {user_id}: {e}")


def push_unread_count_to_user(user_id, count):
    """
    Push updated unread count to a specific user via WebSocket.
    Fire-and-forget using a daemon thread to prevent blocking.
    """
    try:
        group_name = f'notifications_{user_id}'
        t = threading.Thread(
            target=_do_push,
            args=(group_name, {
                'type': 'notification_count_update',
                'count': count,
            }),
            daemon=True,
        )
        t.start()
    except Exception as e:
        logger.debug(f"WebSocket count push failed for user {user_id}: {e}")


def _do_send_email(subject, message, recipient_list):
    """Send email in a daemon thread to avoid blocking."""
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipient_list,
            fail_silently=False,
        )
        logger.info(f"Email sent to {recipient_list}: {subject}")
    except Exception as e:
        logger.error(f"Failed to send email to {recipient_list}: {e}")


def _send_threaded(subject, message, recipient_list, blocking=False):
    """Send email, optionally in a daemon thread."""
    full_subject = f"[Parameter] {subject}"
    if blocking:
        _do_send_email(full_subject, message, recipient_list)
    else:
        t = threading.Thread(
            target=_do_send_email,
            args=(full_subject, message, recipient_list),
            daemon=True,
        )
        t.start()


def send_tenant_email(tenant, subject, message, blocking=False):
    """
    Send an email to a RentalTenant.
    Uses a daemon thread by default to prevent blocking the caller.
    """
    if not tenant or not getattr(tenant, 'email', None):
        logger.debug(f"No email for tenant {getattr(tenant, 'name', '?')}, skipping")
        return
    _send_threaded(subject, message, [tenant.email], blocking)


def send_landlord_email(landlord, subject, message, blocking=False):
    """Send an email to a Landlord."""
    if not landlord or not getattr(landlord, 'email', None):
        logger.debug(f"No email for landlord {getattr(landlord, 'name', '?')}, skipping")
        return
    _send_threaded(subject, message, [landlord.email], blocking)


def send_staff_email(subject, message, roles=None, blocking=False):
    """
    Send an email to all active staff members (Admin/Accountant by default).
    Uses daemon threads to prevent blocking.
    """
    try:
        from apps.accounts.models import User
        if roles is None:
            roles = [User.Role.ADMIN, User.Role.ACCOUNTANT]
        staff = User.objects.filter(
            role__in=roles, is_active=True, notifications_enabled=True
        ).values_list('email', flat=True)
        emails = [e for e in staff if e]
        if not emails:
            return
        _send_threaded(subject, message, emails, blocking)
    except Exception as e:
        logger.error(f"Failed to send staff email: {e}")


def send_email(recipient_email, subject, message, blocking=False):
    """Send an email to any single email address."""
    if not recipient_email:
        return
    _send_threaded(subject, message, [recipient_email], blocking)
