"""
Django base settings for Real Estate Accounting System.
Multi-tenant SaaS with Double-Entry Accounting.
"""
import os
from pathlib import Path
from decouple import config, Csv
import os
from dotenv import load_dotenv
from urllib.parse import urlparse, parse_qsl

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = config('SECRET_KEY', default='django-insecure-change-me-in-production-xyz123')

DEBUG = config('DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1,.localhost', cast=Csv())

# Multi-tenancy: Shared apps (public schema)
SHARED_APPS = [
    'daphne',  # ASGI server - must be before django.contrib.staticfiles
    'django_tenants',
    'apps.tenants',
    'django.contrib.contenttypes',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'django_filters',
    'drf_spectacular',
    'django_q',  # Database-based task queue
    'channels',  # WebSocket support
    'storages',  # django-storages for S3/DO Spaces
    'apps.accounts',  # User model must be in shared apps
]

# Multi-tenancy: Tenant-specific apps
TENANT_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'django.contrib.postgres',  # PostgreSQL full-text search
    'apps.accounting',
    'apps.masterfile',
    'apps.billing',
    'apps.reports',
    'apps.ai_service',
    'apps.notifications',
    'apps.search',  # Unified search API
    'apps.imports',  # Data import from CSV/Excel
    'apps.trash',  # Soft-delete trash management
]

INSTALLED_APPS = list(SHARED_APPS) + [app for app in TENANT_APPS if app not in SHARED_APPS]

TENANT_MODEL = "tenants.Client"
TENANT_DOMAIN_MODEL = "tenants.Domain"
PUBLIC_SCHEMA_NAME = 'public'
SHOW_PUBLIC_IF_NO_TENANT_FOUND = True  # Serve public schema for unknown domains

# Tenant Domain Configuration
# Development: localhost, Production: parameter.co.zw
TENANT_DOMAIN_SUFFIX = config('TENANT_DOMAIN_SUFFIX', default='localhost')
TENANT_FRONTEND_PORT = config('TENANT_FRONTEND_PORT', default='5173')
TENANT_PROTOCOL = config('TENANT_PROTOCOL', default='http')

def get_tenant_url(subdomain):
    """Build full tenant URL based on environment configuration."""
    if TENANT_FRONTEND_PORT and TENANT_DOMAIN_SUFFIX == 'localhost':
        return f"{TENANT_PROTOCOL}://{subdomain}.{TENANT_DOMAIN_SUFFIX}:{TENANT_FRONTEND_PORT}"
    return f"{TENANT_PROTOCOL}://{subdomain}.{TENANT_DOMAIN_SUFFIX}"

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # django-cors-headers - must be first
    'middleware.tenant_middleware.SubdomainHeaderMiddleware',  # Handle X-Tenant-Subdomain header
    'middleware.tenant_middleware.SafeTenantMiddleware',  # Safe wrapper around TenantMainMiddleware
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'middleware.tenant_middleware.TenantContextMiddleware',
]

ROOT_URLCONF = 'config.urls'
PUBLIC_SCHEMA_URLCONF = 'config.urls_public'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# Channel Layers (WebSocket support)
# Use Redis channel layer if REDIS_URL is configured, otherwise fall back to InMemory
REDIS_URL = config('REDIS_URL', default='')

if REDIS_URL:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {
                'hosts': [REDIS_URL],
                'capacity': 1500,
                'expiry': 10,
            },
        }
    }
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        }
    }

# Database - PostgreSQL with django-tenants
# Add these at the top of your settings.py


# Replace the DATABASES section of your settings.py with this
tmpPostgres = urlparse(os.getenv("DATABASE_URL"))

DATABASES = {
    'default': {
        'ENGINE': 'django_tenants.postgresql_backend',
        'NAME': tmpPostgres.path.replace('/', ''),
        'USER': tmpPostgres.username,
        'PASSWORD': tmpPostgres.password,
        'HOST': tmpPostgres.hostname,
        'PORT': 5432,
        'OPTIONS': dict(parse_qsl(tmpPostgres.query)),
        'CONN_MAX_AGE': 600,  # Reuse DB connections for 10 minutes
        'CONN_HEALTH_CHECKS': True,  # Verify connection before reuse
    }
}

DATABASE_ROUTERS = ('django_tenants.routers.TenantSyncRouter',)

# Cache — use Redis if available, otherwise LocMemCache
if REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': REDIS_URL,
            'TIMEOUT': 300,  # 5 minutes default
            'OPTIONS': {
                'db': 1,
            },
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'parameter-cache',
            'TIMEOUT': 300,  # 5 minutes default
        }
    }

AUTH_USER_MODEL = 'accounts.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Africa/Harare'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# DigitalOcean Spaces (S3-compatible) media storage
# When configured, all media uploads (lease documents, etc.) are stored in DO Spaces
AWS_ACCESS_KEY_ID = config('AWS_ACCESS_KEY_ID', default='')
AWS_SECRET_ACCESS_KEY = config('AWS_SECRET_ACCESS_KEY', default='')
AWS_STORAGE_BUCKET_NAME = config('AWS_STORAGE_BUCKET_NAME', default='')
AWS_S3_ENDPOINT_URL = config('AWS_S3_ENDPOINT_URL', default='')
AWS_S3_CUSTOM_DOMAIN = config('AWS_S3_CUSTOM_DOMAIN', default='')
AWS_S3_REGION_NAME = config('AWS_S3_REGION_NAME', default='sgp1')
AWS_S3_OBJECT_PARAMETERS = {
    'CacheControl': 'max-age=86400',
}
AWS_DEFAULT_ACL = 'public-read'
AWS_LOCATION = 'media'
AWS_QUERYSTRING_AUTH = False  # Use public URLs (no signed URLs)

# Only use S3 storage if credentials are configured
if AWS_ACCESS_KEY_ID and AWS_STORAGE_BUCKET_NAME:
    DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
    MEDIA_URL = f'https://{AWS_S3_CUSTOM_DOMAIN}/{AWS_LOCATION}/' if AWS_S3_CUSTOM_DOMAIN else f'{AWS_S3_ENDPOINT_URL}/{AWS_STORAGE_BUCKET_NAME}/{AWS_LOCATION}/'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'apps.accounts.authentication.CsrfExemptSessionAuthentication',
        'rest_framework.authentication.BasicAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'EXCEPTION_HANDLER': 'config.exception_handler.custom_exception_handler',
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '30/minute',
        'user': '120/minute',
        'login': '5/minute',
    },
}

# CORS settings
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175,http://localhost:5176,http://127.0.0.1:5176,http://localhost:5177,http://127.0.0.1:5177,http://localhost:5178,http://127.0.0.1:5178,http://localhost:5179,http://127.0.0.1:5179,http://localhost:5180,http://127.0.0.1:5180',
    cast=Csv()
)
CORS_ALLOW_CREDENTIALS = True
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

# CSRF Settings
CSRF_COOKIE_HTTPONLY = False  # Allow JavaScript to read CSRF token
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS',
    default='http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175,http://localhost:5176,http://127.0.0.1:5176,http://localhost:5177,http://127.0.0.1:5177,http://localhost:5178,http://127.0.0.1:5178,http://localhost:5179,http://127.0.0.1:5179,http://localhost:5180,http://127.0.0.1:5180',
    cast=Csv()
)

# Session settings
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_HTTPONLY = True

# API Documentation
SPECTACULAR_SETTINGS = {
    'TITLE': 'Real Estate Accounting API',
    'DESCRIPTION': 'Multi-tenant Real Estate Accounting System with Double-Entry GL',
    'VERSION': '1.0.0',
}

# Claude AI Configuration
ANTHROPIC_API_KEY = config('ANTHROPIC_API_KEY', default='')
AI_MODEL = config('AI_MODEL', default='claude-sonnet-4-20250514')
AI_MAX_TOKENS = config('AI_MAX_TOKENS', default=4096, cast=int)

# Multi-currency settings
DEFAULT_CURRENCY = 'USD'
SUPPORTED_CURRENCIES = ['USD', 'ZiG']

# Django-Q2 Configuration
# Use Redis as broker if available for better throughput, otherwise ORM
_q_cluster_base = {
    'name': 'parameter',
    'workers': config('Q_WORKERS', default=4, cast=int),
    'timeout': 90,
    'retry': 180,
    'queue_limit': 500,
    'bulk': 10,
    'catch_up': False,
    'ack_failures': True,
    'max_attempts': 3,
    'attempt_count': 0,
    'recycle': 500,  # Restart worker after 500 tasks to prevent memory leaks
}

if REDIS_URL:
    Q_CLUSTER = {
        **_q_cluster_base,
        'redis': REDIS_URL,
    }
else:
    Q_CLUSTER = {
        **_q_cluster_base,
        'orm': 'default',  # Use database as broker
    }

# Email Configuration (for notifications)
EMAIL_BACKEND = config('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = config('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_USE_SSL = config('EMAIL_USE_SSL', default=False, cast=bool)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='noreply@parameter.co.zw')

# Site URL for invitation links
SITE_URL = config('SITE_URL', default='http://localhost:5173')

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{asctime} {levelname} {name} {message}',
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
            'level': 'WARNING',
            'propagate': False,
        },
        'apps': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}
