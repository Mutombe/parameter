"""Backfill the global sequential transaction number on existing journals.

Assigns numbers in chronological order (date, then creation order) so the
sequence traces transactions as they actually happened. New journals pick
up from the highest assigned value via Journal.next_transaction_number.
"""
from django.db import migrations


def backfill(apps, schema_editor):
    Journal = apps.get_model('accounting', 'Journal')
    BASE = 100000
    n = BASE
    qs = (Journal.objects
          .filter(transaction_number__isnull=True)
          .order_by('date', 'created_at', 'id'))
    to_update = []
    for j in qs.iterator():
        n += 1
        j.transaction_number = n
        to_update.append(j)
        if len(to_update) >= 500:
            Journal.objects.bulk_update(to_update, ['transaction_number'])
            to_update = []
    if to_update:
        Journal.objects.bulk_update(to_update, ['transaction_number'])


def unset(apps, schema_editor):
    Journal = apps.get_model('accounting', 'Journal')
    Journal.objects.update(transaction_number=None)


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0026_journal_transaction_number'),
    ]

    operations = [
        migrations.RunPython(backfill, unset),
    ]
