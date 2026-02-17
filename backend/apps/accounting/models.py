"""
Double-Entry Accounting Engine Models.
Implements T-Account Architecture for Real Estate Accounting.

Activities:
1. Debt Recognition - Invoice creation (Dr: Accounts Receivable, Cr: Revenue)
2. Payment Receipt - Cash received (Dr: Cash/Bank, Cr: Accounts Receivable)
3. Revenue Recognition - Commission earned (Dr: Accounts Receivable, Cr: Commission Income)
4. Commission/VAT - Tax handling
5. Expense Payouts - Landlord payments (Dr: Accounts Payable, Cr: Cash)
"""
from decimal import Decimal
from django.db import models, transaction
from django.core.exceptions import ValidationError
from django.conf import settings
from middleware.tenant_middleware import get_current_user


class ChartOfAccount(models.Model):
    """Chart of Accounts - defines all account types in the system."""

    class AccountType(models.TextChoices):
        ASSET = 'asset', 'Asset'
        LIABILITY = 'liability', 'Liability'
        EQUITY = 'equity', 'Equity'
        REVENUE = 'revenue', 'Revenue'
        EXPENSE = 'expense', 'Expense'

    class AccountSubType(models.TextChoices):
        # Assets
        CASH = 'cash', 'Cash & Bank'
        ACCOUNTS_RECEIVABLE = 'accounts_receivable', 'Accounts Receivable'
        PREPAID = 'prepaid', 'Prepaid Expenses'
        FIXED_ASSET = 'fixed_asset', 'Fixed Assets'
        # Liabilities
        ACCOUNTS_PAYABLE = 'accounts_payable', 'Accounts Payable'
        VAT_PAYABLE = 'vat_payable', 'VAT Payable'
        TENANT_DEPOSITS = 'tenant_deposits', 'Tenant Deposits'
        # Equity
        RETAINED_EARNINGS = 'retained_earnings', 'Retained Earnings'
        CAPITAL = 'capital', 'Capital'
        # Revenue - Real Estate Income Types
        RENTAL_INCOME = 'rental_income', 'Rental Income'
        LEVY_INCOME = 'levy_income', 'Levy Income'
        SPECIAL_LEVY_INCOME = 'special_levy_income', 'Special Levy Income'
        RATES_INCOME = 'rates_income', 'Rates Income'
        PARKING_INCOME = 'parking_income', 'Parking Income'
        VAT_INCOME = 'vat_income', 'VAT Income'
        COMMISSION_INCOME = 'commission_income', 'Commission Income'
        OTHER_INCOME = 'other_income', 'Other Income'
        # Expenses
        OPERATING_EXPENSE = 'operating_expense', 'Operating Expenses'
        MAINTENANCE = 'maintenance', 'Maintenance & Repairs'
        UTILITIES = 'utilities', 'Utilities'
        CUSTOM_EXPENSE = 'custom_expense', 'Custom Expense'

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    account_type = models.CharField(max_length=20, choices=AccountType.choices)
    account_subtype = models.CharField(max_length=30, choices=AccountSubType.choices)
    description = models.TextField(blank=True)
    parent = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='children'
    )
    is_active = models.BooleanField(default=True)
    is_system = models.BooleanField(default=False)  # System accounts can't be deleted
    currency = models.CharField(max_length=3, default='USD')

    # Running balance
    current_balance = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Account'
        verbose_name_plural = 'Chart of Accounts'
        ordering = ['code']

    def __str__(self):
        return f'{self.code} - {self.name}'

    @property
    def normal_balance(self):
        """Return the normal balance side (debit or credit) for this account type."""
        if self.account_type in ['asset', 'expense']:
            return 'debit'
        return 'credit'


class ExchangeRate(models.Model):
    """Exchange rate history for multi-currency support."""
    from_currency = models.CharField(max_length=3, default='USD')
    to_currency = models.CharField(max_length=3, default='ZiG')
    rate = models.DecimalField(max_digits=18, decimal_places=6)
    effective_date = models.DateField()
    source = models.CharField(max_length=100, blank=True)  # e.g., "RBZ Official"
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Exchange Rate'
        verbose_name_plural = 'Exchange Rates'
        ordering = ['-effective_date']
        unique_together = ['from_currency', 'to_currency', 'effective_date']

    def __str__(self):
        return f'{self.from_currency}/{self.to_currency}: {self.rate} ({self.effective_date})'

    @classmethod
    def get_rate(cls, from_currency, to_currency, date=None):
        """Get the exchange rate for a given date (or latest if no date)."""
        from django.utils import timezone
        date = date or timezone.now().date()

        rate = cls.objects.filter(
            from_currency=from_currency,
            to_currency=to_currency,
            effective_date__lte=date
        ).order_by('-effective_date').first()

        if rate:
            return rate.rate
        return Decimal('1.0')  # Default to 1:1 if no rate found


class Journal(models.Model):
    """
    Journal - Transaction header for grouping related entries.
    Each journal represents a complete financial transaction.
    """

    class JournalType(models.TextChoices):
        GENERAL = 'general', 'General Journal'
        SALES = 'sales', 'Sales Journal'
        RECEIPTS = 'receipts', 'Cash Receipts'
        PAYMENTS = 'payments', 'Cash Payments'
        ADJUSTMENT = 'adjustment', 'Adjusting Entry'
        REVERSAL = 'reversal', 'Reversal Entry'

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        POSTED = 'posted', 'Posted'
        REVERSED = 'reversed', 'Reversed'

    journal_number = models.CharField(max_length=50, unique=True)
    journal_type = models.CharField(max_length=20, choices=JournalType.choices, default=JournalType.GENERAL)
    date = models.DateField()
    description = models.TextField()
    reference = models.CharField(max_length=100, blank=True)  # External reference

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)

    # For reversals
    reversed_by = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reversal_of'
    )
    reversal_reason = models.TextField(blank=True)

    # Multi-currency
    currency = models.CharField(max_length=3, default='USD')
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal('1.0'))

    # Audit
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='created_journals'
    )
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='posted_journals'
    )
    posted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Journal'
        verbose_name_plural = 'Journals'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f'{self.journal_number} - {self.description[:50]}'

    def save(self, *args, **kwargs):
        if not self.journal_number:
            self.journal_number = self.generate_journal_number()
        super().save(*args, **kwargs)

    @classmethod
    def generate_journal_number(cls):
        from django.utils import timezone
        prefix = timezone.now().strftime('JRN%Y%m')
        last = cls.objects.filter(journal_number__startswith=prefix).order_by('-journal_number').first()
        if last:
            num = int(last.journal_number[-4:]) + 1
        else:
            num = 1
        return f'{prefix}{num:04d}'

    def validate_balance(self):
        """Validate that debits equal credits."""
        entries = self.entries.all()
        total_debit = sum(e.debit_amount for e in entries)
        total_credit = sum(e.credit_amount for e in entries)

        if total_debit != total_credit:
            raise ValidationError(
                f'Journal is unbalanced. Debits: {total_debit}, Credits: {total_credit}'
            )
        return True

    @transaction.atomic
    def post(self, user=None):
        """Post the journal and update account balances."""
        from django.utils import timezone

        if self.status != self.Status.DRAFT:
            raise ValidationError('Only draft journals can be posted')

        self.validate_balance()

        # Update account balances — lock rows to prevent concurrent balance corruption
        entries = list(self.entries.select_related('account').all())
        account_ids = [e.account_id for e in entries]
        # Lock all affected accounts in consistent order to prevent deadlocks
        locked_accounts = {
            a.id: a for a in ChartOfAccount.objects.select_for_update().filter(
                id__in=account_ids
            ).order_by('id')
        }

        gl_entries = []
        for entry in entries:
            account = locked_accounts[entry.account_id]
            if entry.debit_amount:
                if account.normal_balance == 'debit':
                    account.current_balance += entry.debit_amount
                else:
                    account.current_balance -= entry.debit_amount
            if entry.credit_amount:
                if account.normal_balance == 'credit':
                    account.current_balance += entry.credit_amount
                else:
                    account.current_balance -= entry.credit_amount
            account.save(update_fields=['current_balance', 'updated_at'])

            gl_entries.append(GeneralLedger(
                journal_entry=entry,
                account=account,
                date=self.date,
                description=entry.description or self.description,
                debit_amount=entry.debit_amount,
                credit_amount=entry.credit_amount,
                balance=account.current_balance,
                currency=self.currency,
                exchange_rate=self.exchange_rate
            ))

        GeneralLedger.objects.bulk_create(gl_entries)

        self.status = self.Status.POSTED
        self.posted_by = user or get_current_user()
        self.posted_at = timezone.now()
        self.save()

        # Create audit trail
        AuditTrail.objects.create(
            action='journal_posted',
            model_name='Journal',
            record_id=self.id,
            changes={'journal_number': self.journal_number, 'status': 'posted'},
            user=self.posted_by
        )

        return True

    @transaction.atomic
    def reverse(self, reason, user=None):
        """Create a reversal journal entry."""
        from django.utils import timezone

        if self.status != self.Status.POSTED:
            raise ValidationError('Only posted journals can be reversed')

        if not reason:
            raise ValidationError('Reversal reason is required')

        # Create reversal journal
        reversal = Journal.objects.create(
            journal_type=self.JournalType.REVERSAL,
            date=timezone.now().date(),
            description=f'Reversal of {self.journal_number}: {reason}',
            reference=self.journal_number,
            currency=self.currency,
            exchange_rate=self.exchange_rate,
            created_by=user or get_current_user()
        )

        # Create reversed entries (swap debits and credits)
        for entry in self.entries.all():
            JournalEntry.objects.create(
                journal=reversal,
                account=entry.account,
                description=f'Reversal: {entry.description}',
                debit_amount=entry.credit_amount,
                credit_amount=entry.debit_amount
            )

        # Post the reversal
        reversal.post(user)

        # Mark original as reversed
        self.status = self.Status.REVERSED
        self.reversed_by = reversal
        self.reversal_reason = reason
        self.save()

        AuditTrail.objects.create(
            action='journal_reversed',
            model_name='Journal',
            record_id=self.id,
            changes={
                'journal_number': self.journal_number,
                'reversed_by': reversal.journal_number,
                'reason': reason
            },
            user=user or get_current_user()
        )

        return reversal


class JournalEntry(models.Model):
    """
    Journal Entry - Individual debit/credit line in a journal.
    Implements strict double-entry: each entry must have either debit OR credit.
    """
    journal = models.ForeignKey(Journal, on_delete=models.CASCADE, related_name='entries')
    account = models.ForeignKey(ChartOfAccount, on_delete=models.PROTECT, related_name='entries')
    description = models.CharField(max_length=500, blank=True)

    debit_amount = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    credit_amount = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))

    # Optional reference to source document
    source_type = models.CharField(max_length=50, blank=True)  # e.g., 'invoice', 'receipt'
    source_id = models.PositiveIntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Journal Entry'
        verbose_name_plural = 'Journal Entries'
        ordering = ['id']
        indexes = [
            models.Index(fields=['source_type', 'source_id']),
        ]

    def __str__(self):
        if self.debit_amount:
            return f'Dr: {self.account.code} - {self.debit_amount}'
        return f'Cr: {self.account.code} - {self.credit_amount}'

    def clean(self):
        """Validate entry has either debit or credit, not both."""
        if self.debit_amount and self.credit_amount:
            raise ValidationError('Entry cannot have both debit and credit amounts')
        if not self.debit_amount and not self.credit_amount:
            raise ValidationError('Entry must have either debit or credit amount')

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class GeneralLedger(models.Model):
    """
    General Ledger - Posted transactions with running balances.
    This is the book of record for all financial transactions.
    """
    journal_entry = models.OneToOneField(
        JournalEntry, on_delete=models.PROTECT, related_name='gl_entry'
    )
    account = models.ForeignKey(ChartOfAccount, on_delete=models.PROTECT, related_name='gl_entries')
    date = models.DateField(db_index=True)
    description = models.CharField(max_length=500)

    debit_amount = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    credit_amount = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    balance = models.DecimalField(max_digits=18, decimal_places=2)  # Running balance

    currency = models.CharField(max_length=3, default='USD')
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal('1.0'))

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'General Ledger Entry'
        verbose_name_plural = 'General Ledger'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['account', 'date']),
            models.Index(fields=['date']),
        ]

    def __str__(self):
        return f'{self.date} - {self.account.code}: Dr {self.debit_amount} / Cr {self.credit_amount}'


class AuditTrail(models.Model):
    """
    Immutable Audit Trail - Records all sensitive financial actions.
    This table should NEVER be modified or deleted.
    """
    action = models.CharField(max_length=100)
    model_name = models.CharField(max_length=100)
    record_id = models.PositiveIntegerField()
    changes = models.JSONField(default=dict)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='audit_actions'
    )
    user_email = models.EmailField(blank=True)  # Preserved even if user deleted

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)

    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = 'Audit Trail Entry'
        verbose_name_plural = 'Audit Trail'
        ordering = ['-timestamp']

    def __str__(self):
        return f'{self.timestamp} - {self.action} on {self.model_name}#{self.record_id}'

    def save(self, *args, **kwargs):
        # Preserve user email
        if self.user and not self.user_email:
            self.user_email = self.user.email
        # Auto-populate IP and user agent from request context if not set
        if not self.ip_address or not self.user_agent:
            from middleware.tenant_middleware import get_current_request_meta
            meta = get_current_request_meta()
            if not self.ip_address and meta.get('ip_address'):
                self.ip_address = meta['ip_address']
            if not self.user_agent and meta.get('user_agent'):
                self.user_agent = meta['user_agent']
        # Prevent updates to existing records
        if self.pk:
            raise ValidationError('Audit trail entries cannot be modified')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Audit trail entries cannot be deleted')


class FiscalPeriod(models.Model):
    """Fiscal periods for financial reporting."""
    name = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField()
    is_closed = models.BooleanField(default=False)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='closed_periods'
    )

    class Meta:
        verbose_name = 'Fiscal Period'
        verbose_name_plural = 'Fiscal Periods'
        ordering = ['-start_date']

    def __str__(self):
        return f'{self.name} ({self.start_date} - {self.end_date})'


class BankAccount(models.Model):
    """
    Bank Account - Represents physical bank accounts for receipt tracking.
    Examples: FBC Bank, EcoCash, ZB Bank, CABS, Cash
    """

    class AccountType(models.TextChoices):
        BANK = 'bank', 'Bank Account'
        MOBILE_MONEY = 'mobile_money', 'Mobile Money'
        CASH = 'cash', 'Cash'

    class Currency(models.TextChoices):
        USD = 'USD', 'US Dollar'
        ZWG = 'ZWG', 'Zimbabwe Gold (ZiG)'
        ZWL = 'ZWL', 'Zimbabwe Dollar'

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    account_type = models.CharField(max_length=20, choices=AccountType.choices, default=AccountType.BANK)

    # Bank details
    bank_name = models.CharField(max_length=100)
    branch = models.CharField(max_length=100, blank=True)
    account_number = models.CharField(max_length=50, blank=True)
    swift_code = models.CharField(max_length=20, blank=True)

    # Currency support
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.USD)

    # GL Integration
    gl_account = models.ForeignKey(
        ChartOfAccount, on_delete=models.PROTECT,
        related_name='bank_accounts',
        limit_choices_to={'account_subtype': 'cash'}
    )

    # Balances
    book_balance = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    bank_balance = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    last_reconciled_date = models.DateField(null=True, blank=True)
    last_reconciled_balance = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))

    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Bank Account'
        verbose_name_plural = 'Bank Accounts'
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.currency})'

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = self.generate_code()
        # Ensure only one default per currency
        if self.is_default:
            BankAccount.objects.filter(
                currency=self.currency, is_default=True
            ).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)

    @classmethod
    def generate_code(cls):
        last = cls.objects.order_by('-id').first()
        num = (last.id + 1) if last else 1
        return f'BA{num:04d}'

    @property
    def unreconciled_difference(self):
        """Calculate difference between book and bank balance."""
        return self.bank_balance - self.book_balance


class BankTransaction(models.Model):
    """
    Bank Transaction - Records individual bank statement transactions for reconciliation.
    """

    class Status(models.TextChoices):
        UNRECONCILED = 'unreconciled', 'Unreconciled'
        RECONCILED = 'reconciled', 'Reconciled'
        DISPUTED = 'disputed', 'Disputed'

    class TransactionType(models.TextChoices):
        CREDIT = 'credit', 'Credit (Deposit)'
        DEBIT = 'debit', 'Debit (Withdrawal)'

    bank_account = models.ForeignKey(
        BankAccount, on_delete=models.CASCADE, related_name='transactions'
    )

    transaction_date = models.DateField()
    value_date = models.DateField(null=True, blank=True)
    reference = models.CharField(max_length=255)  # Bank statement reference
    description = models.TextField(blank=True)

    transaction_type = models.CharField(max_length=10, choices=TransactionType.choices)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    running_balance = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.UNRECONCILED)

    # Matching
    matched_receipt = models.ForeignKey(
        'billing.Receipt', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='bank_transactions'
    )
    matched_journal = models.ForeignKey(
        Journal, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='bank_transactions'
    )

    reconciled_at = models.DateTimeField(null=True, blank=True)
    reconciled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reconciled_transactions'
    )

    # AI matching result
    ai_match_confidence = models.PositiveIntegerField(null=True, blank=True)
    ai_match_suggestion = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Bank Transaction'
        verbose_name_plural = 'Bank Transactions'
        ordering = ['-transaction_date', '-created_at']
        indexes = [
            models.Index(fields=['bank_account', 'status']),
            models.Index(fields=['transaction_date']),
        ]

    def __str__(self):
        return f'{self.transaction_date} - {self.reference}: {self.amount}'

    @transaction.atomic
    def reconcile(self, receipt=None, journal=None, user=None):
        """Mark transaction as reconciled."""
        from django.utils import timezone

        self.status = self.Status.RECONCILED
        self.matched_receipt = receipt
        self.matched_journal = journal
        self.reconciled_at = timezone.now()
        self.reconciled_by = user
        self.save()

        # Lock bank account row to prevent concurrent balance corruption
        bank_acct = BankAccount.objects.select_for_update().get(id=self.bank_account_id)
        if self.transaction_type == self.TransactionType.CREDIT:
            bank_acct.book_balance += self.amount
        else:
            bank_acct.book_balance -= self.amount
        bank_acct.save(update_fields=['book_balance', 'updated_at'])


class BankReconciliation(models.Model):
    """
    Bank Reconciliation - Reconciliation session/report.
    """

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        COMPLETED = 'completed', 'Completed'

    bank_account = models.ForeignKey(
        BankAccount, on_delete=models.CASCADE, related_name='reconciliations'
    )

    period_start = models.DateField()
    period_end = models.DateField()

    statement_balance = models.DecimalField(max_digits=18, decimal_places=2)
    book_balance = models.DecimalField(max_digits=18, decimal_places=2)
    adjusted_book_balance = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)

    # Outstanding items
    outstanding_deposits = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    outstanding_withdrawals = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)

    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='created_reconciliations'
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='completed_reconciliations'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Bank Reconciliation'
        verbose_name_plural = 'Bank Reconciliations'
        ordering = ['-period_end']

    def __str__(self):
        return f'{self.bank_account.name} - {self.period_end}'

    @property
    def difference(self):
        """Calculate reconciliation difference."""
        adjusted = self.adjusted_book_balance or self.book_balance
        return self.statement_balance - adjusted

    @property
    def is_balanced(self):
        """Check if reconciliation is balanced."""
        return abs(self.difference) < Decimal('0.01')


class ExpenseCategory(models.Model):
    """
    Dynamic Expense Categories - User-created expense types.
    """
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # GL account mapping
    gl_account = models.ForeignKey(
        ChartOfAccount, on_delete=models.PROTECT,
        related_name='expense_categories',
        limit_choices_to={'account_type': 'expense'}
    )

    # Categorization
    is_deductible = models.BooleanField(default=True)
    requires_approval = models.BooleanField(default=False)
    approval_threshold = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True,
        help_text='Amount above which approval is required'
    )

    is_active = models.BooleanField(default=True)
    is_system = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Expense Category'
        verbose_name_plural = 'Expense Categories'
        ordering = ['name']

    def __str__(self):
        return f'{self.code} - {self.name}'

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = self.generate_code()
        super().save(*args, **kwargs)

    @classmethod
    def generate_code(cls):
        last = cls.objects.order_by('-id').first()
        num = (last.id + 1) if last else 1
        return f'EXP{num:04d}'


class JournalReallocation(models.Model):
    """
    Journal Reallocation - Track expense reallocations to different accounts.
    Allows preparers to move expenses to more appropriate accounts after initial allocation.
    """
    original_entry = models.ForeignKey(
        JournalEntry, on_delete=models.PROTECT, related_name='reallocations_from'
    )
    new_entry = models.ForeignKey(
        JournalEntry, on_delete=models.PROTECT, related_name='reallocations_to'
    )

    from_account = models.ForeignKey(
        ChartOfAccount, on_delete=models.PROTECT, related_name='reallocated_from'
    )
    to_account = models.ForeignKey(
        ChartOfAccount, on_delete=models.PROTECT, related_name='reallocated_to'
    )

    amount = models.DecimalField(max_digits=18, decimal_places=2)
    reason = models.TextField()

    reallocated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='reallocations'
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Journal Reallocation'
        verbose_name_plural = 'Journal Reallocations'
        ordering = ['-created_at']

    def __str__(self):
        return f'Reallocation: {self.from_account.code} → {self.to_account.code} ({self.amount})'

    @classmethod
    @transaction.atomic
    def create_reallocation(cls, original_entry, to_account, amount, reason, user):
        """
        Create a reallocation entry.
        This creates a journal that moves the amount from original account to new account.
        """
        from django.utils import timezone

        from_account = original_entry.account

        # Create reallocation journal
        journal = Journal.objects.create(
            journal_type=Journal.JournalType.ADJUSTMENT,
            date=timezone.now().date(),
            description=f'Reallocation: {from_account.code} → {to_account.code}. Reason: {reason}',
            created_by=user
        )

        # Reverse from original account
        reverse_entry = JournalEntry.objects.create(
            journal=journal,
            account=from_account,
            description=f'Reallocation out - {reason}',
            credit_amount=amount if from_account.normal_balance == 'debit' else Decimal('0'),
            debit_amount=Decimal('0') if from_account.normal_balance == 'debit' else amount
        )

        # Credit to new account
        new_entry = JournalEntry.objects.create(
            journal=journal,
            account=to_account,
            description=f'Reallocation in - {reason}',
            debit_amount=amount if to_account.normal_balance == 'debit' else Decimal('0'),
            credit_amount=Decimal('0') if to_account.normal_balance == 'debit' else amount
        )

        # Post the journal
        journal.post(user)

        # Create reallocation record
        reallocation = cls.objects.create(
            original_entry=original_entry,
            new_entry=new_entry,
            from_account=from_account,
            to_account=to_account,
            amount=amount,
            reason=reason,
            reallocated_by=user
        )

        # Audit trail
        AuditTrail.objects.create(
            action='expense_reallocated',
            model_name='JournalReallocation',
            record_id=reallocation.id,
            changes={
                'from_account': from_account.code,
                'to_account': to_account.code,
                'amount': str(amount),
                'reason': reason
            },
            user=user
        )

        return reallocation


class IncomeType(models.Model):
    """
    Income Type - Defines different types of income for detailed tracking.
    Links to specific GL accounts and enables income analysis.
    """
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # GL account mapping
    gl_account = models.ForeignKey(
        ChartOfAccount, on_delete=models.PROTECT,
        related_name='income_types',
        limit_choices_to={'account_type': 'revenue'}
    )

    # Commission settings
    is_commissionable = models.BooleanField(default=True)
    default_commission_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('10.00')
    )

    # VAT settings
    is_vatable = models.BooleanField(default=False)
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('15.00'))

    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Income Type'
        verbose_name_plural = 'Income Types'
        ordering = ['display_order', 'name']

    def __str__(self):
        return f'{self.code} - {self.name}'

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = self.generate_code()
        super().save(*args, **kwargs)

    @classmethod
    def generate_code(cls):
        last = cls.objects.order_by('-id').first()
        num = (last.id + 1) if last else 1
        return f'INC{num:04d}'
