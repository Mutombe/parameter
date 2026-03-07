"""
Seed the Chart of Accounts with the trust accounting structure
as defined in the TRUST ACCOUNTING SOFTWARE FEB 2026 specification.

Includes: Income, Expenses, Balance Sheet, and Subsidiary Ledger codes.
Dual-currency: USD codes (/0xx) and ZWG codes (/5xx).
"""
from django.core.management.base import BaseCommand
from django_tenants.utils import get_tenant_model, tenant_context
from apps.accounting.models import ChartOfAccount, SubsidiaryAccount
from apps.masterfile.models import Landlord, RentalTenant


# (code, name, account_type, account_subtype, parent_code_or_None)
TRUST_COA = [
    # === INCOME (1000-1100) ===
    ('1000', 'Income', 'revenue', 'rental_income', None),
    ('1000/010', 'Rent Income USD', 'revenue', 'rental_income', '1000'),
    ('1000/020', 'Levy Income USD', 'revenue', 'levy_income', '1000'),
    ('1000/030', 'Parking Income USD', 'revenue', 'parking_income', '1000'),
    ('1000/040', 'Maintenance Income USD', 'revenue', 'other_income', '1000'),
    ('1000/050', 'Special Levy Income USD', 'revenue', 'special_levy_income', '1000'),
    ('1000/060', 'Rates Income USD', 'revenue', 'rates_income', '1000'),
    ('1000/070', 'Deposit Income USD', 'revenue', 'other_income', '1000'),
    ('1000/080', 'VAT Income USD', 'revenue', 'vat_income', '1000'),
    ('1100', 'Other Income', 'revenue', 'other_income', None),
    ('1100/001', 'Other Income USD', 'revenue', 'other_income', '1100'),

    # === OPERATING EXPENSES (2000) ===
    ('2000', 'Operating Expenses', 'expense', 'operating_expense', None),
    ('2000/001', 'Routine Maintenance', 'expense', 'maintenance', '2000'),
    ('2000/002', 'General Repairs', 'expense', 'maintenance', '2000'),
    ('2000/003', 'Utilities', 'expense', 'utilities', '2000'),
    ('2000/004', 'Salaries & Wages', 'expense', 'operating_expense', '2000'),
    ('2000/005', 'Electricity', 'expense', 'utilities', '2000'),
    ('2000/006', 'Rates', 'expense', 'operating_expense', '2000'),
    ('2000/007', 'Refuse Collection', 'expense', 'operating_expense', '2000'),
    ('2000/008', 'Capital Improvements', 'expense', 'operating_expense', '2000'),
    ('2000/009', 'Payroll Expenses', 'expense', 'operating_expense', '2000'),
    ('2000/010', 'Rent Commission Expense', 'expense', 'operating_expense', '2000'),
    ('2000/011', 'Security Fees', 'expense', 'operating_expense', '2000'),
    ('2000/020', 'Levy Commission Expense', 'expense', 'operating_expense', '2000'),
    ('2000/030', 'Parking Commission Expense', 'expense', 'operating_expense', '2000'),
    ('2000/040', 'Maintenance Commission Expense', 'expense', 'operating_expense', '2000'),
    ('2000/050', 'Special Levy Commission Expense', 'expense', 'operating_expense', '2000'),
    ('2000/060', 'Rates Commission Expense', 'expense', 'operating_expense', '2000'),

    # === OTHER EXPENSES (2100) ===
    ('2100', 'Other Expenses', 'expense', 'operating_expense', None),
    ('2100/001', 'Insurance', 'expense', 'operating_expense', '2100'),
    ('2100/002', 'Legal & Professional Fees', 'expense', 'operating_expense', '2100'),

    # === FINANCE CHARGES (2200) ===
    ('2200/001', 'Bank Charges', 'expense', 'operating_expense', None),

    # === BILLING/INVOICING EXPENSES (2300) ===
    ('2300', 'Billing Expenses', 'expense', 'operating_expense', None),
    ('2300/010', 'Rent Charge', 'expense', 'operating_expense', '2300'),
    ('2300/020', 'Levy Charge', 'expense', 'operating_expense', '2300'),
    ('2300/030', 'Parking Charge', 'expense', 'operating_expense', '2300'),
    ('2300/040', 'Maintenance Charge', 'expense', 'operating_expense', '2300'),
    ('2300/050', 'Special Levy Charge', 'expense', 'operating_expense', '2300'),
    ('2300/060', 'Rates Charge', 'expense', 'operating_expense', '2300'),
    ('2300/070', 'VAT Charge', 'expense', 'operating_expense', '2300'),
    ('2300/080', 'Late Payment Interest Charge', 'expense', 'operating_expense', '2300'),

    # === FIXED ASSETS (3000) ===
    ('3000', 'Fixed Assets', 'asset', 'fixed_asset', None),
    ('3000/001', 'Land', 'asset', 'fixed_asset', '3000'),
    ('3000/002', 'Buildings', 'asset', 'fixed_asset', '3000'),
    ('3000/003', 'Motor Vehicles', 'asset', 'fixed_asset', '3000'),
    ('3000/004', 'Office Furniture', 'asset', 'fixed_asset', '3000'),
    ('3000/005', 'Computer Equipment', 'asset', 'fixed_asset', '3000'),

    # === CURRENT ASSETS (4000) ===
    ('4000', 'Current Assets', 'asset', 'cash', None),
    ('4000/001', 'Cash USD', 'asset', 'cash', '4000'),
    ('4000/002', 'FBC Bank USD', 'asset', 'cash', '4000'),
    ('4000/003', 'ZB Bank USD', 'asset', 'cash', '4000'),
    ('4000/004', 'Ecocash USD', 'asset', 'cash', '4000'),

    # === EQUITY (5000) ===
    ('5000', 'Equity', 'equity', 'capital', None),
    ('5000/010', "Owner's Equity", 'equity', 'capital', '5000'),
    ('5000/020', 'Retained Income', 'equity', 'retained_earnings', '5000'),

    # === CURRENT LIABILITIES — Unpaid Accounts (6000) ===
    ('6000', 'Current Liabilities - Unpaid', 'liability', 'tenant_deposits', None),
    ('6000/010', 'Unpaid Rent USD', 'liability', 'tenant_deposits', '6000'),
    ('6000/020', 'Unpaid Levy USD', 'liability', 'tenant_deposits', '6000'),
    ('6000/030', 'Unpaid Parking USD', 'liability', 'tenant_deposits', '6000'),
    ('6000/040', 'Unpaid Special Levy USD', 'liability', 'tenant_deposits', '6000'),
    ('6000/050', 'Unpaid Maintenance USD', 'liability', 'tenant_deposits', '6000'),
    ('6000/060', 'Unpaid Rates USD', 'liability', 'tenant_deposits', '6000'),
    ('6000/070', 'Unpaid VAT USD', 'liability', 'tenant_deposits', '6000'),

    # === OTHER CURRENT LIABILITIES (6100) ===
    ('6100/010', 'Short-Term Loan', 'liability', 'accounts_payable', None),

    # === LONG-TERM LIABILITIES (7000) ===
    ('7000/010', 'Mortgage', 'liability', 'accounts_payable', None),
]


class Command(BaseCommand):
    help = 'Seed trust accounting Chart of Accounts and subsidiary accounts'

    def add_arguments(self, parser):
        parser.add_argument(
            '--schema', type=str, default=None,
            help='Seed for a specific tenant schema (default: all tenants)'
        )
        parser.add_argument(
            '--accounts-only', action='store_true',
            help='Only seed COA, skip subsidiary account sync'
        )

    def handle(self, *args, **options):
        TenantModel = get_tenant_model()
        schema = options.get('schema')

        if schema:
            tenants = TenantModel.objects.filter(schema_name=schema)
        else:
            tenants = TenantModel.objects.exclude(schema_name='public')

        self.stdout.write(f'Seeding trust accounting for {tenants.count()} tenant(s)')

        for tenant in tenants:
            self.stdout.write(f'\n=== Schema: {tenant.schema_name} ===')
            with tenant_context(tenant):
                coa_created = self._seed_coa()
                self.stdout.write(f'  COA: {coa_created} new accounts created')

                if not options.get('accounts_only'):
                    sub_created = self._sync_subsidiary_accounts()
                    self.stdout.write(f'  Subsidiary: {sub_created} new accounts created')

        self.stdout.write(self.style.SUCCESS('\nDone!'))

    def _seed_coa(self):
        created = 0
        parent_cache = {}

        for code, name, acc_type, subtype, parent_code in TRUST_COA:
            parent = parent_cache.get(parent_code) if parent_code else None

            account, was_created = ChartOfAccount.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'account_type': acc_type,
                    'account_subtype': subtype,
                    'parent': parent,
                    'is_system': True,
                    'is_active': True,
                }
            )
            parent_cache[code] = account
            if was_created:
                created += 1

        return created

    def _sync_subsidiary_accounts(self):
        created = 0

        for tenant in RentalTenant.objects.filter(is_active=True, is_deleted=False):
            _, was_created = SubsidiaryAccount.objects.get_or_create(
                tenant=tenant,
                defaults={
                    'code': f'TN/{tenant.code.replace("TN", "").lstrip("0") or "0"}',
                    'name': tenant.name,
                    'entity_type': SubsidiaryAccount.EntityType.TENANT
                    if tenant.account_type == 'rental'
                    else SubsidiaryAccount.EntityType.ACCOUNT_HOLDER,
                    'currency': 'USD',
                }
            )
            if was_created:
                created += 1

        for landlord in Landlord.objects.filter(is_active=True, is_deleted=False):
            _, was_created = SubsidiaryAccount.objects.get_or_create(
                landlord=landlord,
                defaults={
                    'code': f'LD/{landlord.code.replace("LL", "").lstrip("0") or "0"}',
                    'name': landlord.name,
                    'entity_type': SubsidiaryAccount.EntityType.LANDLORD,
                    'currency': landlord.preferred_currency,
                }
            )
            if was_created:
                created += 1

        return created
