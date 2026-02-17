"""Add performance indexes for receipt and invoice queries at scale."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0004_add_expense_indexes'),
    ]

    operations = [
        # Receipt — payment method and currency used in summary reports
        migrations.AddIndex(
            model_name='receipt',
            index=models.Index(fields=['payment_method'], name='billing_rct_method_idx'),
        ),
        migrations.AddIndex(
            model_name='receipt',
            index=models.Index(fields=['currency'], name='billing_rct_currency_idx'),
        ),
        # Invoice — currency for multi-currency filtering
        migrations.AddIndex(
            model_name='invoice',
            index=models.Index(fields=['currency'], name='billing_inv_currency_idx'),
        ),
        # Invoice — status alone for dashboard aggregations
        migrations.AddIndex(
            model_name='invoice',
            index=models.Index(fields=['status'], name='billing_inv_status_idx'),
        ),
    ]
