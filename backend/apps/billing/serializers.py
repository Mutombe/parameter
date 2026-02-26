"""Serializers for billing module."""
from rest_framework import serializers
from .models import Invoice, Receipt, Expense, LatePenaltyConfig, LatePenaltyExclusion


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
    income_type_name = serializers.CharField(source='income_type.name', read_only=True, default=None)

    class Meta:
        model = Receipt
        fields = [
            'id', 'receipt_number', 'tenant', 'tenant_name', 'invoice',
            'invoice_number', 'income_type', 'income_type_name', 'bank_account',
            'date', 'amount', 'currency', 'payment_method',
            'reference', 'bank_name', 'description', 'notes', 'journal',
            'journal_number', 'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ['receipt_number', 'journal', 'created_at', 'updated_at']


class ReceiptCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating receipts."""

    class Meta:
        model = Receipt
        fields = [
            'tenant', 'invoice', 'income_type', 'bank_account', 'date', 'amount',
            'currency', 'payment_method', 'reference', 'bank_name', 'description',
            'notes'
        ]

    def validate(self, data):
        if not data.get('income_type'):
            raise serializers.ValidationError({'income_type': 'Income type is required.'})
        return data


class ExpenseSerializer(serializers.ModelSerializer):
    journal_number = serializers.CharField(source='journal.journal_number', read_only=True)
    expense_category_name = serializers.CharField(source='expense_category.name', read_only=True, default=None)
    income_type_name = serializers.CharField(source='income_type.name', read_only=True, default=None)

    class Meta:
        model = Expense
        fields = [
            'id', 'expense_number', 'expense_type', 'status', 'payee_name',
            'payee_type', 'payee_id', 'date', 'amount', 'currency',
            'description', 'reference', 'expense_category', 'expense_category_name',
            'income_type', 'income_type_name', 'journal', 'journal_number',
            'approved_by', 'approved_at', 'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'expense_number', 'journal', 'approved_by', 'approved_at',
            'created_at', 'updated_at'
        ]

    def validate(self, data):
        if not self.instance and not data.get('income_type'):
            raise serializers.ValidationError({'income_type': 'Income type is required for new expenses.'})
        return data


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


class LatePenaltyConfigSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True, default=None)
    tenant_name = serializers.CharField(source='tenant.name', read_only=True, default=None)

    class Meta:
        model = LatePenaltyConfig
        fields = [
            'id', 'property', 'property_name', 'tenant', 'tenant_name',
            'penalty_type', 'percentage_rate', 'flat_fee', 'currency',
            'grace_period_days', 'max_penalty_amount', 'max_penalties_per_invoice',
            'is_enabled', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class LatePenaltyExclusionSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    excluded_by_name = serializers.CharField(source='excluded_by.email', read_only=True, default=None)
    is_active = serializers.ReadOnlyField()

    class Meta:
        model = LatePenaltyExclusion
        fields = [
            'id', 'tenant', 'tenant_name', 'reason', 'excluded_by',
            'excluded_by_name', 'excluded_until', 'is_active', 'created_at'
        ]
        read_only_fields = ['excluded_by', 'created_at']
