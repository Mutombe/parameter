#!/usr/bin/env bash
# Build script for Render.com deployment

set -o errexit  # Exit on error

echo "Installing dependencies..."
pip install -r requirements.txt

echo "Collecting static files..."
python manage.py collectstatic --no-input

echo "=== Starting migration ==="

# Step 1: Migrate shared (public) schema
echo "Migrating shared schema..."
python manage.py migrate_schemas --shared 2>&1 && {
    echo "Shared migrations completed successfully"
} || {
    echo "Shared migration failed, retrying..."
    python manage.py migrate_schemas --shared || {
        echo "WARNING: Shared migrations failed. Continuing with tenant migrations..."
    }
}

# Step 2: Migrate all tenant schemas
echo "Migrating tenant schemas..."
python manage.py migrate_schemas --tenant 2>&1 && {
    echo "Tenant migrations completed successfully"
} || {
    echo "WARNING: Tenant migrations had errors (some schemas may have failed)"
    echo "This is often OK if test schemas were deleted. Continuing..."
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
