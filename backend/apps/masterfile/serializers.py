"""Serializers for masterfile module."""
from rest_framework import serializers
from .models import Landlord, Property, Unit, RentalTenant, LeaseAgreement, PropertyManager


class LandlordSerializer(serializers.ModelSerializer):
    property_count = serializers.SerializerMethodField()

    class Meta:
        model = Landlord
        fields = [
            'id', 'code', 'name', 'landlord_type', 'email', 'phone', 'alt_phone',
            'address', 'bank_name', 'bank_branch', 'account_number', 'account_name',
            'tax_id', 'vat_registered', 'vat_number', 'commission_rate',
            'preferred_currency', 'payment_frequency', 'is_active', 'notes',
            'property_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['code', 'created_at', 'updated_at']

    def get_property_count(self, obj):
        return getattr(obj, '_property_count', obj.properties.count())


class UnitSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)
    current_tenant = serializers.SerializerMethodField()

    class Meta:
        model = Unit
        fields = [
            'id', 'property', 'property_name', 'code', 'unit_number', 'unit_type',
            'floor', 'bedrooms', 'bathrooms', 'size_sqm', 'rental_amount',
            'currency', 'deposit_amount', 'is_occupied', 'is_active',
            'amenities', 'notes', 'current_tenant', 'created_at', 'updated_at'
        ]
        read_only_fields = ['code', 'created_at', 'updated_at']

    def get_current_tenant(self, obj):
        active_leases = getattr(obj, '_active_leases', None)
        if active_leases is None:
            active_lease = obj.leases.filter(status='active').select_related('tenant').first()
        else:
            active_lease = active_leases[0] if active_leases else None
        if active_lease:
            return {
                'id': active_lease.tenant.id,
                'name': active_lease.tenant.name,
                'lease_end': active_lease.end_date
            }
        return None


class PropertyManagerSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    user_email = serializers.CharField(source='user.email', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    assigned_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PropertyManager
        fields = [
            'id', 'user', 'user_name', 'user_email', 'property', 'property_name',
            'is_primary', 'assigned_at', 'assigned_by', 'assigned_by_name'
        ]
        read_only_fields = ['assigned_at']

    def get_user_name(self, obj):
        return obj.user.get_full_name() or obj.user.email

    def get_assigned_by_name(self, obj):
        if obj.assigned_by:
            return obj.assigned_by.get_full_name() or obj.assigned_by.email
        return None


class PropertySerializer(serializers.ModelSerializer):
    landlord_name = serializers.CharField(source='landlord.name', read_only=True)
    units = UnitSerializer(many=True, read_only=True)
    unit_count = serializers.SerializerMethodField()
    defined_unit_count = serializers.SerializerMethodField()
    valid_units = serializers.SerializerMethodField()
    vacancy_rate = serializers.ReadOnlyField()
    occupancy_rate = serializers.ReadOnlyField()
    primary_manager = serializers.SerializerMethodField()
    managers_list = serializers.SerializerMethodField()

    class Meta:
        model = Property
        fields = [
            'id', 'landlord', 'landlord_name', 'code', 'name', 'property_type',
            'management_type', 'unit_definition', 'defined_unit_count', 'valid_units',
            'address', 'city', 'suburb', 'country', 'year_built', 'total_units',
            'total_floors', 'parking_spaces', 'amenities', 'image', 'is_active',
            'notes', 'units', 'unit_count', 'vacancy_rate', 'occupancy_rate',
            'primary_manager', 'managers_list',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['code', 'created_at', 'updated_at']

    def get_unit_count(self, obj):
        return getattr(obj, '_unit_count', obj.units.count())

    def get_defined_unit_count(self, obj):
        return obj.get_defined_unit_count()

    def get_valid_units(self, obj):
        # Return first 50 units to avoid huge responses
        units = obj.get_valid_units()
        return units[:50] if len(units) > 50 else units

    def get_primary_manager(self, obj):
        primary_managers = getattr(obj, '_primary_managers', None)
        if primary_managers is not None:
            pm = primary_managers[0] if primary_managers else None
        else:
            pm = obj.managers.filter(is_primary=True).select_related('user').first()
        if pm:
            return {
                'id': pm.id,
                'user_id': pm.user.id,
                'name': pm.user.get_full_name() or pm.user.email,
            }
        return None

    def get_managers_list(self, obj):
        # Use prefetched data (managers__user already prefetched in viewset)
        return [{
            'id': pm.id,
            'user_id': pm.user.id,
            'name': pm.user.get_full_name() or pm.user.email,
            'is_primary': pm.is_primary,
        } for pm in obj.managers.all()]


class PropertyListSerializer(serializers.ModelSerializer):
    """Lighter serializer for list views."""
    landlord_name = serializers.CharField(source='landlord.name', read_only=True)
    unit_count = serializers.SerializerMethodField()
    defined_unit_count = serializers.SerializerMethodField()
    vacancy_rate = serializers.ReadOnlyField()
    primary_manager = serializers.SerializerMethodField()

    class Meta:
        model = Property
        fields = [
            'id', 'landlord', 'landlord_name', 'code', 'name', 'property_type',
            'management_type', 'unit_definition', 'defined_unit_count',
            'city', 'total_units', 'unit_count', 'vacancy_rate', 'is_active',
            'primary_manager'
        ]

    def get_unit_count(self, obj):
        return getattr(obj, '_unit_count', obj.units.count())

    def get_defined_unit_count(self, obj):
        return obj.get_defined_unit_count()

    def get_primary_manager(self, obj):
        primary_managers = getattr(obj, '_primary_managers', None)
        if primary_managers is not None:
            pm = primary_managers[0] if primary_managers else None
        else:
            pm = obj.managers.filter(is_primary=True).select_related('user').first()
        if pm:
            return {
                'id': pm.id,
                'user_id': pm.user.id,
                'name': pm.user.get_full_name() or pm.user.email,
            }
        return None


class RentalTenantListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views — avoids loading invoices/receipts."""
    has_active_lease = serializers.SerializerMethodField()
    lease_count = serializers.SerializerMethodField()
    unit_name = serializers.SerializerMethodField()

    class Meta:
        model = RentalTenant
        fields = [
            'id', 'code', 'name', 'tenant_type', 'account_type', 'unit', 'unit_name',
            'email', 'phone', 'is_active', 'has_active_lease', 'lease_count',
            'created_at', 'updated_at'
        ]

    def get_unit_name(self, obj):
        return str(obj.unit) if obj.unit else None

    def get_has_active_lease(self, obj):
        return getattr(obj, '_has_active_lease', 0) > 0

    def get_lease_count(self, obj):
        return getattr(obj, '_lease_count', obj.leases.count())


class RentalTenantSerializer(serializers.ModelSerializer):
    active_leases = serializers.SerializerMethodField()
    has_active_lease = serializers.SerializerMethodField()
    lease_count = serializers.SerializerMethodField()
    unit_name = serializers.SerializerMethodField()

    class Meta:
        model = RentalTenant
        fields = [
            'id', 'code', 'name', 'tenant_type', 'account_type', 'unit', 'unit_name',
            'email', 'phone', 'alt_phone', 'id_type', 'id_number',
            'emergency_contact_name', 'emergency_contact_phone',
            'emergency_contact_relation', 'employer_name', 'employer_address',
            'occupation', 'portal_user', 'is_active', 'notes', 'active_leases',
            'has_active_lease', 'lease_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['code', 'created_at', 'updated_at']

    def get_unit_name(self, obj):
        """Return unit name or None if no unit assigned."""
        return str(obj.unit) if obj.unit else None

    def get_active_leases(self, obj):
        active = getattr(obj, '_active_leases', None)
        if active is None:
            active = obj.leases.filter(status='active').select_related('unit')
        return [{
            'id': l.id,
            'lease_number': l.lease_number,
            'unit': str(l.unit),
            'monthly_rent': str(l.monthly_rent),
            'end_date': l.end_date
        } for l in active]

    def get_has_active_lease(self, obj):
        return getattr(obj, '_has_active_lease', 0) > 0

    def get_lease_count(self, obj):
        return getattr(obj, '_lease_count', obj.leases.count())


class LeaseAgreementSerializer(serializers.ModelSerializer):
    """
    Lease serializer with auto-unit creation support.

    When creating a lease, you can either:
    1. Pass an existing unit ID in the 'unit' field
    2. Pass 'property' and 'unit_number' to auto-create the unit

    If unit_number matches an existing unit in the property, it uses that unit.
    Otherwise, a new unit is created automatically.
    """
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    unit_display = serializers.SerializerMethodField()
    property_name = serializers.SerializerMethodField()
    property_id = serializers.SerializerMethodField()
    landlord_name = serializers.SerializerMethodField()
    landlord_id = serializers.SerializerMethodField()

    # Optional fields for auto-creating units
    property = serializers.PrimaryKeyRelatedField(
        queryset=Property.objects.all(),
        required=False,
        write_only=True,
        help_text="Property ID (used with unit_number to auto-create unit)"
    )
    unit_number = serializers.CharField(
        required=False,
        write_only=True,
        help_text="Unit number (used with property to auto-create unit)"
    )

    class Meta:
        model = LeaseAgreement
        fields = [
            'id', 'tenant', 'tenant_name', 'unit', 'unit_display',
            'property_name', 'property_id', 'landlord_name', 'landlord_id',
            'property', 'unit_number',  # For auto-creating units
            'lease_number', 'lease_type', 'status', 'start_date', 'end_date',
            'monthly_rent', 'currency', 'deposit_amount', 'deposit_paid',
            'billing_day', 'grace_period_days', 'annual_escalation_rate',
            'terms_and_conditions', 'special_conditions', 'document',
            'terminated_at', 'termination_reason',
            'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ['lease_number', 'lease_type', 'created_at', 'updated_at']
        extra_kwargs = {
            'unit': {'required': False}  # Not required if property/unit_number provided
        }

    def get_unit_display(self, obj):
        """Return unit display string or None if no unit."""
        return str(obj.unit) if obj.unit else None

    def get_property_name(self, obj):
        """Return property name or None if no unit."""
        return obj.unit.property.name if obj.unit else None

    def get_property_id(self, obj):
        """Return property ID or None if no unit."""
        return obj.unit.property.id if obj.unit else None

    def get_landlord_name(self, obj):
        """Return landlord name or None if no unit/property."""
        if obj.unit and obj.unit.property and obj.unit.property.landlord:
            return obj.unit.property.landlord.name
        return None

    def get_landlord_id(self, obj):
        """Return landlord ID or None if no unit/property."""
        if obj.unit and obj.unit.property and obj.unit.property.landlord:
            return obj.unit.property.landlord.id
        return None

    def validate(self, data):
        """Validate that either unit or property (with optional unit_number) is provided."""
        import logging
        logger = logging.getLogger('lease.debug')
        logger.debug(f"[SERIALIZER.validate] Input data keys: {list(data.keys())}")
        logger.debug(f"[SERIALIZER.validate] tenant={data.get('tenant')}, unit={data.get('unit')}, property={data.get('property')}, unit_number={data.get('unit_number')}")
        logger.debug(f"[SERIALIZER.validate] monthly_rent={data.get('monthly_rent')}, deposit={data.get('deposit_amount')}, currency={data.get('currency')}")
        logger.debug(f"[SERIALIZER.validate] start_date={data.get('start_date')}, end_date={data.get('end_date')}, payment_day={data.get('billing_day')}")

        unit = data.get('unit')
        prop = data.get('property')
        unit_number = data.get('unit_number')

        # Creating a new lease
        if not self.instance:
            if not unit and not prop:
                raise serializers.ValidationError(
                    "Either 'unit' or 'property' must be provided."
                )

            # Auto-generate unit_number if property given without one
            if prop and not unit_number and not unit:
                valid_units = prop.get_valid_units()
                if valid_units:
                    # Use next available from the property's defined units
                    existing = set(prop.units.values_list('unit_number', flat=True))
                    available = [u for u in valid_units if u not in existing]
                    if available:
                        data['unit_number'] = available[0]
                    else:
                        next_num = prop.units.count() + 1
                        data['unit_number'] = f'UNIT-{next_num:03d}'
                else:
                    next_num = prop.units.count() + 1
                    data['unit_number'] = f'UNIT-{next_num:03d}'
                data['_auto_generated_unit'] = True

        # Validate user-provided unit_number against property's valid units
        unit_number = data.get('unit_number')
        is_auto = data.pop('_auto_generated_unit', False)
        if prop and unit_number and not is_auto:
            valid_units = prop.get_valid_units()
            if valid_units and unit_number not in valid_units:
                raise serializers.ValidationError({
                    'unit_number': f"'{unit_number}' is not a valid unit for this property. "
                    f"Valid units: {', '.join(valid_units[:10])}{'...' if len(valid_units) > 10 else ''}"
                })

        # Cross-validate tenant account_type with property management_type
        # Only block truly incompatible combinations (levy-only on rental, rental-only on levy)
        # but auto-upgrade to 'both' in create() for soft mismatches
        tenant = data.get('tenant')
        resolved_prop = prop or (unit.property if unit else None)
        if tenant and resolved_prop and not self.instance:
            mgmt = resolved_prop.management_type
            acct = tenant.account_type
            if mgmt == 'rental' and acct == 'levy':
                raise serializers.ValidationError(
                    'A levy-only tenant cannot be assigned to a rental property. '
                    'Please change the tenant\'s account type first.'
                )
            # Allow rental tenants on levy properties — auto-upgrade happens in create()

        logger.debug(f"[SERIALIZER.validate] PASSED - returning data keys: {list(data.keys())}")
        return data

    def create(self, validated_data):
        """Create lease, auto-creating unit if needed."""
        import logging
        logger = logging.getLogger('lease.debug')
        logger.debug(f"[SERIALIZER.create] validated_data keys: {list(validated_data.keys())}")

        prop = validated_data.pop('property', None)
        unit_number = validated_data.pop('unit_number', None)
        logger.debug(f"[SERIALIZER.create] prop={prop}, unit_number={unit_number}")

        # If property and unit_number provided, find or create the unit
        if prop and unit_number:
            unit, created = Unit.objects.get_or_create(
                property=prop,
                unit_number=unit_number,
                defaults={
                    'rental_amount': validated_data.get('monthly_rent', 0),
                    'currency': validated_data.get('currency', 'USD'),
                    'is_occupied': True,
                }
            )
            validated_data['unit'] = unit

            # Update unit occupancy if existing unit
            if not created:
                unit.is_occupied = True
                unit.save(update_fields=['is_occupied'])

        # Auto-set lease_type from property management_type
        unit = validated_data.get('unit')
        if unit:
            validated_data['lease_type'] = unit.property.management_type

        # Auto-upgrade tenant account_type to 'both' if assigning to a different management_type
        tenant = validated_data.get('tenant')
        if tenant and unit:
            mgmt = unit.property.management_type
            if tenant.account_type != 'both' and tenant.account_type != mgmt:
                tenant.account_type = 'both'
                tenant.save(update_fields=['account_type'])

        return super().create(validated_data)

    def update(self, instance, validated_data):
        """Update lease, handling property/unit_number if provided."""
        prop = validated_data.pop('property', None)
        unit_number = validated_data.pop('unit_number', None)

        # If property and unit_number provided, find or create the unit
        if prop and unit_number:
            unit, created = Unit.objects.get_or_create(
                property=prop,
                unit_number=unit_number,
                defaults={
                    'rental_amount': validated_data.get('monthly_rent', instance.monthly_rent),
                    'currency': validated_data.get('currency', instance.currency),
                    'is_occupied': True,
                }
            )
            validated_data['unit'] = unit

        return super().update(instance, validated_data)


class LeaseActivateSerializer(serializers.Serializer):
    """Serializer for lease activation."""
    pass


class LeaseTerminateSerializer(serializers.Serializer):
    """Serializer for lease termination."""
    reason = serializers.CharField(required=True)
