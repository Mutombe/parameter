"""Serializers for billing module."""
from rest_framework import serializers
from .models import Invoice, Receipt, Expense


class InvoiceSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    unit_display = serializers.CharField(source='unit.__str__', read_only=True)
    journal_number = serializers.CharField(source='journal.journal_number', read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'tenant', 'tenant_name', 'lease', 'unit',
            'unit_display', 'invoice_type', 'status', 'date', 'due_date',
            'period_start', 'period_end', 'amount', 'vat_amount', 'total_amount',
            'amount_paid', 'balance', 'currency', 'description', 'notes',
            'journal', 'journal_number', 'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'invoice_number', 'total_amount', 'balance',
            'journal', 'created_at', 'updated_at'
        ]


class InvoiceCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating invoices."""

    class Meta:
        model = Invoice
        fields = [
            'tenant', 'lease', 'unit', 'invoice_type', 'date', 'due_date',
            'period_start', 'period_end', 'amount', 'vat_amount', 'currency',
            'description', 'notes'
        ]


class ReceiptSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    journal_number = serializers.CharField(source='journal.journal_number', read_only=True)

    class Meta:
        model = Receipt
        fields = [
            'id', 'receipt_number', 'tenant', 'tenant_name', 'invoice',
            'invoice_number', 'date', 'amount', 'currency', 'payment_method',
            'reference', 'bank_name', 'description', 'notes', 'journal',
            'journal_number', 'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ['receipt_number', 'journal', 'created_at', 'updated_at']


class ReceiptCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating receipts."""

    class Meta:
        model = Receipt
        fields = [
            'tenant', 'invoice', 'date', 'amount', 'currency',
            'payment_method', 'reference', 'bank_name', 'description', 'notes'
        ]


class ExpenseSerializer(serializers.ModelSerializer):
    journal_number = serializers.CharField(source='journal.journal_number', read_only=True)

    class Meta:
        model = Expense
        fields = [
            'id', 'expense_number', 'expense_type', 'status', 'payee_name',
            'payee_type', 'payee_id', 'date', 'amount', 'currency',
            'description', 'reference', 'journal', 'journal_number',
            'approved_by', 'approved_at', 'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'expense_number', 'journal', 'approved_by', 'approved_at',
            'created_at', 'updated_at'
        ]


class BulkInvoiceSerializer(serializers.Serializer):
    """Serializer for bulk invoice generation."""
    month = serializers.IntegerField(min_value=1, max_value=12)
    year = serializers.IntegerField(min_value=2000)
    lease_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True
    )


class BulkReceiptSerializer(serializers.Serializer):
    """Serializer for batch receipt processing."""
    receipts = serializers.ListField(
        child=serializers.DictField()
    )
