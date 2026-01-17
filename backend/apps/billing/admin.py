"""Admin configuration for billing module."""
from django.contrib import admin
from .models import Invoice, Receipt, Expense


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = [
        'invoice_number', 'tenant', 'unit', 'invoice_type',
        'total_amount', 'balance', 'status', 'date', 'due_date'
    ]
    list_filter = ['invoice_type', 'status', 'date', 'currency']
    search_fields = ['invoice_number', 'tenant__name', 'description']
    readonly_fields = ['invoice_number', 'total_amount', 'balance', 'created_at', 'updated_at']
    date_hierarchy = 'date'


@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    list_display = [
        'receipt_number', 'tenant', 'amount', 'payment_method',
        'reference', 'date'
    ]
    list_filter = ['payment_method', 'date', 'currency']
    search_fields = ['receipt_number', 'tenant__name', 'reference']
    readonly_fields = ['receipt_number', 'created_at', 'updated_at']
    date_hierarchy = 'date'


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = [
        'expense_number', 'expense_type', 'payee_name',
        'amount', 'status', 'date'
    ]
    list_filter = ['expense_type', 'status', 'date', 'currency']
    search_fields = ['expense_number', 'payee_name', 'description']
    readonly_fields = ['expense_number', 'created_at', 'updated_at']
    date_hierarchy = 'date'
