"""Seed the 28 cash-expense categories from the trust accounting spec.

Each entry creates / updates an ExpenseCategory with:
  - code: short identifier (EXP_xxxx)
  - name: human label
  - gl_account: the single GL account (serves USD and ZWG; created if
    missing)
  - funding_category: which landlord sub-account to debit
  - default_description: pre-fills the Record Expense modal

Idempotent — re-running won't duplicate or clobber user-edited names.
"""
from django.core.management.base import BaseCommand
from django_tenants.utils import schema_context, get_tenant_model

from apps.accounting.models import ChartOfAccount, ExpenseCategory


# (name, gl_code, funding_category, default_description)
# ONE GL account per category serves BOTH currencies — currency lives on
# the transaction. Codes are the hierarchical chart's 7000-range Operating
# Expenses (plus 8000-range taxes and asset/liability payment categories).
CATEGORIES = [
    # ── Operating Expenses (7000-7999) ──
    ('Salaries & Wages',          '7000', 'rent',        'Salaries & Wages'),
    ('Security Fees',             '7010', 'rent',        'Security Fees'),
    ('Electricity',               '7020', 'rent',        'Electricity'),
    ('City of Harare Rates',      '7030', 'rates',       'City of Harare Rates'),
    ('Gardening',                 '7040', 'maintenance', 'Gardening'),
    ('Routine Maintenance',       '7050', 'maintenance', 'Routine Maintenance'),
    ('Fuels & Lubricants',        '7060', 'rent',        'Fuels & Lubricants'),
    ('Repairs & Maintenance',     '7070', 'maintenance', 'Repairs & Maintenance'),
    ('Insurance',                 '7080', 'rent',        'Insurance'),
    ('Cash in Lieu',              '7090', 'rent',        'Cash in Lieu'),
    ('Utilities',                 '7100', 'rent',        'Utilities'),
    ('Payroll Expenses',          '7110', 'rent',        'Payroll Expenses'),
    ('Bank Charges',              '7120', 'rent',        'Bank Charges'),
    ('Audit Fees',                '7130', 'rent',        'Audit Fees'),
    ('Legal & Professional Fees', '7140', 'rent',        'Legal & Professional Fees'),
    ('Gratuity',                  '7150', 'rent',        'Gratuity'),
    ('Refuse Collection',         '7160', 'rent',        'Refuse Collection'),
    ('Cleaning',                  '7170', 'rent',        'Cleaning'),
    # ── Taxation Expense (8000-8999) ──
    ('Income Tax',                '8000', 'rent',        'Income Tax'),
    ('Withholding Tax',           '8010', 'rent',        'Withholding Tax'),
    ('Presumptive Tax',           '8020', 'rent',        'Presumptive Tax'),
    ('Lessors VAT',               '8030', 'rent',        'Lessors VAT'),
    # ── Capitalised purchases (Fixed Asset codes) ──
    ('Motor Vehicles',            '0050', 'rent',        'Motor Vehicle purchase'),
    ('Furniture & Fittings',      '0070', 'rent',        'Furniture & Fittings'),
    ('Computer Equipment',        '0090', 'rent',        'Computer Equipment'),
    ('Office Equipment',          '0110', 'rent',        'Office Equipment'),
    # ── Liability settlements ──
    ('Mortgage',                  '4000', 'rent',        'Mortgage repayment'),
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
        for name, code, funding, desc in CATEGORIES:
            acc = self._get_or_create_gl(code, name, 'operating_expense')
            cat, was_created = ExpenseCategory.objects.update_or_create(
                gl_account=acc,
                defaults={
                    'name': name,
                    # ONE account serves both currencies under the
                    # hierarchical chart — no ZWG twin.
                    'gl_account_zwg': None,
                    'funding_category': funding,
                    'default_description': desc,
                    'is_system': True,
                    'is_active': True,
                },
            )
            if was_created:
                created += 1
                self.stdout.write(f'  + {name} ({code}) -> {funding}')
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
