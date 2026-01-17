"""URL routes for tenant management."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClientViewSet, GlobalSettingsViewSet,
    SuperAdminDashboardView, TenantDetailStatsView, SystemHealthView,
    CompanyOnboardingView, SubdomainCheckView, SubscriptionPlansView,
    TenantInvitationViewSet, AcceptTenantInvitationView, DemoSignupView
)

router = DefaultRouter()
router.register('clients', ClientViewSet, basename='client')
router.register('settings', GlobalSettingsViewSet, basename='global-settings')
router.register('invitations', TenantInvitationViewSet, basename='tenant-invitation')

urlpatterns = [
    path('', include(router.urls)),
    # Company Onboarding (Public)
    path('onboarding/', CompanyOnboardingView.as_view(), name='company-onboarding'),
    path('check-subdomain/', SubdomainCheckView.as_view(), name='check-subdomain'),
    path('plans/', SubscriptionPlansView.as_view(), name='subscription-plans'),
    # Invitation-based signup (Public)
    path('accept-invitation/', AcceptTenantInvitationView.as_view(), name='accept-tenant-invitation'),
    path('demo-signup/', DemoSignupView.as_view(), name='demo-signup'),
    # Super Admin Dashboard (Admin only)
    path('dashboard/', SuperAdminDashboardView.as_view(), name='super-admin-dashboard'),
    path('dashboard/<int:tenant_id>/', TenantDetailStatsView.as_view(), name='tenant-detail-stats'),
    path('health/', SystemHealthView.as_view(), name='system-health'),
]
