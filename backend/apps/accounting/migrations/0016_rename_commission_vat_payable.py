"""Rename ChartOfAccount 2110 from 'VAT Payable (Commission)' to
'Commission Payable (Commission)'.

The agency's only VAT exposure is on its commission revenue. Calling
the liability "VAT Payable" was opaque — the rename makes every
financial report (Trial Balance, Income Statement, Balance Sheet,
Cash Flow) self-explanatory about what the line represents.

Idempotent: skips rows that already carry the new name, so safe to
re-run if a tenant schema was patched out-of-band via fix_schemas.
"""
from django.db import migrations


def rename_vat_payable_commission(apps, schema_editor):
    ChartOfAccount = apps.get_model('accounting', 'ChartOfAccount')
    ChartOfAccount.objects.filter(
        code='2110',
        name='VAT Payable (Commission)',
    ).update(name='Commission Payable (Commission)')


def revert_rename(apps, schema_editor):
    ChartOfAccount = apps.get_model('accounting', 'ChartOfAccount')
    ChartOfAccount.objects.filter(
        code='2110',
        name='Commission Payable (Commission)',
    ).update(name='VAT Payable (Commission)')


class Migration(migrations.Migration):
    dependencies = [
        ('accounting', '0015_add_opening_balance_supplier'),
    ]

    operations = [
        migrations.RunPython(
            rename_vat_payable_commission,
            revert_rename,
        ),
    ]
