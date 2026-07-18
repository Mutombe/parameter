"""Backfill the full set of category sub-account pockets for every existing
tenant and account holder — the same slate landlords carry.

New tenants get their pockets from the RentalTenant post_save signal; this
command covers everyone created before that signal existed.

Rental tenant:         12 pockets (Rent, Rates, Maintenance, Parking, VAT,
                       Deposit × USD/ZWG)
Account holder (levy): 10 pockets (Levy, Special Levy, Maintenance, Parking,
                       Rates × USD/ZWG)

BULK implementation: one SELECT for existing codes + batched bulk_create.
A per-payer get_or_create loop was O(payers × 12) round-trips and timed out
the deploy on schemas with tens of thousands of payers (demo: 20k+).

Idempotent. Usage:
    python manage.py seed_tenant_pockets --schema=freshtest
    python manage.py seed_tenant_pockets --all-tenants
    python manage.py seed_tenant_pockets --schema=freshtest --dry-run
"""
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django_tenants.utils import schema_context, get_tenant_model

CHUNK = 1000  # payers per bulk_create batch — bounds memory on huge schemas


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
        # transaction.atomic pins ONE server connection for the whole schema's
        # work — with a transaction-pooling proxy (PgBouncer/Neon pooler),
        # statements outside a transaction can land on different server
        # connections where SET search_path never applied, silently reading
        # or writing the WRONG schema.
        with schema_context(schema), transaction.atomic():
            with connection.cursor() as cur:
                cur.execute('SELECT current_schema()')
                current = cur.fetchone()[0]
            if current != schema:
                raise RuntimeError(
                    f'search_path not applied (current_schema={current!r}, '
                    f'expected {schema!r}) — refusing to seed the wrong schema')
            labels = dict(SubsidiaryAccount.AccountCategory.choices)
            existing_codes = set(
                SubsidiaryAccount.objects.filter(tenant__isnull=False)
                .values_list('code', flat=True)
            )
            payers = RentalTenant.objects.all().only('id', 'name', 'account_type')
            total_payers = 0
            total_created = 0
            batch = []

            def flush():
                nonlocal total_created
                if batch and not dry:
                    SubsidiaryAccount.objects.bulk_create(
                        batch, batch_size=500, ignore_conflicts=True)
                total_created += len(batch)
                batch.clear()

            for t in payers.iterator(chunk_size=CHUNK):
                total_payers += 1
                if t.account_type == 'levy':
                    prefix = 'AC'
                    entity = SubsidiaryAccount.EntityType.ACCOUNT_HOLDER
                    smap = SubsidiaryAccount.LEVY_SUFFIX_MAP
                else:
                    prefix = 'TN'
                    entity = SubsidiaryAccount.EntityType.TENANT
                    smap = SubsidiaryAccount.RENTAL_SUFFIX_MAP
                for (category, currency), suffix in smap.items():
                    code = f'{prefix}/{t.id:05d}/{suffix}'
                    if code in existing_codes:
                        continue
                    label = labels.get(category, category.replace('_', ' ').title())
                    batch.append(SubsidiaryAccount(
                        code=code,
                        name=f'{t.name} - {label} ({currency})',
                        entity_type=entity,
                        tenant_id=t.id,
                        category=category,
                        currency=currency,
                    ))
                if len(batch) >= CHUNK * 12:
                    flush()
            flush()

            verb = 'would create' if dry else 'created'
            self.stdout.write(self.style.SUCCESS(
                f'[{schema}] {total_payers} payer(s): {verb} {total_created} pocket(s)'))
