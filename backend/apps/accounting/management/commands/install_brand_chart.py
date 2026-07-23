"""Install the canonical hierarchical Chart of Accounts (brand spec).

Creates/aligns the 4-digit coded chart from the CHART OF ACCOUNTS workbook:
every account carries its full 6-level hierarchy (report -> class ->
subclass -> type -> subtype -> code+name) plus the legacy account_type/
account_subtype slugs the posting engine and reports key on.

ONE account serves BOTH currencies (USD & ZWG) — currency lives on the
transactions, and reports filter by it. No (ZWG) twin accounts.

Idempotent: matches by code; updates hierarchy/name/type fields in place,
never touches balances. Usage:
    python manage.py install_brand_chart --schema=<name> | --all-tenants
"""
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django_tenants.utils import schema_context, get_tenant_model

from apps.accounting.hierarchy import LEGACY_TYPE_BY_CLASS

# (report, class, subclass, type_l4, subtype_l5, code, name,
#  legacy_subtype, balance_sheet_category)
CHART = [
    # ── Fixed / Non-current Assets (0001-0999) ──────────────────────
    ('balance_sheet', 'asset',        'noncurrent_assets', 'Fixed Asset', 'Immovable Asset', '0010', 'Land & Buildings',            'fixed_asset',              'non_current_assets'),
    ('balance_sheet', 'contra_asset', 'noncurrent_assets', 'Fixed Asset', 'Immovable Asset', '0020', 'Accumulated Depreciation — Land & Buildings', 'accumulated_depreciation', 'non_current_assets'),
    ('balance_sheet', 'asset',        'noncurrent_assets', 'Fixed Asset', 'Immovable Asset', '0030', 'Buildings',                   'fixed_asset',              'non_current_assets'),
    ('balance_sheet', 'contra_asset', 'noncurrent_assets', 'Fixed Asset', 'Immovable Asset', '0040', 'Accumulated Depreciation — Buildings', 'accumulated_depreciation', 'non_current_assets'),
    ('balance_sheet', 'asset',        'noncurrent_assets', 'Fixed Asset', 'Movable Asset',   '0050', 'Motor Vehicles',              'movable_asset',            'non_current_assets'),
    ('balance_sheet', 'contra_asset', 'noncurrent_assets', 'Fixed Asset', 'Movable Asset',   '0060', 'Accumulated Depreciation — Motor Vehicles', 'accumulated_depreciation', 'non_current_assets'),
    ('balance_sheet', 'asset',        'noncurrent_assets', 'Fixed Asset', 'Movable Asset',   '0070', 'Furniture & Fittings',        'movable_asset',            'non_current_assets'),
    ('balance_sheet', 'contra_asset', 'noncurrent_assets', 'Fixed Asset', 'Movable Asset',   '0080', 'Accumulated Depreciation — Furniture & Fittings', 'accumulated_depreciation', 'non_current_assets'),
    ('balance_sheet', 'asset',        'noncurrent_assets', 'Fixed Asset', 'Movable Asset',   '0090', 'Computer Equipment',          'movable_asset',            'non_current_assets'),
    ('balance_sheet', 'contra_asset', 'noncurrent_assets', 'Fixed Asset', 'Movable Asset',   '0100', 'Accumulated Depreciation — Computer Equipment', 'accumulated_depreciation', 'non_current_assets'),
    ('balance_sheet', 'asset',        'noncurrent_assets', 'Fixed Asset', 'Movable Asset',   '0110', 'Office Equipment',            'movable_asset',            'non_current_assets'),
    ('balance_sheet', 'contra_asset', 'noncurrent_assets', 'Fixed Asset', 'Movable Asset',   '0120', 'Accumulated Depreciation — Office Equipment', 'accumulated_depreciation', 'non_current_assets'),
    # ── Current Assets (1000-1999) ──────────────────────────────────
    ('balance_sheet', 'asset', 'current_assets', 'Cash & Cash Equivalents', 'Bank', '1100', 'Bank Current Account',   'bank',                'current_assets'),
    ('balance_sheet', 'asset', 'current_assets', 'Cash & Cash Equivalents', 'Bank', '1110', 'Savings Account',        'bank',                'current_assets'),
    ('balance_sheet', 'asset', 'current_assets', 'Cash & Cash Equivalents', 'Cash', '1200', 'Petty Cash',             'cash',                'current_assets'),
    ('balance_sheet', 'asset', 'current_assets', 'Accounts Receivable', 'Debtors', '1300', 'Accounts Receivable',     'accounts_receivable', 'accounts_receivable'),
    ('balance_sheet', 'contra_asset', 'current_assets', 'Accounts Receivable', 'Debtors', '1310', 'Allowance for Bad Debts', 'accounts_receivable', 'accounts_receivable'),
    ('balance_sheet', 'asset', 'current_assets', 'Short-term Investments', '', '1400', 'Short-term Investments',      'investment',          'investments'),
    ('balance_sheet', 'asset', 'current_assets', 'Other', '',        '1500', 'VAT Control',                           'prepaid',             'current_assets'),
    ('balance_sheet', 'asset', 'current_assets', 'Prepayments', '',  '1600', 'Prepaid Expenses',                      'prepaid',             'prepayments'),
    # ── Current Liabilities (2000-2999) ─────────────────────────────
    ('balance_sheet', 'liability', 'current_liabilities', 'Payables', '', '2000', 'Accounts Payable (Creditors)', 'accounts_payable', ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Tax Liability', '', '2100', 'VAT Payable',              'vat_payable',      ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Tax Liability', '', '2110', 'VAT Payable (Commission)', 'vat_payable',      ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Payables', '', '2200', 'Tenant Deposits',              'tenant_deposits',  ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Payables', '', '2300', 'Bank Overdraft',               'accounts_payable', ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Tax Liability', '', '2400', 'Withholding Tax Liability', 'vat_payable',     ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Tax Liability', '', '2410', 'Income Tax Liability',     'vat_payable',      ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Tax Liability', '', '2420', 'Presumptive Tax Liability', 'vat_payable',     ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Tax Liability', '', '2440', 'Lessors VAT Liability',    'vat_payable',      ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Deferred Revenue', '', '2500', 'Unpaid Rent',           'tenant_deposits',  ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Deferred Revenue', '', '2510', 'Unpaid Levy',           'tenant_deposits',  ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Deferred Revenue', '', '2520', 'Unpaid Special Levy',   'tenant_deposits',  ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Deferred Revenue', '', '2530', 'Unpaid Maintenance',    'tenant_deposits',  ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Deferred Revenue', '', '2540', 'Unpaid Parking',        'tenant_deposits',  ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Deferred Revenue', '', '2550', 'Unpaid Rates',          'tenant_deposits',  ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Deferred Revenue', '', '2560', 'Unpaid VAT',            'tenant_deposits',  ''),
    ('balance_sheet', 'liability', 'current_liabilities', 'Deferred Revenue', '', '2570', 'Unpaid Deposit',        'tenant_deposits',  ''),
    # Engine control account: what the agency owes landlords. Reserved
    # current-liability code (spec range 2000-2999, code unassigned there).
    ('balance_sheet', 'liability', 'current_liabilities', 'Payables', '', '2600', 'Landlord Trust Payable',        'accounts_payable', ''),
    # ── Equity (3000-3999) ──────────────────────────────────────────
    ('balance_sheet', 'equity', 'equity', 'Equity', '', '3000', 'Retained Earnings',        'retained_earnings', ''),
    ('balance_sheet', 'equity', 'equity', 'Equity', '', '3100', 'Capital',                  'capital',           ''),
    ('balance_sheet', 'equity', 'equity', 'Equity', '', '3200', 'Current Year Profit/Loss', 'retained_earnings', ''),
    ('balance_sheet', 'equity', 'equity', 'Equity', '', '3300', 'Owner Withdrawals',        'capital',           ''),
    # ── Long-term Liabilities (4000-4999) ───────────────────────────
    ('balance_sheet', 'liability', 'longterm_liabilities', 'Loans & Mortgages', '', '4000', 'Mortgage', 'accounts_payable', ''),
    # ── Property Income (5000-5499) ─────────────────────────────────
    ('profit_loss', 'income', 'property_income', 'Property Income', '', '5000', 'Rental Income',       'rental_income',        ''),
    ('profit_loss', 'income', 'property_income', 'Property Income', '', '5010', 'Levy Income',         'levy_income',          ''),
    ('profit_loss', 'income', 'property_income', 'Property Income', '', '5020', 'Special Levy Income', 'special_levy_income',  ''),
    ('profit_loss', 'income', 'property_income', 'Property Income', '', '5030', 'Maintenance Income',  'other_income',         ''),
    ('profit_loss', 'income', 'property_income', 'Property Income', '', '5040', 'Rates Income',        'rates_income',         ''),
    ('profit_loss', 'income', 'property_income', 'Property Income', '', '5050', 'Parking Income',      'parking_income',       ''),
    ('profit_loss', 'income', 'property_income', 'Property Income', '', '5060', 'VAT Income',          'vat_income',           ''),
    ('profit_loss', 'income', 'property_income', 'Property Income', '', '5070', 'Deposit Income',      'other_income',         ''),
    # ── Cost of Sales (6000-6999) ───────────────────────────────────
    ('profit_loss', 'expense', 'cost_of_sales', 'Management Fee', 'Commission', '6000', 'Agent Commission', 'commission_income', ''),
    # ── Operating Expenses (7000-7999) ──────────────────────────────
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7000', 'Salaries & Wages',          'operating_expense', ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7010', 'Security Fees',             'operating_expense', ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7020', 'Electricity',               'operating_expense', ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7030', 'City of Harare Rates',      'operating_expense', ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7040', 'Gardening',                 'operating_expense', ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7050', 'Routine Maintenance',       'maintenance',       ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7060', 'Fuels & Lubricants',        'operating_expense', ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7070', 'Repairs & Maintenance',     'maintenance',       ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7080', 'Insurance',                 'operating_expense', ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7090', 'Cash in Lieu',              'operating_expense', ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7100', 'Utilities',                 'utilities',         ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7110', 'Payroll Expenses',          'operating_expense', ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7120', 'Bank Charges',              'operating_expense', ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7130', 'Audit Fees',                'operating_expense', ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7140', 'Legal & Professional Fees', 'operating_expense', ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7150', 'Gratuity',                  'operating_expense', ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7160', 'Refuse Collection',         'operating_expense', ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7170', 'Cleaning',                  'operating_expense', ''),
    ('profit_loss', 'expense', 'operating_expenses', 'Property Expense', '', '7300', 'Depreciation Expense',      'depreciation',      ''),
    # ── Taxation Expense (8000-8999) ────────────────────────────────
    ('profit_loss', 'expense', 'taxation_expense', 'Property Tax', '', '8000', 'Income Tax',       'operating_expense', ''),
    ('profit_loss', 'expense', 'taxation_expense', 'Property Tax', '', '8010', 'Withholding Tax',  'operating_expense', ''),
    ('profit_loss', 'expense', 'taxation_expense', 'Property Tax', '', '8020', 'Presumptive Tax',  'operating_expense', ''),
    ('profit_loss', 'expense', 'taxation_expense', 'Property Tax', '', '8030', 'Lessors VAT',      'operating_expense', ''),
    # ── Suspense / Opening Balances (9000-9999) ─────────────────────
    ('balance_sheet', 'equity', 'suspense', 'Suspense', '', '9000', 'Opening Balances / Suspense', 'retained_earnings', ''),
]


class Command(BaseCommand):
    help = "Install/align the canonical hierarchical chart of accounts (brand spec)."

    def add_arguments(self, parser):
        parser.add_argument('--schema', type=str)
        parser.add_argument('--all-tenants', action='store_true')

    def handle(self, *args, **options):
        if options['all_tenants']:
            schemas = list(get_tenant_model().objects.exclude(schema_name='public')
                           .values_list('schema_name', flat=True))
        elif options['schema']:
            schemas = [options['schema']]
        else:
            self.stderr.write('Provide --schema=<name> or --all-tenants')
            return
        for schema in schemas:
            try:
                self._process(schema)
            except Exception as e:
                self.stderr.write(f'[{schema}] FAILED: {e}')

    def _process(self, schema):
        from apps.accounting.models import ChartOfAccount
        with schema_context(schema), transaction.atomic():
            with connection.cursor() as cur:
                cur.execute('SELECT current_schema()')
                if cur.fetchone()[0] != schema:
                    raise RuntimeError('search_path not applied - refusing')

            created = updated = 0
            for (report, klass, subclass, type_l4, subtype_l5,
                 code, name, legacy_subtype, bs_cat) in CHART:
                fields = {
                    'name': name,
                    'report_type': report,
                    'account_class': klass,
                    'account_subclass': subclass,
                    'hierarchy_type': type_l4,
                    'account_type': LEGACY_TYPE_BY_CLASS[klass],
                    'account_subtype': legacy_subtype,
                    'balance_sheet_category': bs_cat,
                    'description': subtype_l5,
                    'is_system': True,
                    'is_active': True,
                }
                acct, was_created = ChartOfAccount.objects.get_or_create(
                    code=code, defaults=fields)
                if was_created:
                    created += 1
                else:
                    changed = [k for k, v in fields.items() if getattr(acct, k) != v]
                    if changed:
                        for k in changed:
                            setattr(acct, k, fields[k])
                        acct.save(update_fields=changed + ['updated_at'])
                        updated += 1
            self.stdout.write(self.style.SUCCESS(
                f'[{schema}] chart installed: {created} created, {updated} aligned, '
                f'{len(CHART)} canonical accounts'))
