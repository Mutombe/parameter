"""Seed the 28 cash-expense categories from the trust accounting spec.

Each entry creates / updates an ExpenseCategory with:
  - code: short identifier (EXP_xxxx)
  - name: human label
  - gl_account: USD GL account (created if missing)
  - gl_account_zwg: ZWG GL account (created if missing)
  - funding_category: which landlord sub-account to debit
  - default_description: pre-fills the Record Expense modal

Idempotent — re-running won't duplicate or clobber user-edited names.
"""
from django.core.management.base import BaseCommand
from django_tenants.utils import schema_context, get_tenant_model

from apps.accounting.models import ChartOfAccount, ExpenseCategory


# (name, usd_code, zwg_code, funding_category, default_description, account_subtype)
CATEGORIES = [
    # ── Operating Expenses ──
    ('Salaries & Wages',              '2000/001', '2000/501', 'rent',        'Salaries & Wages',          'operating'),
    ('Utilities',                     '2000/002', '2000/502', 'rent',        'Utilities',                 'operating'),
    ('Electricity',                   '2000/003', '2000/503', 'rent',        'Electricity',               'operating'),
    ('Refuse Collection',             '2000/004', '2000/504', 'rent',        'Refuse Collection',         'operating'),
    ('Payroll Expenses',              '2000/005', '2000/505', 'rent',        'Payroll Expenses',          'operating'),
    ('Security Fees',                 '2000/006', '2000/506', 'rent',        'Security Fees',             'operating'),
    ('Routine Maintenance',           '2000/007', '2000/507', 'maintenance', 'Routine Maintenance',       'operating'),
    ('General Repairs',               '2000/008', '2000/508', 'maintenance', 'General Repairs',           'operating'),
    ('City of Harare Rates',          '2000/009', '2000/509', 'rates',       'City of Harare Rates',      'operating'),
    ('Upper Manyame Rates',           '2000/010', '2000/510', 'rates',       'Upper Manyame Rates',       'operating'),
    # ── Payroll Expenses ──
    ('NSSA',                          '2100/001', '2100/501', 'rent',        'NSSA',                      'operating'),
    ('PAYE',                          '2100/002', '2100/502', 'rent',        'PAYE',                      'operating'),
    # ── Other Expenses ──
    ('Cash In Lieu',                  '2200/001', '2200/501', 'rent',        'Cash In Lieu',              'operating'),
    ('Gratuity',                      '2200/002', '2200/502', 'rent',        'Gratuity',                  'operating'),
    ('Insurance',                     '2200/003', '2200/503', 'rent',        'Insurance',                 'operating'),
    ('Legal & Professional Fees',     '2200/004', '2200/504', 'rent',        'Legal & Professional Fees', 'operating'),
    # ── Finance Expenses ──
    ('Bank Charges',                  '2300/001', '2300/501', 'rent',        'Bank Charges',              'operating'),
    ('Interest Charges',              '2300/002', '2300/502', 'rent',        'Interest Charges',          'operating'),
    # ── Assets (capitalised purchases) ──
    ('Land',                          '3000/001', '3000/501', 'rent',        'Land Purchase',             'operating'),
    ('Buildings',                     '3000/002', '3000/502', 'rent',        'Buildings',                 'operating'),
    ('Motor Vehicles',                '3000/003', '3000/503', 'rent',        'Motor Vehicles',            'operating'),
    ('Office Furniture',              '3000/004', '3000/504', 'rent',        'Office Furniture',          'operating'),
    ('Computer Equipment',            '3000/005', '3000/505', 'rent',        'Computer Equipment',        'operating'),
    ('Accounts Receivable',           '4100/001', '4100/501', 'rent',        'Accounts Receivable',       'operating'),
    # ── Liabilities ──
    ('Short-term Loan',               '6100/010', '6100/510', 'rent',        'Short-term Loan repayment', 'operating'),
    # ── Long-Term Liabilities ──
    ('Mortgage',                      '7000/010', '7000/510', 'rent',        'Mortgage repayment',        'operating'),
]


class Command(BaseCommand):
    help = 'Seed standard expense categories from the cash-expense spec.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--schema', type=str, default=None,
            help='Only run in this tenant schema (defaults to all non-public tenants).'
        )

    def handle(self, *args, **opts):
        TenantModel = get_tenant_model()
        tenants = TenantModel.objects.exclude(schema_name='public')
        if opts['schema']:
            tenants = tenants.filter(schema_name=opts['schema'])

        for tenant in tenants:
            self.stdout.write(f'--- {tenant.schema_name} ---')
            with schema_context(tenant.schema_name):
                self._seed_schema()

    def _seed_schema(self):
        created, updated = 0, 0
        for name, usd_code, zwg_code, funding, desc, subtype in CATEGORIES:
            usd_acc = self._get_or_create_gl(usd_code, name, subtype)
            zwg_acc = self._get_or_create_gl(zwg_code, f'{name} (ZWG)', subtype)
            cat, was_created = ExpenseCategory.objects.update_or_create(
                gl_account=usd_acc,
                defaults={
                    'name': name,
                    'gl_account_zwg': zwg_acc,
                    'funding_category': funding,
                    'default_description': desc,
                    'is_system': True,
                    'is_active': True,
                },
            )
            if was_created:
                created += 1
                self.stdout.write(f'  + {name} ({usd_code} / {zwg_code}) → {funding}')
            else:
                updated += 1
        self.stdout.write(self.style.SUCCESS(
            f'Created {created}, updated {updated} expense categories.'
        ))

    def _get_or_create_gl(self, code, name, subtype):
        """Get or create a ChartOfAccount with the given code."""
        acc, _ = ChartOfAccount.objects.get_or_create(
            code=code,
            defaults={
                'name': name,
                'account_type': 'expense',
                'account_subtype': subtype,
                'is_system': True,
            },
        )
        return acc
