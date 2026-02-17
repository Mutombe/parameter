"""Add performance indexes for high-traffic queries at scale."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0004_journalentry_accounting__source__3d844c_idx'),
    ]

    operations = [
        # Journal indexes — frequently filtered by status and type
        migrations.AddIndex(
            model_name='journal',
            index=models.Index(fields=['status', 'date'], name='accounting_jrn_status_date_idx'),
        ),
        migrations.AddIndex(
            model_name='journal',
            index=models.Index(fields=['journal_type'], name='accounting_jrn_type_idx'),
        ),
        # ChartOfAccount — filtered by account_type in every report
        migrations.AddIndex(
            model_name='chartofaccount',
            index=models.Index(fields=['account_type'], name='accounting_coa_type_idx'),
        ),
        migrations.AddIndex(
            model_name='chartofaccount',
            index=models.Index(fields=['account_type', 'is_active'], name='accounting_coa_type_active_idx'),
        ),
        # BankTransaction — reconciliation queries filter by status + date
        migrations.AddIndex(
            model_name='banktransaction',
            index=models.Index(fields=['status', 'transaction_date'], name='accounting_btx_status_date_idx'),
        ),
    ]
