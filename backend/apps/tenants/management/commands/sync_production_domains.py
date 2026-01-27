"""
Management command to sync production domains for all tenants.
This adds production domain entries (e.g., demo.parameter.co.zw)
for all existing tenants that only have localhost domains.
"""
from django.core.management.base import BaseCommand
from django.conf import settings
from apps.tenants.models import Client, Domain


class Command(BaseCommand):
    help = 'Add production domains to all existing tenants'

    def add_arguments(self, parser):
        parser.add_argument(
            '--domain-suffix',
            type=str,
            default=None,
            help='Domain suffix to use (default: from TENANT_DOMAIN_SUFFIX setting)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without making changes'
        )

    def handle(self, *args, **options):
        domain_suffix = options['domain_suffix'] or getattr(
            settings, 'TENANT_DOMAIN_SUFFIX', 'parameter.co.zw'
        )
        dry_run = options['dry_run']

        self.stdout.write(f'Syncing production domains with suffix: {domain_suffix}')
        self.stdout.write(f'Dry run: {dry_run}')
        self.stdout.write('')

        # Get all tenants except public schema
        tenants = Client.objects.exclude(schema_name='public')

        created_count = 0
        skipped_count = 0

        for tenant in tenants:
            # Build the expected production domain
            # Use schema_name but replace underscores with hyphens for DNS compatibility
            subdomain = tenant.schema_name.replace('_', '-')
            production_domain = f'{subdomain}.{domain_suffix}'

            # Check if this domain already exists
            existing = Domain.objects.filter(
                domain=production_domain,
                tenant=tenant
            ).exists()

            if existing:
                self.stdout.write(
                    f'  [SKIP] {tenant.name}: {production_domain} already exists'
                )
                skipped_count += 1
                continue

            if dry_run:
                self.stdout.write(
                    self.style.WARNING(f'  [DRY RUN] Would add: {production_domain} for {tenant.name}')
                )
            else:
                # Check if tenant has any primary domain
                has_primary = Domain.objects.filter(
                    tenant=tenant, is_primary=True
                ).exists()

                Domain.objects.create(
                    domain=production_domain,
                    tenant=tenant,
                    is_primary=not has_primary  # Make primary if no primary exists
                )
                self.stdout.write(
                    self.style.SUCCESS(f'  [ADDED] {production_domain} for {tenant.name}')
                )

            created_count += 1

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(f'Summary:'))
        self.stdout.write(f'  - Tenants processed: {tenants.count()}')
        self.stdout.write(f'  - Domains {"would be " if dry_run else ""}added: {created_count}')
        self.stdout.write(f'  - Domains skipped (already exist): {skipped_count}')

        if not dry_run and created_count > 0:
            self.stdout.write('')
            self.stdout.write(self.style.WARNING(
                'Note: You may need to run migrations or restart the server '
                'for django-tenants to pick up the new domains.'
            ))

        # List all domains for verification
        self.stdout.write('')
        self.stdout.write('Current domain mappings:')
        for tenant in Client.objects.all():
            domains = Domain.objects.filter(tenant=tenant)
            domain_list = ', '.join([d.domain for d in domains])
            self.stdout.write(f'  {tenant.name} ({tenant.schema_name}): {domain_list}')
