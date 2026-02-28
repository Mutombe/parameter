"""
Management command to fix missing columns in tenant schemas.
Run this after migrations have been faked but columns are missing.
"""
from django.core.management.base import BaseCommand
from django.db import connection
from psycopg2 import sql
from apps.tenants.models import Client


class Command(BaseCommand):
    help = 'Fix missing columns in tenant schemas'

    def handle(self, *args, **options):
        # Get all tenant schemas (excluding public)
        tenants = Client.objects.exclude(schema_name='public')

        self.stdout.write(f"Found {tenants.count()} tenant schemas to fix")

        with connection.cursor() as cursor:
            for tenant in tenants:
                schema = tenant.schema_name
                self.stdout.write(f"\nProcessing schema: {schema}")

                try:
                    # Use psycopg2 sql.Identifier for safe schema name interpolation
                    schema_id = sql.Identifier(schema)

                    # Add unit_definition to masterfile_property if missing
                    cursor.execute(
                        sql.SQL('ALTER TABLE {}.masterfile_property ADD COLUMN IF NOT EXISTS unit_definition VARCHAR(500) DEFAULT %s').format(schema_id),
                        ['']
                    )
                    self.stdout.write("  - Added/verified unit_definition in masterfile_property")

                    # Add unit_id to masterfile_rentaltenant if missing
                    cursor.execute(
                        sql.SQL('''
                            DO $$
                            BEGIN
                                IF NOT EXISTS (
                                    SELECT 1 FROM information_schema.columns
                                    WHERE table_schema = %s
                                    AND table_name = 'masterfile_rentaltenant'
                                    AND column_name = 'unit_id'
                                ) THEN
                                    ALTER TABLE {schema}.masterfile_rentaltenant
                                    ADD COLUMN unit_id INTEGER;
                                END IF;
                            END $$;
                        ''').format(schema=schema_id),
                        [schema]
                    )
                    self.stdout.write("  - Added/verified unit_id in masterfile_rentaltenant")

                    # Add foreign key constraint if not exists
                    cursor.execute(
                        sql.SQL('''
                            DO $$
                            BEGIN
                                IF NOT EXISTS (
                                    SELECT 1 FROM information_schema.table_constraints
                                    WHERE constraint_schema = %s
                                    AND constraint_name = 'masterfile_rentaltenant_unit_id_fkey'
                                ) THEN
                                    ALTER TABLE {schema}.masterfile_rentaltenant
                                    ADD CONSTRAINT masterfile_rentaltenant_unit_id_fkey
                                    FOREIGN KEY (unit_id)
                                    REFERENCES {schema}.masterfile_unit(id)
                                    ON DELETE SET NULL;
                                END IF;
                            EXCEPTION WHEN OTHERS THEN
                                -- Constraint might already exist with different name
                                NULL;
                            END $$;
                        ''').format(schema=schema_id),
                        [schema]
                    )
                    self.stdout.write("  - Added/verified foreign key constraint")

                    # Create masterfile_propertymanager if missing
                    cursor.execute(
                        sql.SQL('''
                            CREATE TABLE IF NOT EXISTS {schema}.masterfile_propertymanager (
                                id bigserial PRIMARY KEY,
                                role varchar(50) NOT NULL DEFAULT 'manager',
                                created_at timestamp with time zone NOT NULL DEFAULT now(),
                                property_id bigint NOT NULL REFERENCES {schema}.masterfile_property(id) DEFERRABLE INITIALLY DEFERRED,
                                user_id bigint NOT NULL REFERENCES {schema}.accounts_customuser(id) DEFERRABLE INITIALLY DEFERRED
                            )
                        ''').format(schema=schema_id)
                    )
                    cursor.execute(
                        sql.SQL('CREATE INDEX IF NOT EXISTS masterfile_pm_property_idx ON {schema}.masterfile_propertymanager(property_id)').format(schema=schema_id)
                    )
                    cursor.execute(
                        sql.SQL('CREATE INDEX IF NOT EXISTS masterfile_pm_user_idx ON {schema}.masterfile_propertymanager(user_id)').format(schema=schema_id)
                    )
                    cursor.execute(
                        sql.SQL('CREATE UNIQUE INDEX IF NOT EXISTS masterfile_pm_prop_user_uniq ON {schema}.masterfile_propertymanager(property_id, user_id)').format(schema=schema_id)
                    )
                    self.stdout.write("  - Added/verified masterfile_propertymanager table")

                    self.stdout.write(self.style.SUCCESS(f"  Schema {schema} fixed successfully"))

                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"  Error fixing {schema}: {e}"))

        self.stdout.write(self.style.SUCCESS("\nSchema fix complete!"))
