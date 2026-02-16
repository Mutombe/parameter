"""Utility functions for pushing notifications via WebSocket."""
import logging
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

logger = logging.getLogger(__name__)


def push_notification_to_user(user_id, notification_data):
    """
    Push a notification to a specific user via WebSocket.

    Args:
        user_id: The user's ID
        notification_data: Dict with notification info (id, title, message, type, etc.)
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        group_name = f'notifications_{user_id}'
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                'type': 'notification_new',
                'notification': notification_data,
            }
        )
    except Exception as e:
        logger.debug(f"WebSocket push failed for user {user_id}: {e}")


def push_unread_count_to_user(user_id, count):
    """
    Push updated unread count to a specific user via WebSocket.

    Args:
        user_id: The user's ID
        count: The new unread notification count
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        group_name = f'notifications_{user_id}'
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                'type': 'notification_count_update',
                'count': count,
            }
        )
    except Exception as e:
        logger.debug(f"WebSocket count push failed for user {user_id}: {e}")
