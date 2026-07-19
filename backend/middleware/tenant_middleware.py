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
        subdomain = request.META.get('HTTP_X_TENANT_SUBDOMAIN')
        original_host = request.META.get('HTTP_HOST', '')

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
                    logger.warning("Tenant not found for schema %s", schema_name)
                    _tenant_cache[schema_name] = False
                    return
                except Exception as e:
                    logger.error("Error resolving tenant for schema %s: %s", schema_name, e)
                    return
            elif tenant is False:
                return

            # Set the tenant on the request
            request.tenant = tenant

            # Build the expected domain for this tenant
            domain_suffix = getattr(settings, 'TENANT_DOMAIN_SUFFIX', 'localhost')
            expected_host = f"{subdomain}.{domain_suffix}"
            request.META['HTTP_HOST'] = expected_host
        else:
            # No subdomain header — check if the Host already matches a known tenant domain.
            host_without_port = original_host.split(':')[0]
            try:
                from apps.tenants.models import Domain
                if Domain.objects.filter(domain=host_without_port).exists():
                    return
            except Exception:
                pass

            public_tenant = self._get_public_tenant()
            if public_tenant:
                request.tenant = public_tenant
                try:
                    primary_domain = public_tenant.domains.filter(is_primary=True).first()
                    if primary_domain:
                        request.META['HTTP_HOST'] = primary_domain.domain
                    else:
                        logger.warning("Public tenant has no primary domain")
                except Exception as e:
                    logger.warning("Error finding primary public domain: %s", e)
            else:
                logger.warning("No public tenant found!")


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
            # If SubdomainHeaderMiddleware already resolved a tenant, use it directly.
            existing_tenant = getattr(request, 'tenant', None)
            if existing_tenant and existing_tenant.schema_name != 'public':
                logger.warning(
                    "TenantMainMiddleware failed (%s); falling back to set_tenant(%s)",
                    e, existing_tenant.schema_name,
                )
                try:
                    db_connection.set_tenant(existing_tenant)
                    return
                except Exception as e2:
                    logger.error("set_tenant fallback failed: %s", e2)

            logger.warning("TenantMainMiddleware failed (%s); falling back to public schema", e)
            try:
                db_connection.set_schema_to_public()
            except Exception:
                try:
                    with db_connection.cursor() as cursor:
                        cursor.execute("SET search_path TO public")
                except Exception as e2:
                    logger.error("Failed to set public schema: %s", e2)

            if not getattr(request, 'tenant', None):
                try:
                    from django_tenants.utils import get_tenant_model
                    TenantModel = get_tenant_model()
                    public_tenant = TenantModel.objects.filter(schema_name='public').first()
                    if public_tenant:
                        request.tenant = public_tenant
                except Exception:
                    pass

            request.urlconf = getattr(settings, 'PUBLIC_SCHEMA_URLCONF', settings.ROOT_URLCONF)


class TenantUserEnforcementMiddleware(MiddlewareMixin):
    """
    Pin every authenticated request to the user's OWN tenant schema.

    Users live in the shared (public) schema, so a session cookie is valid
    no matter which X-Tenant-Subdomain header the browser sends. Without
    this guard, a stale header (browser previously logged into another
    tenant) — or a deliberately edited one — routes an authenticated user
    into a tenant they don't belong to and exposes that tenant's data.

    If the authenticated user has a tenant_schema and the request resolved
    to a different schema, the connection is switched to the user's tenant.
    Superusers and users without a tenant_schema (platform/public accounts)
    are left untouched.

    MUST be placed AFTER AuthenticationMiddleware (needs request.user) and
    BEFORE TenantContextMiddleware (so audit thread-locals see the final
    tenant).
    """

    def process_request(self, request):
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated:
            return
        if getattr(user, 'is_superuser', False):
            return
        schema = (getattr(user, 'tenant_schema', '') or '').strip()
        if not schema or schema == 'public':
            return
        if db_connection.schema_name == schema:
            return

        tenant = _tenant_cache.get(schema)
        if tenant is None:
            try:
                from django_tenants.utils import get_tenant_model
                TenantModel = get_tenant_model()
                tenant = TenantModel.objects.filter(schema_name=schema).first()
                _tenant_cache[schema] = tenant or False
            except Exception as e:
                logger.error("Enforcement: error resolving tenant %s: %s", schema, e)
                return
        if not tenant:
            logger.error("Enforcement: user %s has tenant_schema=%r but no such tenant",
                         getattr(user, 'email', user.pk), schema)
            return

        logger.warning(
            "Enforcement: request for user %s arrived on schema %r; pinning to %r",
            getattr(user, 'email', user.pk), db_connection.schema_name, schema,
        )
        try:
            db_connection.set_tenant(tenant)
            request.tenant = tenant
        except Exception as e:
            logger.error("Enforcement: set_tenant(%s) failed: %s", schema, e)


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
