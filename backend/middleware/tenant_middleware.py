"""Custom tenant middleware for request context and subdomain routing."""
import threading
import logging
from django.db import connection as db_connection
from django.utils.deprecation import MiddlewareMixin
from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponse, JsonResponse

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


def get_current_request_meta():
    """Get the current request's IP address and user agent from thread local storage."""
    return {
        'ip_address': getattr(_thread_locals, 'ip_address', None),
        'user_agent': getattr(_thread_locals, 'user_agent', ''),
    }


class SubdomainHeaderMiddleware(MiddlewareMixin):
    """
    Middleware to resolve tenant from X-Tenant-Subdomain header.

    This is used when the frontend and backend are on different domains
    (e.g., frontend on parameter.co.zw, API on parameter-api.onrender.com).

    The frontend sends the subdomain in the X-Tenant-Subdomain header,
    and this middleware sets the tenant on the request before
    TenantMainMiddleware processes it.

    When NO subdomain header is present, falls back to the public tenant
    so that public API endpoints (signup, health check, etc.) work correctly.

    MUST be placed BEFORE TenantMainMiddleware in MIDDLEWARE settings.
    """

    def _get_public_tenant(self):
        """Get the public tenant, using in-process cache."""
        tenant = _tenant_cache.get('__public__')
        if tenant is None:
            try:
                from django_tenants.utils import get_tenant_model
                TenantModel = get_tenant_model()
                tenant = TenantModel.objects.filter(schema_name='public').first()
                _tenant_cache['__public__'] = tenant or False
            except Exception as e:
                logger.error(f"Error fetching public tenant: {e}")
                _tenant_cache['__public__'] = False
                return None
        return tenant if tenant is not False else None

    def process_request(self, request):
        """Set tenant from X-Tenant-Subdomain header if present. Uses in-process cache."""
        # Check for the custom subdomain header
        subdomain = request.META.get('HTTP_X_TENANT_SUBDOMAIN')
        original_host = request.META.get('HTTP_HOST', '')
        logger.debug(f"SubdomainHeaderMiddleware: host={original_host}, subdomain_header={subdomain}")

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
        else:
            # No subdomain header — check if the Host already matches a known tenant domain.
            # If so, let TenantMainMiddleware resolve it. Only fall back to public
            # for unrecognized hosts (e.g., parameter-backend.onrender.com).
            host_without_port = original_host.split(':')[0]
            try:
                from apps.tenants.models import Domain
                if Domain.objects.filter(domain=host_without_port).exists():
                    logger.debug(f"SubdomainHeaderMiddleware: host {host_without_port} matches a domain, letting TenantMainMiddleware handle it")
                    return
            except Exception:
                pass

            public_tenant = self._get_public_tenant()
            if public_tenant:
                request.tenant = public_tenant
                # Find the primary domain for the public tenant
                try:
                    primary_domain = public_tenant.domains.filter(is_primary=True).first()
                    if primary_domain:
                        request.META['HTTP_HOST'] = primary_domain.domain
                        logger.debug(f"SubdomainHeaderMiddleware: set public tenant, host -> {primary_domain.domain}")
                    else:
                        logger.warning(f"SubdomainHeaderMiddleware: public tenant has no primary domain")
                except Exception as e:
                    logger.warning(f"SubdomainHeaderMiddleware: error finding primary domain: {e}")
            else:
                logger.warning(f"SubdomainHeaderMiddleware: no public tenant found, host={original_host}")


class SafeTenantMiddleware(MiddlewareMixin):
    """
    Safe wrapper around django-tenants' TenantMainMiddleware.

    If TenantMainMiddleware fails to resolve a tenant (e.g. missing Domain
    records, DB issues), this catches the error and manually sets the
    connection to the public schema so views can still handle the request.
    """

    def process_request(self, request):
        from django_tenants.middleware.main import TenantMainMiddleware

        try:
            mw = TenantMainMiddleware(lambda r: None)
            mw.process_request(request)
        except Exception as e:
            # If SubdomainHeaderMiddleware already resolved a tenant (e.g. via
            # X-Tenant-Subdomain header), use that tenant's schema directly.
            # This handles the case where the Domain record doesn't match the
            # constructed hostname (e.g. domain is demo.localhost but host was
            # rewritten to demo.parameter.co.zw).
            existing_tenant = getattr(request, 'tenant', None)
            if existing_tenant and existing_tenant.schema_name != 'public':
                logger.info(
                    f"TenantMainMiddleware failed ({e}), but tenant already "
                    f"resolved to {existing_tenant.schema_name} — using it"
                )
                try:
                    db_connection.set_tenant(existing_tenant)
                    return
                except Exception as e2:
                    logger.error(f"Failed to set tenant {existing_tenant.schema_name}: {e2}")

            logger.error(f"TenantMainMiddleware failed: {e} — falling back to public schema")
            # Manually set the connection to public schema
            try:
                db_connection.set_schema_to_public()
            except Exception:
                try:
                    with db_connection.cursor() as cursor:
                        cursor.execute("SET search_path TO public")
                except Exception as e2:
                    logger.error(f"Failed to set public schema: {e2}")

            # Try to set a public tenant on the request
            if not getattr(request, 'tenant', None):
                try:
                    from django_tenants.utils import get_tenant_model
                    TenantModel = get_tenant_model()
                    public_tenant = TenantModel.objects.filter(schema_name='public').first()
                    if public_tenant:
                        request.tenant = public_tenant
                except Exception:
                    pass

            # Set the URL conf to public schema URLs
            request.urlconf = getattr(settings, 'PUBLIC_SCHEMA_URLCONF', settings.ROOT_URLCONF)


class TenantContextMiddleware(MiddlewareMixin):
    """Middleware to store tenant, user, and request metadata for audit trails."""

    def _get_client_ip(self, request):
        """Extract the client IP address from the request."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')

    def process_request(self, request):
        """Store tenant, user, IP, and user agent in thread local storage."""
        _thread_locals.tenant = getattr(request, 'tenant', None)
        _thread_locals.user = getattr(request, 'user', None)
        _thread_locals.ip_address = self._get_client_ip(request)
        _thread_locals.user_agent = request.META.get('HTTP_USER_AGENT', '')

    def process_response(self, request, response):
        """Clean up thread local storage."""
        for attr in ('tenant', 'user', 'ip_address', 'user_agent'):
            if hasattr(_thread_locals, attr):
                delattr(_thread_locals, attr)
        return response
