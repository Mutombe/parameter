"""Wipe all transactional + masterfile data from a tenant schema.

Designed for "give me a fresh testing slate" scenarios. Defaults to a
DRY-RUN so the operator sees what will be deleted before committing.

What gets wiped:
  • Accounting transactions: Journal, JournalEntry, GeneralLedger,
    SubsidiaryTransaction, JournalReallocation, TransactionConsolidation.
  • Layer entries: OpeningBalance, AccruedExpense, BalanceSheetMovement.
  • Subsidiary accounts.
  • Billing: Receipt, Invoice, Expense.
  • Masterfile entities: PropertyIncomeCommission, PropertyManager,
    LeaseAgreement, Unit, Property, RentalTenant, Supplier, Landlord.

What gets preserved (always):
  • The tenant schema itself + Domain records (shared apps).
  • All User records (shared apps).
  • Tenant Client row (shared apps).

Optional preservation (default on — use --include-config to wipe too):
  • ChartOfAccount, IncomeType, ExpenseCategory, BankAccount — these
    are configuration data the operator usually wants to keep so the
    chart-of-accounts isn't re-seeded from scratch.

Usage::

    python manage.py wipe_tenant_data --schema=freshtest
    # (dry run — shows row counts only)

    python manage.py wipe_tenant_data --schema=freshtest --confirm
    # actually deletes; respects FK PROTECT by deleting children first

    python manage.py wipe_tenant_data --schema=freshtest --confirm \
        --include-config
    # also wipe ChartOfAccount / IncomeType / ExpenseCategory / BankAccount

Soft-deleted records are also removed (uses .all_objects).
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django_tenants.utils import get_tenant_model, schema_context


class Command(BaseCommand):
    help = (
        'Wipe transactional + masterfile data from a tenant schema. '
        'Defaults to a DRY RUN; pass --confirm to actually delete.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--schema', required=True,
            help='Target tenant schema name (e.g. freshtest)',
        )
        parser.add_argument(
            '--confirm', action='store_true',
            help='Actually delete. Without this flag the command is a DRY RUN.',
        )
        parser.add_argument(
            '--include-config', action='store_true',
            help=(
                'Also wipe ChartOfAccount / IncomeType / ExpenseCategory / '
                'BankAccount. Off by default so the config survives the reset.'
            ),
        )

    def handle(self, *args, **opts):
        schema = opts['schema']
        confirm = opts['confirm']
        include_config = opts['include_config']

        TenantModel = get_tenant_model()
        try:
            tenant = TenantModel.objects.get(schema_name=schema)
        except TenantModel.DoesNotExist:
            raise CommandError(f"Tenant schema '{schema}' not found")

        if schema == 'public':
            raise CommandError(
                "Refusing to wipe the public schema — it holds shared apps "
                "(users, tenants, domains). This command is for tenant "
                "schemas only."
            )

        # Models in FK-safe deletion order (children first). Each entry is
        # `(label, model)`; we use `all_objects` where available to also
        # remove soft-deleted rows.
        from apps.accounting.models import (
            JournalReallocation, TransactionConsolidation,
            SubsidiaryTransaction, GeneralLedger, JournalEntry, Journal,
            BalanceSheetMovement, OpeningBalance, AccruedExpense,
            SubsidiaryAccount,
            ChartOfAccount, IncomeType, ExpenseCategory, BankAccount,
        )
        from apps.billing.models import Receipt, Invoice, Expense
        from apps.masterfile.models import (
            LeaseAgreement, RentalTenant, Unit, Property, Landlord,
            Supplier, PropertyIncomeCommission, PropertyManager,
        )

        # Deletion order — children before parents so FK PROTECT doesn't
        # block the cascade. Within each group order is informed by the
        # actual FK graph in the project.
        wipe_order = [
            # 1) Accounting transactions
            ('JournalReallocation', JournalReallocation),
            ('TransactionConsolidation', TransactionConsolidation),
            ('SubsidiaryTransaction', SubsidiaryTransaction),
            ('GeneralLedger', GeneralLedger),
            ('JournalEntry', JournalEntry),
            ('Journal', Journal),
            # 2) Layer source records
            ('BalanceSheetMovement', BalanceSheetMovement),
            ('OpeningBalance', OpeningBalance),
            ('AccruedExpense', AccruedExpense),
            # 3) Subsidiary accounts (referenced by many of the above)
            ('SubsidiaryAccount', SubsidiaryAccount),
            # 4) Billing
            ('Receipt', Receipt),
            ('Invoice', Invoice),
            ('Expense', Expense),
            # 5) Masterfile (children → parents)
            ('PropertyIncomeCommission', PropertyIncomeCommission),
            ('PropertyManager', PropertyManager),
            ('LeaseAgreement', LeaseAgreement),
            ('Unit', Unit),
            ('Property', Property),
            ('RentalTenant', RentalTenant),
            ('Supplier', Supplier),
            ('Landlord', Landlord),
        ]

        if include_config:
            wipe_order.extend([
                # Bank accounts depend on ChartOfAccount, so bank first.
                ('BankAccount', BankAccount),
                ('IncomeType', IncomeType),
                ('ExpenseCategory', ExpenseCategory),
                ('ChartOfAccount', ChartOfAccount),
            ])

        def _all(model):
            """Return a manager that includes soft-deleted rows where
            applicable. Falls back to the default manager."""
            mgr = getattr(model, 'all_objects', None)
            if mgr is None:
                mgr = model.objects
            return mgr

        # Header
        self.stdout.write('')
        self.stdout.write('=' * 70)
        self.stdout.write(self.style.WARNING(
            f"  WIPE TENANT DATA — {tenant.name} (schema: {schema})"
        ))
        self.stdout.write('=' * 70)
        self.stdout.write(
            self.style.SUCCESS('  MODE: WIPE') if confirm
            else self.style.NOTICE('  MODE: DRY RUN (no rows will be deleted)')
        )
        self.stdout.write(
            f"  Include config: {'YES (chart of accounts etc.)' if include_config else 'no'}"
        )
        self.stdout.write('=' * 70)
        self.stdout.write('')

        # Run inside the tenant's schema context.
        with schema_context(schema):
            # --- Count phase ---
            self.stdout.write('Row counts:')
            counts = []
            total = 0
            for label, model in wipe_order:
                try:
                    n = _all(model).count()
                except Exception as exc:
                    self.stdout.write(self.style.ERROR(
                        f"  {label}: ERROR — {exc}"
                    ))
                    counts.append((label, model, 0))
                    continue
                counts.append((label, model, n))
                total += n
                marker = '·' if n == 0 else '✓'
                self.stdout.write(f"  {marker} {label}: {n}")
            self.stdout.write('')
            self.stdout.write(f"Total: {total} rows across {len(wipe_order)} tables")
            self.stdout.write('')

            if not confirm:
                self.stdout.write(self.style.NOTICE(
                    'Dry run complete. Add --confirm to actually delete.'
                ))
                return

            if total == 0:
                self.stdout.write(self.style.SUCCESS(
                    'Nothing to delete — tenant already clean.'
                ))
                return

            # --- Delete phase ---
            self.stdout.write(self.style.WARNING('Deleting…'))
            deleted_total = 0
            with transaction.atomic():
                for label, model, prior in counts:
                    if prior == 0:
                        continue
                    try:
                        deleted, _ = _all(model).all().delete()
                        deleted_total += deleted
                        self.stdout.write(self.style.SUCCESS(
                            f"  ✓ {label}: {deleted} deleted"
                        ))
                    except Exception as exc:
                        self.stdout.write(self.style.ERROR(
                            f"  ✗ {label}: {exc} (aborting; transaction will roll back)"
                        ))
                        raise

            self.stdout.write('')
            self.stdout.write(self.style.SUCCESS(
                f"Done — wiped {deleted_total} rows from schema '{schema}'."
            ))
            self.stdout.write(
                'Tip: re-run with --dry-run (no --confirm) to verify everything is at 0.'
            )
