"""
Django-Q tasks for tenant management.
Handles async tenant creation for demo signups.
"""
import logging
from django.utils import timezone
from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def create_demo_tenant_async(request_id: str):
    """
    Async task to create a demo tenant.
    This runs in the background to avoid request timeouts.
    """
    from .models import DemoSignupRequest, Client
    from .onboarding import OnboardingService

    logger.info(f"Starting async tenant creation for request: {request_id}")

    try:
        # Get the signup request
        signup_request = DemoSignupRequest.objects.get(request_id=request_id)
    except DemoSignupRequest.DoesNotExist:
        logger.error(f"Signup request not found: {request_id}")
        return {'success': False, 'error': 'Request not found'}

    # Update status to processing
    signup_request.status = DemoSignupRequest.Status.PROCESSING
    signup_request.started_at = timezone.now()
    signup_request.save()

    try:
        # Prepare data for onboarding service
        company_data = {
            'name': signup_request.company_name,
            'subdomain': signup_request.subdomain,
            'email': signup_request.company_email,
            'phone': signup_request.company_phone,
            'address': '',
            'subscription_plan': 'free',
            'default_currency': signup_request.default_currency
        }

        admin_data = {
            'email': signup_request.admin_email,
            'password': signup_request.admin_password,
            'first_name': signup_request.admin_first_name,
            'last_name': signup_request.admin_last_name,
            'phone': signup_request.admin_phone
        }

        # Create the tenant
        logger.info(f"Creating tenant: {signup_request.company_name}")
        service = OnboardingService()
        result = service.register_company(
            company_data,
            admin_data,
            {
                'create_sample_coa': True,
                'send_welcome_email': False,  # We'll send our own email
                'is_demo': True,
                'seed_demo_data': False
            }
        )

        # Update signup request with success
        signup_request.status = DemoSignupRequest.Status.COMPLETED
        signup_request.completed_at = timezone.now()
        signup_request.created_tenant = Client.objects.get(id=result['tenant']['id'])
        signup_request.login_url = result.get('login_url', '')
        signup_request.save()

        logger.info(f"Tenant created successfully: {signup_request.company_name}")

        # Send success email
        send_demo_ready_email(signup_request)

        return {
            'success': True,
            'tenant_id': result['tenant']['id'],
            'login_url': result.get('login_url', '')
        }

    except Exception as e:
        logger.error(f"Tenant creation failed for {request_id}: {str(e)}")

        # Update signup request with failure
        signup_request.status = DemoSignupRequest.Status.FAILED
        signup_request.completed_at = timezone.now()
        signup_request.error_message = str(e)
        signup_request.save()

        # Send failure email
        send_demo_failed_email(signup_request, str(e))

        return {
            'success': False,
            'error': str(e)
        }


def send_demo_ready_email(signup_request):
    """Send email when demo account is ready."""
    try:
        site_url = getattr(settings, 'SITE_URL', 'https://parameter.co.zw')
        domain_suffix = getattr(settings, 'TENANT_DOMAIN_SUFFIX', 'parameter.co.zw')
        login_url = f"https://{signup_request.subdomain}.{domain_suffix}"

        subject = f"Your Demo Account is Ready - {signup_request.company_name}"
        message = f"""
Hello {signup_request.admin_first_name},

Great news! Your demo account for "{signup_request.company_name}" is now ready.

Login Details:
- URL: {login_url}
- Email: {signup_request.admin_email}
- Password: (the password you provided during signup)

Your demo will be active for 2 hours. During this time, you can explore all features of Parameter.co.zw:

- Double-Entry Accounting with Real Estate Chart of Accounts
- Landlord and Property Management
- Tenant and Lease Management
- Automated Billing and Invoicing
- Multi-Currency Support (USD & ZiG)
- AI-Powered Features

To continue using Parameter after your demo expires, please contact our team.

Best regards,
The Parameter Team
"""

        send_mail(
            subject=subject,
            message=message,
            from_email=f"Parameter <{settings.DEFAULT_FROM_EMAIL}>",
            recipient_list=[signup_request.admin_email],
            fail_silently=True
        )
        logger.info(f"Demo ready email sent to {signup_request.admin_email}")

    except Exception as e:
        logger.warning(f"Failed to send demo ready email: {e}")


def send_demo_failed_email(signup_request, error: str):
    """Send email when demo account creation fails."""
    try:
        subject = f"Demo Account Setup Issue - {signup_request.company_name}"
        message = f"""
Hello {signup_request.admin_first_name},

We encountered an issue while setting up your demo account for "{signup_request.company_name}".

Our team has been notified and we're working to resolve this. Please try again in a few minutes, or contact our support team if the issue persists.

We apologize for the inconvenience.

Best regards,
The Parameter Team
"""

        send_mail(
            subject=subject,
            message=message,
            from_email=f"Parameter <{settings.DEFAULT_FROM_EMAIL}>",
            recipient_list=[signup_request.admin_email],
            fail_silently=True
        )
        logger.info(f"Demo failed email sent to {signup_request.admin_email}")

    except Exception as e:
        logger.warning(f"Failed to send demo failed email: {e}")
