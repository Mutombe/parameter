"""Reverse ledger postings left behind by soft-deleted expenses.

Historically, soft-deleting a posted Expense did NOT reverse the GL journal
or the landlord sub-account transaction it created, leaving phantom balances
(a "mystery" expenditure on a landlord's statement). This command finds those
soft-deleted-but-still-posted expenses and reverses their postings via
Expense.reverse_postings(). Idempotent — already-reversed journals are skipped.

Usage:
    python manage.py reverse_deleted_expense_postings --schema=freshtest
    python manage.py reverse_deleted_expense_postings --all-tenants
    python manage.py reverse_deleted_expense_postings --schema=freshtest --dry-run
"""
from django.core.management.base import BaseCommand
from django_tenants.utils import schema_context, get_tenant_model


class Command(BaseCommand):
    help = "Reverse ledger postings of soft-deleted expenses (phantom balances)."

    def add_arguments(self, parser):
        parser.add_argument('--schema', type=str)
        parser.add_argument('--all-tenants', action='store_true')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        if options['all_tenants']:
            schemas = list(get_tenant_model().objects.exclude(schema_name='public')
                           .values_list('schema_name', flat=True))
        elif options['schema']:
            schemas = [options['schema']]
        else:
            self.stderr.write('Provide --schema=<name> or --all-tenants')
            return
        for schema in schemas:
            self._process(schema, options['dry_run'])

    def _process(self, schema, dry):
        from apps.billing.models import Expense
        from apps.accounting.models import Journal
        with schema_context(schema):
            qs = Expense.all_objects.filter(
                deleted_at__isnull=False, journal__isnull=False,
            ).select_related('journal')
            done = 0
            for exp in qs:
                journal = exp.journal
                if not journal or journal.status != Journal.Status.POSTED:
                    continue
                line = f'  {exp.expense_number} ${exp.amount} (journal {journal.journal_number})'
                if dry:
                    self.stdout.write(f'{line} — would reverse')
                    done += 1
                    continue
                exp.reverse_postings(user=exp.created_by)
                self.stdout.write(line + ' — reversed')
                done += 1
            self.stdout.write(self.style.SUCCESS(
                f'[{schema}] {done} deleted-expense posting(s) {"to reverse" if dry else "reversed"}'))
