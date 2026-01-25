"""
Masterfile models for Real Estate entities.
Landlords, Properties, Units, and Rental Tenants.
"""
from decimal import Decimal
from django.db import models
from django.conf import settings


class Landlord(models.Model):
    """Property owner who receives rental income."""

    class LandlordType(models.TextChoices):
        INDIVIDUAL = 'individual', 'Individual'
        COMPANY = 'company', 'Company'
        TRUST = 'trust', 'Trust'

    # Basic Info
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    landlord_type = models.CharField(
        max_length=20,
        choices=LandlordType.choices,
        default=LandlordType.INDIVIDUAL
    )

    # Contact
    email = models.EmailField()
    phone = models.CharField(max_length=20)
    alt_phone = models.CharField(max_length=20, blank=True)
    address = models.TextField()

    # Banking
    bank_name = models.CharField(max_length=100, blank=True)
    bank_branch = models.CharField(max_length=100, blank=True)
    account_number = models.CharField(max_length=50, blank=True)
    account_name = models.CharField(max_length=255, blank=True)

    # Tax Info
    tax_id = models.CharField(max_length=50, blank=True)
    vat_registered = models.BooleanField(default=False)
    vat_number = models.CharField(max_length=50, blank=True)

    # Commission rate (percentage taken by agency)
    commission_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('10.00')
    )

    # Preferences
    preferred_currency = models.CharField(max_length=3, default='USD')
    payment_frequency = models.CharField(
        max_length=20,
        choices=[
            ('monthly', 'Monthly'),
            ('quarterly', 'Quarterly'),
            ('annually', 'Annually'),
        ],
        default='monthly'
    )

    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Landlord'
        verbose_name_plural = 'Landlords'
        ordering = ['name']

    def __str__(self):
        return f'{self.code} - {self.name}'

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = self.generate_code()
        super().save(*args, **kwargs)

    @classmethod
    def generate_code(cls):
        last = cls.objects.order_by('-id').first()
        num = (last.id + 1) if last else 1
        return f'LL{num:04d}'


class Property(models.Model):
    """Real estate property (building/complex)."""

    class PropertyType(models.TextChoices):
        RESIDENTIAL = 'residential', 'Residential'
        COMMERCIAL = 'commercial', 'Commercial'
        INDUSTRIAL = 'industrial', 'Industrial'
        MIXED = 'mixed', 'Mixed Use'

    landlord = models.ForeignKey(
        Landlord, on_delete=models.PROTECT, related_name='properties'
    )

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    property_type = models.CharField(
        max_length=20,
        choices=PropertyType.choices,
        default=PropertyType.RESIDENTIAL
    )

    # Address
    address = models.TextField()
    city = models.CharField(max_length=100)
    suburb = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, default='Zimbabwe')

    # Details
    year_built = models.PositiveIntegerField(null=True, blank=True)
    total_units = models.PositiveIntegerField(default=1)
    total_floors = models.PositiveIntegerField(default=1)
    parking_spaces = models.PositiveIntegerField(default=0)
    amenities = models.JSONField(default=list, blank=True)

    # Images
    image = models.ImageField(upload_to='properties/', null=True, blank=True)

    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Property'
        verbose_name_plural = 'Properties'
        ordering = ['name']

    def __str__(self):
        return f'{self.code} - {self.name}'

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = self.generate_code()
        super().save(*args, **kwargs)

    @classmethod
    def generate_code(cls):
        last = cls.objects.order_by('-id').first()
        num = (last.id + 1) if last else 1
        return f'PROP{num:04d}'

    @property
    def vacancy_rate(self):
        """Calculate vacancy rate as percentage."""
        total = self.units.count()
        if total == 0:
            return Decimal('0')
        vacant = self.units.filter(is_occupied=False).count()
        return (Decimal(vacant) / Decimal(total)) * 100

    @property
    def occupancy_rate(self):
        return Decimal('100') - self.vacancy_rate


class Unit(models.Model):
    """Individual rentable unit within a property."""

    class UnitType(models.TextChoices):
        APARTMENT = 'apartment', 'Apartment'
        OFFICE = 'office', 'Office'
        SHOP = 'shop', 'Shop'
        WAREHOUSE = 'warehouse', 'Warehouse'
        PARKING = 'parking', 'Parking Bay'
        STORAGE = 'storage', 'Storage Unit'

    property = models.ForeignKey(
        Property, on_delete=models.CASCADE, related_name='units'
    )

    code = models.CharField(max_length=20)
    unit_number = models.CharField(max_length=20)
    unit_type = models.CharField(
        max_length=20,
        choices=UnitType.choices,
        default=UnitType.APARTMENT
    )

    # Specifications
    floor = models.PositiveIntegerField(default=1)
    bedrooms = models.PositiveIntegerField(default=0)
    bathrooms = models.PositiveIntegerField(default=0)
    size_sqm = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # Rental Info
    rental_amount = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=3, default='USD')
    deposit_amount = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True
    )

    # Status
    is_occupied = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    # Amenities specific to unit
    amenities = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Unit'
        verbose_name_plural = 'Units'
        ordering = ['property', 'unit_number']
        unique_together = ['property', 'unit_number']

    def __str__(self):
        return f'{self.property.name} - Unit {self.unit_number}'

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = f'{self.property.code}-{self.unit_number}'
        super().save(*args, **kwargs)


class RentalTenant(models.Model):
    """
    Tenant who rents a unit or pays levies.
    Named RentalTenant to avoid confusion with django-tenants.
    Supports both rental tenants and levy account holders.
    """

    class TenantType(models.TextChoices):
        INDIVIDUAL = 'individual', 'Individual'
        COMPANY = 'company', 'Company'

    class AccountType(models.TextChoices):
        """Differentiates rental tenants from levy account holders."""
        RENTAL = 'rental', 'Rental Tenant'
        LEVY = 'levy', 'Levy Account Holder'
        BOTH = 'both', 'Both (Rental & Levy)'

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    tenant_type = models.CharField(
        max_length=20,
        choices=TenantType.choices,
        default=TenantType.INDIVIDUAL
    )
    account_type = models.CharField(
        max_length=20,
        choices=AccountType.choices,
        default=AccountType.RENTAL,
        help_text='Rental tenant or levy account holder'
    )

    # Contact
    email = models.EmailField()
    phone = models.CharField(max_length=20)
    alt_phone = models.CharField(max_length=20, blank=True)

    # Identification
    id_type = models.CharField(
        max_length=20,
        choices=[
            ('national_id', 'National ID'),
            ('passport', 'Passport'),
            ('drivers_license', 'Driver\'s License'),
            ('company_reg', 'Company Registration'),
        ],
        default='national_id'
    )
    id_number = models.CharField(max_length=50)

    # Emergency Contact
    emergency_contact_name = models.CharField(max_length=255, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)
    emergency_contact_relation = models.CharField(max_length=100, blank=True)

    # Employment/Business Info
    employer_name = models.CharField(max_length=255, blank=True)
    employer_address = models.TextField(blank=True)
    occupation = models.CharField(max_length=100, blank=True)

    # Portal access
    portal_user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='rental_tenant'
    )

    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Rental Tenant'
        verbose_name_plural = 'Rental Tenants'
        ordering = ['name']

    def __str__(self):
        return f'{self.code} - {self.name}'

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = self.generate_code()
        super().save(*args, **kwargs)

    @classmethod
    def generate_code(cls):
        last = cls.objects.order_by('-id').first()
        num = (last.id + 1) if last else 1
        return f'TN{num:04d}'


class LeaseAgreement(models.Model):
    """
    Lease agreement between tenant and unit.

    IMPORTANT: One lease per tenant constraint is enforced:
    - A tenant can only have ONE active lease at a time
    - A unit can only have ONE active lease at a time
    """

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        ACTIVE = 'active', 'Active'
        EXPIRED = 'expired', 'Expired'
        TERMINATED = 'terminated', 'Terminated'

    class LeaseType(models.TextChoices):
        """Type of lease - rental or levy."""
        RENTAL = 'rental', 'Rental Lease'
        LEVY = 'levy', 'Levy Account'

    tenant = models.ForeignKey(
        RentalTenant, on_delete=models.PROTECT, related_name='leases'
    )
    unit = models.ForeignKey(
        Unit, on_delete=models.PROTECT, related_name='leases'
    )
    # Property reference for easy querying (denormalized from unit.property)
    property = models.ForeignKey(
        Property, on_delete=models.PROTECT, related_name='leases',
        null=True, blank=True
    )

    lease_type = models.CharField(
        max_length=20,
        choices=LeaseType.choices,
        default=LeaseType.RENTAL
    )

    lease_number = models.CharField(max_length=50, unique=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT
    )

    # Dates
    start_date = models.DateField()
    end_date = models.DateField()

    # Financial Terms
    monthly_rent = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=3, default='USD')
    deposit_amount = models.DecimalField(max_digits=18, decimal_places=2)
    deposit_paid = models.BooleanField(default=False)

    # Billing
    billing_day = models.PositiveIntegerField(default=1)  # Day of month for rent due
    grace_period_days = models.PositiveIntegerField(default=5)

    # Escalation
    annual_escalation_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0')
    )

    # Terms
    terms_and_conditions = models.TextField(blank=True)
    special_conditions = models.TextField(blank=True)

    # Documents
    document = models.FileField(upload_to='leases/', null=True, blank=True)

    # Termination
    terminated_at = models.DateTimeField(null=True, blank=True)
    termination_reason = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='created_leases'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Lease Agreement'
        verbose_name_plural = 'Lease Agreements'
        ordering = ['-start_date']

    def __str__(self):
        return f'{self.lease_number} - {self.tenant.name} @ {self.unit}'

    def save(self, *args, **kwargs):
        if not self.lease_number:
            self.lease_number = self.generate_lease_number()

        # Auto-populate property from unit
        if self.unit and not self.property:
            self.property = self.unit.property

        # Validate 1:1 constraints for ACTIVE leases only
        if self.status == self.Status.ACTIVE:
            self._validate_one_lease_per_tenant()
            self._validate_one_lease_per_unit()

        super().save(*args, **kwargs)

    def _validate_one_lease_per_tenant(self):
        """Ensure tenant has only one active lease."""
        from django.core.exceptions import ValidationError

        existing = LeaseAgreement.objects.filter(
            tenant=self.tenant,
            status=self.Status.ACTIVE
        ).exclude(pk=self.pk).exists()

        if existing:
            raise ValidationError(
                f'Tenant {self.tenant.name} already has an active lease. '
                f'A tenant can only have one active lease at a time.'
            )

    def _validate_one_lease_per_unit(self):
        """Ensure unit has only one active lease."""
        from django.core.exceptions import ValidationError

        existing = LeaseAgreement.objects.filter(
            unit=self.unit,
            status=self.Status.ACTIVE
        ).exclude(pk=self.pk).exists()

        if existing:
            raise ValidationError(
                f'Unit {self.unit} already has an active lease. '
                f'A unit can only have one active lease at a time.'
            )

    @classmethod
    def generate_lease_number(cls):
        from django.utils import timezone
        prefix = timezone.now().strftime('LS%Y%m')
        last = cls.objects.filter(lease_number__startswith=prefix).order_by('-lease_number').first()
        if last:
            num = int(last.lease_number[-4:]) + 1
        else:
            num = 1
        return f'{prefix}{num:04d}'

    def activate(self):
        """Activate the lease and mark unit as occupied."""
        self.status = self.Status.ACTIVE
        self.unit.is_occupied = True
        self.unit.save()
        self.save()

    def terminate(self, reason):
        """Terminate the lease and mark unit as vacant."""
        from django.utils import timezone
        self.status = self.Status.TERMINATED
        self.terminated_at = timezone.now()
        self.termination_reason = reason
        self.unit.is_occupied = False
        self.unit.save()
        self.save()
