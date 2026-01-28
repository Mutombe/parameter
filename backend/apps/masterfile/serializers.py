"""Serializers for masterfile module."""
from rest_framework import serializers
from .models import Landlord, Property, Unit, RentalTenant, LeaseAgreement


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
        return obj.properties.count()


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
        active_lease = obj.leases.filter(status='active').first()
        if active_lease:
            return {
                'id': active_lease.tenant.id,
                'name': active_lease.tenant.name,
                'lease_end': active_lease.end_date
            }
        return None


class PropertySerializer(serializers.ModelSerializer):
    landlord_name = serializers.CharField(source='landlord.name', read_only=True)
    units = UnitSerializer(many=True, read_only=True)
    unit_count = serializers.SerializerMethodField()
    defined_unit_count = serializers.SerializerMethodField()
    valid_units = serializers.SerializerMethodField()
    vacancy_rate = serializers.ReadOnlyField()
    occupancy_rate = serializers.ReadOnlyField()

    class Meta:
        model = Property
        fields = [
            'id', 'landlord', 'landlord_name', 'code', 'name', 'property_type',
            'unit_definition', 'defined_unit_count', 'valid_units',
            'address', 'city', 'suburb', 'country', 'year_built', 'total_units',
            'total_floors', 'parking_spaces', 'amenities', 'image', 'is_active',
            'notes', 'units', 'unit_count', 'vacancy_rate', 'occupancy_rate',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['code', 'created_at', 'updated_at']

    def get_unit_count(self, obj):
        return obj.units.count()

    def get_defined_unit_count(self, obj):
        return obj.get_defined_unit_count()

    def get_valid_units(self, obj):
        # Return first 50 units to avoid huge responses
        units = obj.get_valid_units()
        return units[:50] if len(units) > 50 else units


class PropertyListSerializer(serializers.ModelSerializer):
    """Lighter serializer for list views."""
    landlord_name = serializers.CharField(source='landlord.name', read_only=True)
    unit_count = serializers.SerializerMethodField()
    defined_unit_count = serializers.SerializerMethodField()
    vacancy_rate = serializers.ReadOnlyField()

    class Meta:
        model = Property
        fields = [
            'id', 'landlord', 'landlord_name', 'code', 'name', 'property_type',
            'unit_definition', 'defined_unit_count',
            'city', 'total_units', 'unit_count', 'vacancy_rate', 'is_active'
        ]

    def get_unit_count(self, obj):
        return obj.units.count()

    def get_defined_unit_count(self, obj):
        return obj.get_defined_unit_count()


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
        leases = obj.leases.filter(status='active')
        return [{
            'id': l.id,
            'lease_number': l.lease_number,
            'unit': str(l.unit),
            'monthly_rent': str(l.monthly_rent),
            'end_date': l.end_date
        } for l in leases]

    def get_has_active_lease(self, obj):
        return obj.leases.filter(status='active').exists()

    def get_lease_count(self, obj):
        return obj.leases.count()


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
            'id', 'tenant', 'tenant_name', 'unit', 'unit_display', 'property_name',
            'property', 'unit_number',  # For auto-creating units
            'lease_number', 'status', 'start_date', 'end_date', 'monthly_rent',
            'currency', 'deposit_amount', 'deposit_paid', 'billing_day',
            'grace_period_days', 'annual_escalation_rate', 'terms_and_conditions',
            'special_conditions', 'document', 'terminated_at', 'termination_reason',
            'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ['lease_number', 'created_at', 'updated_at']
        extra_kwargs = {
            'unit': {'required': False}  # Not required if property/unit_number provided
        }

    def get_unit_display(self, obj):
        """Return unit display string or None if no unit."""
        return str(obj.unit) if obj.unit else None

    def get_property_name(self, obj):
        """Return property name or None if no unit."""
        return obj.unit.property.name if obj.unit else None

    def validate(self, data):
        """Validate that either unit or (property + unit_number) is provided."""
        unit = data.get('unit')
        prop = data.get('property')
        unit_number = data.get('unit_number')

        # Creating a new lease
        if not self.instance:
            if not unit and not (prop and unit_number):
                raise serializers.ValidationError(
                    "Either 'unit' or both 'property' and 'unit_number' must be provided."
                )

        # Validate unit_number is in property's valid units if unit_definition exists
        if prop and unit_number:
            valid_units = prop.get_valid_units()
            if valid_units and unit_number not in valid_units:
                raise serializers.ValidationError({
                    'unit_number': f"Invalid unit number. Valid units for this property: {', '.join(valid_units[:10])}{'...' if len(valid_units) > 10 else ''}"
                })

        return data

    def create(self, validated_data):
        """Create lease, auto-creating unit if needed."""
        prop = validated_data.pop('property', None)
        unit_number = validated_data.pop('unit_number', None)

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
