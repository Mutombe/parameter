"""
Billing models for Invoices and Receipts.
Implements Activities 1 (Debt Recognition) and 2 (Payment Receipt).
"""
from decimal import Decimal
from django.db import models, transaction
from django.conf import settings
from apps.masterfile.models import RentalTenant, Unit, LeaseAgreement, Property
from apps.accounting.models import Journal, JournalEntry, ChartOfAccount, AuditTrail


class Invoice(models.Model):
    """
    Rent Invoice - Activity 1: Debt Recognition.
    Creates: Dr Accounts Receivable, Cr Rental Income
    """

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        SENT = 'sent', 'Sent'
        PARTIAL = 'partial', 'Partially Paid'
        PAID = 'paid', 'Paid'
        OVERDUE = 'overdue', 'Overdue'
        CANCELLED = 'cancelled', 'Cancelled'

    class InvoiceType(models.TextChoices):
        # Rental income types
        RENT = 'rent', 'Rent'
        DEPOSIT = 'deposit', 'Deposit'
        # Levy income types (for residential associations)
        LEVY = 'levy', 'Levy'
        SPECIAL_LEVY = 'special_levy', 'Special Levy'
        RATES = 'rates', 'Rates'
        PARKING = 'parking', 'Parking'
        # Penalty
        PENALTY = 'penalty', 'Late Payment Penalty'
        # Other types
        UTILITY = 'utility', 'Utility'
        MAINTENANCE = 'maintenance', 'Maintenance'
        VAT = 'vat', 'VAT'
        OTHER = 'other', 'Other'

    invoice_number = models.CharField(max_length=50, unique=True)
    tenant = models.ForeignKey(
        RentalTenant, on_delete=models.PROTECT, related_name='invoices'
    )
    lease = models.ForeignKey(
        LeaseAgreement, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='invoices'
    )
    unit = models.ForeignKey(
        Unit, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='invoices'
    )
    # Property reference for easier filtering and reporting
    property = models.ForeignKey(
        Property, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='invoices'
    )
    # Income type for detailed income analysis
    income_type = models.ForeignKey(
        'accounting.IncomeType', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='invoices'
    )

    invoice_type = models.CharField(
        max_length=20,
        choices=InvoiceType.choices,
        default=InvoiceType.RENT
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT
    )

    # Dates
    date = models.DateField()
    due_date = models.DateField()
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)

    # Amounts
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    vat_amount = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0'))
    total_amount = models.DecimalField(max_digits=18, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0'))
    balance = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=3, default='USD')

    description = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    # GL Reference
    journal = models.ForeignKey(
        Journal, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='invoices'
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='created_invoices'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Invoice'
        verbose_name_plural = 'Invoices'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['status', 'due_date']),
            models.Index(fields=['lease', 'period_start']),
            models.Index(fields=['tenant']),
            models.Index(fields=['invoice_type']),
            models.Index(fields=['date']),
        ]

    def __str__(self):
        return f'{self.invoice_number} - {self.tenant.name}'

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            self.invoice_number = self.generate_invoice_number()

        # Auto-populate property from unit
        if self.unit and not self.property:
            self.property = self.unit.property

        # Calculate totals
        self.total_amount = self.amount + self.vat_amount
        self.balance = self.total_amount - self.amount_paid

        super().save(*args, **kwargs)

    @classmethod
    def generate_invoice_number(cls):
        from django.utils import timezone
        prefix = timezone.now().strftime('INV%Y%m')
        last = cls.objects.filter(invoice_number__startswith=prefix).order_by('-invoice_number').first()
        if last:
            num = int(last.invoice_number[-4:]) + 1
        else:
            num = 1
        return f'{prefix}{num:04d}'

    @transaction.atomic
    def post_to_ledger(self, user=None):
        """
        Post invoice to General Ledger.
        Activity 1: Debt Recognition (as per SYSTEM OVERVIEW)
        Dr: Tenant A/c - Accounts Receivable (1200)
        Cr: Unpaid Rent - Deferred Revenue (2200)

        Note: Revenue is NOT recognized here. Revenue recognition happens
        when payment is received (Activity 3 in Receipt.post_to_ledger_with_commission).
        This implements proper accrual accounting with deferred revenue.
        """
        if self.journal:
            return self.journal

        # Get or create Unpaid Rent account (deferred revenue)
        unpaid_rent_account, created = ChartOfAccount.objects.get_or_create(
            code='2200',
            defaults={
                'name': 'Unpaid Rent (Deferred Revenue)',
                'account_type': 'liability',
                'account_subtype': 'tenant_deposits',
                'is_system': True
            }
        )

        # Get accounts
        ar_account = ChartOfAccount.objects.get(code='1200')  # Accounts Receivable (Tenant A/c)

        # Create journal
        journal = Journal.objects.create(
            journal_type=Journal.JournalType.SALES,
            date=self.date,
            description=f'Invoice {self.invoice_number} - {self.tenant.name}',
            reference=self.invoice_number,
            currency=self.currency,
            created_by=user
        )

        # Create entries
        # Dr: Tenant A/c (Accounts Receivable)
        JournalEntry.objects.create(
            journal=journal,
            account=ar_account,
            description=f'Rent receivable - {self.tenant.name}',
            debit_amount=self.total_amount,
            source_type='invoice',
            source_id=self.id
        )

        # Cr: Unpaid Rent (Deferred Revenue) - NOT income yet
        JournalEntry.objects.create(
            journal=journal,
            account=unpaid_rent_account,
            description=f'Deferred rental revenue - {self.unit}',
            credit_amount=self.total_amount,
            source_type='invoice',
            source_id=self.id
        )

        # Post the journal
        journal.post(user)

        self.journal = journal
        self.status = self.Status.SENT
        self.save()

        return journal


class Receipt(models.Model):
    """
    Payment Receipt - Activity 2: Payment Receipt.
    Creates: Dr Cash/Bank, Cr Accounts Receivable
    """

    class PaymentMethod(models.TextChoices):
        CASH = 'cash', 'Cash'
        BANK_TRANSFER = 'bank_transfer', 'Bank Transfer'
        ECOCASH = 'ecocash', 'EcoCash'
        CARD = 'card', 'Card'
        CHEQUE = 'cheque', 'Cheque'

    receipt_number = models.CharField(max_length=50, unique=True)
    tenant = models.ForeignKey(
        RentalTenant, on_delete=models.PROTECT, related_name='receipts'
    )
    invoice = models.ForeignKey(
        Invoice, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='receipts'
    )

    # Bank account for proper receipt tracking
    bank_account = models.ForeignKey(
        'accounting.BankAccount', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='receipts',
        help_text='Bank account into which payment was received'
    )

    # Income type for receipt analysis
    income_type = models.ForeignKey(
        'accounting.IncomeType', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='receipts'
    )

    date = models.DateField()
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=3, default='USD')

    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.CASH
    )
    reference = models.CharField(max_length=100, blank=True)  # Bank ref, EcoCash ref, etc.
    bank_name = models.CharField(max_length=100, blank=True)  # Legacy field, use bank_account instead

    description = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    # GL Reference
    journal = models.ForeignKey(
        Journal, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='receipts'
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='created_receipts'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Receipt'
        verbose_name_plural = 'Receipts'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['tenant']),
            models.Index(fields=['invoice']),
            models.Index(fields=['date']),
        ]

    def __str__(self):
        return f'{self.receipt_number} - {self.tenant.name}'

    def save(self, *args, **kwargs):
        if not self.receipt_number:
            self.receipt_number = self.generate_receipt_number()
        super().save(*args, **kwargs)

    @classmethod
    def generate_receipt_number(cls):
        from django.utils import timezone
        prefix = timezone.now().strftime('RCT%Y%m')
        last = cls.objects.filter(receipt_number__startswith=prefix).order_by('-receipt_number').first()
        if last:
            num = int(last.receipt_number[-4:]) + 1
        else:
            num = 1
        return f'{prefix}{num:04d}'

    @transaction.atomic
    def post_to_ledger(self, user=None):
        """
        Post receipt to General Ledger.
        Activity 2: Payment Receipt
        Dr: Cash/Bank (1000/1100)
        Cr: Accounts Receivable (1200)
        """
        if self.journal:
            return self.journal

        # Get accounts based on payment method
        if self.payment_method == self.PaymentMethod.CASH:
            debit_account = ChartOfAccount.objects.get(code='1000')  # Cash
        else:
            # Use bank account based on currency
            code = '1100' if self.currency == 'USD' else '1110'
            debit_account = ChartOfAccount.objects.get(code=code)

        ar_account = ChartOfAccount.objects.get(code='1200')  # Accounts Receivable

        # Create journal
        journal = Journal.objects.create(
            journal_type=Journal.JournalType.RECEIPTS,
            date=self.date,
            description=f'Receipt {self.receipt_number} - {self.tenant.name}',
            reference=self.receipt_number,
            currency=self.currency,
            created_by=user
        )

        # Create entries
        JournalEntry.objects.create(
            journal=journal,
            account=debit_account,
            description=f'Payment received - {self.tenant.name}',
            debit_amount=self.amount,
            source_type='receipt',
            source_id=self.id
        )

        JournalEntry.objects.create(
            journal=journal,
            account=ar_account,
            description=f'Receipt against AR - {self.tenant.name}',
            credit_amount=self.amount,
            source_type='receipt',
            source_id=self.id
        )

        # Post the journal
        journal.post(user)

        self.journal = journal
        self.save()

        # Update invoice if linked — lock the row to prevent concurrent payment races
        if self.invoice:
            invoice = Invoice.objects.select_for_update().get(id=self.invoice_id)
            old_status = invoice.status
            invoice.amount_paid += self.amount
            if invoice.amount_paid >= invoice.total_amount:
                invoice.status = Invoice.Status.PAID
            else:
                invoice.status = Invoice.Status.PARTIAL
            invoice.save()

            # Audit trail for payment status change
            if invoice.status != old_status:
                AuditTrail.objects.create(
                    action='invoice_payment_applied',
                    model_name='Invoice',
                    record_id=invoice.id,
                    changes={
                        'invoice_number': invoice.invoice_number,
                        'receipt_number': self.receipt_number,
                        'payment_amount': str(self.amount),
                        'new_amount_paid': str(invoice.amount_paid),
                        'old_status': old_status,
                        'new_status': invoice.status,
                    },
                    user=user
                )

        return journal

    @transaction.atomic
    def post_to_ledger_with_commission(self, user=None):
        """
        Post receipt to General Ledger with full commission processing.
        Implements SYSTEM OVERVIEW Activities 2, 3, and 4:

        Activity 2: Payment Receipt
            Dr: Cash/Bank (1000/1100)
            Cr: Tenant A/c - Accounts Receivable (1200)

        Activity 3: Revenue Recognition
            Dr: Unpaid Rent - Deferred Revenue (2200)
            Cr: Rent Income (4000)

        Activity 4: Commission Calculation (based on Income Type settings)
            Dr: COS Commission (5100) - gross commission amount
            Cr: Commission Payable (2100) - net commission (85%)
            Cr: VAT Payable (2110) - VAT on commission (15%)

        Example from SYSTEM OVERVIEW:
        - Receipt amount: $1000
        - Commission rate: 10% = $100
        - VAT rate: 15% on commission
        - COS Commission: $100 (debit)
        - Commission Payable: $87 (credit - net of VAT)
        - VAT Payable: $13 (credit - 15% of $87 = ~$13)
        """
        if self.journal:
            return self.journal

        # Get or create required accounts
        def get_or_create_account(code, name, account_type, account_subtype):
            account, created = ChartOfAccount.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'account_type': account_type,
                    'account_subtype': account_subtype,
                    'is_system': True
                }
            )
            return account

        # Activity 2 accounts
        if self.payment_method == self.PaymentMethod.CASH:
            cash_account = ChartOfAccount.objects.get(code='1000')  # Cash
        else:
            # Use bank account based on currency
            code = '1100' if self.currency == 'USD' else '1110'
            cash_account = ChartOfAccount.objects.get(code=code)

        ar_account = ChartOfAccount.objects.get(code='1200')  # Accounts Receivable

        # Activity 3 accounts (Revenue Recognition)
        unpaid_rent_account = get_or_create_account(
            '2200', 'Unpaid Rent (Deferred Revenue)', 'liability', 'tenant_deposits'
        )
        rent_income_account = ChartOfAccount.objects.get(code='4000')  # Rent Income

        # Activity 4 accounts (Commission)
        cos_commission_account = get_or_create_account(
            '5100', 'Cost of Sales - Commission', 'expense', 'operating_expense'
        )
        commission_payable_account = get_or_create_account(
            '2100', 'Commission Payable', 'liability', 'accounts_payable'
        )
        vat_payable_account = get_or_create_account(
            '2110', 'VAT Payable', 'liability', 'vat_payable'
        )

        # Get commission settings from income type or use defaults
        commission_rate = Decimal('0.10')  # 10% default
        vat_rate = Decimal('0.15')  # 15% VAT on commission

        if self.income_type:
            if self.income_type.is_commissionable:
                commission_rate = self.income_type.default_commission_rate / Decimal('100')
            else:
                commission_rate = Decimal('0')
            if self.income_type.is_vatable:
                vat_rate = self.income_type.vat_rate / Decimal('100')

        # Calculate commission amounts
        gross_commission = self.amount * commission_rate
        # VAT is calculated on the net commission: Net + VAT = Gross
        # So: Net = Gross / (1 + VAT_rate)
        net_commission = gross_commission / (Decimal('1') + vat_rate)
        vat_on_commission = gross_commission - net_commission

        # Round to 2 decimal places
        gross_commission = gross_commission.quantize(Decimal('0.01'))
        net_commission = net_commission.quantize(Decimal('0.01'))
        vat_on_commission = vat_on_commission.quantize(Decimal('0.01'))

        # Create journal
        journal = Journal.objects.create(
            journal_type=Journal.JournalType.RECEIPTS,
            date=self.date,
            description=f'Receipt {self.receipt_number} - {self.tenant.name} (with commission)',
            reference=self.receipt_number,
            currency=self.currency,
            created_by=user
        )

        # ===== Activity 2: Payment Receipt =====
        # Dr Cash/Bank
        JournalEntry.objects.create(
            journal=journal,
            account=cash_account,
            description=f'Payment received - {self.tenant.name}',
            debit_amount=self.amount,
            source_type='receipt',
            source_id=self.id
        )

        # Cr Tenant A/c (Accounts Receivable)
        JournalEntry.objects.create(
            journal=journal,
            account=ar_account,
            description=f'Receipt against AR - {self.tenant.name}',
            credit_amount=self.amount,
            source_type='receipt',
            source_id=self.id
        )

        # ===== Activity 3: Revenue Recognition =====
        # Dr Unpaid Rent (clear the deferred revenue)
        JournalEntry.objects.create(
            journal=journal,
            account=unpaid_rent_account,
            description=f'Revenue recognition - {self.tenant.name}',
            debit_amount=self.amount,
            source_type='receipt',
            source_id=self.id
        )

        # Cr Rent Income (recognize revenue)
        JournalEntry.objects.create(
            journal=journal,
            account=rent_income_account,
            description=f'Rental income recognized - {self.tenant.name}',
            credit_amount=self.amount,
            source_type='receipt',
            source_id=self.id
        )

        # ===== Activity 4: Commission Calculation =====
        if gross_commission > Decimal('0'):
            # Dr COS Commission (expense for gross commission amount)
            JournalEntry.objects.create(
                journal=journal,
                account=cos_commission_account,
                description=f'Commission expense - {self.tenant.name}',
                debit_amount=gross_commission,
                source_type='receipt',
                source_id=self.id
            )

            # Cr Commission Payable (net commission owed to agent/landlord)
            JournalEntry.objects.create(
                journal=journal,
                account=commission_payable_account,
                description=f'Commission payable - {self.tenant.name}',
                credit_amount=net_commission,
                source_type='receipt',
                source_id=self.id
            )

            # Cr VAT Payable (VAT on commission)
            JournalEntry.objects.create(
                journal=journal,
                account=vat_payable_account,
                description=f'VAT on commission - {self.tenant.name}',
                credit_amount=vat_on_commission,
                source_type='receipt',
                source_id=self.id
            )

        # Post the journal
        journal.post(user)

        self.journal = journal
        self.save()

        # Update invoice if linked — lock the row to prevent concurrent payment races
        if self.invoice:
            invoice = Invoice.objects.select_for_update().get(id=self.invoice_id)
            old_status = invoice.status
            invoice.amount_paid += self.amount
            if invoice.amount_paid >= invoice.total_amount:
                invoice.status = Invoice.Status.PAID
            else:
                invoice.status = Invoice.Status.PARTIAL
            invoice.save()

            # Audit trail for payment status change
            if invoice.status != old_status:
                AuditTrail.objects.create(
                    action='invoice_payment_applied',
                    model_name='Invoice',
                    record_id=invoice.id,
                    changes={
                        'invoice_number': invoice.invoice_number,
                        'receipt_number': self.receipt_number,
                        'payment_amount': str(self.amount),
                        'new_amount_paid': str(invoice.amount_paid),
                        'old_status': old_status,
                        'new_status': invoice.status,
                    },
                    user=user
                )

        return journal


class Expense(models.Model):
    """
    Expense/Payout - Activity 5: Expense Payouts.
    For landlord payments, maintenance, etc.
    """

    class ExpenseType(models.TextChoices):
        LANDLORD_PAYMENT = 'landlord_payment', 'Landlord Payment'
        MAINTENANCE = 'maintenance', 'Maintenance'
        UTILITY = 'utility', 'Utility'
        COMMISSION = 'commission', 'Commission'
        OTHER = 'other', 'Other'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        PAID = 'paid', 'Paid'
        CANCELLED = 'cancelled', 'Cancelled'

    expense_number = models.CharField(max_length=50, unique=True)
    expense_type = models.CharField(
        max_length=20,
        choices=ExpenseType.choices,
        default=ExpenseType.OTHER
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )

    # Payee info (could be landlord, vendor, etc.)
    payee_name = models.CharField(max_length=255)
    payee_type = models.CharField(max_length=50)  # 'landlord', 'vendor'
    payee_id = models.PositiveIntegerField(null=True, blank=True)

    date = models.DateField()
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=3, default='USD')

    description = models.TextField()
    reference = models.CharField(max_length=100, blank=True)

    # GL Reference
    journal = models.ForeignKey(
        Journal, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='expenses'
    )

    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='approved_expenses'
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='created_expenses'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Expense'
        verbose_name_plural = 'Expenses'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f'{self.expense_number} - {self.payee_name}'

    def save(self, *args, **kwargs):
        if not self.expense_number:
            self.expense_number = self.generate_expense_number()
        super().save(*args, **kwargs)

    @classmethod
    def generate_expense_number(cls):
        from django.utils import timezone
        prefix = timezone.now().strftime('EXP%Y%m')
        last = cls.objects.filter(expense_number__startswith=prefix).order_by('-expense_number').first()
        if last:
            num = int(last.expense_number[-4:]) + 1
        else:
            num = 1
        return f'{prefix}{num:04d}'

    @transaction.atomic
    def post_to_ledger(self, user=None):
        """Post expense to General Ledger."""
        if self.journal:
            return self.journal

        # Get accounts
        expense_account = ChartOfAccount.objects.filter(
            account_type='expense'
        ).first()
        cash_account = ChartOfAccount.objects.get(code='1100')  # Bank

        # Create journal
        journal = Journal.objects.create(
            journal_type=Journal.JournalType.PAYMENTS,
            date=self.date,
            description=f'Expense {self.expense_number} - {self.payee_name}',
            reference=self.expense_number,
            currency=self.currency,
            created_by=user
        )

        # Create entries
        JournalEntry.objects.create(
            journal=journal,
            account=expense_account,
            description=f'{self.description}',
            debit_amount=self.amount,
            source_type='expense',
            source_id=self.id
        )

        JournalEntry.objects.create(
            journal=journal,
            account=cash_account,
            description=f'Payment to {self.payee_name}',
            credit_amount=self.amount,
            source_type='expense',
            source_id=self.id
        )

        # Post the journal
        journal.post(user)

        self.journal = journal
        self.status = self.Status.PAID
        self.save()

        return journal


class LatePenaltyConfig(models.Model):
    """Configuration for automated late payment penalties."""

    class PenaltyType(models.TextChoices):
        PERCENTAGE = 'percentage', 'Percentage of Invoice'
        FLAT_FEE = 'flat_fee', 'Flat Fee'
        BOTH = 'both', 'Percentage + Flat Fee'

    property = models.ForeignKey(
        Property, on_delete=models.CASCADE, null=True, blank=True,
        related_name='penalty_configs',
        help_text='Apply to all tenants in this property (null = system default)'
    )
    tenant = models.ForeignKey(
        RentalTenant, on_delete=models.CASCADE, null=True, blank=True,
        related_name='penalty_configs',
        help_text='Override for a specific tenant'
    )

    penalty_type = models.CharField(
        max_length=20, choices=PenaltyType.choices, default=PenaltyType.PERCENTAGE
    )
    percentage_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('5.00'),
        help_text='Percentage of overdue amount'
    )
    flat_fee = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0.00')
    )
    currency = models.CharField(max_length=3, default='USD')

    grace_period_days = models.PositiveIntegerField(
        default=0,
        help_text='Additional days after due date before penalty applies'
    )
    max_penalty_amount = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True,
        help_text='Maximum penalty amount (null = no cap)'
    )
    max_penalties_per_invoice = models.PositiveIntegerField(
        default=1,
        help_text='0 = recurring monthly, 1 = one-time, N = max N penalties'
    )

    is_enabled = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Late Penalty Configuration'
        verbose_name_plural = 'Late Penalty Configurations'
        indexes = [
            models.Index(fields=['tenant', 'is_enabled']),
            models.Index(fields=['property', 'is_enabled']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        target = self.tenant or self.property or 'System Default'
        return f'Penalty Config: {self.penalty_type} for {target}'

    def calculate_penalty(self, overdue_amount):
        """Calculate the penalty amount for a given overdue amount."""
        penalty = Decimal('0')

        if self.penalty_type in ('percentage', 'both'):
            penalty += overdue_amount * (self.percentage_rate / Decimal('100'))

        if self.penalty_type in ('flat_fee', 'both'):
            penalty += self.flat_fee

        if self.max_penalty_amount and penalty > self.max_penalty_amount:
            penalty = self.max_penalty_amount

        return penalty.quantize(Decimal('0.01'))


class LatePenaltyExclusion(models.Model):
    """Exclude a tenant from late penalties."""

    tenant = models.ForeignKey(
        RentalTenant, on_delete=models.CASCADE, related_name='penalty_exclusions'
    )
    reason = models.TextField()
    excluded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    excluded_until = models.DateField(
        null=True, blank=True,
        help_text='Null = permanent exclusion'
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Late Penalty Exclusion'
        verbose_name_plural = 'Late Penalty Exclusions'
        indexes = [
            models.Index(fields=['tenant']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f'Exclusion: {self.tenant.name}'

    @property
    def is_active(self):
        if self.excluded_until is None:
            return True
        from django.utils import timezone
        return self.excluded_until >= timezone.now().date()
