"""WebSocket consumer for real-time notifications."""
import json
import logging
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async

logger = logging.getLogger(__name__)


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """WebSocket consumer for pushing notifications to users in real-time."""

    async def connect(self):
        """Handle WebSocket connection."""
        self.user = self.scope.get('user')

        if not self.user or self.user.is_anonymous:
            await self.close()
            return

        self.group_name = f'notifications_{self.user.id}'

        # Join user's notification group
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )

        await self.accept()

        # Send current unread count on connect
        unread_count = await self.get_unread_count()
        await self.send_json({
            'type': 'unread_count',
            'count': unread_count,
        })

    async def disconnect(self, close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name
            )

    async def receive_json(self, content):
        """Handle incoming WebSocket messages."""
        action = content.get('action')

        if action == 'mark_read':
            notification_id = content.get('notification_id')
            if notification_id:
                await self.mark_notification_read(notification_id)
                unread_count = await self.get_unread_count()
                await self.send_json({
                    'type': 'unread_count',
                    'count': unread_count,
                })

    async def notification_new(self, event):
        """Forward new notification to WebSocket client."""
        await self.send_json({
            'type': 'new_notification',
            'notification': event['notification'],
        })

    async def notification_count_update(self, event):
        """Forward count update to WebSocket client."""
        await self.send_json({
            'type': 'unread_count',
            'count': event['count'],
        })

    @database_sync_to_async
    def get_unread_count(self):
        """Get the user's unread notification count."""
        from apps.notifications.models import Notification
        return Notification.objects.filter(
            user=self.user, is_read=False
        ).count()

    @database_sync_to_async
    def mark_notification_read(self, notification_id):
        """Mark a specific notification as read."""
        from apps.notifications.models import Notification
        Notification.objects.filter(
            id=notification_id, user=self.user
        ).update(is_read=True)
