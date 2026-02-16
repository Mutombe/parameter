"""Utility functions for pushing notifications via WebSocket."""
import logging
import threading

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
