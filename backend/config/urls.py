"""URL configuration for tenant schemas."""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from django.http import JsonResponse
from django.db import connection
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def health_check(request):
    """Health check endpoint for load balancers and monitoring."""
    try:
        connection.ensure_connection()
        return JsonResponse({'status': 'healthy', 'database': 'ok'})
    except Exception as e:
        return JsonResponse({'status': 'unhealthy', 'database': str(e)}, status=503)


def debug_tenant(request):
    """Debug endpoint: show current tenant routing state. Remove after debugging."""
    from apps.tenants.models import Domain
    all_domains = list(Domain.objects.values_list('domain', 'tenant__schema_name', 'is_primary'))
    return JsonResponse({
        'db_schema': connection.schema_name,
        'request_tenant': str(getattr(request, 'tenant', None)),
        'request_tenant_schema': getattr(getattr(request, 'tenant', None), 'schema_name', None),
        'http_host': request.META.get('HTTP_HOST', ''),
        'x_tenant_subdomain': request.META.get('HTTP_X_TENANT_SUBDOMAIN', ''),
        'user': str(request.user),
        'user_tenant_schema': getattr(request.user, 'tenant_schema', None) if hasattr(request.user, 'tenant_schema') else 'N/A',
        'urlconf': getattr(request, 'urlconf', 'default'),
        'all_domains': all_domains,
    })


urlpatterns = [
    path('api/debug-tenant/', debug_tenant, name='debug-tenant'),
    path('health/', health_check, name='health-check'),
    path('admin/', admin.site.urls),
    path('api/tenants/', include('apps.tenants.urls')),  # Super Admin dashboard & tenant management
    path('api/accounts/', include('apps.accounts.urls')),
    path('api/accounting/', include('apps.accounting.urls')),
    path('api/masterfile/', include('apps.masterfile.urls')),
    path('api/billing/', include('apps.billing.urls')),
    path('api/reports/', include('apps.reports.urls')),
    path('api/ai/', include('apps.ai_service.urls')),
    path('api/notifications/', include('apps.notifications.urls')),
    path('api/search/', include('apps.search.urls')),  # Unified search API
    path('api/imports/', include('apps.imports.urls')),  # Data import from CSV/Excel
    path('api/trash/', include('apps.trash.urls')),  # Soft-delete trash management
    path('api/maintenance/', include('apps.maintenance.urls')),  # Maintenance requests
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
]

# Serve media files - use explicit view to work with django-tenants
# Note: Always serve media files regardless of DEBUG mode for avatar uploads to work in production
# For better performance in high-traffic production, consider using cloud storage (S3/Cloudinary)
urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]
