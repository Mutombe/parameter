"""Relocate the legacy Unpaid Rent (Deferred Revenue) account at code 2200
into the Unpaid account range 6000/010-6000/070.

Historically every invoice credited (and every receipt debited) a single
account at code 2200 regardless of billing category. The chart of accounts
lays deferred revenue out as one Unpaid account per category:

    6000/010 Unpaid Rent          6000/050 Unpaid Maintenance
    6000/020 Unpaid Levy          6000/060 Unpaid Rates
    6000/030 Unpaid Parking       6000/070 Unpaid VAT
    6000/040 Unpaid Special Levy

This command moves every ledger row off 2200 into the account matching the
row's source category — an old levy invoice's credit lands in Unpaid Levy,
exactly where the posting engine now puts new ones:

  * source_type='invoice' -> the invoice's invoice_type
  * source_type='receipt' -> receipt.sub_account_category, else the linked
    invoice's invoice_type, else rent (same category-lock resolution the
    posting engine uses)
  * anything else (manual journals, opening balances) -> Unpaid Rent
    6000/010 when the 2200 account is named like Unpaid Rent / Deferred
    Revenue; left in place otherwise (custom account, not ours to move)

Balances (current_balance) are then recomputed from the moved rows for 2200
and every 6000/0X0 account, and 2200 is deactivated once empty. Note the
GeneralLedger.balance running-balance snapshots are not rewritten — the
account statement endpoint recomputes running balances from the rows.

Idempotent; runs on every deploy. Usage:
    python manage.py relocate_unpaid_accounts --schema=freshtest [--dry-run]
    python manage.py relocate_unpaid_accounts --all-tenants
"""
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django_tenants.utils import schema_context, get_tenant_model


class Command(BaseCommand):
    help = "Move ledger history from legacy 2200 into the Unpaid 6000/010-070 range."

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
        from apps.accounting.models import ChartOfAccount, JournalEntry, GeneralLedger
        from apps.billing.models import Invoice, Receipt, UNPAID_ACCOUNT_MAP

        with schema_context(schema), transaction.atomic():
            with connection.cursor() as cur:
                cur.execute('SELECT current_schema()')
                if cur.fetchone()[0] != schema:
                    raise RuntimeError('search_path not applied - refusing')

            # Destination accounts, keyed by category.
            dest = {}
            for category, (code, name) in UNPAID_ACCOUNT_MAP.items():
                dest[category], _ = ChartOfAccount.objects.get_or_create(
                    code=code,
                    defaults={'name': name, 'account_type': 'liability',
                              'account_subtype': 'tenant_deposits',
                              'is_system': True},
                )

            src = ChartOfAccount.objects.filter(code='2200').first()
            if src is None:
                self.stdout.write(f'[{schema}] no 2200 account — nothing to relocate')
                return
            src_is_ours = any(k in (src.name or '').lower()
                              for k in ('unpaid', 'deferred'))

            rows = list(JournalEntry.objects.filter(account=src)
                        .values_list('id', 'source_type', 'source_id'))

            # Resolve each row's category with the engine's own fallback chain.
            inv_ids = {sid for (_, st, sid) in rows if st == 'invoice' and sid}
            rec_ids = {sid for (_, st, sid) in rows if st == 'receipt' and sid}
            inv_type = dict(Invoice.all_objects.filter(id__in=inv_ids)
                            .values_list('id', 'invoice_type')) if inv_ids else {}
            rec_type = {}
            if rec_ids:
                for rid, sub_cat, linked in (Receipt.all_objects
                                             .filter(id__in=rec_ids)
                                             .values_list('id', 'sub_account_category',
                                                          'invoice__invoice_type')):
                    rec_type[rid] = sub_cat or linked or 'rent'

            move = defaultdict(list)   # category -> [journal_entry ids]
            left = 0
            for je_id, st, sid in rows:
                if st == 'invoice' and sid in inv_type:
                    cat = inv_type[sid]
                elif st == 'receipt' and sid in rec_type:
                    cat = rec_type[sid]
                elif src_is_ours:
                    cat = 'rent'   # manual/opening rows on our Unpaid Rent account
                else:
                    left += 1      # custom 2200 account — leave foreign rows alone
                    continue
                if cat not in dest:
                    cat = 'rent'   # deposit/penalty/utility/other -> Unpaid Rent
                move[cat].append(je_id)

            moved = 0
            for cat, je_ids in move.items():
                if not dry:
                    JournalEntry.objects.filter(id__in=je_ids).update(account=dest[cat])
                    GeneralLedger.objects.filter(journal_entry_id__in=je_ids).update(
                        account=dest[cat])
                moved += len(je_ids)

            # Recompute current_balance for every touched account from its
            # (post-move) journal entries, using the account's normal side.
            if not dry:
                from django.db.models import Sum
                for account in [src] + list(dest.values()):
                    totals = JournalEntry.objects.filter(
                        account=account, journal__status='posted',
                    ).aggregate(dr=Sum('debit_amount'), cr=Sum('credit_amount'))
                    dr = totals['dr'] or 0
                    cr = totals['cr'] or 0
                    account.current_balance = (
                        cr - dr if account.normal_balance == 'credit' else dr - cr)
                    account.save(update_fields=['current_balance', 'updated_at'])

                if src_is_ours and not JournalEntry.objects.filter(account=src).exists():
                    if src.is_active:
                        src.is_active = False
                        src.save(update_fields=['is_active', 'updated_at'])

            verb = 'would move' if dry else 'moved'
            detail = ', '.join(f'{cat}:{len(ids)}' for cat, ids in sorted(move.items()))
            self.stdout.write(self.style.SUCCESS(
                f'[{schema}] {verb} {moved} row(s) off 2200 ({src.name!r})'
                + (f' [{detail}]' if detail else '')
                + (f'; left {left} foreign row(s)' if left else '')
                + ('' if src_is_ours else ' -- 2200 kept active (custom account)')))
