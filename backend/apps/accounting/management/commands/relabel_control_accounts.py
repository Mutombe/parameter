"""Heal engine control accounts that were seeded under colliding names.

The posting engine books by CODE: 1200 Accounts Receivable, 2300 Landlord
Trust Payable, 1100/1110 Bank. The company-onboarding chart used to seed
different accounts at those same codes (1200 'Prepaid Expenses', 2300
'Accrued Expenses', 1100 'Accounts Receivable - Tenants'), so in schemas
created through onboarding the engine's postings landed in accounts wearing
the wrong names — e.g. tenant arrears reported as "Prepaid Expenses" and
the agent's trust payable to the landlord reported as "Accrued Expenses"
on the landlord's own balance sheet.

Per schema (atomic, search_path-guarded), for each control code:
  * If the account's name/type already match — nothing to do.
  * If EVERY ledger row is engine-sourced (invoice/receipt/expense) or the
    account has no rows, it IS the control account mislabelled — relabel
    in place (name, account_type, account_subtype).
  * Mixed history (manual journals a user aimed at the seeded concept) —
    left alone and reported; nothing is guessed.

When a relabel takes a concept's name away (Prepaid Expenses / Accrued
Expenses), the concept is re-created empty at a free code (1250 / 2350)
so the chart still offers it.

Idempotent; runs on every deploy. Usage:
    python manage.py relabel_control_accounts --schema=clienttest [--dry-run]
    python manage.py relabel_control_accounts --all-tenants
"""
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django_tenants.utils import schema_context, get_tenant_model

ENGINE_SOURCES = {'invoice', 'receipt', 'expense', ''}

# code -> (canonical name, account_type, account_subtype, acceptable)
# `acceptable(acct)` = True when the existing account is functionally fine
# and must be left alone (reports filter cash by subtype bank/cash, skip
# receivables by subtype accounts_receivable, and exclude the trust payable
# from landlord sheets by NAME) — a custom-but-correct name like
# "Bank - USD" is not renamed.
CONTROL_ACCOUNTS = {
    '1100': ('Bank Account', 'asset', 'bank',
             lambda a: a.account_subtype in ('bank', 'cash')),
    '1110': ('Bank Account (ZWG)', 'asset', 'bank',
             lambda a: a.account_subtype in ('bank', 'cash')),
    '1200': ('Accounts Receivable', 'asset', 'accounts_receivable',
             lambda a: a.account_subtype == 'accounts_receivable'),
    '2300': ('Landlord Trust Payable', 'liability', 'accounts_payable',
             lambda a: 'landlord trust' in (a.name or '').lower()),
}

# concept name (lowered substring) -> (free code, name, type, subtype)
DISPLACED_CONCEPTS = {
    'prepaid expenses': ('1250', 'Prepaid Expenses', 'asset', 'prepaid'),
    'accrued expenses': ('2350', 'Accrued Expenses', 'liability', 'accounts_payable'),
}


class Command(BaseCommand):
    help = "Relabel engine control accounts (1100/1110/1200/2300) seeded under colliding names."

    def add_arguments(self, parser):
        parser.add_argument('--schema', type=str)
        parser.add_argument('--all-tenants', action='store_true')
        parser.add_argument('--dry-run', action='store_true')

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
                self._process(schema, options['dry_run'])
            except Exception as e:
                self.stderr.write(f'[{schema}] FAILED: {e}')

    def _process(self, schema, dry):
        from apps.accounting.models import ChartOfAccount, JournalEntry

        with schema_context(schema), transaction.atomic():
            with connection.cursor() as cur:
                cur.execute('SELECT current_schema()')
                if cur.fetchone()[0] != schema:
                    raise RuntimeError('search_path not applied - refusing')

            notes = []
            for code, (name, acc_type, subtype, acceptable) in CONTROL_ACCOUNTS.items():
                acct = ChartOfAccount.objects.filter(code=code).first()
                if acct is None:
                    continue  # engine get_or_create seeds it correctly on first use
                if acceptable(acct):
                    continue

                rows = JournalEntry.objects.filter(account=acct)
                foreign = rows.exclude(source_type__in=ENGINE_SOURCES).count()
                if foreign:
                    notes.append(f'{code} ({acct.name!r}) left alone - '
                                 f'{foreign} non-engine row(s)')
                    continue

                old_name = acct.name
                if not dry:
                    acct.name = name
                    acct.account_type = acc_type
                    acct.account_subtype = subtype
                    acct.save(update_fields=['name', 'account_type',
                                             'account_subtype', 'updated_at'])
                notes.append(f'{code} relabelled {old_name!r} -> {name!r} '
                             f'({rows.count()} engine row(s))')

                # Keep the displaced concept available at a free code.
                displaced = (old_name or '').lower()
                for key, (free_code, c_name, c_type, c_subtype) in DISPLACED_CONCEPTS.items():
                    if key in displaced and not ChartOfAccount.objects.filter(
                            name__iexact=c_name).exclude(code=code).exists():
                        if not ChartOfAccount.objects.filter(code=free_code).exists():
                            if not dry:
                                ChartOfAccount.objects.create(
                                    code=free_code, name=c_name,
                                    account_type=c_type, account_subtype=c_subtype)
                            notes.append(f'created {free_code} {c_name!r}')

            verb = 'would apply' if dry else 'applied'
            self.stdout.write(self.style.SUCCESS(
                f'[{schema}] {verb}: ' + ('; '.join(notes) if notes else 'nothing - already correct')))
