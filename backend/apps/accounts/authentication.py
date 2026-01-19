"""Custom authentication classes."""
from rest_framework.authentication import SessionAuthentication


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """
    Session authentication without CSRF enforcement.

    Used for cross-origin API requests where the frontend and backend
    are on different domains (e.g., subdomain.parameter.co.zw and
    parameter-backend.onrender.com).

    Security is maintained through:
    - CORS restrictions (only allowed origins can make requests)
    - Session cookies with SameSite=None and Secure=True
    - HTTPS only in production
    """

    def enforce_csrf(self, request):
        """Skip CSRF check for API requests."""
        return None
