"""
Management command to seed demo data for presentation.
Creates a demo tenant with realistic real estate data.
"""
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from datetime import date, timedelta
from apps.tenants.models import Client, Domain
from apps.accounts.models import User
from apps.accounting.models import ChartOfAccount, ExchangeRate
from apps.masterfile.models import Landlord, Property, Unit, RentalTenant, LeaseAgreement
from apps.billing.models import Invoice, Receipt


class Command(BaseCommand):
    help = 'Seed demo data for presentation'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant',
            type=str,
            default='demo',
            help='Tenant schema name'
        )
        parser.add_argument(
            '--skip-tenant-creation',
            action='store_true',
            help='Skip tenant creation (seed data in current schema context)'
        )

    def handle(self, *args, **options):
        from django_tenants.utils import tenant_context, schema_context
        from django.db import connection

        self.stdout.write('Seeding demo data...')

        # Check if we're already in a tenant context
        current_schema = connection.schema_name

        if options.get('skip_tenant_creation') or current_schema != 'public':
            # Seed data directly in current context
            self._seed_data_only(options)
            self.stdout.write(self.style.SUCCESS('Demo data seeded successfully!'))
            return

        # Create or get demo tenant
        tenant, created = Client.objects.get_or_create(
            schema_name=options['tenant'],
            defaults={
                'name': 'Harare Properties Ltd',
                'email': 'info@harareproperties.co.zw',
                'phone': '+263 24 2700 123',
                'address': '15 Samora Machel Ave, Harare',
                'subscription_plan': 'professional',
                'ai_accounting_enabled': True,
                'ai_reconciliation_enabled': True,
                'ai_reports_enabled': True,
                'ai_ocr_enabled': True,
            }
        )

        if created:
            Domain.objects.create(
                domain=f'{options["tenant"]}.localhost',
                tenant=tenant,
                is_primary=True
            )
            self.stdout.write(f'Created tenant: {tenant.name}')
        else:
            self.stdout.write(f'Using existing tenant: {tenant.name}')

        # Switch to tenant schema using context manager
        with tenant_context(tenant):
            self._seed_in_tenant(tenant, options)

        self.stdout.write(self.style.SUCCESS('Demo data seeded successfully!'))
        self.stdout.write('')
        self.stdout.write('Login credentials:')
        self.stdout.write('  Email: admin@harareproperties.co.zw')
        self.stdout.write('  Password: demo123')

    def _seed_data_only(self, options):
        """Seed demo data without creating tenant or admin user (they already exist)."""
        # Get existing admin user if any
        admin_user = User.objects.filter(role=User.Role.ADMIN).first()
        if not admin_user:
            admin_user = User.objects.first()

        # Seed Chart of Accounts
        self._seed_chart_of_accounts()

        # Seed Exchange Rates
        self._seed_exchange_rates()

        # Seed Landlords
        landlords = self._seed_landlords()

        # Seed Properties and Units
        properties = self._seed_properties(landlords)

        # Seed Tenants
        tenants = self._seed_tenants()

        # Seed Leases
        if admin_user:
            leases = self._seed_leases(properties, tenants, admin_user)
            # Seed Invoices and Receipts
            self._seed_transactions(leases, admin_user)

    def _seed_in_tenant(self, tenant, options):
        """Seed all data within tenant context."""
        # Create admin user
        admin_user, _ = User.objects.get_or_create(
            email='admin@harareproperties.co.zw',
            defaults={
                'first_name': 'Admin',
                'last_name': 'User',
                'role': User.Role.ADMIN,
                'is_staff': True,
                'is_superuser': True,
            }
        )
        admin_user.set_password('demo123')
        admin_user.save()
        self.stdout.write(f'Admin user: admin@harareproperties.co.zw / demo123')

        # Seed Chart of Accounts
        self._seed_chart_of_accounts()

        # Seed Exchange Rates
        self._seed_exchange_rates()

        # Seed Landlords
        landlords = self._seed_landlords()

        # Seed Properties and Units
        properties = self._seed_properties(landlords)

        # Seed Tenants
        tenants = self._seed_tenants()

        # Seed Leases
        leases = self._seed_leases(properties, tenants, admin_user)

        # Seed Invoices and Receipts
        self._seed_transactions(leases, admin_user)

    def _seed_chart_of_accounts(self):
        """Seed default chart of accounts."""
        defaults = [
            ('1000', 'Cash', 'asset', 'cash', True),
            ('1100', 'Bank - USD', 'asset', 'cash', True),
            ('1110', 'Bank - ZiG', 'asset', 'cash', True),
            ('1200', 'Accounts Receivable', 'asset', 'accounts_receivable', True),
            ('1300', 'Prepaid Expenses', 'asset', 'prepaid', True),
            ('2000', 'Accounts Payable', 'liability', 'accounts_payable', True),
            ('2100', 'VAT Payable', 'liability', 'vat_payable', True),
            ('2200', 'Tenant Deposits', 'liability', 'tenant_deposits', True),
            ('3000', 'Retained Earnings', 'equity', 'retained_earnings', True),
            ('3100', 'Capital', 'equity', 'capital', True),
            ('4000', 'Rental Income', 'revenue', 'rental_income', True),
            ('4100', 'Commission Income', 'revenue', 'commission_income', True),
            ('4200', 'Other Income', 'revenue', 'other_income', True),
            ('5000', 'Operating Expenses', 'expense', 'operating_expense', True),
            ('5100', 'Maintenance & Repairs', 'expense', 'maintenance', True),
            ('5200', 'Utilities', 'expense', 'utilities', True),
        ]

        for code, name, acc_type, subtype, is_system in defaults:
            ChartOfAccount.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'account_type': acc_type,
                    'account_subtype': subtype,
                    'is_system': is_system
                }
            )
        self.stdout.write('  - Chart of Accounts seeded')

    def _seed_exchange_rates(self):
        """Seed exchange rates."""
        today = timezone.now().date()
        ExchangeRate.objects.get_or_create(
            from_currency='USD',
            to_currency='ZiG',
            effective_date=today,
            defaults={
                'rate': Decimal('13.50'),
                'source': 'RBZ Official'
            }
        )
        self.stdout.write('  - Exchange rates seeded')

    def _seed_landlords(self):
        """Seed landlords."""
        landlords_data = [
            {
                'name': 'John Moyo Investments',
                'landlord_type': 'company',
                'email': 'john.moyo@email.co.zw',
                'phone': '+263 77 234 5678',
                'address': '23 Enterprise Road, Harare',
                'bank_name': 'CBZ Bank',
                'account_number': '1234567890',
                'commission_rate': Decimal('10.00'),
            },
            {
                'name': 'Sarah Ndlovu',
                'landlord_type': 'individual',
                'email': 'sarah.ndlovu@gmail.com',
                'phone': '+263 71 987 6543',
                'address': '45 Borrowdale Road, Harare',
                'bank_name': 'Stanbic Bank',
                'account_number': '0987654321',
                'commission_rate': Decimal('8.00'),
            },
            {
                'name': 'Chiedza Properties Trust',
                'landlord_type': 'trust',
                'email': 'info@chiedzaproperties.co.zw',
                'phone': '+263 24 2792 100',
                'address': '10 Kwame Nkrumah Ave, Harare',
                'bank_name': 'FBC Bank',
                'account_number': '5678901234',
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

        self.stdout.write(f'  - {len(landlords)} landlords seeded')
        return landlords

    def _seed_properties(self, landlords):
        """Seed properties and units."""
        properties_data = [
            {
                'landlord': landlords[0],
                'name': 'Eastgate Complex',
                'property_type': 'commercial',
                'address': '2nd Street, Harare CBD',
                'city': 'Harare',
                'suburb': 'CBD',
                'total_units': 12,
                'units': [
                    {'number': f'E{i:02d}', 'type': 'office', 'rent': Decimal('1500.00'), 'bedrooms': 0}
                    for i in range(1, 13)
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
                'total_units': 15,
                'units': [
                    {'number': f'S{i:02d}', 'type': 'shop', 'rent': Decimal('2000.00'), 'bedrooms': 0}
                    for i in range(1, 16)
                ]
            },
            {
                'landlord': landlords[0],
                'name': 'Highlands Apartments',
                'property_type': 'residential',
                'address': '50 Highlands Drive',
                'city': 'Harare',
                'suburb': 'Highlands',
                'total_units': 20,
                'units': [
                    {'number': f'{i:02d}', 'type': 'apartment', 'rent': Decimal('650.00'), 'bedrooms': 1}
                    for i in range(1, 11)
                ] + [
                    {'number': f'{i:02d}', 'type': 'apartment', 'rent': Decimal('950.00'), 'bedrooms': 2}
                    for i in range(11, 21)
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
                        'bedrooms': udata['bedrooms'],
                        'bathrooms': 1,
                    }
                )

        self.stdout.write(f'  - {len(properties)} properties with units seeded')
        return properties

    def _seed_tenants(self):
        """Seed rental tenants."""
        tenants_data = [
            {'name': 'ABC Trading Co.', 'type': 'company', 'email': 'info@abctrading.co.zw', 'phone': '+263 77 111 2222', 'id_type': 'company_reg', 'id_number': 'CR2020/1234'},
            {'name': 'James Chikomo', 'type': 'individual', 'email': 'jchikomo@gmail.com', 'phone': '+263 71 333 4444', 'id_type': 'national_id', 'id_number': '63-123456-A-12'},
            {'name': 'Grace Mutasa', 'type': 'individual', 'email': 'gmutasa@yahoo.com', 'phone': '+263 77 555 6666', 'id_type': 'national_id', 'id_number': '63-789012-B-34'},
            {'name': 'XYZ Consulting', 'type': 'company', 'email': 'hello@xyzconsulting.co.zw', 'phone': '+263 24 2700 456', 'id_type': 'company_reg', 'id_number': 'CR2019/5678'},
            {'name': 'Peter Banda', 'type': 'individual', 'email': 'pbanda@gmail.com', 'phone': '+263 71 777 8888', 'id_type': 'national_id', 'id_number': '63-345678-C-56'},
            {'name': 'Fashion Hub Ltd', 'type': 'company', 'email': 'shop@fashionhub.co.zw', 'phone': '+263 77 999 0000', 'id_type': 'company_reg', 'id_number': 'CR2021/9012'},
            {'name': 'Tendai Mapfumo', 'type': 'individual', 'email': 'tmapfumo@email.com', 'phone': '+263 71 123 4567', 'id_type': 'national_id', 'id_number': '63-901234-D-78'},
            {'name': 'Tech Solutions', 'type': 'company', 'email': 'support@techsolutions.co.zw', 'phone': '+263 24 2792 789', 'id_type': 'company_reg', 'id_number': 'CR2022/3456'},
        ]

        tenants = []
        for data in tenants_data:
            tenant, _ = RentalTenant.objects.get_or_create(
                email=data['email'],
                defaults={
                    'name': data['name'],
                    'tenant_type': data['type'],
                    'phone': data['phone'],
                    'id_type': data['id_type'],
                    'id_number': data['id_number'],
                }
            )
            tenants.append(tenant)

        self.stdout.write(f'  - {len(tenants)} tenants seeded')
        return tenants

    def _seed_leases(self, properties, tenants, user):
        """Seed lease agreements."""
        today = timezone.now().date()
        start_date = today.replace(day=1) - timedelta(days=60)
        end_date = start_date.replace(year=start_date.year + 1)

        units = Unit.objects.all()[:len(tenants)]
        leases = []

        for i, (unit, tenant) in enumerate(zip(units, tenants)):
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
                    'created_by': user,
                }
            )

            if created:
                unit.is_occupied = True
                unit.save()

            leases.append(lease)

        self.stdout.write(f'  - {len(leases)} leases seeded')
        return leases

    def _seed_transactions(self, leases, user):
        """Seed invoices and receipts."""
        today = timezone.now().date()

        invoices_created = 0
        receipts_created = 0

        for lease in leases:
            # Create invoices for last 3 months
            for month_offset in range(3):
                invoice_date = today.replace(day=1) - timedelta(days=30 * month_offset)
                due_date = invoice_date.replace(day=15)

                period_start = invoice_date.replace(day=1)
                if period_start.month == 12:
                    period_end = period_start.replace(year=period_start.year + 1, month=1, day=1) - timedelta(days=1)
                else:
                    period_end = period_start.replace(month=period_start.month + 1, day=1) - timedelta(days=1)

                invoice, created = Invoice.objects.get_or_create(
                    lease=lease,
                    period_start=period_start,
                    defaults={
                        'tenant': lease.tenant,
                        'unit': lease.unit,
                        'invoice_type': 'rent',
                        'status': 'paid' if month_offset > 0 else 'sent',
                        'date': invoice_date,
                        'due_date': due_date,
                        'period_end': period_end,
                        'amount': lease.monthly_rent,
                        'vat_amount': Decimal('0'),
                        'currency': 'USD',
                        'description': f'Rent for {period_start.strftime("%B %Y")}',
                        'created_by': user,
                    }
                )

                if created:
                    invoices_created += 1

                    # Create receipt for paid invoices
                    if invoice.status == 'paid':
                        receipt, rcreated = Receipt.objects.get_or_create(
                            invoice=invoice,
                            defaults={
                                'tenant': lease.tenant,
                                'date': due_date + timedelta(days=2),
                                'amount': lease.monthly_rent,
                                'currency': 'USD',
                                'payment_method': 'bank_transfer',
                                'reference': f'TRF{invoice_date.strftime("%Y%m")}{lease.tenant.code}',
                                'description': f'Payment for {invoice.invoice_number}',
                                'created_by': user,
                            }
                        )

                        if rcreated:
                            receipts_created += 1
                            invoice.amount_paid = invoice.total_amount
                            invoice.save()

        self.stdout.write(f'  - {invoices_created} invoices and {receipts_created} receipts seeded')
