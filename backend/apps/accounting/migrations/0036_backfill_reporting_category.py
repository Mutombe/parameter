"""Backfill reporting_category on existing GeneralLedger + JournalEntry rows.

Category rides on the ledger going forward (populated at post time), but
historical rows predate the field. This migration reconstructs the category for
existing rows, set-based and grouped by category so it stays a handful of
UPDATEs rather than a row-by-row scan:

  1. By GL account code — the revenue (50XX) and Unpaid/deferred (25XX) accounts
     encode the category at post time.
  2. By subsidiary pocket — any line touching a tenant/landlord pocket inherits
     that pocket's category (also reaches the control-account GL mirror).
  3. By source model — Opening Balance and Account Transfer (BS movement) rows
     carry their own category, grouped into one UPDATE per category.

Anything still blank is genuinely uncategorised GL activity and only ever shows
under "All Categories".
"""
from django.db import migrations

CATEGORIES = ['rent', 'levy', 'special_levy', 'maintenance', 'parking', 'rates', 'vat', 'deposit']

# GL account code -> reporting category (income 50XX + unpaid/deferred 25XX).
CODE_CATEGORY = {
    '5000': 'rent', '5010': 'levy', '5020': 'special_levy', '5030': 'maintenance',
    '5040': 'rates', '5050': 'parking', '5060': 'vat', '5070': 'deposit',
    '2500': 'rent', '2510': 'levy', '2520': 'special_levy', '2530': 'maintenance',
    '2540': 'parking', '2550': 'rates', '2560': 'vat', '2570': 'deposit',
}


def backfill(apps, schema_editor):
    GeneralLedger = apps.get_model('accounting', 'GeneralLedger')
    JournalEntry = apps.get_model('accounting', 'JournalEntry')
    OpeningBalance = apps.get_model('accounting', 'OpeningBalance')
    BalanceSheetMovement = apps.get_model('accounting', 'BalanceSheetMovement')

    # 1. By account code.
    for code, cat in CODE_CATEGORY.items():
        GeneralLedger.objects.filter(account__code=code, reporting_category='').update(reporting_category=cat)
        JournalEntry.objects.filter(account__code=code, reporting_category='').update(reporting_category=cat)

    # 2. By subsidiary pocket (one UPDATE per category).
    for cat in CATEGORIES:
        JournalEntry.objects.filter(
            subsidiary_account__category=cat, reporting_category=''
        ).update(reporting_category=cat)
        GeneralLedger.objects.filter(
            journal_entry__subsidiary_account__category=cat, reporting_category=''
        ).update(reporting_category=cat)

    # 3. By source model — Opening Balance + Account Transfer, grouped.
    for cat in CATEGORIES:
        ob_ids = list(OpeningBalance.objects.filter(category=cat).values_list('id', flat=True))
        if ob_ids:
            JournalEntry.objects.filter(
                source_type='opening_balance', source_id__in=ob_ids, reporting_category=''
            ).update(reporting_category=cat)
            GeneralLedger.objects.filter(
                journal_entry__source_type='opening_balance',
                journal_entry__source_id__in=ob_ids, reporting_category=''
            ).update(reporting_category=cat)

        bs_ids = list(BalanceSheetMovement.objects.filter(category=cat).values_list('id', flat=True))
        if bs_ids:
            JournalEntry.objects.filter(
                source_type='bs_movement', source_id__in=bs_ids, reporting_category=''
            ).update(reporting_category=cat)
            GeneralLedger.objects.filter(
                journal_entry__source_type='bs_movement',
                journal_entry__source_id__in=bs_ids, reporting_category=''
            ).update(reporting_category=cat)


def noop(apps, schema_editor):
    # Reversing just clears the backfilled values.
    GeneralLedger = apps.get_model('accounting', 'GeneralLedger')
    JournalEntry = apps.get_model('accounting', 'JournalEntry')
    GeneralLedger.objects.update(reporting_category='')
    JournalEntry.objects.update(reporting_category='')


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0035_generalledger_reporting_category_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
