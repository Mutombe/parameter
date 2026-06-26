"""Correct ChartOfAccount.account_type to match the account's code category
(Account categories spec).

Some accounts were seeded with the wrong account_type for their code — most
importantly Fixed Assets (3000/xxx) and loans (6100/7000) created as
'expense'. That makes capital/balance-sheet expenditures land on the Income
Statement. This command flips the account_type to the one implied by the
code, using the SAME one-directional rule as derive_account_category: only
expense-typed accounts whose code sits in a non-expense reserved range are
changed. Liabilities/assets already at non-reserved codes (Unpaid Rent
2200, Cash 1000, etc.) are left untouched.

Idempotent. Usage:
    python manage.py fix_account_types_by_code --schema=freshtest
    python manage.py fix_account_types_by_code --all-tenants
    python manage.py fix_account_types_by_code --schema=freshtest --dry-run
"""
from django.core.management.base import BaseCommand
from django_tenants.utils import schema_context, get_tenant_model

CATEGORY_TO_TYPE = {
    'fixed_asset': 'asset',
    'current_asset': 'asset',
    'current_liability': 'liability',
    'short_term_liability': 'liability',
    'long_term_liability': 'liability',
    'other_liability': 'liability',
    'equity': 'equity',
    'revenue': 'revenue',
    'expense': 'expense',
}


class Command(BaseCommand):
    help = "Fix ChartOfAccount.account_type to match the account's code category."

    def add_arguments(self, parser):
        parser.add_argument('--schema', type=str)
        parser.add_argument('--all-tenants', action='store_true')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        if options['all_tenants']:
            TenantModel = get_tenant_model()
            schemas = list(TenantModel.objects.exclude(schema_name='public')
                           .values_list('schema_name', flat=True))
        elif options['schema']:
            schemas = [options['schema']]
        else:
            self.stderr.write('Provide --schema=<name> or --all-tenants')
            return
        for schema in schemas:
            self._process(schema, options['dry_run'])

    def _process(self, schema, dry):
        from apps.accounting.models import ChartOfAccount, derive_account_category
        with schema_context(schema):
            changed = 0
            for a in ChartOfAccount.objects.all():
                cat = derive_account_category(a.code, a.account_type)
                target = CATEGORY_TO_TYPE.get(cat)
                if not target or target == a.account_type:
                    continue
                line = f'  {a.code} {a.name}: {a.account_type} -> {target}'
                changed += 1
                if dry:
                    self.stdout.write(f'{line} (would change)')
                    continue
                a.account_type = target
                # Give flipped fixed assets a sensible subtype.
                if cat == 'fixed_asset':
                    a.account_subtype = 'fixed_asset'
                a.save(update_fields=['account_type', 'account_subtype', 'updated_at'])
                self.stdout.write(line)
            self.stdout.write(self.style.SUCCESS(
                f'[{schema}] {changed} account type(s) {"to change" if dry else "corrected"}'))
