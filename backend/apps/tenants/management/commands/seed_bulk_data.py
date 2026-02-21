"""
Management command to seed 10k+ records for load testing.
Creates landlords, properties, units, rental tenants, leases, invoices, receipts.
Uses bulk_create for speed.
"""
import random
import string
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone
from django_tenants.utils import tenant_context, get_tenant_model


# Zimbabwe-realistic data pools
FIRST_NAMES = [
    'Tatenda', 'Rumbidzai', 'Tonderai', 'Chipo', 'Farai', 'Nyasha', 'Tendai',
    'Kudakwashe', 'Rudo', 'Tinashe', 'Shamiso', 'Tapiwa', 'Anesu', 'Rutendo',
    'Blessing', 'Tariro', 'Kudzai', 'Makanaka', 'Munashe', 'Panashe',
    'Grace', 'Peter', 'James', 'Sarah', 'Mary', 'John', 'Brian', 'Linda',
    'Michael', 'Patricia', 'David', 'Susan', 'Robert', 'Karen', 'Thomas',
]
LAST_NAMES = [
    'Moyo', 'Ndlovu', 'Ncube', 'Dube', 'Sibanda', 'Nkomo', 'Mpofu',
    'Nyoni', 'Chirwa', 'Banda', 'Phiri', 'Mwale', 'Tembo', 'Zimba',
    'Chikomo', 'Mutasa', 'Mapfumo', 'Chipunza', 'Hove', 'Gumbo',
    'Manyika', 'Zvobgo', 'Chidemo', 'Mugabe', 'Tsvangirai', 'Masoka',
    'Chidziva', 'Matongo', 'Rusvingo', 'Chimuka', 'Zengeni', 'Kahonde',
]
COMPANY_SUFFIXES = [
    'Properties', 'Investments', 'Holdings', 'Trust', 'Estates',
    'Realty', 'Development', 'Group', 'Capital', 'Corp', 'Ltd',
]
SUBURBS = [
    'Avondale', 'Borrowdale', 'Highlands', 'Mabelreign', 'Mount Pleasant',
    'Eastlea', 'Belgravia', 'Greendale', 'Hatfield', 'Marlborough',
    'Waterfalls', 'Glen Lorne', 'Chisipite', 'Greystone Park', 'Emerald Hill',
    'Newlands', 'Vainona', 'Mandara', 'Msasa', 'Graniteside',
    'Willowvale', 'Bluff Hill', 'Sentosa', 'Glen Norah', 'Budiriro',
]
STREETS = [
    'Enterprise Rd', 'Samora Machel Ave', 'Julius Nyerere Way', 'Borrowdale Rd',
    'King George Rd', 'Churchill Ave', 'Harare Dr', 'Airport Rd',
    'Mutare Rd', 'Masvingo Rd', 'Bulawayo Rd', 'Chiremba Rd',
]
PROPERTY_NAMES = [
    'Park', 'Gardens', 'Towers', 'Court', 'Heights', 'View', 'Place',
    'Complex', 'Mall', 'Center', 'House', 'Square', 'Terrace', 'Residences',
]
BANK_NAMES = ['CBZ Bank', 'Stanbic Bank', 'FBC Bank', 'NMB Bank', 'ZB Bank', 'Steward Bank', 'BancABC']
INVOICE_TYPES = ['rent', 'levy', 'parking', 'utility', 'maintenance', 'rates']
PAYMENT_METHODS = ['cash', 'bank_transfer', 'ecocash', 'card']


class Command(BaseCommand):
    help = 'Seed ~10k records per table for load testing'

    def add_arguments(self, parser):
        parser.add_argument('--tenant', type=str, default='demo', help='Tenant schema name')
        parser.add_argument('--landlords', type=int, default=50, help='Number of landlords')
        parser.add_argument('--properties-per-landlord', type=int, default=4, help='Properties per landlord')
        parser.add_argument('--units-per-property', type=int, default=50, help='Units per property')
        parser.add_argument('--invoices-per-lease', type=int, default=3, help='Invoice months per lease')

    def handle(self, *args, **options):
        TenantModel = get_tenant_model()
        try:
            tenant = TenantModel.objects.get(schema_name=options['tenant'])
        except TenantModel.DoesNotExist:
            self.stderr.write(f"Tenant '{options['tenant']}' not found")
            return

        with tenant_context(tenant):
            self._seed(options)

    def _seed(self, options):
        from apps.masterfile.models import Landlord, Property, Unit, RentalTenant, LeaseAgreement
        from apps.billing.models import Invoice, Receipt
        from apps.accounts.models import User

        admin_user = User.objects.filter(role='admin').first() or User.objects.first()
        if not admin_user:
            self.stderr.write('No user found in tenant schema')
            return

        n_landlords = options['landlords']
        n_props_per = options['properties_per_landlord']
        n_units_per = options['units_per_property']
        n_inv_months = options['invoices_per_lease']

        total_props = n_landlords * n_props_per
        total_units = total_props * n_units_per
        self.stdout.write(f'Plan: {n_landlords} landlords, {total_props} properties, '
                          f'{total_units} units, ~{total_units} tenants/leases, '
                          f'~{total_units * n_inv_months} invoices/receipts')

        # --- LANDLORDS ---
        self.stdout.write('Creating landlords...')
        existing_ll = Landlord.objects.count()
        landlords = []
        for i in range(n_landlords):
            idx = existing_ll + i + 1
            ll_type = random.choice(['individual', 'company', 'trust'])
            if ll_type == 'company':
                name = f'{random.choice(LAST_NAMES)} {random.choice(COMPANY_SUFFIXES)}'
            else:
                name = f'{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}'
            landlords.append(Landlord(
                code=f'LL{idx:05d}',
                name=f'{name} #{idx}',
                landlord_type=ll_type,
                email=f'landlord{idx}@loadtest.co.zw',
                phone=f'+263 7{random.randint(1,9)} {random.randint(100,999)} {random.randint(1000,9999)}',
                address=f'{random.randint(1,200)} {random.choice(STREETS)}, {random.choice(SUBURBS)}',
                bank_name=random.choice(BANK_NAMES),
                account_number=f'{random.randint(1000000000, 9999999999)}',
                commission_rate=Decimal(str(random.choice([8, 10, 12, 15]))),
                is_active=True,
            ))
        Landlord.objects.bulk_create(landlords, batch_size=500)
        landlords = list(Landlord.objects.order_by('-id')[:n_landlords])
        self.stdout.write(self.style.SUCCESS(f'  {len(landlords)} landlords created'))

        # --- PROPERTIES ---
        self.stdout.write('Creating properties...')
        existing_p = Property.objects.count()
        properties = []
        prop_idx = 0
        for ll in landlords:
            for j in range(n_props_per):
                prop_idx += 1
                idx = existing_p + prop_idx
                ptype = random.choice(['residential', 'commercial', 'mixed'])
                suburb = random.choice(SUBURBS)
                pname_suffix = random.choice(PROPERTY_NAMES)
                properties.append(Property(
                    landlord=ll,
                    code=f'PROP{idx:05d}',
                    name=f'{suburb} {pname_suffix} #{idx}',
                    property_type=ptype,
                    address=f'{random.randint(1,300)} {random.choice(STREETS)}',
                    city='Harare',
                    suburb=suburb,
                    total_units=n_units_per,
                    is_active=True,
                ))
        Property.objects.bulk_create(properties, batch_size=500)
        properties = list(Property.objects.order_by('-id')[:total_props])
        self.stdout.write(self.style.SUCCESS(f'  {len(properties)} properties created'))

        # --- UNITS ---
        # Build units keeping local property references (avoid FK lazy loads)
        self.stdout.write('Creating units...')
        unit_objects = []
        # Map: index -> property object (for later use without FK access)
        unit_prop_map = {}
        unit_idx = 0
        for prop in properties:
            for u in range(1, n_units_per + 1):
                utype = 'apartment' if prop.property_type == 'residential' else random.choice(['office', 'shop'])
                rent = Decimal(str(random.choice([500, 650, 800, 950, 1200, 1500, 2000, 2500])))
                unit_objects.append(Unit(
                    property_id=prop.id,
                    code=f'{prop.code}-{u:03d}',
                    unit_number=f'{u:03d}',
                    unit_type=utype,
                    floor=((u - 1) // 10) + 1,
                    bedrooms=random.randint(0, 3) if utype == 'apartment' else 0,
                    bathrooms=1,
                    rental_amount=rent,
                    is_occupied=True,
                    is_active=True,
                ))
                unit_prop_map[unit_idx] = prop
                unit_idx += 1
        Unit.objects.bulk_create(unit_objects, batch_size=2000)
        # Refetch with IDs (use select_related to avoid lazy loading)
        units = list(Unit.objects.select_related('property').order_by('-id')[:total_units])
        units.reverse()  # oldest first
        self.stdout.write(self.style.SUCCESS(f'  {len(units)} units created'))

        # --- RENTAL TENANTS ---
        self.stdout.write('Creating rental tenants...')
        existing_tn = RentalTenant.objects.count()
        rt_objects = []
        for i in range(len(units)):
            idx = existing_tn + i + 1
            ttype = random.choice(['individual', 'company'])
            if ttype == 'company':
                name = f'{random.choice(LAST_NAMES)} {random.choice(["Trading", "Services", "Solutions", "Enterprises"])} #{idx}'
            else:
                name = f'{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)} #{idx}'
            rt_objects.append(RentalTenant(
                code=f'TN{idx:06d}',
                name=name,
                tenant_type=ttype,
                email=f'tenant{idx}@loadtest.co.zw',
                phone=f'+263 7{random.randint(1,9)} {random.randint(100,999)} {random.randint(1000,9999)}',
                id_type='company_reg' if ttype == 'company' else 'national_id',
                id_number=f'CR{random.randint(2015,2025)}/{idx:05d}' if ttype == 'company' else f'63-{random.randint(100000,999999)}-{random.choice(string.ascii_uppercase)}-{random.randint(10,99)}',
                is_active=True,
            ))
        RentalTenant.objects.bulk_create(rt_objects, batch_size=2000)
        rental_tenants = list(RentalTenant.objects.order_by('-id')[:total_units])
        rental_tenants.reverse()
        self.stdout.write(self.style.SUCCESS(f'  {len(rental_tenants)} rental tenants created'))

        # --- LEASES ---
        # Use _id fields to avoid FK lazy loading
        self.stdout.write('Creating leases...')
        today = timezone.now().date()
        start_base = date(today.year, 1, 1)
        end_base = date(today.year, 12, 31)
        existing_ls = LeaseAgreement.objects.count()
        lease_objects = []
        # Keep local data for invoice creation (unit_id, property_id, tenant_id, rent)
        lease_local_data = []
        for i, (unit, rt) in enumerate(zip(units, rental_tenants)):
            idx = existing_ls + i + 1
            lease_objects.append(LeaseAgreement(
                tenant_id=rt.id,
                unit_id=unit.id,
                property_id=unit.property_id,
                lease_number=f'LS{today.strftime("%Y%m")}{idx:06d}',
                status='active',
                start_date=start_base,
                end_date=end_base,
                monthly_rent=unit.rental_amount,
                deposit_amount=unit.rental_amount * 2,
                deposit_paid=True,
                billing_day=1,
                created_by=admin_user,
            ))
            lease_local_data.append({
                'tenant_id': rt.id,
                'unit_id': unit.id,
                'property_id': unit.property_id,
                'monthly_rent': unit.rental_amount,
            })
        LeaseAgreement.objects.bulk_create(lease_objects, batch_size=2000)
        # Refetch lease IDs
        lease_ids = list(LeaseAgreement.objects.order_by('-id').values_list('id', flat=True)[:total_units])
        lease_ids.reverse()
        self.stdout.write(self.style.SUCCESS(f'  {len(lease_ids)} leases created'))

        # --- INVOICES ---
        self.stdout.write('Creating invoices...')
        inv_objects = []
        inv_counter = Invoice.all_objects.count()
        # Track which invoices are "paid" for receipt creation
        paid_invoice_data = []
        for month_offset in range(n_inv_months):
            m = today.month - month_offset
            y = today.year
            while m < 1:
                m += 12
                y -= 1
            period_start = date(y, m, 1)
            if m == 12:
                period_end = date(y, 12, 31)
            else:
                period_end = date(y, m + 1, 1) - timedelta(days=1)
            inv_date = period_start
            due_date = date(y, m, 15)
            is_past = month_offset > 0

            for j, (lease_id, ld) in enumerate(zip(lease_ids, lease_local_data)):
                inv_counter += 1
                inv_type = random.choice(INVOICE_TYPES) if random.random() < 0.3 else 'rent'
                inv_num = f'INV{y}{m:02d}{inv_counter:06d}'
                inv_objects.append(Invoice(
                    invoice_number=inv_num,
                    tenant_id=ld['tenant_id'],
                    lease_id=lease_id,
                    unit_id=ld['unit_id'],
                    property_id=ld['property_id'],
                    invoice_type=inv_type,
                    status='paid' if is_past else 'sent',
                    date=inv_date,
                    due_date=due_date,
                    period_start=period_start,
                    period_end=period_end,
                    amount=ld['monthly_rent'],
                    vat_amount=Decimal('0'),
                    total_amount=ld['monthly_rent'],
                    amount_paid=ld['monthly_rent'] if is_past else Decimal('0'),
                    balance=Decimal('0') if is_past else ld['monthly_rent'],
                    currency='USD',
                    description=f'Rent for {period_start.strftime("%B %Y")}',
                    created_by=admin_user,
                ))
                if is_past:
                    paid_invoice_data.append({
                        'inv_num': inv_num,
                        'tenant_id': ld['tenant_id'],
                        'amount': ld['monthly_rent'],
                        'due_date': due_date,
                    })
        Invoice.objects.bulk_create(inv_objects, batch_size=2000)
        self.stdout.write(self.style.SUCCESS(f'  {len(inv_objects)} invoices created'))

        # --- RECEIPTS ---
        self.stdout.write('Creating receipts...')
        # Fetch paid invoice PKs
        paid_invoices = Invoice.objects.filter(status='paid').order_by('-id').values_list('id', 'tenant_id', 'amount', 'due_date', 'invoice_number')[:len(paid_invoice_data)]
        rct_counter = Receipt.all_objects.count()
        rct_objects = []
        for inv_id, tenant_id, amount, due_dt, inv_num in paid_invoices:
            rct_counter += 1
            rct_objects.append(Receipt(
                receipt_number=f'RCT{due_dt.year}{due_dt.month:02d}{rct_counter:06d}',
                tenant_id=tenant_id,
                invoice_id=inv_id,
                date=due_dt + timedelta(days=random.randint(0, 5)),
                amount=amount,
                currency='USD',
                payment_method=random.choice(PAYMENT_METHODS),
                reference=f'PAY-{rct_counter:06d}',
                description=f'Payment for {inv_num}',
                created_by=admin_user,
            ))
        Receipt.objects.bulk_create(rct_objects, batch_size=2000)
        self.stdout.write(self.style.SUCCESS(f'  {len(rct_objects)} receipts created'))

        # --- SUMMARY ---
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=== Bulk seed complete ==='))
        self.stdout.write(f'  Landlords:      {Landlord.objects.count()}')
        self.stdout.write(f'  Properties:     {Property.objects.count()}')
        self.stdout.write(f'  Units:          {Unit.objects.count()}')
        self.stdout.write(f'  Rental Tenants: {RentalTenant.objects.count()}')
        self.stdout.write(f'  Leases:         {LeaseAgreement.objects.count()}')
        self.stdout.write(f'  Invoices:       {Invoice.objects.count()}')
        self.stdout.write(f'  Receipts:       {Receipt.objects.count()}')
