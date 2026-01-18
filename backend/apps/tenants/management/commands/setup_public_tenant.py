"""
Management command to set up the public tenant and domain for production.
"""
from django.core.management.base import BaseCommand
from django.conf import settings
from apps.tenants.models import Client, Domain
from apps.accounts.models import User


class Command(BaseCommand):
    help = 'Set up public tenant and domain for production deployment'

    def add_arguments(self, parser):
        parser.add_argument(
            '--domain',
            type=str,
            help='Domain for the public tenant (e.g., parameter-backend.onrender.com)',
        )
        parser.add_argument(
            '--admin-password',
            type=str,
            default='Parameter2024!',
            help='Password for the admin user',
        )

    def handle(self, *args, **options):
        domain = options.get('domain')
        admin_password = options.get('admin_password', 'Parameter2024!')

        # Get domain from environment or argument
        if not domain:
            # Try to get from ALLOWED_HOSTS
            allowed_hosts = getattr(settings, 'ALLOWED_HOSTS', [])
            for host in allowed_hosts:
                if host and not host.startswith('.') and host not in ['localhost', '127.0.0.1']:
                    domain = host
                    break

        if not domain:
            domain = 'parameter-backend.onrender.com'

        self.stdout.write(f'Setting up public tenant with domain: {domain}')

        # Create or get public tenant
        public_tenant, created = Client.objects.get_or_create(
            schema_name='public',
            defaults={
                'name': 'Parameter Platform',
                'email': 'admin@parameter.co.zw',
                'is_active': True,
                'subscription_plan': 'enterprise',
            }
        )

        if created:
            self.stdout.write(self.style.SUCCESS(f'Created public tenant: {public_tenant.name}'))
        else:
            self.stdout.write(f'Public tenant already exists: {public_tenant.name}')

        # Create superuser for admin access
        admin_user, user_created = User.objects.get_or_create(
            email='admin@parameter.co.zw',
            defaults={
                'first_name': 'Admin',
                'last_name': 'User',
                'role': 'super_admin',  # Super admin role for platform management
                'is_staff': True,
                'is_superuser': True,
            }
        )
        admin_user.set_password(admin_password)
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.role = 'super_admin'  # Ensure role is set correctly
        admin_user.save()

        if user_created:
            self.stdout.write(self.style.SUCCESS(f'Created admin user: admin@parameter.co.zw'))
        else:
            self.stdout.write(f'Updated admin user password: admin@parameter.co.zw')

        self.stdout.write(self.style.WARNING(f'Admin credentials: admin@parameter.co.zw / {admin_password}'))

        # Create domain for backend
        domain_obj, domain_created = Domain.objects.get_or_create(
            domain=domain,
            defaults={
                'tenant': public_tenant,
                'is_primary': True,
            }
        )

        if domain_created:
            self.stdout.write(self.style.SUCCESS(f'Created domain: {domain}'))
        else:
            self.stdout.write(f'Domain already exists: {domain}')

        # Also add localhost domains for development
        dev_domains = ['localhost', '127.0.0.1']
        for dev_domain in dev_domains:
            Domain.objects.get_or_create(
                domain=dev_domain,
                defaults={
                    'tenant': public_tenant,
                    'is_primary': False,
                }
            )

        # Add any .onrender.com domains
        Domain.objects.get_or_create(
            domain='parameter-backend.onrender.com',
            defaults={
                'tenant': public_tenant,
                'is_primary': False,
            }
        )

        self.stdout.write(self.style.SUCCESS('Public tenant setup complete!'))
