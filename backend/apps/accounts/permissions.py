"""Custom permissions for accounts app."""
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied
from .models import User


def _is_super(user):
    return bool(
        getattr(user, 'is_superuser', False)
        or getattr(user, 'user_type', None) == 'super_admin'
    )


def require_capability(user, code, message=None):
    """Imperative capability guard for use inside view methods (e.g. to branch
    on request data). Raises DRF PermissionDenied when the user lacks ``code``.
    super_admin / Django superuser always pass."""
    if _is_super(user):
        return
    if not user or not user.is_authenticated or not user.has_capability(code):
        raise PermissionDenied(message or 'You do not have permission to perform this action.')


class RequireCapability(permissions.BasePermission):
    """Per-action capability gate driven by a ``capability_map`` on the view.

    Example on a viewset::

        capability_map = {
            'create': 'receipts.create',
            'reverse': 'receipts.void',
            'default': 'receipts.view',   # optional fallback for other actions
        }

    A mapped value may be a single capability code or an iterable of codes
    (any-of). Actions absent from the map fall back to ``'default'``; if there
    is no default either, the action is allowed (still gated by
    IsAuthenticated). super_admin and Django superusers bypass all checks.
    """
    message = 'You do not have permission to perform this action.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if _is_super(user):
            return True

        cap_map = getattr(view, 'capability_map', None) or {}
        action = getattr(view, 'action', None)
        required = cap_map.get(action, cap_map.get('default'))
        if not required:
            return True

        if isinstance(required, (list, tuple, set)):
            allowed = any(user.has_capability(c) for c in required)
        else:
            allowed = user.has_capability(required)

        if not allowed:
            self.message = f'You do not have permission to {(action or "perform this action").replace("_", " ")}.'
        return allowed


class CanInviteUsers(permissions.BasePermission):
    """
    Permission to check if user can invite others.

    Role hierarchy for invitations:
    - SUPER_ADMIN: Can invite admin, accountant, clerk, tenant_portal
    - ADMIN: Can invite admin, accountant, clerk
    - ACCOUNTANT: Can invite accountant, clerk
    - CLERK: Cannot invite anyone
    - TENANT_PORTAL: Cannot invite anyone
    """
    message = 'You do not have permission to send invitations.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        # Only SUPER_ADMIN, ADMIN, ACCOUNTANT can invite
        return request.user.role in [
            User.Role.SUPER_ADMIN,
            User.Role.ADMIN,
            User.Role.ACCOUNTANT,
        ]


class CanManageUsers(permissions.BasePermission):
    """
    Permission to manage (deactivate/activate) users.
    Only admins can manage users.
    """
    message = 'You do not have permission to manage users.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        return request.user.role in [
            User.Role.SUPER_ADMIN,
            User.Role.ADMIN,
        ]


def get_allowed_invite_roles(user):
    """
    Get the list of roles a user is allowed to invite.

    Args:
        user: The user sending the invitation

    Returns:
        List of role values the user can invite
    """
    role_map = {
        User.Role.SUPER_ADMIN: [
            User.Role.ADMIN,
            User.Role.ACCOUNTANT,
            User.Role.CLERK,
            User.Role.TENANT_PORTAL,
        ],
        User.Role.ADMIN: [
            User.Role.ADMIN,
            User.Role.ACCOUNTANT,
            User.Role.CLERK,
            User.Role.TENANT_PORTAL,
        ],
        User.Role.ACCOUNTANT: [
            User.Role.ACCOUNTANT,
            User.Role.CLERK,
        ],
    }

    return role_map.get(user.role, [])


class IsTenantPortalUser(permissions.BasePermission):
    """
    Permission to check if user is a tenant portal user.
    Only tenant portal users can access their own portal data.
    """
    message = 'You must be a tenant portal user to access this resource.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        # Tenant portal users can access their own data
        return request.user.role == User.Role.TENANT_PORTAL


class IsTenantPortalOrStaff(permissions.BasePermission):
    """
    Permission for tenant portal users or staff members.
    Allows tenant portal users to access their own data,
    or staff to access any tenant's data.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        # Staff can access any data
        if request.user.role in [
            User.Role.SUPER_ADMIN,
            User.Role.ADMIN,
            User.Role.ACCOUNTANT,
            User.Role.CLERK,
        ]:
            return True

        # Tenant portal users can access only their own data
        return request.user.role == User.Role.TENANT_PORTAL
