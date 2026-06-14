"""Post invoices stuck in DRAFT so their charges reach the GL and the
tenant sub-ledger.

Invoices are meant to auto-post the moment they're created (InvoiceViewSet
.perform_create → Invoice.post_to_ledger), recognising the debt as a DEBIT
on the tenant's subsidiary account. If that auto-post ever fails (a
transient error at creation time), the invoice is kept as DRAFT and the
charge is never recognised — leaving the tenant account with payments
(credits) but no charges (debits). On the Balance Sheet that makes paying
tenants look like they're in *prepayment* and never-paid tenants invisible
under *arrears*.

This command re-posts those stuck drafts. It is idempotent: an invoice
that already has a journal is skipped, and post_to_ledger only fires for
DRAFT invoices.

Usage:
    python manage.py post_draft_invoices --schema=freshtest
    python manage.py post_draft_invoices --schema=freshtest --dry-run
    python manage.py post_draft_invoices --all-tenants        # every tenant schema
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction
from django_tenants.utils import schema_context, get_tenant_model


class Command(BaseCommand):
    help = 'Post invoices stuck in DRAFT (failed auto-post) to the GL + sub-ledger.'

    def add_arguments(self, parser):
        parser.add_argument('--schema', type=str, help='Tenant schema to process')
        parser.add_argument('--all-tenants', action='store_true',
                            help='Process every tenant schema (excludes public)')
        parser.add_argument('--dry-run', action='store_true',
                            help='List what would be posted without writing')

    def handle(self, *args, **options):
        dry = options['dry_run']
        if options['all_tenants']:
            TenantModel = get_tenant_model()
            schemas = list(
                TenantModel.objects.exclude(schema_name='public')
                .values_list('schema_name', flat=True)
            )
        elif options['schema']:
            schemas = [options['schema']]
        else:
            self.stderr.write('Provide --schema=<name> or --all-tenants')
            return

        for schema in schemas:
            self._process(schema, dry)

    def _process(self, schema, dry):
        from apps.billing.models import Invoice
        User = get_user_model()
        with schema_context(schema):
            drafts = list(Invoice.objects.filter(status='draft', journal__isnull=True))
            self.stdout.write(f'\n[{schema}] {len(drafts)} draft invoice(s) to post')
            if not drafts:
                return
            user = (User.objects.filter(is_superuser=True).first()
                    or User.objects.first())
            posted = failed = 0
            for inv in drafts:
                label = f'  {inv.invoice_number} {inv.date} {inv.tenant.name} {inv.total_amount}'
                if dry:
                    self.stdout.write(f'{label} -> would post')
                    continue
                try:
                    with transaction.atomic():
                        inv.post_to_ledger(user)
                    posted += 1
                    self.stdout.write(f'{label} -> posted')
                except Exception as e:  # noqa: BLE001
                    failed += 1
                    self.stderr.write(f'{label} -> FAILED: {e}')
            if not dry:
                self.stdout.write(self.style.SUCCESS(
                    f'[{schema}] posted={posted} failed={failed}'))
