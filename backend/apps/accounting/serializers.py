"""Serializers for accounting module."""
from decimal import Decimal
from rest_framework import serializers
from .models import (
    ChartOfAccount, ExchangeRate, Journal, JournalEntry,
    GeneralLedger, AuditTrail, FiscalPeriod, BankAccount,
    BankTransaction, BankReconciliation, ExpenseCategory,
    JournalReallocation, IncomeType
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
        return sum(e.debit_amount for e in obj.entries.all())

    def get_total_credit(self, obj):
        return sum(e.credit_amount for e in obj.entries.all())


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
            'user', 'user_name', 'user_email', 'ip_address', 'timestamp'
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
            'period_end', 'statement_balance', 'book_balance',
            'adjusted_book_balance', 'outstanding_deposits',
            'outstanding_withdrawals', 'status', 'notes', 'difference',
            'is_balanced', 'created_by', 'created_by_name',
            'completed_at', 'completed_by', 'completed_by_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['status', 'completed_at', 'completed_by',
                           'created_at', 'updated_at']


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
            'is_active', 'display_order', 'created_at', 'updated_at'
        ]
        read_only_fields = ['code', 'created_at', 'updated_at']
