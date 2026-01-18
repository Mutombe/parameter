"""URL configuration for public schema."""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.views.static import serve
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


# Stub endpoints for public schema (notifications don't exist in public schema)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notifications_unread_count(request):
    """Return empty count for public schema."""
    return Response({'unread_count': 0})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notifications_recent(request):
    """Return empty notifications for public schema."""
    return Response({'notifications': [], 'unread_count': 0})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notifications_list(request):
    """Return empty notifications list for public schema."""
    return Response({'results': [], 'count': 0})


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/tenants/', include('apps.tenants.urls')),
    path('api/accounts/', include('apps.accounts.urls')),  # Auth for login
    # Stub notifications endpoints for public schema
    path('api/notifications/notifications/unread_count/', notifications_unread_count, name='notifications-unread-count'),
    path('api/notifications/notifications/recent/', notifications_recent, name='notifications-recent'),
    path('api/notifications/notifications/', notifications_list, name='notifications-list'),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
]

# Serve media files in development (public schema)
if settings.DEBUG:
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    ]
