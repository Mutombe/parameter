"""
Company Onboarding Service.
Handles the multi-step registration process for new real estate companies.
"""
import logging
from django.db import transaction
from django.core.mail import send_mail
from django.conf import settings
from django.template.loader import render_to_string
from django_tenants.utils import tenant_context
from .models import Client, Domain

logger = logging.getLogger(__name__)


class OnboardingService:
    """
    Multi-step onboarding service for new companies.

    Steps:
    1. Company Registration (create tenant)
    2. Admin User Creation
    3. Initial Chart of Accounts Setup
    4. Welcome Email
    """

    def __init__(self):
        self.errors = []

    @transaction.atomic
    def register_company(self, company_data: dict, admin_data: dict, setup_options: dict = None):
        """
        Complete company registration with all setup steps.

        Args:
            company_data: {
                'name': str,
                'subdomain': str,
                'email': str,
                'phone': str (optional),
                'address': str (optional),
                'subscription_plan': str (optional, default 'free'),
                'default_currency': str (optional, default 'USD')
            }
            admin_data: {
                'email': str,
                'password': str,
                'first_name': str,
                'last_name': str,
                'phone': str (optional)
            }
            setup_options: {
                'create_sample_coa': bool (default True),
                'send_welcome_email': bool (default True),
                'industry_template': str (optional),
                'is_demo': bool (default False),
                'seed_demo_data': bool (default False)
            }

        Returns:
            dict with success status and created objects
        """
        setup_options = setup_options or {}
        is_demo = setup_options.get('is_demo', False)

        try:
            # Step 1: Create the tenant (company)
            client = self._create_tenant(company_data, is_demo=is_demo)

            # Step 2: Create admin user within tenant context
            admin_user = self._create_admin_user(client, admin_data, is_demo=is_demo)

            # Step 3: Set up initial chart of accounts
            if setup_options.get('create_sample_coa', True):
                self._setup_chart_of_accounts(client)

            # Step 4: Seed demo data if requested
            if setup_options.get('seed_demo_data', False):
                self._seed_demo_data(client)

            # Step 5: Send welcome email
            if setup_options.get('send_welcome_email', True):
                self._send_welcome_email(client, admin_user, is_demo=is_demo)

            # Build tenant URL using settings
            login_url = self._build_tenant_url(company_data['subdomain'])

            result = {
                'success': True,
                'tenant': {
                    'id': client.id,
                    'name': client.name,
                    'schema_name': client.schema_name,
                    'subdomain': company_data['subdomain'],
                    'is_demo': is_demo
                },
                'admin': {
                    'id': admin_user.id,
                    'email': admin_user.email,
                    'name': admin_user.get_full_name()
                },
                'login_url': login_url
            }

            if is_demo:
                result['tenant']['demo_expires_at'] = client.demo_expires_at.isoformat() if client.demo_expires_at else None

            return result

        except Exception as e:
            logger.error(f"Onboarding failed: {e}")
            self.errors.append(str(e))
            raise

    def _create_tenant(self, company_data: dict, is_demo: bool = False) -> Client:
        """Create the tenant/company record."""
        from datetime import timedelta
        from django.utils import timezone

        subdomain = company_data['subdomain'].lower().strip()
        schema_name = subdomain.replace('-', '_').replace(' ', '_')

        # Validate subdomain
        if Client.objects.filter(schema_name=schema_name).exists():
            raise ValueError(f"Subdomain '{subdomain}' is already taken")

        if Domain.objects.filter(domain__icontains=subdomain).exists():
            raise ValueError(f"Domain with '{subdomain}' already exists")

        # Set demo expiry (2 hours from now)
        demo_expires_at = None
        account_status = Client.AccountStatus.ACTIVE
        if is_demo:
            demo_expires_at = timezone.now() + timedelta(hours=2)
            account_status = Client.AccountStatus.ACTIVE  # Demo starts active

        # Create client
        client = Client.objects.create(
            schema_name=schema_name,
            name=company_data['name'],
            email=company_data['email'],
            phone=company_data.get('phone', ''),
            address=company_data.get('address', ''),
            subscription_plan=company_data.get('subscription_plan', 'free'),
            default_currency=company_data.get('default_currency', 'USD'),
            is_active=True,
            is_demo=is_demo,
            demo_expires_at=demo_expires_at,
            account_status=account_status,
            ai_accounting_enabled=True,
            ai_reconciliation_enabled=True,
            ai_reports_enabled=True,
            ai_ocr_enabled=True
        )

        # Create domain with configurable suffix
        domain_suffix = getattr(settings, 'TENANT_DOMAIN_SUFFIX', 'localhost')
        Domain.objects.create(
            domain=f'{subdomain}.{domain_suffix}',
            tenant=client,
            is_primary=True
        )

        logger.info(f"Created tenant: {client.name} ({schema_name}) {'[DEMO]' if is_demo else ''}")
        return client

    def _create_admin_user(self, client: Client, admin_data: dict, is_demo: bool = False):
        """Create the company admin user within tenant context."""
        from apps.accounts.models import User

        with tenant_context(client):
            # Check if user already exists
            if User.objects.filter(email=admin_data['email']).exists():
                raise ValueError(f"User with email {admin_data['email']} already exists")

            user = User.objects.create_user(
                email=admin_data['email'],
                password=admin_data['password'],
                first_name=admin_data['first_name'],
                last_name=admin_data['last_name'],
                phone=admin_data.get('phone', ''),
                role=User.Role.ADMIN,
                is_staff=True,
                preferred_currency=client.default_currency,
                is_demo_user=is_demo,
                account_status=User.AccountStatus.ACTIVE,
                tenant_schema=client.schema_name,
            )

            logger.info(f"Created admin user: {user.email} for {client.name} {'[DEMO]' if is_demo else ''}")
            return user

    def _setup_chart_of_accounts(self, client: Client):
        """Set up initial chart of accounts for the company."""
        from apps.accounting.models import ChartOfAccount

        # Standard Real Estate Chart of Accounts
        # Format: (code, name, account_type, account_subtype, is_system, currency)
        accounts = [
            # Assets (1xxx)
            ('1000', 'Cash and Cash Equivalents', 'asset', 'cash', True, 'USD'),
            ('1010', 'Petty Cash', 'asset', 'cash', True, 'USD'),
            ('1100', 'Accounts Receivable - Tenants', 'asset', 'accounts_receivable', True, 'USD'),
            ('1110', 'Accounts Receivable - Other', 'asset', 'accounts_receivable', False, 'USD'),
            ('1200', 'Prepaid Expenses', 'asset', 'prepaid', False, 'USD'),
            ('1300', 'Security Deposits Held', 'asset', 'prepaid', False, 'USD'),
            ('1500', 'Property and Equipment', 'asset', 'fixed_asset', False, 'USD'),
            ('1510', 'Accumulated Depreciation', 'asset', 'fixed_asset', False, 'USD'),

            # Liabilities (2xxx)
            ('2000', 'Accounts Payable', 'liability', 'accounts_payable', True, 'USD'),
            ('2100', 'Landlord Payables', 'liability', 'accounts_payable', True, 'USD'),
            ('2200', 'Tenant Deposits Liability', 'liability', 'tenant_deposits', True, 'USD'),
            ('2300', 'Accrued Expenses', 'liability', 'accounts_payable', False, 'USD'),
            ('2400', 'VAT Payable', 'liability', 'vat_payable', True, 'USD'),
            ('2500', 'Deferred Revenue', 'liability', 'accounts_payable', False, 'USD'),

            # Equity (3xxx)
            ('3000', 'Owner Capital', 'equity', 'capital', True, 'USD'),
            ('3100', 'Retained Earnings', 'equity', 'retained_earnings', True, 'USD'),
            ('3200', 'Owner Drawings', 'equity', 'capital', False, 'USD'),

            # Revenue (4xxx) - USD
            ('4000', 'Rental Income', 'revenue', 'rental_income', True, 'USD'),
            ('4010', 'Late Fee Income', 'revenue', 'other_income', False, 'USD'),
            ('4020', 'Service Fee Income', 'revenue', 'other_income', False, 'USD'),
            ('4100', 'Management Fee Income', 'revenue', 'commission_income', False, 'USD'),
            ('4200', 'Commission Income', 'revenue', 'commission_income', True, 'USD'),
            ('4900', 'Other Income', 'revenue', 'other_income', True, 'USD'),

            # Revenue (4xxxZ) - ZWG variants
            ('4000Z', 'Rental Income (ZWG)', 'revenue', 'rental_income', True, 'ZWG'),
            ('4010Z', 'Late Fee Income (ZWG)', 'revenue', 'other_income', False, 'ZWG'),
            ('4020Z', 'Service Fee Income (ZWG)', 'revenue', 'other_income', False, 'ZWG'),
            ('4100Z', 'Management Fee Income (ZWG)', 'revenue', 'commission_income', False, 'ZWG'),
            ('4200Z', 'Commission Income (ZWG)', 'revenue', 'commission_income', True, 'ZWG'),
            ('4900Z', 'Other Income (ZWG)', 'revenue', 'other_income', True, 'ZWG'),

            # Expenses (5xxx)
            ('5000', 'Property Management Expenses', 'expense', 'operating_expense', True, 'USD'),
            ('5100', 'Repairs and Maintenance', 'expense', 'maintenance', True, 'USD'),
            ('5200', 'Utilities Expense', 'expense', 'utilities', True, 'USD'),
            ('5300', 'Insurance Expense', 'expense', 'operating_expense', False, 'USD'),
            ('5400', 'Property Taxes', 'expense', 'operating_expense', False, 'USD'),
            ('5500', 'Legal and Professional Fees', 'expense', 'operating_expense', False, 'USD'),
            ('5600', 'Advertising and Marketing', 'expense', 'operating_expense', False, 'USD'),
            ('5700', 'Salaries and Wages', 'expense', 'operating_expense', False, 'USD'),
            ('5800', 'Office Expenses', 'expense', 'operating_expense', False, 'USD'),
            ('5900', 'Depreciation Expense', 'expense', 'operating_expense', False, 'USD'),
            ('5950', 'Bad Debt Expense', 'expense', 'operating_expense', False, 'USD'),
            ('5999', 'Miscellaneous Expense', 'expense', 'operating_expense', False, 'USD'),
        ]

        with tenant_context(client):
            for code, name, acc_type, subtype, is_system, currency in accounts:
                ChartOfAccount.objects.get_or_create(
                    code=code,
                    defaults={
                        'name': name,
                        'account_type': acc_type,
                        'account_subtype': subtype,
                        'is_system': is_system,
                        'is_active': True,
                        'currency': currency,
                    }
                )

            logger.info(f"Created {len(accounts)} chart of accounts for {client.name}")

    def _seed_demo_data(self, client: Client):
        """Seed demo data for the tenant."""
        try:
            from django.core.management import call_command

            with tenant_context(client):
                # Call the seed_demo_data management command
                call_command('seed_demo_data', verbosity=0)

            logger.info(f"Demo data seeded for {client.name}")

        except Exception as e:
            logger.warning(f"Failed to seed demo data: {e}")
            # Don't raise - demo data seeding is not critical

    def _send_welcome_email(self, client: Client, admin_user, is_demo: bool = False):
        """Send welcome email to the new company admin."""
        try:
            if is_demo:
                subject = f'Your Demo Account is Ready - {client.name}'
                demo_message = """
IMPORTANT: This is a demo account.
Your demo will expire in 2 hours. All data will be preserved but you won't be able to log in until your account is activated.

To continue using Parameter after the demo, please contact our sales team.
"""
            else:
                subject = f'Welcome to Parameter.co.zw - {client.name}'
                demo_message = ""

            login_url = self._build_tenant_url(client.schema_name)
            message = f"""
Hello {admin_user.get_full_name()},

Welcome to Parameter.co.zw - Your Real Estate Accounting Platform!

Your company "{client.name}" has been successfully registered.
{demo_message}
Login Details:
- URL: {login_url}
- Email: {admin_user.email}

Getting Started:
1. Log in to your account
2. Set up your landlords and properties
3. Add tenants and create lease agreements
4. Start generating invoices

Features Available:
- Double-Entry Accounting with Real Estate-specific Chart of Accounts
- Automated Monthly Billing
- AI-Powered Reports and Reconciliation
- OCR Document Extraction for Leases and Invoices
- Multi-Currency Support (USD & ZiG)

Need Help?
Visit our documentation or contact support@parameter.co.zw

Best regards,
The Parameter Team
"""

            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[admin_user.email, client.email],
                fail_silently=True
            )

            logger.info(f"Welcome email sent to {admin_user.email}")

        except Exception as e:
            logger.warning(f"Failed to send welcome email: {e}")

    def validate_subdomain(self, subdomain: str) -> dict:
        """Validate if a subdomain is available."""
        subdomain = subdomain.lower().strip()
        schema_name = subdomain.replace('-', '_').replace(' ', '_')

        # Check format
        if not subdomain.isalnum() and '-' not in subdomain:
            return {
                'valid': False,
                'available': False,
                'error': 'Subdomain can only contain letters, numbers, and hyphens'
            }

        if len(subdomain) < 3:
            return {
                'valid': False,
                'available': False,
                'error': 'Subdomain must be at least 3 characters'
            }

        if len(subdomain) > 30:
            return {
                'valid': False,
                'available': False,
                'error': 'Subdomain must be 30 characters or less'
            }

        # Reserved subdomains
        reserved = ['www', 'api', 'admin', 'app', 'mail', 'public', 'static', 'assets']
        if subdomain in reserved:
            return {
                'valid': True,
                'available': False,
                'error': 'This subdomain is reserved'
            }

        # Check database using fully-qualified table name to bypass search_path issues
        try:
            from django.db import connection
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT EXISTS(SELECT 1 FROM public.tenants_client WHERE schema_name = %s)",
                    [schema_name]
                )
                exists = cursor.fetchone()[0]

            is_available = not exists

            return {
                'valid': True,
                'available': is_available,
                'error': None if is_available else 'This subdomain is already taken'
            }
        except Exception as e:
            logger.error(f"Database error checking subdomain availability: {e}")
            # If we can't check, assume it's available (will fail at creation if not)
            return {
                'valid': True,
                'available': True,
                'error': None
            }

    def _build_tenant_url(self, subdomain: str) -> str:
        """Build the full tenant URL based on environment settings."""
        domain_suffix = getattr(settings, 'TENANT_DOMAIN_SUFFIX', 'localhost')
        protocol = getattr(settings, 'TENANT_PROTOCOL', 'http')
        frontend_port = getattr(settings, 'TENANT_FRONTEND_PORT', '5173')

        # In production (no port needed)
        if not frontend_port or domain_suffix != 'localhost':
            return f"{protocol}://{subdomain}.{domain_suffix}"

        # In development (with port)
        return f"{protocol}://{subdomain}.{domain_suffix}:{frontend_port}"
