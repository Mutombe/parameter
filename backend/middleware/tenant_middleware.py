"""Custom tenant middleware for request context and subdomain routing."""
import threading
import logging
from django.utils.deprecation import MiddlewareMixin
from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponse

_thread_locals = threading.local()
logger = logging.getLogger(__name__)

# In-process tenant cache (survives across requests in the same worker)
_tenant_cache = {}


class SimpleCorsMiddleware(MiddlewareMixin):
    """
    Simple CORS middleware for development.
    Adds CORS headers to all responses.
    """

    def process_request(self, request):
        """Handle preflight OPTIONS requests."""
        if request.method == 'OPTIONS':
            response = HttpResponse()
            response['Access-Control-Allow-Origin'] = request.META.get('HTTP_ORIGIN', '*')
            response['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
            response['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-CSRFToken, X-Tenant-Subdomain, X-Requested-With'
            response['Access-Control-Allow-Credentials'] = 'true'
            response['Access-Control-Max-Age'] = '86400'
            return response
        return None

    def process_response(self, request, response):
        """Add CORS headers to all responses."""
        origin = request.META.get('HTTP_ORIGIN', '*')
        response['Access-Control-Allow-Origin'] = origin
        response['Access-Control-Allow-Credentials'] = 'true'
        response['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-CSRFToken, X-Tenant-Subdomain, X-Requested-With'
        return response


def get_current_tenant():
    """Get the current tenant from thread local storage."""
    return getattr(_thread_locals, 'tenant', None)


def get_current_user():
    """Get the current user from thread local storage."""
    return getattr(_thread_locals, 'user', None)


class SubdomainHeaderMiddleware(MiddlewareMixin):
    """
    Middleware to resolve tenant from X-Tenant-Subdomain header.

    This is used when the frontend and backend are on different domains
    (e.g., frontend on parameter.co.zw, API on parameter-api.onrender.com).

    The frontend sends the subdomain in the X-Tenant-Subdomain header,
    and this middleware sets the tenant on the request before
    TenantMainMiddleware processes it.

    MUST be placed BEFORE TenantMainMiddleware in MIDDLEWARE settings.
    """

    def process_request(self, request):
        """Set tenant from X-Tenant-Subdomain header if present. Uses in-process cache."""
        # Check for the custom subdomain header
        subdomain = request.META.get('HTTP_X_TENANT_SUBDOMAIN')

        if subdomain:
            subdomain = subdomain.lower().strip()
            schema_name = subdomain.replace('-', '_').replace(' ', '_')

            # Check in-process cache first (avoids DB query entirely)
            tenant = _tenant_cache.get(schema_name)
            if tenant is None:
                try:
                    from django_tenants.utils import get_tenant_model
                    TenantModel = get_tenant_model()
                    tenant = TenantModel.objects.get(schema_name=schema_name)
                    _tenant_cache[schema_name] = tenant
                except TenantModel.DoesNotExist:
                    logger.warning(f"Tenant not found for subdomain: {subdomain}")
                    _tenant_cache[schema_name] = False  # Negative cache
                    return
                except Exception as e:
                    logger.error(f"Error resolving tenant from header: {e}")
                    return

            if tenant is False:
                return  # Cached negative result

            # Set the tenant on the request
            request.tenant = tenant

            # Build the expected domain for this tenant
            domain_suffix = getattr(settings, 'TENANT_DOMAIN_SUFFIX', 'localhost')
            expected_host = f"{subdomain}.{domain_suffix}"

            # Override HTTP_HOST so django-tenants can process it correctly
            request.META['HTTP_HOST'] = expected_host


class TenantContextMiddleware(MiddlewareMixin):
    """Middleware to store tenant and user context for audit trails."""

    def process_request(self, request):
        """Store tenant and user in thread local storage."""
        _thread_locals.tenant = getattr(request, 'tenant', None)
        _thread_locals.user = getattr(request, 'user', None)

    def process_response(self, request, response):
        """Clean up thread local storage."""
        if hasattr(_thread_locals, 'tenant'):
            del _thread_locals.tenant
        if hasattr(_thread_locals, 'user'):
            del _thread_locals.user
        return response
