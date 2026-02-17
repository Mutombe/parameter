"""Tenant-scoped User query helpers for multi-tenancy data isolation."""
from django.db import connection


def get_tenant_users(roles=None, tenant_schema=None, active_only=True, notifications_enabled_only=False):
    """
    Return User queryset scoped to a single tenant.

    Args:
        roles: List of User.Role values to filter by.
        tenant_schema: Explicit schema name. Defaults to connection.schema_name.
        active_only: Only return active users (default True).
        notifications_enabled_only: Only return users with notifications_enabled=True.

    Raises:
        ValueError: If called without a valid tenant context.
    """
    from apps.accounts.models import User

    schema = tenant_schema or connection.schema_name
    if not schema or schema == 'public':
        raise ValueError("get_tenant_users() called without tenant context")

    qs = User.objects.filter(tenant_schema=schema)
    if roles:
        qs = qs.filter(role__in=roles)
    if active_only:
        qs = qs.filter(is_active=True)
    if notifications_enabled_only:
        qs = qs.filter(notifications_enabled=True)
    return qs


def get_tenant_staff(roles=None, tenant_schema=None):
    """
    Active, notifications-enabled staff for the current tenant.
    Default roles: [ADMIN, ACCOUNTANT].
    """
    from apps.accounts.models import User

    if roles is None:
        roles = [User.Role.ADMIN, User.Role.ACCOUNTANT]
    return get_tenant_users(
        roles=roles,
        tenant_schema=tenant_schema,
        notifications_enabled_only=True,
    )


def get_tenant_staff_emails(roles=None, tenant_schema=None):
    """Eagerly resolve email list (safe for daemon threads)."""
    return [e for e in get_tenant_staff(roles, tenant_schema).values_list('email', flat=True) if e]
