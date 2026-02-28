"""Rate limiting throttle classes for sensitive operations."""
from rest_framework.throttling import ScopedRateThrottle


class LoginThrottle(ScopedRateThrottle):
    scope = 'login'


class PasswordResetThrottle(ScopedRateThrottle):
    scope = 'password_reset'


class BulkOperationThrottle(ScopedRateThrottle):
    scope = 'bulk'


class FileUploadThrottle(ScopedRateThrottle):
    scope = 'upload'


class InvoiceGenerationThrottle(ScopedRateThrottle):
    scope = 'invoice_gen'
