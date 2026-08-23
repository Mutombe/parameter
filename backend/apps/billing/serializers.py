"""Serializers for billing module."""
from rest_framework import serializers
from .models import Invoice, Receipt, Expense, LatePenaltyConfig, LatePenaltyExclusion, PaymentReminder
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
    tenant_code = serializers.CharField(source='tenant.code', read_only=True)
    payer_type = serializers.CharField(source='tenant.account_type', read_only=True)
    unit_display = serializers.CharField(source='unit.__str__', read_only=True)
    journal_number = serializers.CharField(source='journal.journal_number', read_only=True)
    property_name = serializers.SerializerMethodField()
    property_id = serializers.SerializerMethodField()
    landlord_name = serializers.SerializerMethodField()
    landlord_id = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'tenant', 'tenant_name', 'tenant_code',
            'payer_type', 'lease', 'unit',
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

        # PAYER-TYPE RULE: a Rental payer can only be billed Rental items and
        # a Levy payer only Levy items — billing must not cross payer types.
        payer = tenant or (lease.tenant if lease else None)
        inv_type = data.get('invoice_type')
        if payer and inv_type:
            from apps.accounting.account_coding import (
                RENTAL_CATEGORIES, LEVY_CATEGORIES, allowed_categories, payer_side_label,
            )
            recognized = set(RENTAL_CATEGORIES) | set(LEVY_CATEGORIES)
            atype = getattr(payer, 'account_type', 'rental') or 'rental'
            if inv_type in recognized and inv_type not in allowed_categories(atype):
                other = 'Levy' if atype != 'levy' else 'Rental'
                raise serializers.ValidationError({
                    'invoice_type': (
                        f'{payer.code} ({payer.name}) is a {payer_side_label(atype)} '
                        f'Payer and cannot be billed {other} items ({inv_type}).'
                    )
                })

        return data


class ReceiptSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    tenant_code = serializers.CharField(source='tenant.code', read_only=True)
    payer_type = serializers.CharField(source='tenant.account_type', read_only=True)
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    journal_number = serializers.CharField(source='journal.journal_number', read_only=True)
    transaction_number = serializers.IntegerField(source='journal.transaction_number', read_only=True, default=None)
    transaction_display = serializers.CharField(source='journal.transaction_display', read_only=True, default='')
    income_type_name = serializers.CharField(source='income_type.name', read_only=True, default=None)
    sub_account_category_display = serializers.CharField(source='get_sub_account_category_display', read_only=True)
    # Receipt-as-audit-document fields (display only — no accounting impact):
    # the actual bank/cash account used, the authenticated cashier who created
    # the receipt (+ their role), and the property/landlord the payer belongs to.
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True, default=None)
    bank_account_currency = serializers.CharField(source='bank_account.currency', read_only=True, default=None)
    created_by_name = serializers.SerializerMethodField()
    created_by_role = serializers.SerializerMethodField()
    property_name = serializers.SerializerMethodField()
    landlord_name = serializers.SerializerMethodField()

    class Meta:
        model = Receipt
        fields = [
            'id', 'receipt_number', 'tenant', 'tenant_name', 'tenant_code',
            'payer_type', 'invoice',
            'invoice_number', 'income_type', 'income_type_name', 'bank_account',
            'bank_account_name', 'bank_account_currency',
            'property_name', 'landlord_name',
            'sub_account_category', 'sub_account_category_display',
            'date', 'amount', 'currency', 'payment_method',
            'reference', 'bank_name', 'description', 'notes', 'journal',
            'journal_number', 'transaction_number', 'transaction_display',
            'is_reversed', 'reversed_at', 'is_reversal', 'reversal_of',
            'created_by', 'created_by_name', 'created_by_role', 'created_at', 'updated_at'
        ]
        read_only_fields = ['receipt_number', 'journal', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        u = obj.created_by if obj.created_by_id else None
        if not u:
            return None
        return (u.get_full_name() or '').strip() or u.get_username() or getattr(u, 'email', None)

    def get_created_by_role(self, obj):
        u = obj.created_by if obj.created_by_id else None
        if not u:
            return None
        return u.get_role_display() if hasattr(u, 'get_role_display') else getattr(u, 'role', None)

    def _receipt_property(self, obj):
        """Payer → property, via the invoice's lease/property first, else the
        tenant's unit / active lease. Never manually set on the receipt."""
        inv = obj.invoice if obj.invoice_id else None
        if inv is not None:
            if getattr(inv, 'property_id', None):
                return inv.property
            p = _resolve_property_from_lease(inv.lease) if getattr(inv, 'lease_id', None) else None
            if p:
                return p
        t = obj.tenant if obj.tenant_id else None
        if t is not None:
            if getattr(t, 'unit_id', None) and getattr(t, 'unit', None) and t.unit.property_id:
                return t.unit.property
            la = (t.leases.filter(status='active').select_related('unit').first()
                  if hasattr(t, 'leases') else None)
            if la:
                return _resolve_property_from_lease(la)
        return None

    def get_property_name(self, obj):
        p = self._receipt_property(obj)
        return p.name if p else None

    def get_landlord_name(self, obj):
        p = self._receipt_property(obj)
        return p.landlord.name if (p and getattr(p, 'landlord_id', None)) else None


class ReceiptCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating receipts."""
    invoice = serializers.PrimaryKeyRelatedField(
        queryset=Invoice.objects.all(), required=False, allow_null=True
    )
    income_type = serializers.PrimaryKeyRelatedField(
        queryset=IncomeType.objects.all(), required=False, allow_null=True
    )
    # HARD RULE: every receipt must land in a specific bank/cash account —
    # reconciles the cash layer and blocks fraudulent no-bank receipting.
    bank_account = serializers.PrimaryKeyRelatedField(
        queryset=BankAccount.objects.all(), required=True, allow_null=False,
        error_messages={
            'required': 'Pick a bank/cash account — no receipt may be recorded without one.',
            'null': 'Pick a bank/cash account — no receipt may be recorded without one.',
        },
    )

    class Meta:
        model = Receipt
        fields = [
            'tenant', 'invoice', 'income_type', 'bank_account',
            'sub_account_category',
            'date', 'amount',
            'currency', 'payment_method', 'reference', 'bank_name', 'description',
            'notes'
        ]

    def to_internal_value(self, data):
        """Convert empty strings to None for nullable FK fields."""
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        for field in ('invoice', 'income_type'):
            if field in data and data[field] in ('', None, 'null', 'undefined'):
                data[field] = None
        if 'bank_account' in data and data['bank_account'] in ('', 'null', 'undefined'):
            data['bank_account'] = None  # -> triggers the required error
        return super().to_internal_value(data)

    def validate(self, data):
        # CURRENCY FOLLOWS THE BANK: a receipt banked into a ZWG (or any
        # non-USD) account is a ZWG receipt — the tenant/landlord pockets,
        # Unpaid accounts and every GL line must post in that currency. The
        # bank account is authoritative, overriding any client-sent currency
        # (the record-receipt form doesn't send one, so it used to default to
        # USD even for a ZWG account).
        bank = data.get('bank_account')
        if bank is not None and getattr(bank, 'currency', None):
            data['currency'] = bank.currency

        # PAYER-TYPE RULE (mutually exclusive): a Rental payer may only be
        # receipted against Rental categories and a Levy payer only against
        # Levy categories. An unset category defaults to the payer's primary;
        # an explicit cross-type category is REJECTED (spec §11) so a Levy
        # payment can never land on a Rental account or vice versa.
        payer = data.get('tenant')
        if payer is not None:
            from apps.accounting.account_coding import (
                allowed_categories, primary_category, payer_side_label,
            )
            atype = getattr(payer, 'account_type', 'rental') or 'rental'
            allowed = allowed_categories(atype)
            cat = data.get('sub_account_category') or ''
            if not cat:
                data['sub_account_category'] = primary_category(atype)
            elif cat not in allowed:
                other = 'Levy' if atype != 'levy' else 'Rental'
                raise serializers.ValidationError({
                    'sub_account_category': (
                        f'{payer.code} ({payer.name}) is configured as a '
                        f'{payer_side_label(atype)} Payer and cannot receive '
                        f'{other} transactions ({cat}).'
                    )
                })
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
    transaction_number = serializers.IntegerField(source='journal.transaction_number', read_only=True, default=None)
    transaction_display = serializers.CharField(source='journal.transaction_display', read_only=True, default='')
    expense_category_name = serializers.CharField(source='expense_category.name', read_only=True, default=None)
    expense_category_funding = serializers.CharField(source='expense_category.funding_category', read_only=True, default=None)
    income_type_name = serializers.CharField(source='income_type.name', read_only=True, default=None)
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True, default=None)
    bank_account_currency = serializers.CharField(source='bank_account.currency', read_only=True, default=None)
    landlord_name = serializers.CharField(source='landlord.name', read_only=True, default=None)
    landlord_code = serializers.CharField(source='landlord.code', read_only=True, default=None)
    expense_kind_display = serializers.CharField(source='get_expense_kind_display', read_only=True)
    sub_account_category_display = serializers.CharField(source='get_sub_account_category_display', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, default=None)
    supplier_code = serializers.CharField(source='supplier.code', read_only=True, default=None)

    class Meta:
        model = Expense
        fields = [
            'id', 'expense_number', 'expense_type', 'expense_kind', 'expense_kind_display',
            'status', 'payee_name',
            'payee_type', 'payee_id', 'date', 'amount', 'currency',
            'description', 'reference',
            'expense_category', 'expense_category_name', 'expense_category_funding',
            'income_type', 'income_type_name',
            'bank_account', 'bank_account_name', 'bank_account_currency',
            'landlord', 'landlord_name', 'landlord_code',
            'supplier', 'supplier_name', 'supplier_code',
            'sub_account_category', 'sub_account_category_display',
            'clears_payable',
            'journal', 'journal_number', 'transaction_number', 'transaction_display',
            'approved_by', 'approved_at', 'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'expense_number', 'journal', 'approved_by', 'approved_at',
            'created_at', 'updated_at'
        ]

    def validate(self, data):
        # income_type is no longer required — the new flow uses
        # expense_category for GL routing and funding_category for
        # sub-account derivation. Keep payee_name as the only mandatory
        # text field beyond what the model already enforces.
        etype = data.get('expense_type') or getattr(self.instance, 'expense_type', None)
        if etype == 'landlord_payment':
            self._validate_landlord_withdrawal(data)
        return data

    def _validate_landlord_withdrawal(self, data):
        """Trust-money controls for a Landlord Withdrawal (spec: Post Withdrawal).

        A withdrawal moves client/landlord trust money, so it must always name
        an identifiable source of funds. Enforced, non-bypassable:
          * Currency and Source Bank/Cash account are BOTH mandatory.
          * The transaction currency must equal the source account currency
            (no silent cross-currency withdrawal).
          * The source must be an existing, active Bank/Cash account (this
            dialogue never creates one).
          * The landlord's trust pocket must already exist (never created here).
          * The amount must not exceed the source account's available balance.
          * A posted withdrawal's controlled fields are immutable — correct via
            void + re-post, not a silent edit.
        """
        from apps.accounting.models import SubsidiaryAccount, SubsidiaryStructureError

        instance = self.instance

        # -- immutability after posting -----------------------------------
        if instance is not None and instance.journal_id:
            for f in ('bank_account', 'currency', 'amount', 'landlord', 'sub_account_category'):
                if f in data:
                    new, old = data[f], getattr(instance, f)
                    if hasattr(new, 'pk'):
                        new = new.pk
                    if hasattr(old, 'pk'):
                        old = old.pk
                    if new != old:
                        raise serializers.ValidationError({f: (
                            'A posted withdrawal cannot be edited. Void the '
                            'withdrawal and post a corrected one instead.')})
            return  # non-controlled edits on a posted withdrawal are allowed

        def pick(field):
            if field in data:
                return data[field]
            return getattr(instance, field, None) if instance is not None else None

        bank = pick('bank_account')
        currency = pick('currency')
        landlord = pick('landlord')
        amount = pick('amount')
        category = pick('sub_account_category')

        errors = {}
        if bank is None:
            errors['bank_account'] = 'Source Bank/Cash Account is required for a landlord withdrawal.'
        if not currency:
            errors['currency'] = 'Currency is required for a landlord withdrawal.'
        if landlord is None:
            errors['landlord'] = 'Landlord is required for a withdrawal.'
        if errors:
            raise serializers.ValidationError(errors)

        if not getattr(bank, 'is_active', True):
            raise serializers.ValidationError(
                {'bank_account': 'The selected source account is not active.'})

        # currency must match the source account's currency
        if currency != bank.currency:
            raise serializers.ValidationError({'currency': (
                f'Currency ({currency}) must match the source account currency '
                f'({bank.currency}). Cross-currency withdrawals are not permitted here.')})

        # the landlord trust pocket must already exist (never created here)
        funding_cat = category or 'rent'
        try:
            SubsidiaryAccount.get_for_landlord_category(landlord, category=funding_cat)
        except SubsidiaryStructureError:
            raise serializers.ValidationError({'sub_account_category': (
                f'Trust pocket "{funding_cat}" does not exist for {landlord.name}. '
                'Create the account structure first — it is never created from this dialogue.')})

        # amount must not exceed the source account's available balance
        if amount is not None:
            available = bank.available_balance(
                exclude_expense_id=getattr(instance, 'id', None))
            if amount > available:
                raise serializers.ValidationError({'amount': (
                    f'Withdrawal amount ({currency} {amount}) exceeds the available '
                    f'balance ({bank.currency} {available}) of {bank.name}.')})


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


class PaymentReminderSerializer(serializers.ModelSerializer):
    """Scheduled payment-reminder runs, with readable scope summaries."""
    property_names = serializers.SerializerMethodField()
    tenant_names = serializers.SerializerMethodField()
    excluded_property_names = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True, default=None)

    class Meta:
        model = PaymentReminder
        fields = [
            'id', 'send_date', 'send_all', 'properties', 'tenants',
            'excluded_properties', 'subject', 'message', 'status',
            'sent_at', 'sent_count', 'created_by', 'created_by_name',
            'property_names', 'tenant_names', 'excluded_property_names',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['status', 'sent_at', 'sent_count', 'created_by',
                            'created_at', 'updated_at']

    def get_property_names(self, obj):
        return list(obj.properties.values_list('name', flat=True))

    def get_tenant_names(self, obj):
        return list(obj.tenants.values_list('name', flat=True))

    def get_excluded_property_names(self, obj):
        return list(obj.excluded_properties.values_list('name', flat=True))
