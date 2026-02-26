"""User model with Role-Based Access Control (RBAC)."""
from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager


class UserManager(BaseUserManager):
    """Custom user manager for email-based authentication."""

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', User.Role.SUPER_ADMIN)
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    """Extended User model with roles for RBAC."""

    class Role(models.TextChoices):
        SUPER_ADMIN = 'super_admin', 'Super Admin'
        ADMIN = 'admin', 'Admin'
        ACCOUNTANT = 'accountant', 'Accountant'
        CLERK = 'clerk', 'Clerk'
        TENANT_PORTAL = 'tenant_portal', 'Tenant Portal'

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
        default=Role.CLERK
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
        default=User.Role.CLERK
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
