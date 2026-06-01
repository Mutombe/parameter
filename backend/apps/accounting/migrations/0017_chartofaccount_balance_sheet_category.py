from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0016_rename_commission_vat_payable'),
    ]

    operations = [
        migrations.AddField(
            model_name='chartofaccount',
            name='balance_sheet_category',
            field=models.CharField(
                blank=True,
                choices=[
                    ('funds_held_in_trust', 'Funds Held in Trust'),
                    ('lessees_arrears', 'Lessees Arrears'),
                    ('prepayments', 'Prepayments'),
                    ('other_current_assets', 'Other Current Assets'),
                    ('funds_owed_by_trust', 'Funds Owed by Trust'),
                    ('lessees_prepayments', 'Lessees Prepayments'),
                    ('accruals', 'Accruals'),
                    ('other_current_liabilities', 'Other Current Liabilities'),
                ],
                default='',
                max_length=40,
            ),
        ),
    ]
