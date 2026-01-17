"""URL routes for accounts."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AuthViewSet, UserViewSet, UserActivityViewSet,
    UserInvitationViewSet, AcceptInvitationView
)

router = DefaultRouter()
router.register('auth', AuthViewSet, basename='auth')
router.register('users', UserViewSet, basename='user')
router.register('activity', UserActivityViewSet, basename='user-activity')
router.register('invitations', UserInvitationViewSet, basename='invitation')

urlpatterns = [
    path('', include(router.urls)),
    path('accept-invitation/', AcceptInvitationView.as_view(), name='accept-invitation'),
]
