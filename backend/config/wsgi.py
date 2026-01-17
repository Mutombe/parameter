"""WSGI config for Real Estate Accounting System."""
import os
from django.core.wsgi import get_wsgi_application

# Use production settings by default if not specified
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.production')

application = get_wsgi_application()
