"""Admin configuration for tenant management."""
from django.contrib import admin
from django_tenants.admin import TenantAdminMixin
from .models import Client, Domain, GlobalSettings


@admin.register(Client)
class ClientAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = ['name', 'schema_name', 'email', 'subscription_plan', 'is_active', 'created_at']
    list_filter = ['is_active', 'subscription_plan', 'created_at']
    search_fields = ['name', 'email', 'schema_name']
    readonly_fields = ['schema_name', 'created_at', 'updated_at']

    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'schema_name', 'description', 'logo')
        }),
        ('Contact', {
            'fields': ('email', 'phone', 'address')
        }),
        ('Subscription', {
            'fields': ('is_active', 'subscription_plan', 'default_currency')
        }),
        ('AI Features', {
            'fields': (
                'ai_accounting_enabled', 'ai_reconciliation_enabled',
                'ai_reports_enabled', 'ai_ocr_enabled'
            )
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(Domain)
class DomainAdmin(admin.ModelAdmin):
    list_display = ['domain', 'tenant', 'is_primary']
    list_filter = ['is_primary']
    search_fields = ['domain', 'tenant__name']


@admin.register(GlobalSettings)
class GlobalSettingsAdmin(admin.ModelAdmin):
    list_display = ['key', 'updated_at']
    search_fields = ['key', 'description']
