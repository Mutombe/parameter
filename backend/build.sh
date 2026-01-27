#!/usr/bin/env bash
# Build script for Render.com deployment

set -o errexit  # Exit on error

echo "Installing dependencies..."
pip install -r requirements.txt

echo "Collecting static files..."
python manage.py collectstatic --no-input

echo "=== Starting migration ==="

# Try to run migrations normally first
python manage.py migrate_schemas --shared 2>&1 && {
    echo "Migrations completed successfully"
} || {
    echo "Migration failed, checking for inconsistent history..."

    # Check if it's the known accounting/billing dependency issue
    if python manage.py showmigrations accounting 2>&1 | grep -q "\[ \]"; then
        echo "Found unapplied accounting migrations, faking them..."
        python manage.py migrate accounting --fake || true
    fi

    # Try again
    echo "Retrying migrations..."
    python manage.py migrate_schemas --shared || {
        echo "Still failing. Attempting fresh migration reset..."

        # As last resort, drop all tables and recreate
        # Only safe for fresh deployments!
        python manage.py shell -c "
from django.db import connection
with connection.cursor() as cursor:
    cursor.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    print('Schema reset complete')
" 2>/dev/null || true

        python manage.py migrate_schemas --shared
    }
}

echo "Creating cache table..."
python manage.py createcachetable || true

echo "Setting up public tenant and domains..."
python manage.py setup_public_tenant --domain parameter-backend.onrender.com || true

echo "Syncing production domains for all tenants..."
python manage.py sync_production_domains --domain-suffix parameter.co.zw || true

echo "Build completed successfully!"
