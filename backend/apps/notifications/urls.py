"""URL configuration for notifications app."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    NotificationViewSet,
    NotificationPreferenceViewSet,
    MasterfileChangeLogViewSet
)

router = DefaultRouter()
router.register('notifications', NotificationViewSet, basename='notification')
router.register('preferences', NotificationPreferenceViewSet, basename='notification-preference')
router.register('changelog', MasterfileChangeLogViewSet, basename='masterfile-changelog')

urlpatterns = [
    path('', include(router.urls)),
]
