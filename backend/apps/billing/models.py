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
        Activity 1: Debt Recognition
        Dr: Accounts Receivable (1200)
        Cr: Rental Income (4000)
        """
        if self.journal:
            return self.journal

        # Get accounts
        ar_account = ChartOfAccount.objects.get(code='1200')  # Accounts Receivable
        income_account = ChartOfAccount.objects.get(code='4000')  # Rental Income

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
        JournalEntry.objects.create(
            journal=journal,
            account=ar_account,
            description=f'Rent receivable - {self.tenant.name}',
            debit_amount=self.total_amount,
            source_type='invoice',
            source_id=self.id
        )

        JournalEntry.objects.create(
            journal=journal,
            account=income_account,
            description=f'Rental income - {self.unit}',
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

        # Update invoice if linked
        if self.invoice:
            self.invoice.amount_paid += self.amount
            if self.invoice.amount_paid >= self.invoice.total_amount:
                self.invoice.status = Invoice.Status.PAID
            else:
                self.invoice.status = Invoice.Status.PARTIAL
            self.invoice.save()

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
