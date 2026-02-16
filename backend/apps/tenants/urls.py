"""URL routes for tenant management."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClientViewSet, GlobalSettingsViewSet,
    SuperAdminDashboardView, TenantDetailStatsView, SystemHealthView,
    PublicHealthCheckView,
    CompanyOnboardingView, SubdomainCheckView, SubscriptionPlansView,
    TenantInvitationViewSet, AcceptTenantInvitationView, DemoSignupView,
    DemoSignupStatusView, ProcessDemoSignupView,
    SeedDemoDataView, CreateDemoTenantView, TenantDebugView
)

router = DefaultRouter()
router.register('clients', ClientViewSet, basename='client')
router.register('settings', GlobalSettingsViewSet, basename='global-settings')
router.register('invitations', TenantInvitationViewSet, basename='tenant-invitation')

urlpatterns = [
    path('', include(router.urls)),
    # Public health check (for Render.com monitoring)
    path('healthz/', PublicHealthCheckView.as_view(), name='public-health-check'),
    # Company Onboarding (Public)
    path('onboarding/', CompanyOnboardingView.as_view(), name='company-onboarding'),
    path('check-subdomain/', SubdomainCheckView.as_view(), name='check-subdomain'),
    path('plans/', SubscriptionPlansView.as_view(), name='subscription-plans'),
    # Invitation-based signup (Public)
    path('accept-invitation/', AcceptTenantInvitationView.as_view(), name='accept-tenant-invitation'),
    path('demo-signup/', DemoSignupView.as_view(), name='demo-signup'),
    path('demo-signup-status/<str:request_id>/', DemoSignupStatusView.as_view(), name='demo-signup-status'),
    path('process-demo-signup/<str:request_id>/', ProcessDemoSignupView.as_view(), name='process-demo-signup'),
    path('seed-demo-data/', SeedDemoDataView.as_view(), name='seed-demo-data'),
    path('create-demo-tenant/', CreateDemoTenantView.as_view(), name='create-demo-tenant'),
    # Debug/diagnostic (temporary - remove after fixing production issue)
    path('debug-info/', TenantDebugView.as_view(), name='tenant-debug-info'),
    # Super Admin Dashboard (Admin only)
    path('dashboard/', SuperAdminDashboardView.as_view(), name='super-admin-dashboard'),
    path('dashboard/<int:tenant_id>/', TenantDetailStatsView.as_view(), name='tenant-detail-stats'),
    path('health/', SystemHealthView.as_view(), name='system-health'),
]
