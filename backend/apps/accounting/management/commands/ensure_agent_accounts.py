"""Ensure every tenant schema has a clearly-labelled Agent Commission account
and VAT Payable (Commission) account — the two accounts credited on every
commission-charging receipt. The Managing Agent must be able to see them in
plain sight with their balances.

Heals two observed data problems:
  • Code 4100 occupied by an account named e.g. "Rental Income (USD)" while
    ALL of its ledger rows are commission credits (the get_or_create in the
    posting engine landed commissions there). When every row is verifiably a
    commission entry (or there are none), the account is relabelled in place
    to "Agent Commission" (revenue/commission_income). If the history is
    mixed, a separate "Agent Commission" account is created at a free code
    and future postings go there instead.
  • Account 2110 still named "Commission Payable (Commission)" — it holds
    VAT on commission and is renamed "VAT Payable (Commission)".

Idempotent; runs on every deploy. Usage:
    python manage.py ensure_agent_accounts --schema=freshtest [--dry-run]
    python manage.py ensure_agent_accounts --all-tenants
"""
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django_tenants.utils import schema_context, get_tenant_model


class Command(BaseCommand):
    help = "Ensure Agent Commission + VAT Payable (Commission) accounts exist and are correctly labelled."

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
        from apps.accounting.models import ChartOfAccount, GeneralLedger
        with schema_context(schema), transaction.atomic():
            with connection.cursor() as cur:
                cur.execute('SELECT current_schema()')
                if cur.fetchone()[0] != schema:
                    raise RuntimeError('search_path not applied — refusing')

            notes = []

            # ---- Agent Commission ------------------------------------------
            comm = (ChartOfAccount.objects
                    .filter(account_subtype='commission_income').order_by('id').first())
            if comm:
                if 'commission' not in (comm.name or '').lower():
                    pass  # custom name, leave it
                elif comm.name != 'Agent Commission':
                    if not dry:
                        comm.name = 'Agent Commission'
                        comm.save(update_fields=['name', 'updated_at'])
                    notes.append(f'renamed {comm.code} -> "Agent Commission"')
            else:
                a4100 = ChartOfAccount.objects.filter(code='4100').first()
                if a4100 is None:
                    if not dry:
                        ChartOfAccount.objects.create(
                            code='4100', name='Agent Commission', account_type='revenue',
                            account_subtype='commission_income', is_system=True)
                    notes.append('created 4100 "Agent Commission"')
                else:
                    rows = GeneralLedger.objects.filter(account=a4100)
                    non_comm = rows.exclude(description__icontains='commission').count()
                    if non_comm == 0:
                        # Every ledger row is a commission entry (or none exist)
                        # — the account IS the commission account, mislabelled.
                        if not dry:
                            a4100.name = 'Agent Commission'
                            a4100.account_type = 'revenue'
                            a4100.account_subtype = 'commission_income'
                            a4100.save(update_fields=['name', 'account_type',
                                                      'account_subtype', 'updated_at'])
                        notes.append(
                            f'relabelled 4100 (was {a4100.name!r}, all '
                            f'{rows.count()} rows are commission) -> "Agent Commission"')
                    else:
                        # Mixed history — leave it, create a dedicated account
                        # at the first free code so future postings separate.
                        for candidate in ('4105', '4110', '4150'):
                            if not ChartOfAccount.objects.filter(code=candidate).exists():
                                if not dry:
                                    ChartOfAccount.objects.create(
                                        code=candidate, name='Agent Commission',
                                        account_type='revenue',
                                        account_subtype='commission_income', is_system=True)
                                notes.append(f'created {candidate} "Agent Commission" '
                                             f'(4100 has {non_comm} non-commission rows)')
                                break

            # ---- VAT Payable (Commission) ----------------------------------
            vat = ChartOfAccount.objects.filter(code='2110').first()
            if vat is None:
                if not dry:
                    ChartOfAccount.objects.create(
                        code='2110', name='VAT Payable (Commission)',
                        account_type='liability', account_subtype='vat_payable',
                        is_system=True)
                notes.append('created 2110 "VAT Payable (Commission)"')
            elif vat.name != 'VAT Payable (Commission)':
                if not dry:
                    vat.name = 'VAT Payable (Commission)'
                    vat.account_subtype = 'vat_payable'
                    vat.save(update_fields=['name', 'account_subtype', 'updated_at'])
                notes.append(f'renamed 2110 (was {vat.name!r}) -> "VAT Payable (Commission)"')

            verb = 'would apply' if dry else 'applied'
            self.stdout.write(self.style.SUCCESS(
                f'[{schema}] {verb}: ' + ('; '.join(notes) if notes else 'nothing — already correct')))
