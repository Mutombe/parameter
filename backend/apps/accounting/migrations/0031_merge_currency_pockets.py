"""Merge per-currency sub-account pockets into ONE pocket per category.

Architectural change (spec: master-structure, currency-as-dimension):
  - Currency stops being part of a sub-account's identity. Each (payer,
    category) becomes a single pocket; currency lives on the transaction and
    in per-currency SubsidiaryBalance rows.
  - Numbering switches to the per-payer-type template:
        Levy   /01 Levy /02 Special Levy /03 Maintenance /04 Parking /05 Rates
        Rental /01 Rent /02 VAT /03 Maintenance /04 Parking /05 Rates /06 Deposit
    (general = /00). Landlords keep the union of both sides.

Steps (atomic per schema):
  1. Stamp each transaction's currency from its (pre-merge single-currency) pocket.
  2. Archive INVALID pockets (a category outside the payer's template, e.g. a
     Rent pocket on a Levy payer from the old void bug) to /9x, is_active=False,
     preserving their transactions for audit (spec §18).
  3. Merge each valid (payer, category) group into one canonical pocket
     (re-point sibling-currency transactions, delete siblings), via a temp
     rename to avoid transient unique collisions, then assign the template code.
  4. Recompute per-currency running balances and populate SubsidiaryBalance.
  5. Backfill any missing template pockets (zero-balance) so every account has
     its complete predefined structure.
  6. Rewrite historical contra_account strings (old pocket code -> new).

Self-contained numbering (frozen here) so later code changes can't break it.
"""
from collections import defaultdict
from decimal import Decimal
from django.db import migrations

# Per-payer-type template numbering (rent/levy share /01; vat/special_levy /02).
_BASE = {'general': 0, 'rent': 1, 'levy': 1, 'vat': 2, 'special_levy': 2,
         'maintenance': 3, 'parking': 4, 'rates': 5, 'deposit': 6}
_RENTAL = ['rent', 'vat', 'maintenance', 'parking', 'rates', 'deposit']
_LEVY = ['levy', 'special_levy', 'maintenance', 'parking', 'rates']
_LANDLORD_UNION = ['general'] + list(dict.fromkeys(_RENTAL + _LEVY))


def _nn(category):
    return f'{_BASE.get(category, 0):02d}'


def _template(account_type):
    return ['general'] + (_LEVY if account_type == 'levy' else _RENTAL)


def forwards(apps, schema_editor):
    RentalTenant = apps.get_model('masterfile', 'RentalTenant')
    Landlord = apps.get_model('masterfile', 'Landlord')
    SubsidiaryAccount = apps.get_model('accounting', 'SubsidiaryAccount')
    SubsidiaryTransaction = apps.get_model('accounting', 'SubsidiaryTransaction')
    SubsidiaryBalance = apps.get_model('accounting', 'SubsidiaryBalance')
    JournalEntry = apps.get_model('accounting', 'JournalEntry')

    RT = RentalTenant._base_manager
    LDm = Landlord._base_manager
    SA = SubsidiaryAccount._base_manager
    ST = SubsidiaryTransaction._base_manager

    tmeta = {t.id: (t.code, t.account_type) for t in RT.all()}
    lcode = {l.id: l.code for l in LDm.all()}

    # ── 1. Stamp currency on every existing transaction from its pocket ──
    for s in SA.all():
        ST.filter(account_id=s.id).update(currency=(s.currency or 'USD'))

    contra_map = {}         # old pocket code -> new pocket code
    archive_counter = defaultdict(int)

    # Group all pockets by (entity, category).
    groups = defaultdict(list)
    for s in SA.all():
        if s.tenant_id:
            key = ('t', s.tenant_id)
        elif s.landlord_id:
            key = ('l', s.landlord_id)
        else:
            key = ('o', s.id)
        groups[(key, s.category)].append(s)

    canonicals = []   # (canonical_account, main_code, category)

    for (key, category), pockets in groups.items():
        kind, eid = key
        if kind == 't':
            main, atype = tmeta.get(eid, (None, 'rental'))
            valid = category in _template(atype)
        elif kind == 'l':
            main = lcode.get(eid)
            valid = category in _LANDLORD_UNION
        else:
            main, valid = None, False

        if main is None:
            continue  # orphan — leave untouched

        pockets.sort(key=lambda p: p.id)

        if not valid:
            # ── 2. Archive invalid pockets (keep history, exclude structure) ──
            for p in pockets:
                archive_counter[main] += 1
                new_code = f'{main}/9{archive_counter[main]}'
                contra_map[p.code] = new_code
                p.code = new_code
                p.is_active = False
                p.save(update_fields=['code', 'is_active'])
            continue

        # ── 3. Merge valid group into the earliest pocket (canonical) ──
        canonical = pockets[0]
        old_codes = [p.code for p in pockets]
        sib_ids = [p.id for p in pockets[1:]]
        for sid in sib_ids:
            # Move both the subsidiary transactions AND the protecting
            # JournalEntry.subsidiary_account FKs onto the canonical pocket.
            ST.filter(account_id=sid).update(account_id=canonical.id)
            JournalEntry.objects.filter(subsidiary_account_id=sid).update(
                subsidiary_account_id=canonical.id)
        if sib_ids:
            SA.filter(id__in=sib_ids).delete()
        # temp-rename canonical to avoid transient unique collisions
        canonical.code = f'__MRG{canonical.id}'
        canonical.save(update_fields=['code'])
        canonicals.append((canonical, main, category, old_codes))

    # ── assign final template codes + recompute per-currency balances ──
    for canonical, main, category, old_codes in canonicals:
        new_code = f'{main}/{_nn(category)}'
        for oc in old_codes:
            contra_map[oc] = new_code
        canonical.code = new_code
        canonical.sub_account_number = _nn(category)
        canonical.currency = 'USD'
        canonical.is_active = True
        canonical.save(update_fields=['code', 'sub_account_number', 'currency', 'is_active'])

        debit_normal = canonical.entity_type in ('tenant', 'account_holder')
        running = defaultdict(lambda: Decimal('0.00'))
        txns = list(ST.filter(account_id=canonical.id).order_by('transaction_number', 'id'))
        to_bal = []
        for t in txns:
            ccy = t.currency or 'USD'
            move = ((t.debit_amount or Decimal('0')) - (t.credit_amount or Decimal('0')))
            running[ccy] += move if debit_normal else -move
            if t.balance != running[ccy]:
                t.balance = running[ccy]
                to_bal.append(t)
        if to_bal:
            ST.bulk_update(to_bal, ['balance'], batch_size=1000)
        for ccy, bal in running.items():
            SubsidiaryBalance.objects.update_or_create(
                account=canonical, currency=ccy, defaults={'balance': bal})
        canonical.current_balance = running.get('USD', Decimal('0.00'))
        canonical.save(update_fields=['current_balance'])

    # ── 5. Backfill missing template pockets (zero-balance) ──
    labels = dict(SubsidiaryAccount._meta.get_field('category').choices or [])
    for eid, (main, atype) in tmeta.items():
        have = set(SA.filter(tenant_id=eid).values_list('category', flat=True))
        entity = 'account_holder' if atype == 'levy' else 'tenant'
        t = RT.filter(id=eid).first()
        for cat in _template(atype):
            if cat not in have:
                SA.create(code=f'{main}/{_nn(cat)}',
                          name=f'{t.name} - {labels.get(cat, cat.title())}',
                          entity_type=entity, tenant_id=eid, category=cat,
                          sub_account_number=_nn(cat))
    for eid, main in lcode.items():
        have = set(SA.filter(landlord_id=eid).values_list('category', flat=True))
        l = LDm.filter(id=eid).first()
        for cat in _LANDLORD_UNION:
            if cat not in have:
                SA.create(code=f'{main}/{_nn(cat)}',
                          name=f'{l.name} - {labels.get(cat, cat.title())}',
                          entity_type='landlord', landlord_id=eid, category=cat,
                          sub_account_number=_nn(cat))

    # ── 6. Rewrite historical contra references ──
    if contra_map:
        affected = list(ST.filter(contra_account__in=list(contra_map.keys())))
        for t in affected:
            t.contra_account = contra_map[t.contra_account]
        if affected:
            ST.bulk_update(affected, ['contra_account'], batch_size=1000)


def backwards(apps, schema_editor):
    raise RuntimeError('0031_merge_currency_pockets is not reversible')


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0030_subsidiarytransaction_currency_subsidiarybalance'),
        ('masterfile', '0019_alter_rentaltenant_account_type'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
