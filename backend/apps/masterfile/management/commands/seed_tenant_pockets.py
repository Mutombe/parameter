"""Backfill the full set of category sub-account pockets for every existing
tenant and account holder — the same slate landlords carry.

New tenants get their pockets from the RentalTenant post_save signal; this
command covers everyone created before that signal existed.

Rental tenant:         12 pockets (Rent, Rates, Maintenance, Parking, VAT,
                       Deposit × USD/ZWG)
Account holder (levy): 10 pockets (Levy, Special Levy, Maintenance, Parking,
                       Rates × USD/ZWG)

Idempotent. Usage:
    python manage.py seed_tenant_pockets --schema=freshtest
    python manage.py seed_tenant_pockets --all-tenants
    python manage.py seed_tenant_pockets --schema=freshtest --dry-run
"""
from django.core.management.base import BaseCommand
from django_tenants.utils import schema_context, get_tenant_model


class Command(BaseCommand):
    help = "Seed category sub-account pockets for all tenants/account holders."

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
            try:
                self._process(schema, options['dry_run'])
            except Exception as e:
                self.stderr.write(f'[{schema}] FAILED: {e}')

    def _process(self, schema, dry):
        from apps.masterfile.models import RentalTenant
        from apps.accounting.models import SubsidiaryAccount
        with schema_context(schema):
            payers = RentalTenant.objects.all()
            before = SubsidiaryAccount.objects.filter(tenant__isnull=False).count()
            if dry:
                self.stdout.write(
                    f'[{schema}] would seed pockets for {payers.count()} payer(s) '
                    f'(existing tenant sub-accounts: {before})')
                return
            for payer in payers:
                SubsidiaryAccount.seed_for_tenant(payer)
            after = SubsidiaryAccount.objects.filter(tenant__isnull=False).count()
            self.stdout.write(self.style.SUCCESS(
                f'[{schema}] seeded {payers.count()} payer(s): '
                f'{before} → {after} tenant sub-accounts (+{after - before})'))
