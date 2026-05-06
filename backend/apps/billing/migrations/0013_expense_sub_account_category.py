# Generated for explicit landlord sub-account selection on expenses.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0012_expense_expense_kind'),
    ]

    operations = [
        migrations.AddField(
            model_name='expense',
            name='sub_account_category',
            field=models.CharField(
                blank=True,
                choices=[
                    ('rent', 'Rent'),
                    ('levy', 'Levy'),
                    ('special_levy', 'Special Levy'),
                    ('maintenance', 'Maintenance'),
                    ('parking', 'Parking'),
                    ('rates', 'Rates'),
                    ('vat', 'VAT'),
                    ('deposit', 'Deposit'),
                    ('general', 'General'),
                ],
                default='',
                help_text="Which of the landlord's trust pockets to deduct from",
                max_length=20,
            ),
        ),
    ]
