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
        logger.info(f"Tenant email sent to {recipient_list}: {subject}")
    except Exception as e:
        logger.error(f"Failed to send tenant email to {recipient_list}: {e}")


def send_tenant_email(tenant, subject, message, blocking=False):
    """
    Send an email to a RentalTenant.
    Uses a daemon thread by default to prevent blocking the caller.

    Args:
        tenant: RentalTenant instance (must have .email and .name)
        subject: Email subject line
        message: Plain-text email body
        blocking: If True, send synchronously instead of in a thread
    """
    if not tenant or not getattr(tenant, 'email', None):
        logger.debug(f"No email for tenant {getattr(tenant, 'name', '?')}, skipping")
        return

    full_subject = f"[Parameter] {subject}"

    if blocking:
        _do_send_email(full_subject, message, [tenant.email])
    else:
        t = threading.Thread(
            target=_do_send_email,
            args=(full_subject, message, [tenant.email]),
            daemon=True,
        )
        t.start()
