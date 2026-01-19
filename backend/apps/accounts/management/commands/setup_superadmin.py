"""
Management command to create or reset the super admin user.
"""
from django.core.management.base import BaseCommand
from django.db import connection
from apps.accounts.models import User


class Command(BaseCommand):
    help = 'Create or reset the super admin user in the public schema'

    def add_arguments(self, parser):
        parser.add_argument(
            '--email',
            type=str,
            default='admin@parameter.co.zw',
            help='Super admin email'
        )
        parser.add_argument(
            '--password',
            type=str,
            default='admin123',
            help='Super admin password'
        )
        parser.add_argument(
            '--check-only',
            action='store_true',
            help='Only check if user exists, do not create/modify'
        )

    def handle(self, *args, **options):
        email = options['email']
        password = options['password']
        check_only = options['check_only']

        # Show current schema
        self.stdout.write(f'Current schema: {connection.schema_name}')

        # Check if user exists
        try:
            user = User.objects.get(email=email)
            self.stdout.write(self.style.SUCCESS(f'User found: {user.email}'))
            self.stdout.write(f'  - ID: {user.id}')
            self.stdout.write(f'  - Name: {user.get_full_name()}')
            self.stdout.write(f'  - Role: {user.role}')
            self.stdout.write(f'  - Is Active: {user.is_active}')
            self.stdout.write(f'  - Is Staff: {user.is_staff}')
            self.stdout.write(f'  - Is Superuser: {user.is_superuser}')
            self.stdout.write(f'  - Account Status: {user.account_status}')

            if check_only:
                return

            # Reset password
            user.set_password(password)
            user.is_active = True
            user.is_staff = True
            user.is_superuser = True
            user.role = User.Role.SUPER_ADMIN
            user.account_status = User.AccountStatus.ACTIVE
            user.save()

            self.stdout.write(self.style.SUCCESS(f'Password reset to: {password}'))

        except User.DoesNotExist:
            self.stdout.write(self.style.WARNING(f'User not found: {email}'))

            if check_only:
                # List all users in public schema
                all_users = User.objects.all()
                self.stdout.write(f'\nAll users in {connection.schema_name} schema:')
                for u in all_users:
                    self.stdout.write(f'  - {u.email} ({u.role})')
                return

            # Create super admin
            user = User.objects.create_superuser(
                email=email,
                password=password,
                first_name='Super',
                last_name='Admin'
            )
            self.stdout.write(self.style.SUCCESS(f'Created super admin: {email}'))
            self.stdout.write(f'Password: {password}')

        self.stdout.write('')
        self.stdout.write('Login from the main domain (not a tenant subdomain):')
        self.stdout.write('  - Production: https://parameter.co.zw or https://www.parameter.co.zw')
        self.stdout.write('  - Development: http://localhost:5173')
