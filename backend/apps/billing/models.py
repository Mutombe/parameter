"""
Billing models for Invoices and Receipts.
Implements Trust Accounting Activities:
  1. Billing/Invoicing - Tenant charge (Dr Tenant Acc, Cr Unpaid Rent)
  2. Receipting - Payment received (Dr Cash, Cr Tenant Acc)
  3. Transfer to Landlord - (Dr Unpaid Rent, Cr Landlord Trust Payable)
  4. Commission Allocation - (Dr Landlord Trust Payable, Cr Commission Revenue, Cr VAT)
  5. Expense Posting - Manual (Dr Expense, Cr Cash/Bank)
"""
from decimal import Decimal, ROUND_HALF_UP
from django.db import models, transaction
from django.conf import settings
from apps.masterfile.models import RentalTenant, Unit, LeaseAgreement, Property
from apps.accounting.models import (
    Journal, JournalEntry, ChartOfAccount, AuditTrail,
    SubsidiaryAccount, SubsidiaryTransaction, build_transaction_description,
)
from apps.soft_delete import SoftDeleteModel


class Invoice(SoftDeleteModel):
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
            models.Index(fields=['currency']),
            models.Index(fields=['property']),
            models.Index(fields=['status', 'balance']),
            models.Index(fields=['tenant', 'date']),
            models.Index(fields=['unit', 'date']),
        ]

    def __str__(self):
        return f'{self.invoice_number} - {self.tenant.name}'

    def save(self, *args, **kwargs):
        # Auto-populate property from unit
        if self.unit and not self.property:
            self.property = self.unit.property

        # Calculate totals
        self.total_amount = self.amount + self.vat_amount
        self.balance = self.total_amount - self.amount_paid

        if not self.invoice_number:
            with transaction.atomic():
                self.invoice_number = self.generate_invoice_number()
                super().save(*args, **kwargs)
                return

        super().save(*args, **kwargs)

    @classmethod
    def generate_invoice_number(cls):
        from django.utils import timezone
        prefix = timezone.now().strftime('INV%Y%m%d')
        last = cls.all_objects.select_for_update().filter(invoice_number__startswith=prefix).order_by('-invoice_number').first()
        if last:
            num = int(last.invoice_number[len(prefix):]) + 1
        else:
            num = 1
        return f'{prefix}{num:04d}'

    def _get_billing_contra_code(self):
        """Get the billing/invoicing expense code for this invoice type."""
        type_map = {
            'rent': '2300/010', 'levy': '2300/020', 'parking': '2300/030',
            'maintenance': '2300/040', 'special_levy': '2300/050',
            'rates': '2300/060', 'vat': '2300/070', 'penalty': '2300/080',
        }
        return type_map.get(self.invoice_type, '2300/010')

    def _get_income_contra_code(self):
        """Get the income account code for this invoice type."""
        type_map = {
            'rent': '1000/010', 'levy': '1000/020', 'parking': '1000/030',
            'maintenance': '1000/040', 'special_levy': '1000/050',
            'rates': '1000/060', 'vat': '1000/080',
        }
        return type_map.get(self.invoice_type, '1000/010')

    def _get_unpaid_contra_code(self):
        """Get the unpaid/deferred liability code for this invoice type."""
        type_map = {
            'rent': '6000/010', 'levy': '6000/020', 'parking': '6000/030',
            'special_levy': '6000/040', 'maintenance': '6000/050',
            'rates': '6000/060', 'vat': '6000/070',
        }
        return type_map.get(self.invoice_type, '6000/010')

    def _get_commission_expense_code(self):
        """Get the commission expense code for this invoice type."""
        type_map = {
            'rent': '2000/010', 'levy': '2000/020', 'parking': '2000/030',
            'maintenance': '2000/040', 'special_levy': '2000/050',
            'rates': '2000/060',
        }
        return type_map.get(self.invoice_type, '2000/010')

    @transaction.atomic
    def post_to_ledger(self, user=None):
        """
        Post invoice to General Ledger — Activity 1: Billing/Invoicing.

        GL entries (agent's books):
            Dr: Accounts Receivable (1200) — control account for tenant sub-ledgers
            Cr: Unpaid Rent (2200) — deferred revenue until payment

        Subsidiary entries (per-entity view):
            Txn 1: Dr Tenant Account (TN/xxx), contra: billing code (e.g., 2300/010)
            Txn 2: Cr Unpaid Rent Account, contra: tenant code (TN/xxx)

        Revenue is NOT recognized here. Revenue recognition happens
        when payment is received (Activity 3).
        """
        if self.journal:
            return self.journal

        # Get or create Unpaid Rent account (deferred revenue)
        unpaid_rent_account, _ = ChartOfAccount.objects.get_or_create(
            code='2200',
            defaults={
                'name': 'Unpaid Rent (Deferred Revenue)',
                'account_type': 'liability',
                'account_subtype': 'tenant_deposits',
                'is_system': True
            }
        )

        ar_account = ChartOfAccount.objects.get(code='1200')

        # Build description in trust accounting format
        invoice_type_label = self.get_invoice_type_display()
        lease_ref = f'Lease ID {self.lease_id}' if self.lease_id else ''
        unit_label = f'{self.unit.property.name}-{self.unit.unit_number}' if self.unit else ''
        period = self.date.strftime('%b')
        desc = f'{period} {invoice_type_label} Charge'
        if lease_ref:
            desc += f'- {lease_ref}'

        # Create journal
        journal = Journal.objects.create(
            journal_type=Journal.JournalType.SALES,
            date=self.date,
            description=f'Invoice {self.invoice_number} - {self.tenant.name}',
            reference=self.invoice_number,
            currency=self.currency,
            created_by=user
        )

        # GL Entry 1: Dr Accounts Receivable (control account)
        je_debit = JournalEntry.objects.create(
            journal=journal,
            account=ar_account,
            description=desc,
            debit_amount=self.total_amount,
            source_type='invoice',
            source_id=self.id
        )

        # GL Entry 2: Cr Unpaid Rent (deferred revenue)
        je_credit = JournalEntry.objects.create(
            journal=journal,
            account=unpaid_rent_account,
            description=desc,
            credit_amount=self.total_amount,
            source_type='invoice',
            source_id=self.id
        )

        journal.post(user)

        # === Subsidiary Ledger Entries ===
        # Txn 1: Debit tenant's subsidiary account
        tenant_sub = SubsidiaryAccount.get_or_create_for_tenant(self.tenant)
        SubsidiaryTransaction.create_entry(
            account=tenant_sub,
            date=self.date,
            contra_account=self._get_billing_contra_code(),
            reference=self.invoice_number,
            description=desc,
            debit_amount=self.total_amount,
            journal_entry=je_debit,
        )

        # Txn 2: Credit unpaid rent (tracked per invoice for auditing)
        # This mirrors the GL credit to the Unpaid Rent control account

        self.journal = journal
        self.status = self.Status.SENT
        self.save()

        return journal


class Receipt(SoftDeleteModel):
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
            models.Index(fields=['payment_method']),
            models.Index(fields=['currency']),
            models.Index(fields=['tenant', 'date']),
            models.Index(fields=['date', 'invoice']),
        ]

    def __str__(self):
        return f'{self.receipt_number} - {self.tenant.name}'

    def save(self, *args, **kwargs):
        if not self.receipt_number:
            with transaction.atomic():
                self.receipt_number = self.generate_receipt_number()
                super().save(*args, **kwargs)
                return
        super().save(*args, **kwargs)

    @classmethod
    def generate_receipt_number(cls):
        from django.utils import timezone
        prefix = timezone.now().strftime('RCT%Y%m%d')
        last = cls.all_objects.select_for_update().filter(receipt_number__startswith=prefix).order_by('-receipt_number').first()
        if last:
            num = int(last.receipt_number[len(prefix):]) + 1
        else:
            num = 1
        return f'{prefix}{num:04d}'

    def _resolve_cash_account(self):
        """Get the cash/bank GL account based on payment method."""
        if self.payment_method == self.PaymentMethod.CASH:
            return ChartOfAccount.objects.get(code='1000')
        code = '1100' if self.currency == 'USD' else '1110'
        return ChartOfAccount.objects.get(code=code)

    def _get_cash_contra_code(self):
        """Get the spec-format cash account code for subsidiary entries."""
        method_map = {
            'cash': '4000/001', 'bank_transfer': '4000/002',
            'ecocash': '4000/004', 'card': '4000/002', 'cheque': '4000/002',
        }
        return method_map.get(self.payment_method, '4000/001')

    def _get_payment_method_label(self):
        """Get a label for the payment method for descriptions."""
        method_map = {
            'cash': 'CASH', 'bank_transfer': 'BANK', 'ecocash': 'ECOCASH',
            'card': 'CARD', 'cheque': 'CHEQUE',
        }
        return f'{method_map.get(self.payment_method, "CASH")} {self.currency}'

    def _resolve_landlord_for_receipt(self):
        """Find the landlord associated with this receipt's tenant/invoice/lease."""
        if self.invoice and self.invoice.unit:
            return self.invoice.unit.property.landlord
        if self.invoice and self.invoice.lease:
            return self.invoice.lease.unit.property.landlord
        # Try via tenant's active lease
        from apps.masterfile.models import LeaseAgreement
        active_lease = LeaseAgreement.objects.filter(
            tenant=self.tenant, status='active'
        ).select_related('unit__property__landlord').first()
        if active_lease:
            return active_lease.unit.property.landlord
        return None

    def _get_commission_settings(self):
        """Get commission rate and VAT rate, respecting landlord override."""
        commission_rate = Decimal('0.10')
        vat_rate = Decimal('0.15')

        landlord = self._resolve_landlord_for_receipt()
        if landlord and landlord.commission_rate:
            commission_rate = landlord.commission_rate / Decimal('100')

        if self.income_type:
            if not self.income_type.is_commissionable:
                commission_rate = Decimal('0')
            elif self.income_type.default_commission_rate:
                commission_rate = self.income_type.default_commission_rate / Decimal('100')
            if self.income_type.is_vatable:
                vat_rate = self.income_type.vat_rate / Decimal('100')

        return commission_rate, vat_rate

    def _calculate_commission(self, amount, gross_rate, vat_rate):
        """
        Calculate commission using the trust accounting approach:
        Net commission % is rounded to 4 significant figures for accuracy.

        Given: gross_rate = 10% (inclusive of 15% VAT)
        Net% = gross_rate / (1 + vat_rate) = 10 / 1.15 = 8.6957% (4 s.f.)
        Net Commission = amount * Net%
        VAT = 15% * Net Commission
        Gross = Net + VAT
        """
        amount = Decimal(str(amount))
        gross_rate = Decimal(str(gross_rate))
        vat_rate = Decimal(str(vat_rate))

        if gross_rate <= 0:
            return Decimal('0'), Decimal('0'), Decimal('0')

        # Calculate net commission rate to 4 significant figures
        net_rate_raw = gross_rate / (Decimal('1') + vat_rate)
        # Round to 4 significant figures
        import math
        if net_rate_raw > 0:
            sig_figs = 4
            magnitude = math.floor(math.log10(float(net_rate_raw)))
            round_to = sig_figs - 1 - magnitude
            net_rate = Decimal(str(round(float(net_rate_raw), round_to)))
        else:
            net_rate = Decimal('0')

        net_commission = (amount * net_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        vat_on_commission = (vat_rate * net_commission).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        gross_commission = net_commission + vat_on_commission

        return net_commission, vat_on_commission, gross_commission

    @transaction.atomic
    def post_to_ledger(self, user=None):
        """
        Post receipt to General Ledger — Activities 2, 3, and 4.
        This is the primary posting method implementing trust accounting.

        Activity 2 (Receipting): 2 transactions
            GL: Dr Cash/Bank, Cr Accounts Receivable
            Subsidiary: Dr Cash acc, Cr Tenant acc

        Activity 3 (Transfer to Landlord): 2 transactions
            GL: Dr Unpaid Rent, Cr Landlord Trust Payable
            Subsidiary: Dr Unpaid Rent, Cr Landlord acc

        Activity 4 (Commission Allocation): 3 transactions
            GL: Dr Landlord Trust Payable, Cr Commission Revenue, Cr VAT Payable
            Subsidiary: Cr Commission acc, Cr VAT acc, Dr Landlord acc

        Total: 7 automated transactions per receipt.
        """
        if self.journal:
            return self.journal

        def get_or_create_account(code, name, account_type, account_subtype):
            account, _ = ChartOfAccount.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'account_type': account_type,
                    'account_subtype': account_subtype,
                    'is_system': True
                }
            )
            return account

        # === Resolve accounts ===
        cash_account = self._resolve_cash_account()
        ar_account = ChartOfAccount.objects.get(code='1200')
        unpaid_rent_account = get_or_create_account(
            '2200', 'Unpaid Rent (Deferred Revenue)', 'liability', 'tenant_deposits'
        )
        landlord_trust_account = get_or_create_account(
            '2300', 'Landlord Trust Payable', 'liability', 'accounts_payable'
        )
        commission_revenue_account = get_or_create_account(
            '4100', 'Commission Revenue', 'revenue', 'commission_income'
        )
        vat_payable_account = get_or_create_account(
            '2110', 'VAT Payable', 'liability', 'vat_payable'
        )

        # === Resolve entities ===
        landlord = self._resolve_landlord_for_receipt()
        commission_rate, vat_rate = self._get_commission_settings()
        net_commission, vat_on_commission, gross_commission = self._calculate_commission(
            self.amount, commission_rate, vat_rate
        )

        # === Build description ===
        payment_label = self._get_payment_method_label()
        unit_label = ''
        lease_ref = ''
        if self.invoice and self.invoice.unit:
            unit_label = f'{self.invoice.unit.property.name}-{self.invoice.unit.unit_number}'
        if self.invoice and self.invoice.lease_id:
            lease_ref = f'Lease ID {self.invoice.lease_id}'

        base_desc = build_transaction_description(
            txn_type='Rent Payment',
            payment_method=payment_label,
            tenant_name=self.tenant.name,
            unit=unit_label or None,
            lease=lease_ref or None,
            user_ref=self.description or None,
        )

        # === Create Receipt Journal (Activities 2+3) ===
        journal = Journal.objects.create(
            journal_type=Journal.JournalType.RECEIPTS,
            date=self.date,
            description=f'Receipt {self.receipt_number} - {self.tenant.name}',
            reference=self.receipt_number,
            currency=self.currency,
            created_by=user
        )

        # --- Activity 2: Payment Receipt ---
        # GL: Dr Cash/Bank
        je_cash_dr = JournalEntry.objects.create(
            journal=journal, account=cash_account,
            description=base_desc, debit_amount=self.amount,
            source_type='receipt', source_id=self.id
        )
        # GL: Cr Accounts Receivable
        je_ar_cr = JournalEntry.objects.create(
            journal=journal, account=ar_account,
            description=base_desc, credit_amount=self.amount,
            source_type='receipt', source_id=self.id
        )

        # --- Activity 3: Transfer to Landlord ---
        # GL: Dr Unpaid Rent (clear deferred revenue)
        je_unpaid_dr = JournalEntry.objects.create(
            journal=journal, account=unpaid_rent_account,
            description=base_desc, debit_amount=self.amount,
            source_type='receipt', source_id=self.id
        )
        # GL: Cr Landlord Trust Payable (money now owed to landlord)
        je_trust_cr = JournalEntry.objects.create(
            journal=journal, account=landlord_trust_account,
            description=base_desc, credit_amount=self.amount,
            source_type='receipt', source_id=self.id
        )

        # --- Activity 4: Commission Allocation ---
        je_trust_dr = None
        je_comm_cr = None
        je_vat_cr = None
        if gross_commission > Decimal('0'):
            # GL: Dr Landlord Trust Payable (reduce what's owed for commission)
            je_trust_dr = JournalEntry.objects.create(
                journal=journal, account=landlord_trust_account,
                description=f'Rent Commission-{base_desc}',
                debit_amount=gross_commission,
                source_type='receipt', source_id=self.id
            )
            # GL: Cr Commission Revenue (net commission — agent's income)
            je_comm_cr = JournalEntry.objects.create(
                journal=journal, account=commission_revenue_account,
                description=f'Rent Commission-{base_desc}',
                credit_amount=net_commission,
                source_type='receipt', source_id=self.id
            )
            # GL: Cr VAT Payable
            je_vat_cr = JournalEntry.objects.create(
                journal=journal, account=vat_payable_account,
                description=f'VAT-Rent Commission-{base_desc}',
                credit_amount=vat_on_commission,
                source_type='receipt', source_id=self.id
            )

        # Post the journal (updates GL balances)
        journal.post(user)

        # === Subsidiary Ledger Entries ===
        tenant_sub = SubsidiaryAccount.get_or_create_for_tenant(self.tenant)
        invoice_type = self.invoice.invoice_type if self.invoice else 'rent'
        billing_contra = Invoice(invoice_type=invoice_type)._get_billing_contra_code()
        income_contra = Invoice(invoice_type=invoice_type)._get_income_contra_code()
        unpaid_contra = Invoice(invoice_type=invoice_type)._get_unpaid_contra_code()
        commission_expense_contra = Invoice(invoice_type=invoice_type)._get_commission_expense_code()
        cash_contra = self._get_cash_contra_code()

        # Activity 2 Txn 3: Dr Cash subsidiary (not tracked per-entity; skip)
        # Activity 2 Txn 4: Cr Tenant Account
        SubsidiaryTransaction.create_entry(
            account=tenant_sub, date=self.date,
            contra_account=cash_contra,
            reference=self.receipt_number,
            description=base_desc,
            credit_amount=self.amount,
            journal_entry=je_ar_cr,
        )

        if landlord:
            # Use category-specific landlord sub-account based on invoice type
            landlord_sub = SubsidiaryAccount.get_or_create_for_landlord_category(
                landlord, category=invoice_type, currency=self.currency
            )

            # Activity 3 Txn 6: Cr Landlord Account (rent income transfer)
            SubsidiaryTransaction.create_entry(
                account=landlord_sub, date=self.date,
                contra_account=income_contra,
                reference=self.receipt_number,
                description=base_desc,
                credit_amount=self.amount,
                journal_entry=je_trust_cr,
            )

            if gross_commission > Decimal('0'):
                # Generate commission allocation reference
                from django.utils import timezone
                cma_prefix = timezone.now().strftime('CMA%Y%m%d')
                cma_last = SubsidiaryTransaction.objects.filter(
                    reference__startswith=cma_prefix
                ).order_by('-reference').first()
                if cma_last:
                    cma_num = int(cma_last.reference[len(cma_prefix):]) + 1
                else:
                    cma_num = 1
                cma_ref = f'{cma_prefix}{cma_num:04d}'

                # Activity 4 Txn 9: Dr Landlord Account (gross commission deducted)
                SubsidiaryTransaction.create_entry(
                    account=landlord_sub, date=self.date,
                    contra_account=commission_expense_contra,
                    reference=cma_ref,
                    description=f'Rent Commission-{base_desc}',
                    debit_amount=gross_commission,
                    journal_entry=je_trust_dr,
                )

        # === Update invoice payment status ===
        self.journal = journal
        self.save()

        if self.invoice:
            invoice = Invoice.objects.select_for_update().get(id=self.invoice_id)
            old_status = invoice.status
            invoice.amount_paid += self.amount
            if invoice.amount_paid >= invoice.total_amount:
                invoice.status = Invoice.Status.PAID
            else:
                invoice.status = Invoice.Status.PARTIAL
            invoice.save()

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

    def post_to_ledger_with_commission(self, user=None):
        """Legacy alias — post_to_ledger now handles commission automatically."""
        return self.post_to_ledger(user)


class Expense(SoftDeleteModel):
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

    # Categorization
    expense_category = models.ForeignKey(
        'accounting.ExpenseCategory', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='expenses'
    )
    income_type = models.ForeignKey(
        'accounting.IncomeType', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='expenses',
        help_text='Income category this expense is matched against'
    )

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
        indexes = [
            models.Index(fields=['status', 'date']),
            models.Index(fields=['expense_type']),
            models.Index(fields=['date']),
            models.Index(fields=['payee_type', 'payee_id']),
            models.Index(fields=['currency']),
        ]

    def __str__(self):
        return f'{self.expense_number} - {self.payee_name}'

    def save(self, *args, **kwargs):
        if not self.expense_number:
            with transaction.atomic():
                self.expense_number = self.generate_expense_number()
                super().save(*args, **kwargs)
                return
        super().save(*args, **kwargs)

    @classmethod
    def generate_expense_number(cls):
        from django.utils import timezone
        prefix = timezone.now().strftime('EXP%Y%m%d')
        last = cls.all_objects.select_for_update().filter(expense_number__startswith=prefix).order_by('-expense_number').first()
        if last:
            num = int(last.expense_number[len(prefix):]) + 1
        else:
            num = 1
        return f'{prefix}{num:04d}'

    @transaction.atomic
    def post_to_ledger(self, user=None):
        """
        Post expense to General Ledger — Activity 5: Expense Posting.

        GL entries:
            Dr: Expense Category account (or Landlord Trust Payable for landlord expenses)
            Cr: Cash/Bank

        Subsidiary entries (for landlord expenses):
            Dr Landlord Account (LD/xxx) — reduces what's owed to landlord
        """
        from django.core.exceptions import ValidationError as DjangoValidationError

        if self.journal:
            return self.journal

        if not self.income_type:
            raise DjangoValidationError('Cannot post expense without an income_type.')

        # Get accounts - prefer expense_category GL account if available
        if self.expense_category and self.expense_category.gl_account:
            expense_account = self.expense_category.gl_account
        else:
            expense_account = ChartOfAccount.objects.filter(
                account_type='expense'
            ).first()

        # For landlord expenses, debit Landlord Trust Payable (reduces liability)
        is_landlord_expense = self.payee_type == 'landlord' and self.payee_id
        if is_landlord_expense:
            landlord_trust_account, _ = ChartOfAccount.objects.get_or_create(
                code='2300',
                defaults={
                    'name': 'Landlord Trust Payable',
                    'account_type': 'liability',
                    'account_subtype': 'accounts_payable',
                    'is_system': True
                }
            )
            debit_account = landlord_trust_account
        else:
            debit_account = expense_account

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

        je_debit = JournalEntry.objects.create(
            journal=journal,
            account=debit_account,
            description=self.description,
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

        journal.post(user)

        # === Subsidiary Ledger Entry for landlord expenses ===
        if is_landlord_expense:
            from apps.masterfile.models import Landlord
            try:
                landlord = Landlord.objects.get(id=self.payee_id)
                # Resolve category from income_type code or default to 'general'
                expense_category_name = 'general'
                if self.income_type and self.income_type.code:
                    expense_category_name = self.income_type.code.lower()
                landlord_sub = SubsidiaryAccount.get_or_create_for_landlord_category(
                    landlord, category=expense_category_name, currency=self.currency
                )

                # Get expense GL code for contra reference
                expense_contra = expense_account.code if expense_account else '2000/001'

                SubsidiaryTransaction.create_entry(
                    account=landlord_sub,
                    date=self.date,
                    contra_account=expense_contra,
                    reference=self.expense_number,
                    description=self.description,
                    debit_amount=self.amount,
                    journal_entry=je_debit,
                )
            except Landlord.DoesNotExist:
                pass

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
