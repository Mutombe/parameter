"""Migrate existing accounts to the TN/AH/LD coding standard.

Steps (one atomic migration per schema):
  1. Main codes -> 6 digits. Rental tenants keep their number
     (TN0001 -> TN000001); levy account holders move to a fresh AH sequence
     (AH000001, AH000002, ... in creation order); landlords LL#### -> LD######.
  2. Sub-account codes rebuilt as <NewMainCode>/<NN> from the currency-banded
     category map; sub_account_number populated.
  3. Historical SubsidiaryTransaction.contra_account strings that referenced
     an old sub-account code are rewritten to the new code. Narrative
     descriptions are left untouched (indelible).

Old codes are 4-digit / slash-segmented and can never equal a new 6-digit
code, so a direct bulk update never produces a transient unique collision —
no temp-rename phase is needed. No duplicate (entity, category, currency)
pockets exist (verified); a collision would raise loudly.
"""
from django.db import migrations


def _digits(code):
    return ''.join(c for c in (code or '') if c.isdigit())


def forwards(apps, schema_editor):
    RentalTenant = apps.get_model('masterfile', 'RentalTenant')
    Landlord = apps.get_model('masterfile', 'Landlord')
    SubsidiaryAccount = apps.get_model('accounting', 'SubsidiaryAccount')
    SubsidiaryTransaction = apps.get_model('accounting', 'SubsidiaryTransaction')
    from apps.accounting.account_coding import sub_account_number

    # Use _base_manager throughout so SOFT-DELETED tenants/landlords are
    # migrated too — their pockets and transactions still exist and reference
    # the old codes, so they must be re-coded for consistency.
    RT = RentalTenant._base_manager
    LDm = Landlord._base_manager
    SAm = SubsidiaryAccount._base_manager
    STm = SubsidiaryTransaction._base_manager

    # ── 1. Main codes ──
    tenants = list(RT.all().order_by('id'))
    ah_seq = 0
    tmap = {}
    for t in tenants:
        if t.account_type == 'levy':
            ah_seq += 1
            t.code = f'AH{ah_seq:06d}'
        else:
            d = _digits(t.code)
            t.code = f'TN{(int(d) if d else t.id):06d}'
        tmap[t.id] = t.code
    assert len(set(tmap.values())) == len(tmap), 'tenant code collision'

    landlords = list(LDm.all().order_by('id'))
    lmap = {}
    for l in landlords:
        d = _digits(l.code)
        l.code = f'LD{(int(d) if d else l.id):06d}'
        lmap[l.id] = l.code
    assert len(set(lmap.values())) == len(lmap), 'landlord code collision'

    if tenants:
        RT.bulk_update(tenants, ['code'], batch_size=500)
    if landlords:
        LDm.bulk_update(landlords, ['code'], batch_size=500)

    # ── 2. Sub-account codes ──
    sub_map = {}   # old code -> new code (for the contra rewrite)
    used = set()
    to_update = []
    for s in SAm.all():
        if s.tenant_id:
            main = tmap.get(s.tenant_id)
        elif s.landlord_id:
            main = lmap.get(s.landlord_id)
        else:
            main = None
        if main is None:
            continue  # orphan pocket (no FK) — leave its code untouched
        nn = sub_account_number(s.category or 'general', s.currency or 'USD')
        new_code = f'{main}/{nn}'
        assert new_code not in used, f'sub-account code collision {new_code}'
        used.add(new_code)
        if s.code != new_code:
            sub_map[s.code] = new_code
        s.code = new_code
        s.sub_account_number = nn
        to_update.append(s)
    if to_update:
        SAm.bulk_update(
            to_update, ['code', 'sub_account_number'], batch_size=500)

    # ── 3. Rewrite historical contra_account strings (old sub-code -> new) ──
    if sub_map:
        affected = list(STm.filter(contra_account__in=list(sub_map.keys())))
        for st in affected:
            st.contra_account = sub_map[st.contra_account]
        if affected:
            STm.bulk_update(affected, ['contra_account'], batch_size=1000)


def backwards(apps, schema_editor):
    # One-way data migration — the pre-standard codes aren't reconstructable
    # (account-holder AH sequence and 6-digit padding lose the old strings).
    raise RuntimeError('0029_account_coding_standard is not reversible')


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0028_subsidiaryaccount_sub_account_number_and_more'),
        ('masterfile', '0018_currency_conversions'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
