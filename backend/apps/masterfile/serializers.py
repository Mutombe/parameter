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
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    unit_display = serializers.CharField(source='unit.__str__', read_only=True)
    property_name = serializers.CharField(source='unit.property.name', read_only=True)

    class Meta:
        model = LeaseAgreement
        fields = [
            'id', 'tenant', 'tenant_name', 'unit', 'unit_display', 'property_name',
            'lease_number', 'status', 'start_date', 'end_date', 'monthly_rent',
            'currency', 'deposit_amount', 'deposit_paid', 'billing_day',
            'grace_period_days', 'annual_escalation_rate', 'terms_and_conditions',
            'special_conditions', 'document', 'terminated_at', 'termination_reason',
            'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ['lease_number', 'created_at', 'updated_at']


class LeaseActivateSerializer(serializers.Serializer):
    """Serializer for lease activation."""
    pass


class LeaseTerminateSerializer(serializers.Serializer):
    """Serializer for lease termination."""
    reason = serializers.CharField(required=True)
