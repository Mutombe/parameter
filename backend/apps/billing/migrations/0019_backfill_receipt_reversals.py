"""Backfill void/reversal flags on existing receipts.

Marks historical reversal receipts (negative "Mispost reversed-" entries)
as is_reversal, links each to its original, and marks that original as
is_reversed — so the "void once" rule also protects receipts voided before
this field existed (they can't be voided a second time).
"""
from django.db import migrations


def backfill(apps, schema_editor):
    Receipt = apps.get_model('billing', 'Receipt')
    reversals = Receipt.objects.filter(
        description__startswith='Mispost reversed-', amount__lt=0,
    ).order_by('date', 'id')
    for rev in reversals:
        # The matching original: same payer + currency, equal-but-positive
        # amount, not itself a reversal, not already matched, dated on/before
        # the reversal. Take the most recent such candidate.
        orig = (Receipt.objects
                .filter(tenant_id=rev.tenant_id, currency=rev.currency,
                        amount=-rev.amount, is_reversal=False,
                        is_reversed=False, date__lte=rev.date)
                .exclude(id=rev.id)
                .order_by('-date', '-id')
                .first())
        rev.is_reversal = True
        if orig is not None:
            rev.reversal_of = orig
            orig.is_reversed = True
            orig.reversed_at = rev.date
            orig.save(update_fields=['is_reversed', 'reversed_at'])
        rev.save(update_fields=['is_reversal', 'reversal_of'])


def unset(apps, schema_editor):
    Receipt = apps.get_model('billing', 'Receipt')
    Receipt.objects.update(is_reversal=False, is_reversed=False,
                           reversal_of=None, reversed_at=None)


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0018_receipt_is_reversal_receipt_is_reversed_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill, unset),
    ]
