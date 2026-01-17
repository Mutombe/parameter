"""Admin configuration for masterfile module."""
from django.contrib import admin
from .models import Landlord, Property, Unit, RentalTenant, LeaseAgreement


@admin.register(Landlord)
class LandlordAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'landlord_type', 'email', 'phone', 'is_active']
    list_filter = ['landlord_type', 'is_active', 'vat_registered']
    search_fields = ['code', 'name', 'email', 'phone']
    readonly_fields = ['code', 'created_at', 'updated_at']


class UnitInline(admin.TabularInline):
    model = Unit
    extra = 1
    fields = ['unit_number', 'unit_type', 'rental_amount', 'currency', 'is_occupied']


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'landlord', 'property_type', 'city', 'total_units', 'is_active']
    list_filter = ['property_type', 'city', 'is_active']
    search_fields = ['code', 'name', 'address', 'landlord__name']
    readonly_fields = ['code', 'created_at', 'updated_at']
    inlines = [UnitInline]


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ['code', 'property', 'unit_number', 'unit_type', 'rental_amount', 'is_occupied']
    list_filter = ['unit_type', 'is_occupied', 'is_active', 'property']
    search_fields = ['code', 'unit_number', 'property__name']
    readonly_fields = ['code', 'created_at', 'updated_at']


@admin.register(RentalTenant)
class RentalTenantAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'tenant_type', 'email', 'phone', 'is_active']
    list_filter = ['tenant_type', 'is_active']
    search_fields = ['code', 'name', 'email', 'phone', 'id_number']
    readonly_fields = ['code', 'created_at', 'updated_at']


@admin.register(LeaseAgreement)
class LeaseAgreementAdmin(admin.ModelAdmin):
    list_display = ['lease_number', 'tenant', 'unit', 'status', 'start_date', 'end_date', 'monthly_rent']
    list_filter = ['status', 'start_date', 'end_date']
    search_fields = ['lease_number', 'tenant__name', 'unit__unit_number']
    readonly_fields = ['lease_number', 'created_at', 'updated_at']
