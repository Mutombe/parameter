"""Views for notification management."""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from .models import Notification, NotificationPreference, MasterfileChangeLog
from .serializers import (
    NotificationSerializer, NotificationPreferenceSerializer,
    MasterfileChangeLogSerializer, MarkReadSerializer
)


class NotificationViewSet(viewsets.ModelViewSet):
    """Manage user notifications."""
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Get notifications for current user only."""
        queryset = Notification.objects.filter(user=self.request.user)

        # Filter by read status
        is_read = self.request.query_params.get('is_read')
        if is_read is not None:
            queryset = queryset.filter(is_read=is_read.lower() == 'true')

        # Filter by type
        notification_type = self.request.query_params.get('type')
        if notification_type:
            queryset = queryset.filter(notification_type=notification_type)

        return queryset.order_by('-created_at')

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        """Get count of unread notifications."""
        count = Notification.objects.filter(
            user=request.user,
            is_read=False
        ).count()
        return Response({'unread_count': count})

    @action(detail=False, methods=['post'])
    def mark_read(self, request):
        """Mark notifications as read."""
        serializer = MarkReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data.get('mark_all'):
            # Mark all as read
            updated = Notification.objects.filter(
                user=request.user,
                is_read=False
            ).update(is_read=True, read_at=timezone.now())
        else:
            # Mark specific IDs
            notification_ids = serializer.validated_data.get('notification_ids', [])
            updated = Notification.objects.filter(
                user=request.user,
                id__in=notification_ids,
                is_read=False
            ).update(is_read=True, read_at=timezone.now())

        return Response({'marked_read': updated})

    @action(detail=True, methods=['post'])
    def read(self, request, pk=None):
        """Mark a single notification as read."""
        notification = self.get_object()
        notification.mark_as_read()
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=['delete'])
    def clear_all(self, request):
        """Delete all read notifications for the user."""
        deleted, _ = Notification.objects.filter(
            user=request.user,
            is_read=True
        ).delete()
        return Response({'deleted': deleted})

    @action(detail=False, methods=['get'])
    def recent(self, request):
        """Get recent notifications (last 10)."""
        notifications = self.get_queryset()[:10]
        serializer = self.get_serializer(notifications, many=True)
        unread_count = Notification.objects.filter(
            user=request.user,
            is_read=False
        ).count()
        return Response({
            'notifications': serializer.data,
            'unread_count': unread_count
        })


class NotificationPreferenceViewSet(viewsets.ViewSet):
    """Manage notification preferences."""
    permission_classes = [IsAuthenticated]

    def list(self, request):
        """Get user's notification preferences."""
        prefs, created = NotificationPreference.objects.get_or_create(
            user=request.user
        )
        serializer = NotificationPreferenceSerializer(prefs)
        return Response(serializer.data)

    def create(self, request):
        """Update notification preferences."""
        prefs, created = NotificationPreference.objects.get_or_create(
            user=request.user
        )
        serializer = NotificationPreferenceSerializer(prefs, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class MasterfileChangeLogViewSet(viewsets.ReadOnlyModelViewSet):
    """View masterfile change history."""
    serializer_class = MasterfileChangeLogSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['entity_type', 'change_type', 'changed_by']
    search_fields = ['entity_name', 'changed_by_email']

    def get_queryset(self):
        queryset = MasterfileChangeLog.objects.all()

        # Filter by entity
        entity_type = self.request.query_params.get('entity_type')
        entity_id = self.request.query_params.get('entity_id')

        if entity_type:
            queryset = queryset.filter(entity_type=entity_type)
        if entity_id:
            queryset = queryset.filter(entity_id=entity_id)

        return queryset.order_by('-created_at')

    @action(detail=False, methods=['get'])
    def for_entity(self, request):
        """Get change history for a specific entity."""
        entity_type = request.query_params.get('entity_type')
        entity_id = request.query_params.get('entity_id')

        if not entity_type or not entity_id:
            return Response(
                {'error': 'entity_type and entity_id are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        logs = MasterfileChangeLog.objects.filter(
            entity_type=entity_type,
            entity_id=entity_id
        ).order_by('-created_at')

        serializer = self.get_serializer(logs, many=True)
        return Response(serializer.data)
