"""
Masterfile models for Real Estate entities.
Landlords, Properties, Units, and Rental Tenants.
"""
from decimal import Decimal
from django.db import models, transaction
from django.conf import settings
from apps.soft_delete import SoftDeleteModel


class Landlord(SoftDeleteModel):
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
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['is_active']),
            models.Index(fields=['landlord_type', 'is_active']),
            models.Index(fields=['created_at']),
            models.Index(fields=['email']),
        ]

    def __str__(self):
        return f'{self.code} - {self.name}'

    def save(self, *args, **kwargs):
        if not self.code:
            with transaction.atomic():
                self.code = self.generate_code()
                super().save(*args, **kwargs)
                return
        super().save(*args, **kwargs)

    @classmethod
    def generate_code(cls):
        last = cls.all_objects.select_for_update().order_by('-id').first()
        num = (last.id + 1) if last else 1
        return f'LL{num:04d}'


class Property(SoftDeleteModel):
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

    # Unit Definition - defines the valid unit range
    # Examples: "1-17" or "A1-A20; B1-B15; C1-C15" or "101-110; 201-210"
    unit_definition = models.CharField(
        max_length=500, blank=True,
        help_text='Define unit range: "1-17" or "A1-A20; B1-B15" etc.'
    )

    # Details
    year_built = models.PositiveIntegerField(null=True, blank=True)
    total_units = models.PositiveIntegerField(default=0)
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
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['landlord', 'is_active']),
            models.Index(fields=['property_type', 'is_active']),
            models.Index(fields=['city']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f'{self.code} - {self.name}'

    def save(self, *args, **kwargs):
        if not self.code:
            with transaction.atomic():
                self.code = self.generate_code()
                super().save(*args, **kwargs)
                return
        super().save(*args, **kwargs)

    @classmethod
    def generate_code(cls):
        last = cls.all_objects.select_for_update().order_by('-id').first()
        num = (last.id + 1) if last else 1
        return f'PROP{num:04d}'

    @property
    def vacancy_rate(self):
        """Calculate vacancy rate as percentage. Uses annotations when available (zero queries)."""
        if hasattr(self, '_vacant_units') and hasattr(self, '_unit_count'):
            total = self._unit_count
            if total == 0:
                return Decimal('0')
            return (Decimal(self._vacant_units) / Decimal(total)) * 100
        total = self.units.count()
        if total == 0:
            return Decimal('0')
        vacant = self.units.filter(is_occupied=False).count()
        return (Decimal(vacant) / Decimal(total)) * 100

    @property
    def occupancy_rate(self):
        return Decimal('100') - self.vacancy_rate

    @staticmethod
    def parse_unit_definition(definition: str) -> list:
        """
        Parse unit definition string into list of valid unit numbers.

        Examples:
        - "1-17" → ['1', '2', '3', ..., '17']
        - "A1-A20; B1-B15" → ['A1', 'A2', ..., 'A20', 'B1', ..., 'B15']
        - "101-110; 201-210" → ['101', ..., '110', '201', ..., '210']
        """
        import re

        if not definition or not definition.strip():
            return []

        units = []
        # Split by semicolon for multiple ranges
        ranges = [r.strip() for r in definition.split(';') if r.strip()]

        for range_def in ranges:
            # Match patterns like "1-17", "A1-A20", "101-110"
            match = re.match(r'^([A-Za-z]*)(\d+)-([A-Za-z]*)(\d+)$', range_def.strip())

            if match:
                prefix1, start, prefix2, end = match.groups()
                prefix = prefix1 or prefix2  # Use whichever prefix exists

                start_num = int(start)
                end_num = int(end)

                # Generate all units in range
                for i in range(start_num, end_num + 1):
                    if prefix:
                        units.append(f'{prefix}{i}')
                    else:
                        units.append(str(i))
            else:
                # Single unit or invalid format - add as-is if not empty
                if range_def.strip():
                    units.append(range_def.strip())

        return units

    def get_valid_units(self) -> list:
        """Get list of valid unit numbers from definition."""
        return self.parse_unit_definition(self.unit_definition)

    def get_defined_unit_count(self) -> int:
        """Get count of units defined in the range."""
        return len(self.get_valid_units())

    def is_valid_unit_number(self, unit_number: str) -> bool:
        """Check if a unit number is within the defined range."""
        if not self.unit_definition:
            return True  # No definition = any unit is valid
        valid_units = self.get_valid_units()
        return unit_number in valid_units

    def generate_units_from_definition(self, default_rent=Decimal('0'), currency='USD', unit_type='apartment'):
        """
        Generate Unit records from the unit definition.
        Only creates units that don't already exist.
        Returns list of created Unit objects.
        """
        valid_units = self.get_valid_units()
        created_units = []

        for unit_number in valid_units:
            # Check if unit already exists
            if self.units.filter(unit_number=unit_number).exists():
                continue

            try:
                unit = Unit.objects.create(
                    property=self,
                    unit_number=unit_number,
                    rental_amount=default_rent,
                    currency=currency,
                    unit_type=unit_type,
                )
                created_units.append(unit)
            except Exception:
                pass  # Skip units that fail to create

        # Update total_units count
        self.total_units = self.units.count()
        self.save(update_fields=['total_units'])

        return created_units


class Unit(SoftDeleteModel):
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
        indexes = [
            models.Index(fields=['property', 'is_occupied']),
            models.Index(fields=['is_occupied', 'is_active']),
            models.Index(fields=['unit_type']),
        ]

    def __str__(self):
        return f'{self.property.name} - Unit {self.unit_number}'

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = f'{self.property.code}-{self.unit_number}'
        super().save(*args, **kwargs)


class RentalTenant(SoftDeleteModel):
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

    # Direct unit allocation (optional - can also be assigned via lease)
    unit = models.ForeignKey(
        'Unit', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assigned_tenants',
        help_text='Unit allocated to this tenant'
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
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['is_active']),
            models.Index(fields=['tenant_type', 'is_active']),
            models.Index(fields=['account_type']),
            models.Index(fields=['email']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f'{self.code} - {self.name}'

    def save(self, *args, **kwargs):
        if not self.code:
            with transaction.atomic():
                self.code = self.generate_code()
                super().save(*args, **kwargs)
                return
        super().save(*args, **kwargs)

    @classmethod
    def generate_code(cls):
        last = cls.all_objects.select_for_update().order_by('-id').first()
        num = (last.id + 1) if last else 1
        return f'TN{num:04d}'


class LeaseAgreement(SoftDeleteModel):
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
    deposit_amount = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True,
        help_text='Optional deposit amount'
    )
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
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['unit', 'status']),
            models.Index(fields=['start_date', 'end_date']),
            models.Index(fields=['status', 'end_date']),
            models.Index(fields=['-created_at']),
        ]

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
        last = cls.all_objects.filter(lease_number__startswith=prefix).order_by('-lease_number').first()
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


class PropertyManager(models.Model):
    """Assignment of a staff user as manager of a property."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='managed_properties',
        limit_choices_to={'role__in': ['super_admin', 'admin', 'accountant', 'clerk']}
    )
    property = models.ForeignKey(
        Property, on_delete=models.CASCADE, related_name='managers'
    )
    is_primary = models.BooleanField(default=False)
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='manager_assignments'
    )

    class Meta:
        verbose_name = 'Property Manager'
        verbose_name_plural = 'Property Managers'
        unique_together = ['user', 'property']
        ordering = ['-is_primary', 'assigned_at']

    def __str__(self):
        return f'{self.user.get_full_name()} - {self.property.name}'

    def save(self, *args, **kwargs):
        # If setting as primary, unset other primaries for this property
        if self.is_primary:
            PropertyManager.objects.filter(
                property=self.property, is_primary=True
            ).exclude(pk=self.pk).update(is_primary=False)
        super().save(*args, **kwargs)
