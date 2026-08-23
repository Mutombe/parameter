"""User model with Role-Based Access Control (RBAC).

Two orthogonal concepts (see apps.accounts.capabilities):
  * ``user_type``       — the user's identity/category (Admin, Accounts
                          Officer, Clerk, Cashier, Portfolio Manager, Tenant,
                          Account Holder; plus platform ``super_admin``).
  * ``permission_role`` — the named capability set they exercise. An Admin may
                          reassign this for internal users, or choose 'custom'
                          and hand-pick capabilities in ``custom_capabilities``.

The legacy ``role`` field is retained (and auto-mirrored from ``user_type`` on
save) so older role-based checks keep working during the transition.
"""
from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager

from . import capabilities as caps


class UserManager(BaseUserManager):
    """Custom user manager for email-based authentication."""

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        # When only a legacy `role` is supplied (e.g. invitation-accept or the
        # legacy create serializer), derive the new user_type/permission_role
        # so capability-based access is set up correctly. save() then keeps the
        # legacy role mirror in sync.
        from .capabilities import (
            LEGACY_ROLE_TO_TYPE, DEFAULT_PERMISSION_ROLE_FOR_TYPE,
        )
        role = extra_fields.get('role')
        if role and 'user_type' not in extra_fields:
            mapped = LEGACY_ROLE_TO_TYPE.get(role)
            if mapped:
                extra_fields.setdefault('user_type', mapped[0])
                extra_fields.setdefault('permission_role', mapped[1])
        # If a user_type is given (e.g. an invitation carrying a Cashier /
        # Portfolio Manager type), default the permission_role to that type's
        # standard set unless one was explicitly supplied.
        utype = extra_fields.get('user_type')
        if utype and 'permission_role' not in extra_fields:
            extra_fields['permission_role'] = DEFAULT_PERMISSION_ROLE_FOR_TYPE.get(
                utype, 'clerk_default'
            )
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', User.Role.SUPER_ADMIN)
        extra_fields.setdefault('user_type', 'super_admin')
        extra_fields.setdefault('permission_role', 'super_admin_full')
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    """Extended User model with roles for RBAC."""

    class Role(models.TextChoices):
        SUPER_ADMIN = 'super_admin', 'Super Admin'
        ADMIN = 'admin', 'Admin'
        ACCOUNTANT = 'accountant', 'Accountant'
        CLERK = 'clerk', 'Clerk'
        TENANT_PORTAL = 'tenant_portal', 'Tenant Portal'
        LANDLORD_PORTAL = 'landlord_portal', 'Landlord Portal'

    class AccountStatus(models.TextChoices):
        PENDING = 'pending', 'Pending Activation'
        ACTIVE = 'active', 'Active'
        DEMO_EXPIRED = 'demo_expired', 'Demo Expired'
        SUSPENDED = 'suspended', 'Suspended'

    username = None  # Remove username field
    email = models.EmailField('email address', unique=True)

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.CLERK,
        help_text='Legacy role — auto-mirrored from user_type. Prefer user_type/permission_role.',
    )

    # --- User Type & Permission Role (capability-based access) ---------------
    user_type = models.CharField(
        max_length=32,
        choices=caps.USER_TYPES,
        default='clerk',
        help_text="The user's identity/category (separate from their permissions).",
    )
    permission_role = models.CharField(
        max_length=40,
        choices=caps.PERMISSION_ROLES,
        default='clerk_default',
        help_text="Named capability set. 'custom' uses custom_capabilities.",
    )
    custom_capabilities = models.JSONField(
        default=list, blank=True,
        help_text="Capability codes used only when permission_role == 'custom'.",
    )

    # Demo & Account Status
    is_demo_user = models.BooleanField(default=False, help_text='Whether this is a demo user')
    account_status = models.CharField(
        max_length=20,
        choices=AccountStatus.choices,
        default=AccountStatus.ACTIVE,
        help_text='Current account status'
    )

    # Tenant membership (schema_name of the tenant this user belongs to)
    tenant_schema = models.CharField(
        max_length=63, blank=True, default='',
        help_text='Schema name of the tenant this user belongs to'
    )

    # Profile fields
    phone = models.CharField(max_length=20, blank=True)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)

    # Preferences
    preferred_currency = models.CharField(max_length=3, default='USD')
    notifications_enabled = models.BooleanField(default=True)

    # Timestamps
    last_activity = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        ordering = ['email']

    def __str__(self):
        return f'{self.get_full_name()} ({self.email})'

    def save(self, *args, **kwargs):
        """Keep the legacy ``role`` mirror in sync with ``user_type`` so older
        role-based checks keep working, without ever silently changing the
        richer permission fields."""
        if self.user_type:
            self.role = caps.LEGACY_ROLE_FOR_TYPE.get(self.user_type, self.role)
        # Portal user types are permanently constrained to their portal set.
        if self.user_type in caps.LOCKED_USER_TYPES:
            self.permission_role = caps.DEFAULT_PERMISSION_ROLE_FOR_TYPE[self.user_type]
        super().save(*args, **kwargs)

    # --- Capability API -----------------------------------------------------
    def get_capabilities(self):
        """The concrete set of capability codes this user may exercise."""
        return caps.effective_capabilities(
            self.user_type, self.permission_role, self.custom_capabilities or []
        )

    def has_capability(self, code):
        """True if the user is allowed to perform ``code``. super_admin and
        the Django superuser flag always pass."""
        if self.is_superuser or self.user_type == 'super_admin':
            return True
        return code in self.get_capabilities()

    @property
    def permissions_locked(self):
        """Portal users (Tenant / Account Holder) can never have their
        permission role changed."""
        return self.user_type in caps.LOCKED_USER_TYPES

    @property
    def is_admin(self):
        return self.role in [self.Role.SUPER_ADMIN, self.Role.ADMIN]

    @property
    def can_edit_accounting(self):
        return self.role in [
            self.Role.SUPER_ADMIN, self.Role.ADMIN, self.Role.ACCOUNTANT
        ]

    @property
    def can_view_reports(self):
        return self.role != self.Role.TENANT_PORTAL


class UserActivity(models.Model):
    """Track user activity for audit purposes."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='activities')
    action = models.CharField(max_length=100)
    details = models.JSONField(default=dict)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'User Activity'
        verbose_name_plural = 'User Activities'
        ordering = ['-timestamp']

    def __str__(self):
        return f'{self.user.email} - {self.action} at {self.timestamp}'


class UserInvitation(models.Model):
    """User invitation for adding team members."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        ACCEPTED = 'accepted', 'Accepted'
        EXPIRED = 'expired', 'Expired'
        CANCELLED = 'cancelled', 'Cancelled'

    email = models.EmailField()
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    role = models.CharField(
        max_length=20,
        choices=User.Role.choices,
        default=User.Role.CLERK,
        help_text='Legacy role mirror — derived from user_type.',
    )
    user_type = models.CharField(
        max_length=32,
        choices=caps.USER_TYPES,
        default='clerk',
        help_text='User type the invitee will be created as on acceptance.',
    )

    # Tenant membership
    tenant_schema = models.CharField(
        max_length=63, blank=True, default='',
        help_text='Schema name of the tenant this invitation belongs to'
    )

    # Invitation metadata
    token = models.CharField(max_length=100, unique=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )

    # Relationships
    invited_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, related_name='invitations_sent'
    )
    accepted_user = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='invitation'
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'User Invitation'
        verbose_name_plural = 'User Invitations'
        ordering = ['-created_at']

    def __str__(self):
        return f'Invitation to {self.email} ({self.status})'

    @property
    def is_expired(self):
        from django.utils import timezone
        return timezone.now() > self.expires_at

    @property
    def is_valid(self):
        return self.status == self.Status.PENDING and not self.is_expired

    @classmethod
    def generate_token(cls):
        import secrets
        return secrets.token_urlsafe(32)


class PasswordResetToken(models.Model):
    """Token for password reset requests."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_reset_tokens')
    token = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)
    tenant_schema = models.CharField(
        max_length=63, blank=True, default='',
        help_text='Schema name of the tenant this reset token belongs to'
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Reset token for {self.user.email}'

    @property
    def is_expired(self):
        from django.utils import timezone
        return timezone.now() > self.expires_at

    @property
    def is_valid(self):
        return not self.used and not self.is_expired

    @classmethod
    def generate_token(cls):
        import secrets
        return secrets.token_urlsafe(32)

    @classmethod
    def create_for_user(cls, user):
        """Create a reset token, invalidating any existing ones."""
        from django.utils import timezone
        from datetime import timedelta
        from django.db import connection
        # Invalidate old tokens
        cls.objects.filter(user=user, used=False).update(used=True)
        return cls.objects.create(
            user=user,
            token=cls.generate_token(),
            expires_at=timezone.now() + timedelta(hours=1),
            tenant_schema=connection.schema_name or '',
        )
