"""Serializers for notification management."""
from rest_framework import serializers
from .models import Notification, NotificationPreference, MasterfileChangeLog


class NotificationSerializer(serializers.ModelSerializer):
    """Serializer for notifications."""
    time_ago = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            'id', 'notification_type', 'priority', 'title', 'message',
            'data', 'is_read', 'read_at', 'created_at', 'time_ago'
        ]
        read_only_fields = ['id', 'created_at', 'time_ago']

    def get_time_ago(self, obj):
        """Get human-readable time ago string."""
        from django.utils import timezone
        from datetime import timedelta

        now = timezone.now()
        diff = now - obj.created_at

        if diff < timedelta(minutes=1):
            return 'Just now'
        elif diff < timedelta(hours=1):
            mins = int(diff.total_seconds() / 60)
            return f'{mins} minute{"s" if mins > 1 else ""} ago'
        elif diff < timedelta(days=1):
            hours = int(diff.total_seconds() / 3600)
            return f'{hours} hour{"s" if hours > 1 else ""} ago'
        elif diff < timedelta(days=7):
            days = diff.days
            return f'{days} day{"s" if days > 1 else ""} ago'
        else:
            return obj.created_at.strftime('%b %d, %Y')


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    """Serializer for notification preferences."""

    class Meta:
        model = NotificationPreference
        fields = [
            'email_masterfile_changes', 'email_invoice_alerts',
            'email_payment_received', 'email_lease_alerts', 'email_system_alerts',
            'email_rental_due', 'email_late_penalty',
            'push_masterfile_changes', 'push_invoice_alerts',
            'push_payment_received', 'push_lease_alerts', 'push_system_alerts',
            'push_rental_due', 'push_late_penalty',
            'daily_digest', 'digest_time'
        ]


class MasterfileChangeLogSerializer(serializers.ModelSerializer):
    """Serializer for masterfile change log."""

    class Meta:
        model = MasterfileChangeLog
        fields = [
            'id', 'entity_type', 'entity_id', 'entity_name',
            'change_type', 'changes', 'changed_by_email', 'created_at'
        ]
        read_only_fields = fields


class MarkReadSerializer(serializers.Serializer):
    """Serializer for marking notifications as read."""
    notification_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False
    )
    mark_all = serializers.BooleanField(default=False)
