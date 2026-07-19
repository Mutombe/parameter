"""Re-home pre-pocket tenant history into the correct category pockets.

Before tenants/account holders had category pockets, every invoice and
payment posted to ONE legacy sub-account per payer (codes like TN/8, AC/3).
Each of those transactions traces back to its source document, which knows
the real category — a rent receipt belongs in the Rent pocket, a parking
invoice in the Parking pocket. This command resolves each legacy transaction
and MOVES it to the payer's matching pocket:

  receipt          → receipt.sub_account_category → invoice.invoice_type
                     → income_type code → rent
  invoice          → invoice.invoice_type → rent
  opening_balance  → OpeningBalance.category
  reversal rows    → follow the reversed transaction's destination

Transactions that cannot be resolved (manual journals etc.) stay in the
legacy account, which remains visible as "General (history)" while it still
holds anything. current_balance is recomputed for every touched account;
statements and the Balance Sheet already derive from the movements, so
totals are unchanged — history simply lands in the right pockets.

Idempotent (moved rows no longer sit in a legacy account). Usage:
    python manage.py migrate_legacy_pocket_history --schema=freshtest
    python manage.py migrate_legacy_pocket_history --all-tenants [--dry-run]
"""
from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.db.models import Sum
from django_tenants.utils import schema_context, get_tenant_model

CHUNK = 5000


class Command(BaseCommand):
    help = "Move pre-pocket tenant history into the matching category pockets."

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
        from apps.accounting.models import (
            SubsidiaryAccount, SubsidiaryTransaction, OpeningBalance,
        )
        from apps.billing.models import Invoice, Receipt

        # One transaction per schema: pins a single server connection so a
        # transaction-pooling proxy can't drop SET search_path mid-run, and
        # makes the whole migration all-or-nothing.
        with schema_context(schema), transaction.atomic():
            with connection.cursor() as cur:
                cur.execute('SELECT current_schema()')
                current = cur.fetchone()[0]
            if current != schema:
                raise RuntimeError(
                    f'search_path not applied (current_schema={current!r}) — refusing')

            legacy = [a for a in SubsidiaryAccount.objects.filter(tenant__isnull=False)
                      .select_related('tenant') if a.code.count('/') == 1]
            if not legacy:
                self.stdout.write(f'[{schema}] no legacy accounts — nothing to do')
                return
            legacy_by_id = {a.id: a for a in legacy}

            txns = list(
                SubsidiaryTransaction.objects
                .filter(account_id__in=legacy_by_id.keys())
                .select_related('journal_entry')
            )
            if not txns:
                self.stdout.write(f'[{schema}] {len(legacy)} legacy account(s), 0 transactions')
                return

            # Bulk-fetch every source document referenced.
            rcpt_ids = {t.journal_entry.source_id for t in txns
                        if t.journal_entry_id and t.journal_entry.source_type == 'receipt'
                        and t.journal_entry.source_id}
            inv_ids = {t.journal_entry.source_id for t in txns
                       if t.journal_entry_id and t.journal_entry.source_type == 'invoice'
                       and t.journal_entry.source_id}
            ob_ids = {t.journal_entry.source_id for t in txns
                      if t.journal_entry_id and t.journal_entry.source_type == 'opening_balance'
                      and t.journal_entry.source_id}
            receipts = {r.id: r for r in Receipt.objects.filter(id__in=rcpt_ids)
                        .select_related('invoice', 'income_type')}
            invoices = {i.id: i for i in Invoice.objects.filter(id__in=inv_ids)}
            obs = {o.id: o for o in OpeningBalance.objects.filter(id__in=ob_ids)}
            # Reference-prefix fallback for rows without a journal link.
            ref_rcpts = {r.receipt_number: r for r in Receipt.objects.filter(
                receipt_number__in=[t.reference for t in txns if (t.reference or '').startswith('RCT')]
            ).select_related('invoice', 'income_type')}
            ref_invs = {i.invoice_number: i for i in Invoice.objects.filter(
                invoice_number__in=[t.reference for t in txns if (t.reference or '').startswith('INV')]
            )}

            def resolve(txn):
                """→ (category, currency) or None when it must stay put."""
                je = txn.journal_entry
                src_type = je.source_type if je else None
                src_id = je.source_id if je else None
                r = receipts.get(src_id) if src_type == 'receipt' else ref_rcpts.get(txn.reference or '')
                if r:
                    cat = (r.sub_account_category
                           or (r.invoice.invoice_type if r.invoice_id and r.invoice else None)
                           or (r.income_type.code.lower() if r.income_type_id and r.income_type
                               and r.income_type.code else None)
                           or 'rent')
                    return cat, (r.currency or 'USD')
                i = invoices.get(src_id) if src_type == 'invoice' else ref_invs.get(txn.reference or '')
                if i:
                    return (i.invoice_type or 'rent'), (i.currency or 'USD')
                if src_type == 'opening_balance':
                    ob = obs.get(src_id)
                    if ob and ob.category and ob.category != 'general':
                        return ob.category, (getattr(ob, 'currency', None) or 'USD')
                return None

            moves = defaultdict(list)   # target_account_id -> [txn ids]
            destination = {}            # txn id -> target_account_id
            unresolved = 0
            pocket_cache = {}

            def pocket_for(tenant, category, currency):
                key = (tenant.id, category, currency)
                if key not in pocket_cache:
                    pocket_cache[key] = SubsidiaryAccount.get_or_create_for_tenant_category(
                        tenant, category=category, currency=currency)
                return pocket_cache[key]

            # Two passes so reversal rows can follow their original.
            deferred = []
            for t in txns:
                if t.reversed_transaction_id:
                    deferred.append(t)
                    continue
                res = resolve(t)
                if res is None:
                    unresolved += 1
                    continue
                category, currency = res
                if category == 'general':
                    unresolved += 1
                    continue
                target = pocket_for(legacy_by_id[t.account_id].tenant, category, currency)
                if target.id == t.account_id:
                    continue
                moves[target.id].append(t.id)
                destination[t.id] = target.id
            for t in deferred:
                tgt = destination.get(t.reversed_transaction_id)
                if tgt is None:
                    res = resolve(t)
                    if res is None or res[0] == 'general':
                        unresolved += 1
                        continue
                    tgt = pocket_for(legacy_by_id[t.account_id].tenant, res[0], res[1]).id
                if tgt != t.account_id:
                    moves[tgt].append(t.id)

            moved = sum(len(v) for v in moves.values())
            if dry:
                self.stdout.write(
                    f'[{schema}] {len(legacy)} legacy account(s), {len(txns)} txn(s): '
                    f'would move {moved}, leave {unresolved}')
                return

            for target_id, ids in moves.items():
                for start in range(0, len(ids), CHUNK):
                    SubsidiaryTransaction.objects.filter(
                        id__in=ids[start:start + CHUNK]).update(account_id=target_id)

            # Recompute current_balance for every touched account (legacy +
            # pockets). Payers are debit-normal: balance = debits − credits.
            touched = set(legacy_by_id.keys()) | set(moves.keys())
            sums = {row['account_id']: (row['d'] or Decimal('0')) - (row['c'] or Decimal('0'))
                    for row in SubsidiaryTransaction.objects.filter(account_id__in=touched)
                    .values('account_id')
                    .annotate(d=Sum('debit_amount'), c=Sum('credit_amount'))}
            for acct_id in touched:
                SubsidiaryAccount.objects.filter(id=acct_id).update(
                    current_balance=sums.get(acct_id, Decimal('0')))

            self.stdout.write(self.style.SUCCESS(
                f'[{schema}] moved {moved} txn(s) into pockets '
                f'({unresolved} left in the history account); '
                f'{len(touched)} account balance(s) recomputed'))
