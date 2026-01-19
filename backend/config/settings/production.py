"""
Production settings for Render.com deployment.
"""
from .base import *

# Security settings for production
DEBUG = False

# Allow Render's domain and your custom domains (including wildcard subdomains)
ALLOWED_HOSTS = config(
    'ALLOWED_HOSTS',
    default='.onrender.com,.parameter.co.zw,parameter.co.zw',
    cast=Csv()
)

# Production Tenant Domain Configuration
TENANT_DOMAIN_SUFFIX = config('TENANT_DOMAIN_SUFFIX', default='parameter.co.zw')
TENANT_FRONTEND_PORT = ''  # No port in production (standard HTTPS port 443)
TENANT_PROTOCOL = 'https'

# Force HTTPS in production
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=True, cast=bool)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True

# CORS settings for production
# Use regex to allow all subdomains of parameter.co.zw and Render domains
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://[\w-]+\.parameter\.co\.zw$",  # Allow all subdomains
    r"^https://parameter\.co\.zw$",  # Main domain
    r"^https://www\.parameter\.co\.zw$",  # www subdomain
    r"^https://[\w-]+\.onrender\.com$",  # Allow Render domains for staging/testing
]
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='https://parameter.co.zw,https://www.parameter.co.zw,https://parameter-frontend.onrender.com',
    cast=Csv()
)
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]
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
    'x-tenant-subdomain',  # Custom header for multi-tenant subdomain routing
]

# CSRF trusted origins for production (supports wildcard subdomains)
CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS',
    default='https://*.parameter.co.zw,https://parameter.co.zw,https://www.parameter.co.zw,https://*.onrender.com,https://parameter-frontend.onrender.com',
    cast=Csv()
)

# Session cookie settings
SESSION_COOKIE_SAMESITE = 'None'  # Required for cross-site cookies
CSRF_COOKIE_SAMESITE = 'None'

# Static files
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Logging configuration for production
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
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
            'level': config('DJANGO_LOG_LEVEL', default='INFO'),
            'propagate': False,
        },
        'apps': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# Cache configuration - use database cache (no Redis dependency)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.db.DatabaseCache',
        'LOCATION': 'django_cache_table',
    }
}

# Email configuration for production
EMAIL_BACKEND = config('EMAIL_BACKEND', default='django.core.mail.backends.smtp.EmailBackend')
