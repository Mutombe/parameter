"""Serializers for accounting module."""
from decimal import Decimal
from django.db.models import Sum
from rest_framework import serializers
from .models import (
    ChartOfAccount, ExchangeRate, Journal, JournalEntry,
    GeneralLedger, AuditTrail, FiscalPeriod, BankAccount,
    BankTransaction, BankReconciliation, ReconciliationItem,
    ExpenseCategory, JournalReallocation, IncomeType,
    SubsidiaryAccount, SubsidiaryTransaction, TransactionConsolidation,
    AccruedExpense, BalanceSheetMovement, OpeningBalance,
)


class ChartOfAccountSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    normal_balance = serializers.ReadOnlyField()

    class Meta:
        model = ChartOfAccount
        fields = [
            'id', 'code', 'name', 'account_type', 'account_subtype',
            'description', 'parent', 'is_active', 'is_system', 'currency',
            'current_balance', 'normal_balance', 'children',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['current_balance', 'created_at', 'updated_at']

    def get_children(self, obj):
        # Use prefetched children to avoid N+1 recursive queries
        children = [c for c in obj.children.all() if c.is_active]
        return ChartOfAccountListSerializer(children, many=True).data


class ChartOfAccountListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views — no recursive children."""
    normal_balance = serializers.ReadOnlyField()

    class Meta:
        model = ChartOfAccount
        fields = [
            'id', 'code', 'name', 'account_type', 'account_subtype',
            'parent', 'is_active', 'is_system', 'currency',
            'current_balance', 'normal_balance',
        ]


class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = [
            'id', 'from_currency', 'to_currency', 'rate',
            'effective_date', 'source', 'created_at'
        ]


class JournalEntrySerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)

    class Meta:
        model = JournalEntry
        fields = [
            'id', 'account', 'account_code', 'account_name',
            'description', 'debit_amount', 'credit_amount',
            'source_type', 'source_id', 'created_at'
        ]


class JournalSerializer(serializers.ModelSerializer):
    entries = JournalEntrySerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    posted_by_name = serializers.CharField(source='posted_by.get_full_name', read_only=True)
    total_debit = serializers.SerializerMethodField()
    total_credit = serializers.SerializerMethodField()

    class Meta:
        model = Journal
        fields = [
            'id', 'journal_number', 'journal_type', 'date', 'description',
            'reference', 'status', 'reversed_by', 'reversal_reason',
            'currency', 'exchange_rate', 'created_by', 'created_by_name',
            'posted_by', 'posted_by_name', 'posted_at', 'entries',
            'total_debit', 'total_credit', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'journal_number', 'status', 'posted_by', 'posted_at',
            'reversed_by', 'created_at', 'updated_at'
        ]

    def get_total_debit(self, obj):
        if hasattr(obj, '_total_debit'):
            return obj._total_debit
        return obj.entries.aggregate(total=Sum('debit_amount'))['total'] or Decimal('0')

    def get_total_credit(self, obj):
        if hasattr(obj, '_total_credit'):
            return obj._total_credit
        return obj.entries.aggregate(total=Sum('credit_amount'))['total'] or Decimal('0')


class JournalCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating journals with entries."""
    entries = serializers.ListField(child=serializers.DictField(), write_only=True)

    class Meta:
        model = Journal
        fields = [
            'journal_type', 'date', 'description', 'reference',
            'currency', 'exchange_rate', 'entries'
        ]

    def validate_entries(self, entries):
        if len(entries) < 2:
            raise serializers.ValidationError('Journal must have at least 2 entries')

        total_debit = Decimal('0')
        total_credit = Decimal('0')

        for entry in entries:
            if not entry.get('account'):
                raise serializers.ValidationError('Each entry must have an account')

            debit = Decimal(str(entry.get('debit_amount', 0) or 0))
            credit = Decimal(str(entry.get('credit_amount', 0) or 0))

            if debit and credit:
                raise serializers.ValidationError('Entry cannot have both debit and credit')
            if not debit and not credit:
                raise serializers.ValidationError('Entry must have debit or credit amount')

            total_debit += debit
            total_credit += credit

        if total_debit != total_credit:
            raise serializers.ValidationError(
                f'Journal is unbalanced. Debits: {total_debit}, Credits: {total_credit}'
            )

        return entries

    def create(self, validated_data):
        entries_data = validated_data.pop('entries')
        validated_data['created_by'] = self.context['request'].user

        journal = Journal.objects.create(**validated_data)

        for entry_data in entries_data:
            JournalEntry.objects.create(
                journal=journal,
                account_id=entry_data['account'],
                description=entry_data.get('description', ''),
                debit_amount=Decimal(str(entry_data.get('debit_amount', 0) or 0)),
                credit_amount=Decimal(str(entry_data.get('credit_amount', 0) or 0)),
                source_type=entry_data.get('source_type', ''),
                source_id=entry_data.get('source_id')
            )

        return journal


class GeneralLedgerSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)
    journal_number = serializers.CharField(source='journal_entry.journal.journal_number', read_only=True)

    class Meta:
        model = GeneralLedger
        fields = [
            'id', 'journal_entry', 'journal_number', 'account',
            'account_code', 'account_name', 'date', 'description',
            'debit_amount', 'credit_amount', 'balance',
            'currency', 'exchange_rate', 'created_at'
        ]


class AuditTrailSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)

    class Meta:
        model = AuditTrail
        fields = [
            'id', 'action', 'model_name', 'record_id', 'changes',
            'user', 'user_name', 'user_email', 'ip_address', 'user_agent',
            'timestamp'
        ]


class FiscalPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = FiscalPeriod
        fields = [
            'id', 'name', 'start_date', 'end_date', 'is_closed',
            'closed_at', 'closed_by'
        ]


class TrialBalanceSerializer(serializers.Serializer):
    """Serializer for trial balance report."""
    account_code = serializers.CharField()
    account_name = serializers.CharField()
    account_type = serializers.CharField()
    debit_balance = serializers.DecimalField(max_digits=18, decimal_places=2)
    credit_balance = serializers.DecimalField(max_digits=18, decimal_places=2)


class BankAccountSerializer(serializers.ModelSerializer):
    """Serializer for Bank Accounts."""
    gl_account_name = serializers.CharField(source='gl_account.name', read_only=True)
    gl_account_code = serializers.CharField(source='gl_account.code', read_only=True)
    unreconciled_difference = serializers.ReadOnlyField()

    class Meta:
        model = BankAccount
        fields = [
            'id', 'code', 'name', 'account_type', 'bank_name', 'branch',
            'account_number', 'swift_code', 'currency', 'gl_account',
            'gl_account_name', 'gl_account_code', 'book_balance', 'bank_balance',
            'last_reconciled_date', 'last_reconciled_balance',
            'unreconciled_difference', 'is_active', 'is_default',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['code', 'book_balance', 'bank_balance',
                           'last_reconciled_date', 'last_reconciled_balance',
                           'created_at', 'updated_at']


class BankTransactionSerializer(serializers.ModelSerializer):
    """Serializer for Bank Transactions."""
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True)
    matched_receipt_number = serializers.CharField(
        source='matched_receipt.receipt_number', read_only=True
    )
    reconciled_by_name = serializers.CharField(
        source='reconciled_by.get_full_name', read_only=True
    )

    class Meta:
        model = BankTransaction
        fields = [
            'id', 'bank_account', 'bank_account_name', 'transaction_date',
            'value_date', 'reference', 'description', 'transaction_type',
            'amount', 'running_balance', 'status', 'matched_receipt',
            'matched_receipt_number', 'matched_journal', 'reconciled_at',
            'reconciled_by', 'reconciled_by_name', 'ai_match_confidence',
            'ai_match_suggestion', 'created_at', 'updated_at'
        ]
        read_only_fields = ['status', 'matched_receipt', 'matched_journal',
                           'reconciled_at', 'reconciled_by', 'created_at', 'updated_at']


class BankTransactionUploadSerializer(serializers.Serializer):
    """Serializer for uploading bank statement."""
    file = serializers.FileField()
    bank_account = serializers.PrimaryKeyRelatedField(queryset=BankAccount.objects.all())
    file_format = serializers.ChoiceField(
        choices=[('csv', 'CSV'), ('excel', 'Excel'), ('ofx', 'OFX')],
        default='csv'
    )


class BankReconciliationSerializer(serializers.ModelSerializer):
    """Serializer for Bank Reconciliation."""
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    completed_by_name = serializers.CharField(
        source='completed_by.get_full_name', read_only=True
    )
    difference = serializers.ReadOnlyField()
    is_balanced = serializers.ReadOnlyField()

    class Meta:
        model = BankReconciliation
        fields = [
            'id', 'bank_account', 'bank_account_name', 'period_start',
            'period_end', 'month', 'year', 'statement_balance', 'book_balance',
            'adjusted_book_balance', 'outstanding_deposits',
            'outstanding_withdrawals', 'status', 'notes', 'difference',
            'is_balanced', 'created_by', 'created_by_name',
            'completed_at', 'completed_by', 'completed_by_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['status', 'completed_at', 'completed_by',
                           'created_at', 'updated_at']


class ReconciliationItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReconciliationItem
        fields = [
            'id', 'item_type', 'receipt', 'gl_entry', 'date',
            'reference', 'description', 'amount', 'is_reconciled', 'reconciled_at'
        ]


class ReconciliationCreateSerializer(serializers.Serializer):
    bank_account = serializers.PrimaryKeyRelatedField(queryset=BankAccount.objects.all())
    month = serializers.IntegerField(min_value=1, max_value=12)
    year = serializers.IntegerField(min_value=2000, max_value=2100)
    statement_balance = serializers.DecimalField(max_digits=18, decimal_places=2)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ReconciliationWorkspaceSerializer(serializers.ModelSerializer):
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True)
    bank_account_currency = serializers.CharField(source='bank_account.currency', read_only=True)
    items = ReconciliationItemSerializer(many=True, read_only=True)
    difference = serializers.ReadOnlyField()
    is_balanced = serializers.ReadOnlyField()
    reconciled_count = serializers.SerializerMethodField()
    unreconciled_count = serializers.SerializerMethodField()
    total_payments = serializers.SerializerMethodField()
    total_receipts = serializers.SerializerMethodField()

    class Meta:
        model = BankReconciliation
        fields = [
            'id', 'bank_account', 'bank_account_name', 'bank_account_currency',
            'month', 'year', 'period_start', 'period_end',
            'statement_balance', 'book_balance',
            'status', 'notes', 'difference', 'is_balanced',
            'reconciled_count', 'unreconciled_count',
            'total_payments', 'total_receipts',
            'items', 'created_by', 'completed_at', 'completed_by',
            'created_at', 'updated_at'
        ]

    def get_reconciled_count(self, obj):
        items = obj.items.all()
        return sum(1 for i in items if i.is_reconciled)

    def get_unreconciled_count(self, obj):
        items = obj.items.all()
        return sum(1 for i in items if not i.is_reconciled)

    def get_total_payments(self, obj):
        items = obj.items.all()
        return str(sum(i.amount for i in items if i.item_type == 'payment'))

    def get_total_receipts(self, obj):
        items = obj.items.all()
        return str(sum(i.amount for i in items if i.item_type == 'receipt'))


class ExpenseCategorySerializer(serializers.ModelSerializer):
    """Serializer for Expense Categories."""
    gl_account_name = serializers.CharField(source='gl_account.name', read_only=True)
    gl_account_code = serializers.CharField(source='gl_account.code', read_only=True)

    class Meta:
        model = ExpenseCategory
        fields = [
            'id', 'code', 'name', 'description', 'gl_account',
            'gl_account_name', 'gl_account_code', 'is_deductible',
            'requires_approval', 'approval_threshold', 'is_active',
            'is_system', 'created_at', 'updated_at'
        ]
        read_only_fields = ['code', 'is_system', 'created_at', 'updated_at']


class JournalReallocationSerializer(serializers.ModelSerializer):
    """Serializer for Journal Reallocations."""
    from_account_code = serializers.CharField(source='from_account.code', read_only=True)
    from_account_name = serializers.CharField(source='from_account.name', read_only=True)
    to_account_code = serializers.CharField(source='to_account.code', read_only=True)
    to_account_name = serializers.CharField(source='to_account.name', read_only=True)
    reallocated_by_name = serializers.CharField(
        source='reallocated_by.get_full_name', read_only=True
    )

    class Meta:
        model = JournalReallocation
        fields = [
            'id', 'original_entry', 'new_entry', 'from_account',
            'from_account_code', 'from_account_name', 'to_account',
            'to_account_code', 'to_account_name', 'amount', 'reason',
            'reallocated_by', 'reallocated_by_name', 'created_at'
        ]
        read_only_fields = ['original_entry', 'new_entry', 'from_account',
                           'reallocated_by', 'created_at']


class ReallocationCreateSerializer(serializers.Serializer):
    """Serializer for creating reallocations."""
    original_entry_id = serializers.IntegerField()
    to_account_id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    reason = serializers.CharField(max_length=500)

    def validate_original_entry_id(self, value):
        if not JournalEntry.objects.filter(id=value).exists():
            raise serializers.ValidationError('Journal entry not found')
        return value

    def validate_to_account_id(self, value):
        if not ChartOfAccount.objects.filter(id=value).exists():
            raise serializers.ValidationError('Account not found')
        return value


class IncomeTypeSerializer(serializers.ModelSerializer):
    """Serializer for Income Types."""
    gl_account_name = serializers.CharField(source='gl_account.name', read_only=True)
    gl_account_code = serializers.CharField(source='gl_account.code', read_only=True)

    class Meta:
        model = IncomeType
        fields = [
            'id', 'code', 'name', 'description', 'gl_account',
            'gl_account_name', 'gl_account_code', 'is_commissionable',
            'default_commission_rate', 'is_vatable', 'vat_rate',
            'is_active', 'display_order', 'is_system', 'management_type',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['code', 'is_system', 'created_at', 'updated_at']


class SubsidiaryTransactionSerializer(serializers.ModelSerializer):
    """Individual transaction line in a subsidiary account statement."""
    display_description = serializers.SerializerMethodField()

    class Meta:
        model = SubsidiaryTransaction
        fields = [
            'id', 'transaction_number', 'date', 'contra_account',
            'reference', 'description', 'display_description',
            'debit_amount', 'credit_amount',
            'balance', 'is_reversal', 'reversed_transaction',
            'is_consolidated', 'consolidation_marker',
            'overwritten_description', 'created_at'
        ]

    def get_display_description(self, obj):
        """Return overwritten description if set, otherwise original."""
        return obj.overwritten_description or obj.description


class SubsidiaryAccountSerializer(serializers.ModelSerializer):
    """Subsidiary account with summary info."""
    entity_name = serializers.SerializerMethodField()
    entity_id = serializers.SerializerMethodField()
    transaction_count = serializers.SerializerMethodField()

    class Meta:
        model = SubsidiaryAccount
        fields = [
            'id', 'code', 'name', 'entity_type', 'entity_name', 'entity_id',
            'currency', 'current_balance', 'is_active',
            'transaction_count', 'created_at', 'updated_at'
        ]

    def get_entity_name(self, obj):
        if obj.tenant:
            return obj.tenant.name
        if obj.landlord:
            return obj.landlord.name
        return obj.name

    def get_entity_id(self, obj):
        if obj.tenant_id:
            return obj.tenant_id
        if obj.landlord_id:
            return obj.landlord_id
        return None

    def get_transaction_count(self, obj):
        return obj.transactions.count()


class SubsidiaryStatementSerializer(serializers.Serializer):
    """Full statement for a subsidiary account (like a tenant or landlord statement)."""
    account = SubsidiaryAccountSerializer()
    period_start = serializers.DateField()
    period_end = serializers.DateField()
    opening_balance = serializers.DecimalField(max_digits=18, decimal_places=2)
    transactions = SubsidiaryTransactionSerializer(many=True)
    total_debits = serializers.DecimalField(max_digits=18, decimal_places=2)
    total_credits = serializers.DecimalField(max_digits=18, decimal_places=2)
    closing_balance = serializers.DecimalField(max_digits=18, decimal_places=2)


class TransactionConsolidationSerializer(serializers.ModelSerializer):
    """Serializer for TransactionConsolidation."""
    source_transactions = SubsidiaryTransactionSerializer(many=True, read_only=True)
    consolidated_entry = SubsidiaryTransactionSerializer(read_only=True)

    class Meta:
        model = TransactionConsolidation
        fields = [
            'id', 'consolidated_entry', 'source_transactions',
            'account', 'reason', 'created_by', 'created_at',
        ]
        read_only_fields = ['created_at']


# ── Layer 2: Accrued Expenses ──────────────────────────────────────────────

class AccruedExpenseSerializer(serializers.ModelSerializer):
    """Read serializer for AccruedExpense with computed display fields."""
    landlord_name = serializers.CharField(source='landlord.name', read_only=True)
    expense_account_name = serializers.CharField(source='expense_account.name', read_only=True)
    expense_account_code = serializers.CharField(source='expense_account.code', read_only=True)
    payable_account_name = serializers.CharField(source='payable_account.name', read_only=True)
    payable_account_code = serializers.CharField(source='payable_account.code', read_only=True)
    landlord_sub_account_code = serializers.CharField(
        source='landlord_sub_account.code', read_only=True
    )
    accrual_sub_account_code = serializers.CharField(
        source='accrual_sub_account.code', read_only=True
    )
    journal_number = serializers.CharField(
        source='journal.journal_number', read_only=True
    )
    created_by_name = serializers.CharField(
        source='created_by.get_full_name', read_only=True
    )

    class Meta:
        model = AccruedExpense
        fields = [
            'id', 'expense_number', 'date', 'expense_account',
            'expense_account_name', 'expense_account_code',
            'expense_class', 'payable_account', 'payable_account_name',
            'payable_account_code', 'funding_category',
            'accrual_sub_account', 'accrual_sub_account_code',
            'landlord_sub_account', 'landlord_sub_account_code',
            'landlord', 'landlord_name', 'description', 'custom_description',
            'amount', 'currency', 'status', 'journal', 'journal_number',
            'cleared_by_expense', 'cleared_date',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'expense_number', 'status', 'journal', 'cleared_by_expense',
            'cleared_date', 'created_by', 'created_at', 'updated_at',
        ]


class AccruedExpenseCreateSerializer(serializers.ModelSerializer):
    """Create serializer for AccruedExpense with validation."""

    class Meta:
        model = AccruedExpense
        fields = [
            'date', 'expense_account', 'expense_class', 'payable_account',
            'funding_category', 'accrual_sub_account', 'landlord_sub_account',
            'landlord', 'description', 'custom_description', 'amount', 'currency',
        ]

    def validate(self, data):
        if data.get('expense_class') == AccruedExpense.ExpenseClass.CLEARABLE:
            if not data.get('accrual_sub_account'):
                raise serializers.ValidationError(
                    {'accrual_sub_account': 'Required for clearable expenses.'}
                )
        if data['amount'] <= 0:
            raise serializers.ValidationError(
                {'amount': 'Amount must be greater than zero.'}
            )
        return data

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


# ── Layer 3: Balance Sheet Movements ───────────────────────────────────────

class BalanceSheetMovementSerializer(serializers.ModelSerializer):
    """Read serializer for BalanceSheetMovement with computed display fields."""
    landlord_name = serializers.CharField(source='landlord.name', read_only=True)
    debit_account_name = serializers.CharField(source='debit_account.name', read_only=True)
    debit_account_code = serializers.CharField(source='debit_account.code', read_only=True)
    credit_account_name = serializers.CharField(source='credit_account.name', read_only=True)
    credit_account_code = serializers.CharField(source='credit_account.code', read_only=True)
    landlord_sub_account_code = serializers.CharField(
        source='landlord_sub_account.code', read_only=True
    )
    journal_number = serializers.CharField(
        source='journal.journal_number', read_only=True
    )
    created_by_name = serializers.CharField(
        source='created_by.get_full_name', read_only=True
    )

    class Meta:
        model = BalanceSheetMovement
        fields = [
            'id', 'movement_number', 'date', 'debit_account',
            'debit_account_name', 'debit_account_code',
            'credit_account', 'credit_account_name', 'credit_account_code',
            'category', 'landlord', 'landlord_name',
            'landlord_sub_account', 'landlord_sub_account_code',
            'description', 'custom_description', 'amount', 'currency',
            'status', 'journal', 'journal_number',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'movement_number', 'status', 'journal',
            'created_by', 'created_at', 'updated_at',
        ]


class BalanceSheetMovementCreateSerializer(serializers.ModelSerializer):
    """Create serializer for BalanceSheetMovement with validation."""

    class Meta:
        model = BalanceSheetMovement
        fields = [
            'date', 'debit_account', 'credit_account', 'category',
            'landlord', 'landlord_sub_account',
            'description', 'custom_description', 'amount', 'currency',
        ]

    def validate(self, data):
        if data['amount'] <= 0:
            raise serializers.ValidationError(
                {'amount': 'Amount must be greater than zero.'}
            )
        if data['debit_account'] == data['credit_account']:
            raise serializers.ValidationError(
                'Debit and credit accounts must be different.'
            )
        return data

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class OpeningBalanceSerializer(serializers.ModelSerializer):
    """Read serializer for OpeningBalance."""
    target_account_name = serializers.CharField(source='target_account.name', read_only=True)
    target_account_code = serializers.CharField(source='target_account.code', read_only=True)
    landlord_name = serializers.CharField(source='landlord.name', read_only=True)
    landlord_sub_name = serializers.CharField(source='landlord_sub_account.name', read_only=True, default=None)
    tenant_sub_name = serializers.CharField(source='tenant_sub_account.name', read_only=True, default=None)
    journal_number = serializers.CharField(source='journal.journal_number', read_only=True, default=None)

    class Meta:
        model = OpeningBalance
        fields = [
            'id', 'entry_number', 'date', 'target_account', 'target_account_name',
            'target_account_code', 'direction', 'category',
            'landlord', 'landlord_name', 'landlord_sub_account', 'landlord_sub_name',
            'tenant_sub_account', 'tenant_sub_name',
            'description', 'custom_description', 'amount', 'currency',
            'status', 'journal', 'journal_number',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['entry_number', 'journal', 'created_at', 'updated_at']


class OpeningBalanceCreateSerializer(serializers.ModelSerializer):
    """Create serializer for OpeningBalance."""

    class Meta:
        model = OpeningBalance
        fields = [
            'date', 'target_account', 'direction', 'category',
            'landlord', 'landlord_sub_account', 'tenant_sub_account',
            'description', 'custom_description', 'amount', 'currency',
        ]

    def validate(self, data):
        if data['amount'] <= 0:
            raise serializers.ValidationError({'amount': 'Amount must be greater than zero.'})
        return data

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)
