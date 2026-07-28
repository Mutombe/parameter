"""Verify the pocket-first control-account guarantee.

The system maintains two GL control accounts automatically:

    1300 Accounts Receivable    = SUM of all tenant / account-holder pockets
    2600 Landlord Trust Payable = SUM of all landlord pockets

This command recomputes both sides from raw ledger rows and reports any
drift, per schema. Read-only. Usage:
    python manage.py verify_control_accounts --schema=<name> | --all-tenants
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.db.models import Sum
from django_tenants.utils import schema_context, get_tenant_model


class Command(BaseCommand):
    help = "Check that control accounts equal the sum of their pockets."

    def add_arguments(self, parser):
        parser.add_argument('--schema', type=str)
        parser.add_argument('--all-tenants', action='store_true')
        parser.add_argument('--fix', action='store_true',
                            help='Post a Suspense (9000) adjustment journal aligning '
                                 'each drifted control to its pocket total (one-time '
                                 'true-up for pre-pocket-first history).')

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
                self._process(schema, fix=options['fix'])
            except Exception as e:
                self.stderr.write(f'[{schema}] FAILED: {e}')

    def _gl_balance(self, GeneralLedger, code, credit_normal):
        t = GeneralLedger.objects.filter(account__code=code).aggregate(
            dr=Sum('debit_amount'), cr=Sum('credit_amount'))
        dr, cr = t['dr'] or Decimal('0'), t['cr'] or Decimal('0')
        return (cr - dr) if credit_normal else (dr - cr)

    def _pocket_total(self, SubsidiaryTransaction, entity_types, debit_normal):
        t = SubsidiaryTransaction.objects.filter(
            account__entity_type__in=entity_types, is_consolidated=False,
        ).aggregate(dr=Sum('debit_amount'), cr=Sum('credit_amount'))
        dr, cr = t['dr'] or Decimal('0'), t['cr'] or Decimal('0')
        return (dr - cr) if debit_normal else (cr - dr)

    def _true_up(self, code, name, acc_type, subtype, credit_normal, delta, user_note):
        """Post `delta` (pockets - gl, in the account's normal direction)
        to the control against 9000 Suspense so control == pockets."""
        from django.utils import timezone
        from apps.accounting.models import ChartOfAccount, Journal, JournalEntry
        control, _ = ChartOfAccount.objects.get_or_create(
            code=code, defaults={'name': name, 'account_type': acc_type,
                                 'account_subtype': subtype, 'is_system': True})
        suspense, _ = ChartOfAccount.objects.get_or_create(
            code='9000', defaults={'name': 'Opening Balances / Suspense',
                                   'account_type': 'equity',
                                   'account_subtype': 'retained_earnings',
                                   'is_system': True})
        journal = Journal.objects.create(
            journal_type=Journal.JournalType.GENERAL,
            date=timezone.now().date(),
            description=f'Control true-up: align {code} {name} to pocket total ({user_note})',
            reference=f'CTRLFIX-{code}',
        )
        inc = delta > 0  # increase control in its normal direction
        amt = abs(delta)
        if credit_normal:
            JournalEntry.objects.create(journal=journal, account=control,
                                        description=journal.description,
                                        credit_amount=amt if inc else None,
                                        debit_amount=None if inc else amt)
            JournalEntry.objects.create(journal=journal, account=suspense,
                                        description=journal.description,
                                        debit_amount=amt if inc else None,
                                        credit_amount=None if inc else amt)
        else:
            JournalEntry.objects.create(journal=journal, account=control,
                                        description=journal.description,
                                        debit_amount=amt if inc else None,
                                        credit_amount=None if inc else amt)
            JournalEntry.objects.create(journal=journal, account=suspense,
                                        description=journal.description,
                                        credit_amount=amt if inc else None,
                                        debit_amount=None if inc else amt)
        journal.post()
        return journal.journal_number

    def _process(self, schema, fix=False):
        from apps.accounting.models import GeneralLedger, SubsidiaryTransaction
        with schema_context(schema), transaction.atomic():
            with connection.cursor() as cur:
                cur.execute('SELECT current_schema()')
                if cur.fetchone()[0] != schema:
                    raise RuntimeError('search_path not applied - refusing')

            ar_gl = self._gl_balance(GeneralLedger, '1300', credit_normal=False)
            ar_pockets = self._pocket_total(
                SubsidiaryTransaction, ['tenant', 'account_holder'], debit_normal=True)
            trust_gl = self._gl_balance(GeneralLedger, '2600', credit_normal=True)
            trust_pockets = self._pocket_total(
                SubsidiaryTransaction, ['landlord'], debit_normal=False)

            ar_ok = ar_gl == ar_pockets
            tr_ok = trust_gl == trust_pockets
            style = self.style.SUCCESS if (ar_ok and tr_ok) else self.style.ERROR
            self.stdout.write(style(
                f'[{schema}] AR 1300 gl={ar_gl} pockets={ar_pockets} '
                f'{"OK" if ar_ok else "DRIFT " + str(ar_gl - ar_pockets)} | '
                f'Trust 2600 gl={trust_gl} pockets={trust_pockets} '
                f'{"OK" if tr_ok else "DRIFT " + str(trust_gl - trust_pockets)}'))

            if fix and not ar_ok:
                jn = self._true_up('1300', 'Accounts Receivable', 'asset',
                                   'accounts_receivable', False,
                                   ar_pockets - ar_gl, 'pre-pocket-first history')
                self.stdout.write(self.style.WARNING(f'  fixed AR via {jn}'))
            if fix and not tr_ok:
                jn = self._true_up('2600', 'Landlord Trust Payable', 'liability',
                                   'accounts_payable', True,
                                   trust_pockets - trust_gl, 'pre-pocket-first history')
                self.stdout.write(self.style.WARNING(f'  fixed Trust via {jn}'))
