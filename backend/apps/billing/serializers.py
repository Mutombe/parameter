"""Serializers for billing module."""
from rest_framework import serializers
from .models import Invoice, Receipt, Expense, LatePenaltyConfig, LatePenaltyExclusion
from apps.accounting.models import IncomeType, BankAccount


def _resolve_property_from_lease(lease):
    """Lease → Property: prefer unit.property, fall back to lease.property (levy)."""
    if not lease:
        return None
    if lease.unit_id and getattr(lease, 'unit', None) and lease.unit.property_id:
        return lease.unit.property
    return getattr(lease, 'property', None)


class InvoiceSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    unit_display = serializers.CharField(source='unit.__str__', read_only=True)
    journal_number = serializers.CharField(source='journal.journal_number', read_only=True)
    property_name = serializers.SerializerMethodField()
    property_id = serializers.SerializerMethodField()
    landlord_name = serializers.SerializerMethodField()
    landlord_id = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'tenant', 'tenant_name', 'lease', 'unit',
            'unit_display', 'property_name', 'property_id',
            'landlord_name', 'landlord_id',
            'invoice_type', 'status', 'date', 'due_date',
            'period_start', 'period_end', 'amount', 'vat_amount', 'total_amount',
            'amount_paid', 'balance', 'currency', 'description', 'notes',
            'journal', 'journal_number', 'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'invoice_number', 'total_amount', 'balance',
            'journal', 'created_at', 'updated_at'
        ]

    def _resolve_property(self, obj):
        # Direct property FK on Invoice wins if set; otherwise resolve via lease.
        if obj.property_id:
            return obj.property
        return _resolve_property_from_lease(obj.lease)

    def get_property_name(self, obj):
        prop = self._resolve_property(obj)
        return prop.name if prop else None

    def get_property_id(self, obj):
        prop = self._resolve_property(obj)
        return prop.id if prop else None

    def get_landlord_name(self, obj):
        prop = self._resolve_property(obj)
        return prop.landlord.name if prop and prop.landlord_id else None

    def get_landlord_id(self, obj):
        prop = self._resolve_property(obj)
        return prop.landlord_id if prop else None


class InvoiceCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating invoices.

    Enforces: an invoice must be tied to a lease, and the lease must belong
    to the submitted tenant. A tenant with no lease cannot be invoiced.
    """

    class Meta:
        model = Invoice
        fields = [
            'tenant', 'lease', 'unit', 'invoice_type', 'date', 'due_date',
            'period_start', 'period_end', 'amount', 'vat_amount', 'currency',
            'description', 'notes'
        ]
        extra_kwargs = {
            'lease': {'required': True, 'allow_null': False},
        }

    def validate(self, data):
        lease = data.get('lease')
        tenant = data.get('tenant')

        if not lease:
            raise serializers.ValidationError({
                'lease': 'Cannot invoice a tenant without a lease. '
                        'Create a lease for this tenant first.'
            })

        if tenant and lease.tenant_id != tenant.id:
            raise serializers.ValidationError({
                'lease': 'Lease does not belong to the selected tenant.'
            })

        return data


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
    invoice = serializers.PrimaryKeyRelatedField(
        queryset=Invoice.objects.all(), required=False, allow_null=True
    )
    income_type = serializers.PrimaryKeyRelatedField(
        queryset=IncomeType.objects.all(), required=False, allow_null=True
    )
    bank_account = serializers.PrimaryKeyRelatedField(
        queryset=BankAccount.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Receipt
        fields = [
            'tenant', 'invoice', 'income_type', 'bank_account', 'date', 'amount',
            'currency', 'payment_method', 'reference', 'bank_name', 'description',
            'notes'
        ]

    def to_internal_value(self, data):
        """Convert empty strings to None for nullable FK fields."""
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        for field in ('invoice', 'income_type', 'bank_account'):
            if field in data and data[field] in ('', None, 'null', 'undefined'):
                data[field] = None
        return super().to_internal_value(data)

    def validate(self, data):
        if not data.get('income_type'):
            # Auto-resolve from invoice type or default to first active income type
            invoice = data.get('invoice')
            if invoice:
                income_type = IncomeType.objects.filter(
                    code__iexact=invoice.invoice_type, is_active=True
                ).first()
                if income_type:
                    data['income_type'] = income_type
            if not data.get('income_type'):
                default = IncomeType.objects.filter(is_active=True).order_by('display_order').first()
                if default:
                    data['income_type'] = default
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
    property_id = serializers.IntegerField(required=False, allow_null=True)
    invoice_date = serializers.DateField(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)


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
