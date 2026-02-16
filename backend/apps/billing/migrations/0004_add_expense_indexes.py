"""Add indexes to Expense model for query performance."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0003_latepenaltyconfig_latepenaltyexclusion_and_more'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='expense',
            index=models.Index(fields=['status'], name='billing_exp_status_idx'),
        ),
        migrations.AddIndex(
            model_name='expense',
            index=models.Index(fields=['date'], name='billing_exp_date_idx'),
        ),
        migrations.AddIndex(
            model_name='expense',
            index=models.Index(fields=['expense_type'], name='billing_exp_type_idx'),
        ),
        migrations.AddIndex(
            model_name='expense',
            index=models.Index(fields=['payee_type', 'payee_id'], name='billing_exp_payee_idx'),
        ),
    ]
