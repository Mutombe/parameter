"""Custom permissions for accounts app."""
from rest_framework import permissions
from .models import User


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
