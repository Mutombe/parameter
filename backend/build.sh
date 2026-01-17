#!/usr/bin/env bash
# Build script for Render.com deployment

set -o errexit  # Exit on error

echo "Installing dependencies..."
pip install -r requirements.txt

echo "Collecting static files..."
python manage.py collectstatic --no-input

echo "Running migrations for shared apps (public schema)..."
python manage.py migrate_schemas --shared

echo "Creating cache table..."
python manage.py createcachetable || true

echo "Build completed successfully!"
