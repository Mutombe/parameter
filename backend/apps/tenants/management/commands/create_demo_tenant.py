"""
Create a demo tenant with all demo data ready for presentation.
"""
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.conf import settings
from datetime import timedelta
from apps.tenants.models import Client, Domain
from django_tenants.utils import tenant_context


class Command(BaseCommand):
    help = 'Create a demo tenant with full demo data'

    def add_arguments(self, parser):
        parser.add_argument('--subdomain', type=str, default='demo', help='Subdomain for the tenant')
        parser.add_argument('--email', type=str, default='admin@demo.parameter.co.zw', help='Admin email')
        parser.add_argument('--password', type=str, default='demo123', help='Admin password')

    @transaction.atomic
    def handle(self, *args, **options):
        subdomain = options['subdomain']
        admin_email = options['email']
        admin_password = options['password']
        schema_name = subdomain.replace('-', '_')

        self.stdout.write(f'Creating demo tenant: {subdomain}')

        # Delete existing tenant if exists
        try:
            existing = Client.objects.get(schema_name=schema_name)
            self.stdout.write(f'Deleting existing tenant: {existing.name}')
            existing.delete()
        except Client.DoesNotExist:
            pass

        # Create tenant
        tenant = Client.objects.create(
            schema_name=schema_name,
            name='Demo Properties Ltd',
            email='info@demo-properties.co.zw',
            phone='+263 24 2700 123',
            address='15 Samora Machel Ave, Harare',
            subscription_plan='professional',
            default_currency='USD',
            is_active=True,
            is_demo=False,  # Not a time-limited demo
            account_status='active',
            ai_accounting_enabled=True,
            ai_reconciliation_enabled=True,
            ai_reports_enabled=True,
            ai_ocr_enabled=True,
        )

        # Create domain
        domain_suffix = getattr(settings, 'TENANT_DOMAIN_SUFFIX', 'localhost')
        Domain.objects.create(
            domain=f'{subdomain}.{domain_suffix}',
            tenant=tenant,
            is_primary=True
        )

        self.stdout.write(self.style.SUCCESS(f'Created tenant: {tenant.name}'))

        # Now create all demo data within tenant context
        with tenant_context(tenant):
            self._create_admin_user(admin_email, admin_password)
            self._create_chart_of_accounts()
            landlords = self._create_landlords()
            properties = self._create_properties(landlords)
            tenants = self._create_tenants()
            self._create_leases(properties, tenants)

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=' * 50))
        self.stdout.write(self.style.SUCCESS('DEMO TENANT CREATED SUCCESSFULLY!'))
        self.stdout.write(self.style.SUCCESS('=' * 50))
        self.stdout.write('')
        self.stdout.write(f'Subdomain: {subdomain}')
        self.stdout.write(f'Login URL: https://{subdomain}.{domain_suffix}')
        self.stdout.write(f'Email: {admin_email}')
        self.stdout.write(f'Password: {admin_password}')
        self.stdout.write('')

    def _create_admin_user(self, email, password):
        from apps.accounts.models import User

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'first_name': 'Demo',
                'last_name': 'Admin',
                'role': User.Role.ADMIN,
                'is_staff': True,
                'is_active': True,
                'account_status': User.AccountStatus.ACTIVE,
            }
        )
        user.set_password(password)
        user.save()
        self.stdout.write(f'  Created admin user: {email}')

    def _create_chart_of_accounts(self):
        from apps.accounting.models import ChartOfAccount

        accounts = [
            ('1000', 'Cash and Cash Equivalents', 'asset', 'debit'),
            ('1100', 'Accounts Receivable - Tenants', 'asset', 'debit'),
            ('1200', 'Prepaid Expenses', 'asset', 'debit'),
            ('2000', 'Accounts Payable', 'liability', 'credit'),
            ('2100', 'Landlord Payables', 'liability', 'credit'),
            ('2200', 'Tenant Deposits Liability', 'liability', 'credit'),
            ('3000', 'Owner Capital', 'equity', 'credit'),
            ('3100', 'Retained Earnings', 'equity', 'credit'),
            ('4000', 'Rental Income', 'revenue', 'credit'),
            ('4100', 'Management Fee Income', 'revenue', 'credit'),
            ('5000', 'Operating Expenses', 'expense', 'debit'),
            ('5100', 'Repairs and Maintenance', 'expense', 'debit'),
        ]

        for code, name, acc_type, normal_balance in accounts:
            ChartOfAccount.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'account_type': acc_type,
                    'normal_balance': normal_balance,
                    'is_active': True
                }
            )
        self.stdout.write(f'  Created {len(accounts)} chart of accounts')

    def _create_landlords(self):
        from apps.masterfile.models import Landlord

        landlords_data = [
            {
                'name': 'John Moyo Investments',
                'landlord_type': 'company',
                'email': 'john.moyo@email.co.zw',
                'phone': '+263 77 234 5678',
                'address': '23 Enterprise Road, Harare',
                'commission_rate': Decimal('10.00'),
            },
            {
                'name': 'Sarah Ndlovu',
                'landlord_type': 'individual',
                'email': 'sarah.ndlovu@gmail.com',
                'phone': '+263 71 987 6543',
                'address': '45 Borrowdale Road, Harare',
                'commission_rate': Decimal('8.00'),
            },
            {
                'name': 'Chiedza Properties Trust',
                'landlord_type': 'trust',
                'email': 'info@chiedzaproperties.co.zw',
                'phone': '+263 24 2792 100',
                'address': '10 Kwame Nkrumah Ave, Harare',
                'commission_rate': Decimal('12.00'),
            },
        ]

        landlords = []
        for data in landlords_data:
            landlord, _ = Landlord.objects.get_or_create(
                email=data['email'],
                defaults=data
            )
            landlords.append(landlord)

        self.stdout.write(f'  Created {len(landlords)} landlords')
        return landlords

    def _create_properties(self, landlords):
        from apps.masterfile.models import Property, Unit

        properties_data = [
            {
                'landlord': landlords[0],
                'name': 'Eastgate Complex',
                'property_type': 'commercial',
                'address': '2nd Street, Harare CBD',
                'city': 'Harare',
                'suburb': 'CBD',
                'total_units': 6,
                'units': [
                    {'number': f'E{i:02d}', 'type': 'office', 'rent': Decimal('1500.00')}
                    for i in range(1, 7)
                ]
            },
            {
                'landlord': landlords[1],
                'name': 'Avondale Gardens',
                'property_type': 'residential',
                'address': '15 King George Road',
                'city': 'Harare',
                'suburb': 'Avondale',
                'total_units': 8,
                'units': [
                    {'number': f'A{i}', 'type': 'apartment', 'rent': Decimal('800.00'), 'bedrooms': 2}
                    for i in range(1, 5)
                ] + [
                    {'number': f'B{i}', 'type': 'apartment', 'rent': Decimal('1200.00'), 'bedrooms': 3}
                    for i in range(1, 5)
                ]
            },
            {
                'landlord': landlords[2],
                'name': 'Borrowdale Mall',
                'property_type': 'commercial',
                'address': 'Borrowdale Road',
                'city': 'Harare',
                'suburb': 'Borrowdale',
                'total_units': 10,
                'units': [
                    {'number': f'S{i:02d}', 'type': 'shop', 'rent': Decimal('2000.00')}
                    for i in range(1, 11)
                ]
            },
        ]

        properties = []
        for pdata in properties_data:
            units_data = pdata.pop('units')
            prop, _ = Property.objects.get_or_create(
                name=pdata['name'],
                defaults=pdata
            )
            properties.append(prop)

            for udata in units_data:
                Unit.objects.get_or_create(
                    property=prop,
                    unit_number=udata['number'],
                    defaults={
                        'unit_type': udata['type'],
                        'rental_amount': udata['rent'],
                        'bedrooms': udata.get('bedrooms', 0),
                        'bathrooms': 1,
                        'is_available': True,
                    }
                )

        self.stdout.write(f'  Created {len(properties)} properties with units')
        return properties

    def _create_tenants(self):
        from apps.masterfile.models import RentalTenant

        tenants_data = [
            {'name': 'ABC Trading Co.', 'type': 'company', 'email': 'info@abctrading.co.zw', 'phone': '+263 77 111 2222'},
            {'name': 'James Chikomo', 'type': 'individual', 'email': 'jchikomo@gmail.com', 'phone': '+263 71 333 4444'},
            {'name': 'Grace Mutasa', 'type': 'individual', 'email': 'gmutasa@yahoo.com', 'phone': '+263 77 555 6666'},
            {'name': 'XYZ Consulting', 'type': 'company', 'email': 'hello@xyzconsulting.co.zw', 'phone': '+263 24 2700 456'},
            {'name': 'Fashion Hub Ltd', 'type': 'company', 'email': 'shop@fashionhub.co.zw', 'phone': '+263 77 999 0000'},
        ]

        tenants = []
        for data in tenants_data:
            tenant, _ = RentalTenant.objects.get_or_create(
                email=data['email'],
                defaults={
                    'name': data['name'],
                    'tenant_type': data['type'],
                    'phone': data['phone'],
                }
            )
            tenants.append(tenant)

        self.stdout.write(f'  Created {len(tenants)} rental tenants')
        return tenants

    def _create_leases(self, properties, tenants):
        from apps.masterfile.models import Unit, LeaseAgreement
        from apps.accounts.models import User

        admin = User.objects.filter(role='admin').first()
        today = timezone.now().date()
        start_date = today.replace(day=1) - timedelta(days=30)
        end_date = start_date.replace(year=start_date.year + 1)

        units = Unit.objects.filter(is_available=True)[:len(tenants)]
        leases_created = 0

        for unit, tenant in zip(units, tenants):
            lease, created = LeaseAgreement.objects.get_or_create(
                tenant=tenant,
                unit=unit,
                defaults={
                    'status': 'active',
                    'start_date': start_date,
                    'end_date': end_date,
                    'monthly_rent': unit.rental_amount,
                    'deposit_amount': unit.rental_amount * 2,
                    'deposit_paid': True,
                    'billing_day': 1,
                    'created_by': admin,
                }
            )
            if created:
                unit.is_occupied = True
                unit.is_available = False
                unit.save()
                leases_created += 1

        self.stdout.write(f'  Created {leases_created} lease agreements')
