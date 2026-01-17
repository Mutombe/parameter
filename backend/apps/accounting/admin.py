"""Admin configuration for accounting module."""
from django.contrib import admin
from .models import (
    ChartOfAccount, ExchangeRate, Journal, JournalEntry,
    GeneralLedger, AuditTrail, FiscalPeriod
)


@admin.register(ChartOfAccount)
class ChartOfAccountAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'account_type', 'account_subtype', 'current_balance', 'is_active']
    list_filter = ['account_type', 'account_subtype', 'is_active', 'is_system']
    search_fields = ['code', 'name', 'description']
    ordering = ['code']


@admin.register(ExchangeRate)
class ExchangeRateAdmin(admin.ModelAdmin):
    list_display = ['from_currency', 'to_currency', 'rate', 'effective_date', 'source']
    list_filter = ['from_currency', 'to_currency', 'effective_date']
    ordering = ['-effective_date']


class JournalEntryInline(admin.TabularInline):
    model = JournalEntry
    extra = 2
    fields = ['account', 'description', 'debit_amount', 'credit_amount']


@admin.register(Journal)
class JournalAdmin(admin.ModelAdmin):
    list_display = ['journal_number', 'journal_type', 'date', 'description', 'status', 'created_by']
    list_filter = ['journal_type', 'status', 'date']
    search_fields = ['journal_number', 'description', 'reference']
    inlines = [JournalEntryInline]
    readonly_fields = ['journal_number', 'posted_by', 'posted_at']


@admin.register(GeneralLedger)
class GeneralLedgerAdmin(admin.ModelAdmin):
    list_display = ['date', 'account', 'description', 'debit_amount', 'credit_amount', 'balance']
    list_filter = ['account__account_type', 'date', 'currency']
    search_fields = ['description', 'account__code', 'account__name']
    ordering = ['-date', '-created_at']


@admin.register(AuditTrail)
class AuditTrailAdmin(admin.ModelAdmin):
    list_display = ['timestamp', 'action', 'model_name', 'record_id', 'user_email']
    list_filter = ['action', 'model_name', 'timestamp']
    search_fields = ['action', 'user_email', 'changes']
    readonly_fields = ['action', 'model_name', 'record_id', 'changes', 'user', 'user_email', 'ip_address', 'timestamp']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(FiscalPeriod)
class FiscalPeriodAdmin(admin.ModelAdmin):
    list_display = ['name', 'start_date', 'end_date', 'is_closed', 'closed_at']
    list_filter = ['is_closed']
