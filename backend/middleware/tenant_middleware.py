"""Custom tenant middleware for request context."""
import threading
from django.utils.deprecation import MiddlewareMixin

_thread_locals = threading.local()


def get_current_tenant():
    """Get the current tenant from thread local storage."""
    return getattr(_thread_locals, 'tenant', None)


def get_current_user():
    """Get the current user from thread local storage."""
    return getattr(_thread_locals, 'user', None)


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
