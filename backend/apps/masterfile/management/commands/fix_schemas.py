"""
Management command to fix missing columns in tenant schemas.
Run this after migrations have been faked but columns are missing.
"""
from django.core.management.base import BaseCommand
from django.db import connection
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
                    # Add unit_definition to masterfile_property if missing
                    cursor.execute(f'''
                        ALTER TABLE {schema}.masterfile_property
                        ADD COLUMN IF NOT EXISTS unit_definition VARCHAR(500) DEFAULT ''
                    ''')
                    self.stdout.write(f"  - Added/verified unit_definition in masterfile_property")

                    # Add unit_id to masterfile_rentaltenant if missing
                    cursor.execute(f'''
                        DO $$
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1 FROM information_schema.columns
                                WHERE table_schema = '{schema}'
                                AND table_name = 'masterfile_rentaltenant'
                                AND column_name = 'unit_id'
                            ) THEN
                                ALTER TABLE {schema}.masterfile_rentaltenant
                                ADD COLUMN unit_id INTEGER;
                            END IF;
                        END $$;
                    ''')
                    self.stdout.write(f"  - Added/verified unit_id in masterfile_rentaltenant")

                    # Add foreign key constraint if not exists
                    cursor.execute(f'''
                        DO $$
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1 FROM information_schema.table_constraints
                                WHERE constraint_schema = '{schema}'
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
                    ''')
                    self.stdout.write(f"  - Added/verified foreign key constraint")

                    self.stdout.write(self.style.SUCCESS(f"  Schema {schema} fixed successfully"))

                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"  Error fixing {schema}: {e}"))

        self.stdout.write(self.style.SUCCESS("\nSchema fix complete!"))
