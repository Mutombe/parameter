"""Multi-tenant models for schema-based isolation."""
from django.db import models
from django.utils import timezone
from django_tenants.models import TenantMixin, DomainMixin


class Client(TenantMixin):
    """
    Real Estate Company (Tenant).
    Each client gets their own PostgreSQL schema for complete data isolation.
    """

    class AccountStatus(models.TextChoices):
        PENDING = 'pending', 'Pending Activation'
        ACTIVE = 'active', 'Active'
        DEMO_EXPIRED = 'demo_expired', 'Demo Expired'
        SUSPENDED = 'suspended', 'Suspended'

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo = models.ImageField(upload_to='tenant_logos/', null=True, blank=True)

    # Contact Information
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)

    # Demo & Account Status
    is_demo = models.BooleanField(default=False, help_text='Whether this is a demo account')
    demo_expires_at = models.DateTimeField(null=True, blank=True, help_text='When the demo expires')
    account_status = models.CharField(
        max_length=20,
        choices=AccountStatus.choices,
        default=AccountStatus.PENDING,
        help_text='Current account status'
    )

    # Subscription & Features
    is_active = models.BooleanField(default=True)
    subscription_plan = models.CharField(
        max_length=20,
        choices=[
            ('free', 'Free Trial'),
            ('basic', 'Basic'),
            ('professional', 'Professional'),
            ('enterprise', 'Enterprise'),
        ],
        default='free'
    )

    # AI Feature Toggles
    ai_accounting_enabled = models.BooleanField(default=True)
    ai_reconciliation_enabled = models.BooleanField(default=True)
    ai_reports_enabled = models.BooleanField(default=True)
    ai_ocr_enabled = models.BooleanField(default=True)

    # Multi-currency
    default_currency = models.CharField(max_length=3, default='USD')

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Required by django-tenants
    auto_create_schema = True
    auto_drop_schema = True

    class Meta:
        verbose_name = 'Client (Tenant)'
        verbose_name_plural = 'Clients (Tenants)'
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def is_demo_expired(self):
        """Check if demo has expired."""
        if not self.is_demo or not self.demo_expires_at:
            return False
        return timezone.now() > self.demo_expires_at

    @property
    def demo_time_remaining(self):
        """Get remaining demo time in seconds."""
        if not self.is_demo or not self.demo_expires_at:
            return None
        remaining = self.demo_expires_at - timezone.now()
        return max(0, int(remaining.total_seconds()))

    def activate_from_demo(self):
        """Convert demo account to full account."""
        self.is_demo = False
        self.demo_expires_at = None
        self.account_status = self.AccountStatus.ACTIVE
        self.save()


class Domain(DomainMixin):
    """
    Domain/Subdomain mapping for tenants.
    e.g., acme.localhost -> ACME Real Estate schema
    """
    class Meta:
        verbose_name = 'Domain'
        verbose_name_plural = 'Domains'

    def __str__(self):
        return self.domain


class TenantInvitation(models.Model):
    """
    Invitation for new companies/tenants.
    Super admin sends these to invite new company admins to join the platform.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        ACCEPTED = 'accepted', 'Accepted'
        EXPIRED = 'expired', 'Expired'
        CANCELLED = 'cancelled', 'Cancelled'

    class InvitationType(models.TextChoices):
        FULL = 'full', 'Full Account'
        DEMO = 'demo', 'Demo Account'

    # Invitee information
    email = models.EmailField(help_text='Email of the company admin')
    company_name = models.CharField(max_length=255, help_text='Name of the company')
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)

    # Invitation type
    invitation_type = models.CharField(
        max_length=20,
        choices=InvitationType.choices,
        default=InvitationType.FULL,
        help_text='Type of account to create'
    )

    # Subscription plan for the invited tenant
    subscription_plan = models.CharField(
        max_length=20,
        choices=[
            ('free', 'Free Trial'),
            ('basic', 'Basic'),
            ('professional', 'Professional'),
            ('enterprise', 'Enterprise'),
        ],
        default='basic'
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
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='tenant_invitations_sent',
        help_text='Super admin who sent the invitation'
    )
    created_tenant = models.ForeignKey(
        Client,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='invitation',
        help_text='The tenant created from this invitation'
    )

    # Personal message from super admin
    message = models.TextField(blank=True, help_text='Optional welcome message')

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Tenant Invitation'
        verbose_name_plural = 'Tenant Invitations'
        ordering = ['-created_at']

    def __str__(self):
        return f'Invitation to {self.company_name} ({self.email}) - {self.status}'

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def is_valid(self):
        return self.status == self.Status.PENDING and not self.is_expired

    @classmethod
    def generate_token(cls):
        import secrets
        return secrets.token_urlsafe(32)


class GlobalSettings(models.Model):
    """Global settings managed by Super Admin (Public schema)."""
    key = models.CharField(max_length=100, unique=True)
    value = models.JSONField()
    description = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Global Setting'
        verbose_name_plural = 'Global Settings'

    def __str__(self):
        return self.key
