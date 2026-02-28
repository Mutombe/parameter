"""Mixins for tenant-scoped view protection."""
from rest_framework.exceptions import PermissionDenied


class TenantSchemaValidationMixin:
    """Validates that write operations don't execute against the public schema."""

    def perform_create(self, serializer):
        self._validate_tenant_schema()
        super().perform_create(serializer)

    def perform_update(self, serializer):
        self._validate_tenant_schema()
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        self._validate_tenant_schema()
        super().perform_destroy(instance)

    def _validate_tenant_schema(self):
        from django.db import connection
        if connection.schema_name == 'public':
            raise PermissionDenied("Operation not permitted on public schema")
