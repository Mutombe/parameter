"""
Management command to create a portal user for an existing tenant.
Links the portal_user field on RentalTenant to a new User with TENANT_PORTAL role.
"""
from django.core.management.base import BaseCommand
from django.db import connection
from apps.accounts.models import User


class Command(BaseCommand):
    help = 'Create a tenant portal user and link it to an existing RentalTenant'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant-id',
            type=int,
            help='ID of the RentalTenant to link'
        )
        parser.add_argument(
            '--password',
            type=str,
            default='portal123',
            help='Portal user password (default: portal123)'
        )
        parser.add_argument(
            '--list',
            action='store_true',
            help='List all tenants and their portal user status'
        )

    def handle(self, *args, **options):
        from apps.masterfile.models import RentalTenant

        self.stdout.write(f'Current schema: {connection.schema_name}')

        if options['list']:
            tenants = RentalTenant.objects.select_related('portal_user').all()
            if not tenants.exists():
                self.stdout.write(self.style.WARNING('No tenants found'))
                return

            self.stdout.write(f'\nAll tenants ({tenants.count()}):')
            for t in tenants:
                portal_status = (
                    f'Portal: {t.portal_user.email}'
                    if t.portal_user
                    else 'No portal access'
                )
                self.stdout.write(
                    f'  ID={t.id} | {t.code} | {t.name} | {t.email} | {portal_status}'
                )
            return

        tenant_id = options['tenant_id']
        password = options['password']

        if not tenant_id:
            # Pick first tenant without portal access
            tenant = RentalTenant.objects.filter(portal_user__isnull=True).first()
            if not tenant:
                tenant = RentalTenant.objects.first()
            if not tenant:
                self.stdout.write(self.style.ERROR('No tenants in database'))
                return
            tenant_id = tenant.id
        else:
            try:
                tenant = RentalTenant.objects.get(id=tenant_id)
            except RentalTenant.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'Tenant ID {tenant_id} not found'))
                return

        # Check if tenant already has portal access
        if tenant.portal_user:
            self.stdout.write(self.style.WARNING(
                f'Tenant "{tenant.name}" already has portal access: {tenant.portal_user.email}'
            ))
            # Reset password
            tenant.portal_user.set_password(password)
            tenant.portal_user.is_active = True
            tenant.portal_user.save()
            self.stdout.write(self.style.SUCCESS(f'Password reset to: {password}'))
            self.stdout.write(f'Email: {tenant.portal_user.email}')
            return

        # Create portal user using tenant's email
        email = tenant.email
        name_parts = tenant.name.split(' ', 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ''

        # Check if user with this email already exists
        if User.objects.filter(email=email).exists():
            # Use a modified email
            email = f'portal+{tenant.code.lower()}@{email.split("@")[1]}'
            self.stdout.write(self.style.WARNING(
                f'Email {tenant.email} already in use, using {email}'
            ))

        user = User.objects.create_user(
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            role=User.Role.TENANT_PORTAL,
        )

        tenant.portal_user = user
        tenant.save(update_fields=['portal_user'])

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(f'Portal user created for: {tenant.name}'))
        self.stdout.write(f'  Tenant: {tenant.code} - {tenant.name}')
        self.stdout.write(f'  Email: {email}')
        self.stdout.write(f'  Password: {password}')
        self.stdout.write(f'  Tenant ID: {tenant.id}')
        self.stdout.write('')
        self.stdout.write('Login at the tenant portal to test.')
