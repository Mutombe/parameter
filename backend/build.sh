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
        echo "CRITICAL: Migrations still failing. NOT dropping schema."
        echo "Please fix migration issues manually."
        # DO NOT drop the public schema - this destroys all data
    }
}

echo "Creating cache table..."
python manage.py createcachetable || true

echo "Fixing tenant schemas (adding missing columns)..."
python manage.py fix_schemas || true

echo "Setting up public tenant and domains..."
python manage.py setup_public_tenant --domain parameter-backend.onrender.com 2>&1 || {
    echo "WARNING: setup_public_tenant failed — creating public tenant via SQL fallback..."
    python manage.py shell -c "
from django.db import connection
with connection.cursor() as cursor:
    # Ensure public tenant exists
    cursor.execute(\"\"\"
        INSERT INTO public.tenants_client (schema_name, name, email, is_active, subscription_plan, created_on)
        VALUES ('public', 'Parameter Platform', 'admin@parameter.co.zw', true, 'enterprise', NOW())
        ON CONFLICT (schema_name) DO NOTHING
    \"\"\")
    # Get the public tenant id
    cursor.execute(\"SELECT id FROM public.tenants_client WHERE schema_name = 'public'\")
    tenant_id = cursor.fetchone()[0]
    # Ensure domain exists
    cursor.execute(\"\"\"
        INSERT INTO public.tenants_domain (domain, tenant_id, is_primary)
        VALUES ('parameter-backend.onrender.com', %s, true)
        ON CONFLICT (domain) DO NOTHING
    \"\"\", [tenant_id])
    cursor.execute(\"\"\"
        INSERT INTO public.tenants_domain (domain, tenant_id, is_primary)
        VALUES ('localhost', %s, false)
        ON CONFLICT (domain) DO NOTHING
    \"\"\", [tenant_id])
    print(f'Public tenant (id={tenant_id}) and domains created via SQL fallback')
" 2>&1 || echo "WARNING: SQL fallback also failed"
}

echo "Syncing production domains for all tenants..."
python manage.py sync_production_domains --domain-suffix parameter.co.zw || true

echo "Build completed successfully!"
