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
            '--admin-email',
            type=str,
            default='admin@parameter.co.zw',
            help='Email for the admin user',
        )
        parser.add_argument(
            '--admin-password',
            type=str,
            default='Parameter2024!',
            help='Password for the admin user',
        )
        parser.add_argument(
            '--create-demo',
            action='store_true',
            help='Also create a demo tenant with sample data',
        )
        parser.add_argument(
            '--frontend-domain',
            type=str,
            default='parameter.co.zw',
            help='Frontend domain for creating tenant subdomains',
        )

    def handle(self, *args, **options):
        domain = options.get('domain')
        admin_email = options.get('admin_email', 'admin@parameter.co.zw')
        admin_password = options.get('admin_password', 'Parameter2024!')
        create_demo = options.get('create_demo', False)
        frontend_domain = options.get('frontend_domain', 'parameter.co.zw')

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
                'email': admin_email,
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
            email=admin_email,
            defaults={
                'first_name': 'Admin',
                'last_name': 'User',
                'role': 'super_admin',
                'is_staff': True,
                'is_superuser': True,
            }
        )
        admin_user.set_password(admin_password)
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.role = 'super_admin'
        admin_user.save()

        if user_created:
            self.stdout.write(self.style.SUCCESS(f'Created admin user: {admin_email}'))
        else:
            self.stdout.write(f'Updated admin user password: {admin_email}')

        self.stdout.write(self.style.WARNING(f'Admin credentials: {admin_email} / {admin_password}'))

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

        # Create demo tenant if requested
        if create_demo:
            self._create_demo_tenant(admin_email, admin_password, frontend_domain)

    def _create_demo_tenant(self, admin_email, admin_password, frontend_domain):
        """Create a demo tenant with sample data."""
        from apps.tenants.onboarding import OnboardingService

        self.stdout.write('\nCreating demo tenant...')

        # Check if demo tenant already exists
        if Client.objects.filter(schema_name='demo').exists():
            self.stdout.write(self.style.WARNING('Demo tenant already exists, skipping creation'))

            # Still update/create admin user in demo schema
            demo_tenant = Client.objects.get(schema_name='demo')
            from django_tenants.utils import tenant_context
            with tenant_context(demo_tenant):
                demo_admin, created = User.objects.get_or_create(
                    email=admin_email,
                    defaults={
                        'first_name': 'Demo',
                        'last_name': 'Admin',
                        'role': 'admin',
                        'is_staff': True,
                    }
                )
                demo_admin.set_password(admin_password)
                demo_admin.save()
                self.stdout.write(f'Updated demo admin user: {admin_email}')
            return

        try:
            service = OnboardingService()

            company_data = {
                'name': 'Demo Real Estate Company',
                'subdomain': 'demo',
                'email': 'demo@parameter.co.zw',
                'phone': '+263 77 123 4567',
                'address': '123 Samora Machel Ave, Harare',
                'subscription_plan': 'professional',
                'default_currency': 'USD'
            }

            admin_data = {
                'email': admin_email,
                'password': admin_password,
                'first_name': 'Demo',
                'last_name': 'Admin',
                'phone': '+263 77 123 4567'
            }

            result = service.register_company(
                company_data,
                admin_data,
                {
                    'create_sample_coa': True,
                    'send_welcome_email': False,
                    'is_demo': False,  # Not a time-limited demo
                }
            )

            self.stdout.write(self.style.SUCCESS(f'Created demo tenant: {result["tenant"]["name"]}'))

            # Add production domain for demo tenant
            demo_tenant = Client.objects.get(schema_name='demo')
            Domain.objects.get_or_create(
                domain=f'demo.{frontend_domain}',
                defaults={
                    'tenant': demo_tenant,
                    'is_primary': False,
                }
            )
            self.stdout.write(f'Added domain: demo.{frontend_domain}')

            # Seed demo data
            self.stdout.write('Seeding demo data...')
            from django.core.management import call_command
            from django_tenants.utils import tenant_context

            with tenant_context(demo_tenant):
                try:
                    call_command('seed_demo_data', verbosity=1)
                    self.stdout.write(self.style.SUCCESS('Demo data seeded successfully'))
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f'Could not seed demo data: {e}'))

            self.stdout.write(self.style.SUCCESS(f'\nDemo tenant ready!'))
            self.stdout.write(f'Demo URL: https://demo.{frontend_domain}')
            self.stdout.write(f'Demo credentials: {admin_email} / {admin_password}')

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Failed to create demo tenant: {e}'))
