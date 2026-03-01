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
        path = request.path
        print(f"[MIDDLEWARE] SubdomainHeader: path={path} host={original_host} X-Tenant-Subdomain={subdomain}")

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
                    print(f"[MIDDLEWARE] Resolved tenant from DB: {schema_name} -> {tenant.name}")
                except TenantModel.DoesNotExist:
                    print(f"[MIDDLEWARE] TENANT NOT FOUND for schema: {schema_name}")
                    _tenant_cache[schema_name] = False
                    return
                except Exception as e:
                    print(f"[MIDDLEWARE] ERROR resolving tenant: {e}")
                    return
            elif tenant is False:
                print(f"[MIDDLEWARE] Cached negative for schema: {schema_name}")
                return
            else:
                print(f"[MIDDLEWARE] Tenant from cache: {schema_name} -> {tenant.name}")

            # Set the tenant on the request
            request.tenant = tenant

            # Build the expected domain for this tenant
            domain_suffix = getattr(settings, 'TENANT_DOMAIN_SUFFIX', 'localhost')
            expected_host = f"{subdomain}.{domain_suffix}"
            request.META['HTTP_HOST'] = expected_host
            print(f"[MIDDLEWARE] Set request.tenant={tenant.schema_name}, Host -> {expected_host}")
        else:
            # No subdomain header — check if the Host already matches a known tenant domain.
            host_without_port = original_host.split(':')[0]
            try:
                from apps.tenants.models import Domain
                if Domain.objects.filter(domain=host_without_port).exists():
                    print(f"[MIDDLEWARE] Host {host_without_port} matches a domain record, letting TenantMainMiddleware handle it")
                    return
            except Exception:
                pass

            print(f"[MIDDLEWARE] No subdomain header and no domain match for {host_without_port}, falling back to public")
            public_tenant = self._get_public_tenant()
            if public_tenant:
                request.tenant = public_tenant
                try:
                    primary_domain = public_tenant.domains.filter(is_primary=True).first()
                    if primary_domain:
                        request.META['HTTP_HOST'] = primary_domain.domain
                        print(f"[MIDDLEWARE] Set public tenant, Host -> {primary_domain.domain}")
                    else:
                        print(f"[MIDDLEWARE] WARNING: public tenant has no primary domain")
                except Exception as e:
                    print(f"[MIDDLEWARE] WARNING: error finding primary domain: {e}")
            else:
                print(f"[MIDDLEWARE] WARNING: no public tenant found!")


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
            print(f"[MIDDLEWARE] SafeTenant: TenantMainMiddleware OK -> schema={db_connection.schema_name}, request.tenant={getattr(request, 'tenant', None)}")
        except Exception as e:
            # If SubdomainHeaderMiddleware already resolved a tenant, use it directly.
            existing_tenant = getattr(request, 'tenant', None)
            if existing_tenant and existing_tenant.schema_name != 'public':
                print(f"[MIDDLEWARE] SafeTenant: TenantMainMiddleware FAILED ({e}), but tenant already resolved to {existing_tenant.schema_name} — calling set_tenant()")
                try:
                    db_connection.set_tenant(existing_tenant)
                    print(f"[MIDDLEWARE] SafeTenant: set_tenant OK -> schema={db_connection.schema_name}")
                    return
                except Exception as e2:
                    print(f"[MIDDLEWARE] SafeTenant: set_tenant FAILED: {e2}")

            print(f"[MIDDLEWARE] SafeTenant: TenantMainMiddleware FAILED ({e}) — falling back to public schema")
            try:
                db_connection.set_schema_to_public()
            except Exception:
                try:
                    with db_connection.cursor() as cursor:
                        cursor.execute("SET search_path TO public")
                except Exception as e2:
                    print(f"[MIDDLEWARE] SafeTenant: Failed to set public schema: {e2}")

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
            print(f"[MIDDLEWARE] SafeTenant: final state -> schema={db_connection.schema_name}, tenant={getattr(request, 'tenant', None)}, urlconf={getattr(request, 'urlconf', 'default')}")


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
        # Log the final schema for every response
        tenant = getattr(request, 'tenant', None)
        print(f"[MIDDLEWARE] Response: {request.method} {request.path} -> {response.status_code} | schema={db_connection.schema_name} | tenant={tenant.schema_name if tenant else 'NONE'}")
        for attr in ('tenant', 'user', 'ip_address', 'user_agent'):
            if hasattr(_thread_locals, attr):
                delattr(_thread_locals, attr)
        return response
