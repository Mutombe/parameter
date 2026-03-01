"""
Management command to fix missing columns/tables in tenant schemas.
Run this after migrations have been faked but columns are missing.
"""
from django.core.management.base import BaseCommand
from django.db import connection
from django_tenants.utils import get_tenant_model, tenant_context


class Command(BaseCommand):
    help = 'Fix missing columns and tables in tenant schemas'

    def handle(self, *args, **options):
        TenantModel = get_tenant_model()
        tenants = TenantModel.objects.exclude(schema_name='public')

        self.stdout.write(f"Found {tenants.count()} tenant schemas to fix")

        for tenant in tenants:
            schema = tenant.schema_name
            self.stdout.write(f"\nProcessing schema: {schema}")

            try:
                with tenant_context(tenant):
                    with connection.cursor() as cursor:
                        # Add unit_definition to masterfile_property if missing
                        cursor.execute(
                            "ALTER TABLE masterfile_property "
                            "ADD COLUMN IF NOT EXISTS unit_definition VARCHAR(500) DEFAULT ''"
                        )
                        self.stdout.write("  - Added/verified unit_definition in masterfile_property")

                        # Add unit_id to masterfile_rentaltenant if missing
                        cursor.execute("""
                            DO $$
                            BEGIN
                                IF NOT EXISTS (
                                    SELECT 1 FROM information_schema.columns
                                    WHERE table_schema = current_schema()
                                    AND table_name = 'masterfile_rentaltenant'
                                    AND column_name = 'unit_id'
                                ) THEN
                                    ALTER TABLE masterfile_rentaltenant
                                    ADD COLUMN unit_id INTEGER;
                                END IF;
                            END $$;
                        """)
                        self.stdout.write("  - Added/verified unit_id in masterfile_rentaltenant")

                        # Add foreign key constraint if not exists
                        cursor.execute("""
                            DO $$
                            BEGIN
                                IF NOT EXISTS (
                                    SELECT 1 FROM information_schema.table_constraints
                                    WHERE constraint_schema = current_schema()
                                    AND constraint_name = 'masterfile_rentaltenant_unit_id_fkey'
                                ) THEN
                                    ALTER TABLE masterfile_rentaltenant
                                    ADD CONSTRAINT masterfile_rentaltenant_unit_id_fkey
                                    FOREIGN KEY (unit_id)
                                    REFERENCES masterfile_unit(id)
                                    ON DELETE SET NULL;
                                END IF;
                            EXCEPTION WHEN OTHERS THEN
                                NULL;
                            END $$;
                        """)
                        self.stdout.write("  - Added/verified foreign key constraint")

                        # Create masterfile_propertymanager if missing
                        cursor.execute("""
                            CREATE TABLE IF NOT EXISTS masterfile_propertymanager (
                                id bigserial PRIMARY KEY,
                                role varchar(50) NOT NULL DEFAULT 'manager',
                                is_primary boolean NOT NULL DEFAULT false,
                                assigned_at timestamp with time zone NOT NULL DEFAULT now(),
                                property_id bigint NOT NULL REFERENCES masterfile_property(id) DEFERRABLE INITIALLY DEFERRED,
                                user_id bigint NOT NULL REFERENCES accounts_user(id) DEFERRABLE INITIALLY DEFERRED,
                                assigned_by_id bigint REFERENCES accounts_user(id) DEFERRABLE INITIALLY DEFERRED
                            )
                        """)
                        cursor.execute(
                            "CREATE INDEX IF NOT EXISTS masterfile_pm_property_idx "
                            "ON masterfile_propertymanager(property_id)"
                        )
                        cursor.execute(
                            "CREATE INDEX IF NOT EXISTS masterfile_pm_user_idx "
                            "ON masterfile_propertymanager(user_id)"
                        )
                        cursor.execute(
                            "CREATE UNIQUE INDEX IF NOT EXISTS masterfile_pm_prop_user_uniq "
                            "ON masterfile_propertymanager(property_id, user_id)"
                        )
                        self.stdout.write("  - Added/verified masterfile_propertymanager table")

                        # Phase 6: Add portal_user to landlord (masterfile.0011)
                        cursor.execute("""
                            DO $$
                            BEGIN
                                IF NOT EXISTS (
                                    SELECT 1 FROM information_schema.columns
                                    WHERE table_schema = current_schema()
                                    AND table_name = 'masterfile_landlord'
                                    AND column_name = 'portal_user_id'
                                ) THEN
                                    ALTER TABLE masterfile_landlord
                                    ADD COLUMN portal_user_id bigint
                                    REFERENCES accounts_user(id)
                                    ON DELETE SET NULL
                                    DEFERRABLE INITIALLY DEFERRED;
                                    CREATE UNIQUE INDEX IF NOT EXISTS masterfile_landlord_portal_user_uniq
                                    ON masterfile_landlord(portal_user_id);
                                END IF;
                            END $$;
                        """)
                        self.stdout.write("  - Added/verified portal_user_id in masterfile_landlord")

                        # Phase 6: Add lease escalation fields (masterfile.0011)
                        cursor.execute(
                            "ALTER TABLE masterfile_leaseagreement "
                            "ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT FALSE"
                        )
                        cursor.execute(
                            "ALTER TABLE masterfile_leaseagreement "
                            "ADD COLUMN IF NOT EXISTS last_escalation_date DATE"
                        )
                        cursor.execute(
                            "ALTER TABLE masterfile_leaseagreement "
                            "ADD COLUMN IF NOT EXISTS original_rent NUMERIC(18,2)"
                        )
                        self.stdout.write("  - Added/verified lease escalation fields")

                        # Phase 7: Create maintenance tables (maintenance.0001)
                        cursor.execute("""
                            CREATE TABLE IF NOT EXISTS maintenance_maintenancerequest (
                                id bigserial PRIMARY KEY,
                                title varchar(200) NOT NULL,
                                description text NOT NULL DEFAULT '',
                                priority varchar(20) NOT NULL DEFAULT 'medium',
                                status varchar(20) NOT NULL DEFAULT 'open',
                                photos jsonb DEFAULT '[]'::jsonb,
                                is_deleted boolean NOT NULL DEFAULT false,
                                deleted_at timestamp with time zone,
                                created_at timestamp with time zone NOT NULL DEFAULT now(),
                                updated_at timestamp with time zone NOT NULL DEFAULT now(),
                                property_id bigint REFERENCES masterfile_property(id) DEFERRABLE INITIALLY DEFERRED,
                                unit_id bigint REFERENCES masterfile_unit(id) DEFERRABLE INITIALLY DEFERRED,
                                reported_by_id bigint REFERENCES accounts_user(id) DEFERRABLE INITIALLY DEFERRED
                            )
                        """)
                        cursor.execute("""
                            CREATE TABLE IF NOT EXISTS maintenance_workorder (
                                id bigserial PRIMARY KEY,
                                assigned_to varchar(200) NOT NULL DEFAULT '',
                                vendor_name varchar(200) NOT NULL DEFAULT '',
                                estimated_cost numeric(12,2),
                                actual_cost numeric(12,2),
                                scheduled_date date,
                                completed_date date,
                                notes text NOT NULL DEFAULT '',
                                status varchar(20) NOT NULL DEFAULT 'pending',
                                is_deleted boolean NOT NULL DEFAULT false,
                                deleted_at timestamp with time zone,
                                created_at timestamp with time zone NOT NULL DEFAULT now(),
                                updated_at timestamp with time zone NOT NULL DEFAULT now(),
                                request_id bigint NOT NULL REFERENCES maintenance_maintenancerequest(id) DEFERRABLE INITIALLY DEFERRED
                            )
                        """)
                        self.stdout.write("  - Added/verified maintenance tables")

                        self.stdout.write(self.style.SUCCESS(f"  Schema {schema} fixed successfully"))

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  Error fixing {schema}: {e}"))

        self.stdout.write(self.style.SUCCESS("\nSchema fix complete!"))
