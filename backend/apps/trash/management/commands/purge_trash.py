"""
Management command to permanently delete items that have been in trash
longer than the retention period (default 30 days).

Run daily via cron:  python manage.py purge_trash
"""
from datetime import timedelta
from django.apps import apps
from django.core.management.base import BaseCommand
from django.utils import timezone
from django_tenants.utils import get_tenant_model, tenant_context


TRASHABLE_MODELS = {
    'landlord':  ('masterfile', 'Landlord'),
    'property':  ('masterfile', 'Property'),
    'unit':      ('masterfile', 'Unit'),
    'tenant':    ('masterfile', 'RentalTenant'),
    'lease':     ('masterfile', 'LeaseAgreement'),
    'invoice':   ('billing', 'Invoice'),
    'receipt':   ('billing', 'Receipt'),
    'expense':   ('billing', 'Expense'),
}


class Command(BaseCommand):
    help = 'Permanently delete soft-deleted items older than N days (default 30).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days', type=int, default=30,
            help='Delete items trashed more than this many days ago (default 30).',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Report what would be deleted without actually deleting.',
        )

    def handle(self, *args, **options):
        days = options['days']
        dry_run = options['dry_run']
        cutoff = timezone.now() - timedelta(days=days)

        TenantModel = get_tenant_model()
        tenants = TenantModel.objects.exclude(schema_name='public')

        total_deleted = 0

        for tenant in tenants:
            with tenant_context(tenant):
                for type_key, (app_label, model_name) in TRASHABLE_MODELS.items():
                    Model = apps.get_model(app_label, model_name)
                    qs = Model.deleted_objects.filter(deleted_at__lt=cutoff)
                    count = qs.count()

                    if count > 0:
                        if dry_run:
                            self.stdout.write(
                                f'  [DRY RUN] {tenant.schema_name}: '
                                f'Would delete {count} {model_name}(s)'
                            )
                        else:
                            qs.delete()
                            self.stdout.write(
                                f'  {tenant.schema_name}: '
                                f'Deleted {count} {model_name}(s)'
                            )
                        total_deleted += count

        action = 'Would delete' if dry_run else 'Deleted'
        self.stdout.write(self.style.SUCCESS(
            f'{action} {total_deleted} total items older than {days} days.'
        ))
