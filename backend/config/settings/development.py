"""Development settings."""
from .base import *

DEBUG = True

ALLOWED_HOSTS = ['*', 'localhost', '127.0.0.1', '.localhost']

# Force a fresh DB connection on every request locally. With CONN_MAX_AGE
# > 0, django-tenants occasionally reuses a connection whose search_path
# was set to a different schema (or to public), producing intermittent
# `relation X does not exist` errors that look random. CONN_MAX_AGE=0
# kills the reuse and the tenant schema is set fresh on every request.
DATABASES['default']['CONN_MAX_AGE'] = 0

# Allow all origins in development - override base.py settings
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOWED_ORIGINS = []  # Clear the whitelist when allowing all
CORS_ALLOW_CREDENTIALS = True

# Additional CORS settings for subdomains
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
    'x-tenant-subdomain',
]

CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]

# Allow CORS for regex patterns (subdomains)
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://\w+\.localhost:\d+$",  # any subdomain.localhost:port
]

# Session cookie settings for cross-subdomain authentication
SESSION_COOKIE_DOMAIN = '.localhost'  # Allow cookie sharing across *.localhost
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_DOMAIN = '.localhost'
CSRF_COOKIE_SAMESITE = 'Lax'

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'apps': {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}
