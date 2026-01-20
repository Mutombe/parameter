"""Views for tenant management (Public schema)."""
from django.db import connection
from django.db.models import Count, Sum, Q
from django.utils import timezone
from datetime import timedelta
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAdminUser
from django_tenants.utils import tenant_context
from .models import Client, Domain, GlobalSettings, TenantInvitation
from .serializers import (
    ClientSerializer, ClientCreateSerializer,
    DomainSerializer, GlobalSettingsSerializer,
    CompanyOnboardingSerializer, SubdomainCheckSerializer,
    TenantInvitationSerializer, CreateTenantInvitationSerializer,
    AcceptTenantInvitationSerializer, DemoSignupSerializer
)
from .onboarding import OnboardingService
from apps.accounts.models import User


class ClientViewSet(viewsets.ModelViewSet):
    """Manage tenant (client) registration and configuration."""
    queryset = Client.objects.all()

    def get_serializer_class(self):
        if self.action == 'create':
            return ClientCreateSerializer
        return ClientSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [AllowAny()]
        return [IsAdminUser()]

    @action(detail=True, methods=['post'])
    def toggle_ai(self, request, pk=None):
        """Toggle AI features for a tenant."""
        client = self.get_object()
        feature = request.data.get('feature')
        enabled = request.data.get('enabled', True)

        feature_map = {
            'accounting': 'ai_accounting_enabled',
            'reconciliation': 'ai_reconciliation_enabled',
            'reports': 'ai_reports_enabled',
            'ocr': 'ai_ocr_enabled',
        }

        if feature not in feature_map:
            return Response(
                {'error': f'Invalid feature. Choose from: {list(feature_map.keys())}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        setattr(client, feature_map[feature], enabled)
        client.save()

        return Response(ClientSerializer(client).data)


class GlobalSettingsViewSet(viewsets.ModelViewSet):
    """Manage global settings (Super Admin only)."""
    queryset = GlobalSettings.objects.all()
    serializer_class = GlobalSettingsSerializer
    permission_classes = [IsAdminUser]
    lookup_field = 'key'


class SuperAdminDashboardView(APIView):
    """Super Admin Dashboard with system-wide statistics."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        today = timezone.now().date()
        thirty_days_ago = today - timedelta(days=30)

        # Tenant Statistics
        total_tenants = Client.objects.count()
        active_tenants = Client.objects.filter(is_active=True, account_status='active').count()
        demo_tenants = Client.objects.filter(is_demo=True).count()
        expired_demos = Client.objects.filter(is_demo=True, account_status='demo_expired').count()
        inactive_tenants = total_tenants - active_tenants

        # Subscription breakdown
        subscription_stats = Client.objects.values('subscription_plan').annotate(
            count=Count('id')
        )
        subscription_breakdown = {
            item['subscription_plan']: item['count']
            for item in subscription_stats
        }

        # New tenants this month
        new_tenants_month = Client.objects.filter(
            created_at__date__gte=thirty_days_ago
        ).count()

        # Invitation Statistics
        pending_invitations = TenantInvitation.objects.filter(
            status=TenantInvitation.Status.PENDING
        ).count()
        accepted_invitations_month = TenantInvitation.objects.filter(
            status=TenantInvitation.Status.ACCEPTED,
            accepted_at__date__gte=thirty_days_ago
        ).count()

        # Get tenant-level statistics
        tenant_details = []
        for client in Client.objects.filter(is_active=True).order_by('-created_at')[:10]:  # Top 10 recent
            stats = self._get_tenant_stats(client)
            tenant_details.append({
                'id': client.id,
                'name': client.name,
                'schema_name': client.schema_name,
                'subscription_plan': client.subscription_plan,
                'is_demo': client.is_demo,
                'demo_expires_at': client.demo_expires_at.isoformat() if client.demo_expires_at else None,
                'account_status': client.account_status,
                'created_at': client.created_at.isoformat(),
                **stats
            })

        # User Statistics (from public schema)
        total_users = User.objects.count()
        super_admins = User.objects.filter(role='super_admin').count()

        # AI Feature Usage
        ai_stats = {
            'accounting_enabled': Client.objects.filter(ai_accounting_enabled=True).count(),
            'reconciliation_enabled': Client.objects.filter(ai_reconciliation_enabled=True).count(),
            'reports_enabled': Client.objects.filter(ai_reports_enabled=True).count(),
            'ocr_enabled': Client.objects.filter(ai_ocr_enabled=True).count(),
        }

        # Recent invitations
        recent_invitations = TenantInvitation.objects.order_by('-created_at')[:5]
        invitations_list = [{
            'id': inv.id,
            'email': inv.email,
            'company_name': inv.company_name,
            'invitation_type': inv.invitation_type,
            'status': inv.status,
            'created_at': inv.created_at.isoformat(),
            'expires_at': inv.expires_at.isoformat()
        } for inv in recent_invitations]

        return Response({
            'overview': {
                'total_tenants': total_tenants,
                'active_tenants': active_tenants,
                'demo_tenants': demo_tenants,
                'expired_demos': expired_demos,
                'inactive_tenants': inactive_tenants,
                'new_tenants_month': new_tenants_month,
                'pending_invitations': pending_invitations,
                'accepted_invitations_month': accepted_invitations_month,
                'total_users': total_users,
                'super_admins': super_admins
            },
            'subscriptions': subscription_breakdown,
            'ai_features': ai_stats,
            'recent_tenants': tenant_details,
            'recent_invitations': invitations_list,
            'generated_at': timezone.now().isoformat()
        })

    def _get_tenant_stats(self, client):
        """Get statistics for a specific tenant."""
        try:
            with tenant_context(client):
                from apps.masterfile.models import Property, Unit, RentalTenant
                from apps.billing.models import Invoice
                from apps.accounts.models import User

                return {
                    'properties': Property.objects.count(),
                    'units': Unit.objects.count(),
                    'tenants': RentalTenant.objects.count(),
                    'users': User.objects.count(),
                    'pending_invoices': Invoice.objects.filter(
                        status__in=['draft', 'sent']
                    ).count()
                }
        except Exception:
            return {
                'properties': 0,
                'units': 0,
                'tenants': 0,
                'users': 0,
                'pending_invoices': 0
            }


class TenantDetailStatsView(APIView):
    """Detailed statistics for a specific tenant."""
    permission_classes = [IsAdminUser]

    def get(self, request, tenant_id):
        try:
            client = Client.objects.get(id=tenant_id)
        except Client.DoesNotExist:
            return Response({'error': 'Tenant not found'}, status=404)

        try:
            with tenant_context(client):
                from apps.masterfile.models import Property, Unit, RentalTenant, Landlord, LeaseAgreement
                from apps.billing.models import Invoice, Receipt
                from apps.accounting.models import ChartOfAccount
                from apps.accounts.models import User

                # Property statistics
                total_properties = Property.objects.count()
                total_units = Unit.objects.count()
                occupied_units = Unit.objects.filter(is_occupied=True).count()

                # Financial statistics
                total_invoiced = Invoice.objects.aggregate(
                    total=Sum('total_amount')
                )['total'] or 0
                total_collected = Receipt.objects.aggregate(
                    total=Sum('amount')
                )['total'] or 0

                # User breakdown by role
                users_by_role = User.objects.values('role').annotate(
                    count=Count('id')
                )
                user_breakdown = {
                    item['role']: item['count']
                    for item in users_by_role
                }

                return Response({
                    'tenant': {
                        'id': client.id,
                        'name': client.name,
                        'schema_name': client.schema_name,
                        'email': client.email,
                        'subscription_plan': client.subscription_plan,
                        'is_active': client.is_active,
                        'created_at': client.created_at.isoformat()
                    },
                    'masterfile': {
                        'landlords': Landlord.objects.count(),
                        'properties': total_properties,
                        'units': total_units,
                        'occupied_units': occupied_units,
                        'vacancy_rate': round(
                            ((total_units - occupied_units) / total_units * 100), 1
                        ) if total_units else 0,
                        'tenants': RentalTenant.objects.count(),
                        'active_leases': LeaseAgreement.objects.filter(status='active').count()
                    },
                    'financial': {
                        'total_invoiced': float(total_invoiced),
                        'total_collected': float(total_collected),
                        'outstanding': float(total_invoiced - total_collected),
                        'chart_of_accounts': ChartOfAccount.objects.count()
                    },
                    'users': user_breakdown,
                    'ai_features': {
                        'accounting': client.ai_accounting_enabled,
                        'reconciliation': client.ai_reconciliation_enabled,
                        'reports': client.ai_reports_enabled,
                        'ocr': client.ai_ocr_enabled
                    }
                })

        except Exception as e:
            return Response({'error': str(e)}, status=500)


class PublicHealthCheckView(APIView):
    """
    Public health check endpoint for Render.com and monitoring.
    Does not require authentication.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            # Simple database connectivity check
            connection.ensure_connection()
            return Response({
                'status': 'healthy',
                'service': 'parameter-backend',
                'timestamp': timezone.now().isoformat()
            })
        except Exception as e:
            return Response({
                'status': 'unhealthy',
                'error': str(e),
                'timestamp': timezone.now().isoformat()
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class SystemHealthView(APIView):
    """System health check and status (detailed, requires admin)."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        health_status = {
            'database': self._check_database(),
            'tenants': self._check_tenants(),
            'timestamp': timezone.now().isoformat()
        }

        overall_healthy = all(
            check['status'] == 'healthy'
            for check in health_status.values()
            if isinstance(check, dict) and 'status' in check
        )

        health_status['overall'] = 'healthy' if overall_healthy else 'degraded'

        return Response(health_status)

    def _check_database(self):
        try:
            connection.ensure_connection()
            return {
                'status': 'healthy',
                'message': 'Database connection successful'
            }
        except Exception as e:
            return {
                'status': 'unhealthy',
                'message': str(e)
            }

    def _check_tenants(self):
        try:
            total = Client.objects.count()
            active = Client.objects.filter(is_active=True).count()
            return {
                'status': 'healthy',
                'total': total,
                'active': active
            }
        except Exception as e:
            return {
                'status': 'unhealthy',
                'message': str(e)
            }


class CompanyOnboardingView(APIView):
    """
    Company Onboarding Endpoint.
    Handles complete company registration with admin user creation.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = CompanyOnboardingSerializer(data=request.data)

        if not serializer.is_valid():
            return Response({
                'success': False,
                'errors': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        # Prepare data for onboarding service
        company_data = {
            'name': data['company_name'],
            'subdomain': data['subdomain'],
            'email': data['company_email'],
            'phone': data.get('company_phone', ''),
            'address': data.get('company_address', ''),
            'subscription_plan': data.get('subscription_plan', 'free'),
            'default_currency': data.get('default_currency', 'USD')
        }

        admin_data = {
            'email': data['admin_email'],
            'password': data['admin_password'],
            'first_name': data['admin_first_name'],
            'last_name': data['admin_last_name'],
            'phone': data.get('admin_phone', '')
        }

        setup_options = {
            'create_sample_coa': data.get('create_sample_coa', True),
            'send_welcome_email': data.get('send_welcome_email', True)
        }

        try:
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"Starting onboarding for: {data['company_name']} ({data['subdomain']})")

            service = OnboardingService()
            result = service.register_company(company_data, admin_data, setup_options)

            logger.info(f"Onboarding successful for: {data['company_name']}")
            return Response(result, status=status.HTTP_201_CREATED)

        except ValueError as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            import traceback
            import logging
            logger = logging.getLogger(__name__)
            error_trace = traceback.format_exc()
            logger.error(f"Onboarding failed: {str(e)}\n{error_trace}")
            return Response({
                'success': False,
                'error': str(e),
                'details': error_trace
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SubdomainCheckView(APIView):
    """Check if a subdomain is available."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SubdomainCheckSerializer(data=request.data)

        if not serializer.is_valid():
            return Response({
                'valid': False,
                'available': False,
                'error': 'Invalid subdomain format'
            }, status=status.HTTP_400_BAD_REQUEST)

        service = OnboardingService()
        result = service.validate_subdomain(serializer.validated_data['subdomain'])

        return Response(result)

    def get(self, request):
        subdomain = request.query_params.get('subdomain', '')

        if not subdomain:
            return Response({
                'valid': False,
                'available': False,
                'error': 'Subdomain is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        service = OnboardingService()
        result = service.validate_subdomain(subdomain)

        return Response(result)


class SubscriptionPlansView(APIView):
    """Get available subscription plans."""
    permission_classes = [AllowAny]

    def get(self, request):
        plans = [
            {
                'id': 'free',
                'name': 'Free Trial',
                'price': 0,
                'currency': 'USD',
                'period': 'month',
                'features': [
                    'Up to 5 properties',
                    'Up to 20 units',
                    'Basic reports',
                    'Email support',
                    '14-day trial'
                ],
                'limits': {
                    'properties': 5,
                    'units': 20,
                    'users': 2
                }
            },
            {
                'id': 'basic',
                'name': 'Basic',
                'price': 49,
                'currency': 'USD',
                'period': 'month',
                'features': [
                    'Up to 25 properties',
                    'Up to 100 units',
                    'All reports',
                    'AI-powered insights',
                    'Email & chat support'
                ],
                'limits': {
                    'properties': 25,
                    'units': 100,
                    'users': 5
                }
            },
            {
                'id': 'professional',
                'name': 'Professional',
                'price': 99,
                'currency': 'USD',
                'period': 'month',
                'features': [
                    'Up to 100 properties',
                    'Up to 500 units',
                    'All reports + custom',
                    'OCR document extraction',
                    'AI reconciliation',
                    'Priority support'
                ],
                'limits': {
                    'properties': 100,
                    'units': 500,
                    'users': 15
                },
                'recommended': True
            },
            {
                'id': 'enterprise',
                'name': 'Enterprise',
                'price': 299,
                'currency': 'USD',
                'period': 'month',
                'features': [
                    'Unlimited properties',
                    'Unlimited units',
                    'Custom integrations',
                    'Dedicated support',
                    'SLA guarantee',
                    'Training included'
                ],
                'limits': {
                    'properties': -1,  # Unlimited
                    'units': -1,
                    'users': -1
                }
            }
        ]

        return Response({
            'plans': plans,
            'default_plan': 'free'
        })


class TenantInvitationViewSet(viewsets.ModelViewSet):
    """
    Manage tenant invitations (Super Admin only).
    Used to invite new companies to the platform.
    """
    serializer_class = TenantInvitationSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        return TenantInvitation.objects.all()

    def get_serializer_class(self):
        if self.action == 'create':
            return CreateTenantInvitationSerializer
        return TenantInvitationSerializer

    def create(self, request):
        """Create and send a new tenant invitation."""
        serializer = CreateTenantInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        # Create invitation
        invitation = TenantInvitation.objects.create(
            email=data['email'],
            company_name=data['company_name'],
            first_name=data.get('first_name', ''),
            last_name=data.get('last_name', ''),
            invitation_type=data.get('invitation_type', 'full'),
            subscription_plan=data.get('subscription_plan', 'basic'),
            message=data.get('message', ''),
            token=TenantInvitation.generate_token(),
            invited_by=request.user,
            expires_at=timezone.now() + timedelta(days=7)
        )

        # Send invitation email
        self._send_invitation_email(invitation)

        return Response({
            'message': f'Invitation sent to {invitation.email}',
            'invitation': TenantInvitationSerializer(invitation).data
        }, status=status.HTTP_201_CREATED)

    def _send_invitation_email(self, invitation):
        """Send the tenant invitation email."""
        from django.core.mail import send_mail
        from django.conf import settings
        import logging
        logger = logging.getLogger(__name__)

        # Get site URL - prefer production URL
        site_url = getattr(settings, 'SITE_URL', 'https://parameter.co.zw')

        # Warn if still using localhost in production
        if 'localhost' in site_url:
            logger.warning(f"SITE_URL is set to localhost ({site_url}). Set SITE_URL env var for production.")
            # Use production URL as fallback
            if not settings.DEBUG:
                site_url = 'https://parameter.co.zw'

        invite_url = f"{site_url}/signup?token={invitation.token}"

        inviter_name = invitation.invited_by.get_full_name() if invitation.invited_by else 'Parameter Team'

        subject = f"You're invited to join Parameter.co.zw - {invitation.company_name}"

        message = f"""
Hello{' ' + invitation.first_name if invitation.first_name else ''},

You've been invited to set up your company "{invitation.company_name}" on Parameter.co.zw - Real Estate Accounting Platform.

{f'Message from {inviter_name}:' if invitation.message else ''}
{invitation.message if invitation.message else ''}

Account Type: {invitation.get_invitation_type_display()}
Subscription Plan: {invitation.get_subscription_plan_display()}

Click the link below to complete your registration:
{invite_url}

This invitation expires in 7 days.

If you did not expect this invitation, you can safely ignore this email.

Best regards,
The Parameter Team
"""

        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=f"Parameter <{settings.DEFAULT_FROM_EMAIL}>",
                recipient_list=[invitation.email],
                fail_silently=False
            )
            logger.info(f"Tenant invitation email sent to {invitation.email} with URL: {invite_url}")
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send tenant invitation email to {invitation.email}: {str(e)}")

    @action(detail=True, methods=['post'])
    def resend(self, request, pk=None):
        """Resend invitation email."""
        invitation = self.get_object()

        if invitation.status != TenantInvitation.Status.PENDING:
            return Response({
                'error': 'Can only resend pending invitations'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Extend expiry
        invitation.expires_at = timezone.now() + timedelta(days=7)
        invitation.save()

        # Resend email
        self._send_invitation_email(invitation)

        return Response({
            'message': f'Invitation resent to {invitation.email}'
        })

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a pending invitation."""
        invitation = self.get_object()

        if invitation.status != TenantInvitation.Status.PENDING:
            return Response({
                'error': 'Can only cancel pending invitations'
            }, status=status.HTTP_400_BAD_REQUEST)

        invitation.status = TenantInvitation.Status.CANCELLED
        invitation.save()

        return Response({
            'message': f'Invitation to {invitation.email} cancelled'
        })

    @action(detail=True, methods=['post'])
    def activate_demo(self, request, pk=None):
        """
        Activate a demo tenant to full account.
        Used when making a sale to a demo user.
        """
        invitation = self.get_object()

        if not invitation.created_tenant:
            return Response({
                'error': 'No tenant was created from this invitation'
            }, status=status.HTTP_400_BAD_REQUEST)

        tenant = invitation.created_tenant

        if not tenant.is_demo:
            return Response({
                'error': 'This tenant is not a demo account'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Activate the tenant
        tenant.activate_from_demo()

        # Also activate the admin user
        with tenant_context(tenant):
            User.objects.filter(role='admin').update(
                is_demo_user=False,
                account_status='active'
            )

        return Response({
            'message': f'Tenant {tenant.name} has been activated',
            'tenant': ClientSerializer(tenant).data
        })


class AcceptTenantInvitationView(APIView):
    """Accept a tenant invitation and create the company."""
    permission_classes = [AllowAny]

    def get(self, request):
        """Validate invitation token and return invitation details."""
        token = request.query_params.get('token')

        if not token:
            return Response({
                'error': 'Token is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            invitation = TenantInvitation.objects.get(token=token)
        except TenantInvitation.DoesNotExist:
            return Response({
                'error': 'Invalid invitation token'
            }, status=status.HTTP_404_NOT_FOUND)

        if not invitation.is_valid:
            return Response({
                'error': 'This invitation is no longer valid',
                'status': invitation.status
            }, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'valid': True,
            'email': invitation.email,
            'company_name': invitation.company_name,
            'first_name': invitation.first_name,
            'last_name': invitation.last_name,
            'invitation_type': invitation.invitation_type,
            'subscription_plan': invitation.subscription_plan,
            'expires_at': invitation.expires_at
        })

    def post(self, request):
        """Accept invitation and create company + admin user."""
        serializer = AcceptTenantInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        token = data['token']

        invitation = TenantInvitation.objects.get(token=token)

        # Prepare data for onboarding
        company_data = {
            'name': invitation.company_name,
            'subdomain': data['subdomain'],
            'email': invitation.email,
            'phone': data.get('company_phone', ''),
            'address': data.get('company_address', ''),
            'subscription_plan': invitation.subscription_plan,
            'default_currency': data.get('default_currency', 'USD')
        }

        admin_data = {
            'email': invitation.email,
            'password': data['admin_password'],
            'first_name': data.get('admin_first_name') or invitation.first_name,
            'last_name': data.get('admin_last_name') or invitation.last_name,
            'phone': data.get('admin_phone', '')
        }

        # Check if this is a demo invitation
        is_demo = invitation.invitation_type == 'demo'

        try:
            service = OnboardingService()
            result = service.register_company(
                company_data,
                admin_data,
                {
                    'create_sample_coa': True,
                    'send_welcome_email': True,
                    'is_demo': is_demo,
                    'seed_demo_data': is_demo
                }
            )

            # Update invitation
            invitation.status = TenantInvitation.Status.ACCEPTED
            invitation.created_tenant = Client.objects.get(id=result['tenant']['id'])
            invitation.accepted_at = timezone.now()
            invitation.save()

            return Response(result, status=status.HTTP_201_CREATED)

        except ValueError as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({
                'success': False,
                'error': 'Registration failed. Please try again.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SeedDemoDataView(APIView):
    """
    Seed demo data for the current tenant.
    Only available to admin users.
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        from django.core.management import call_command
        from django.db import connection
        import io

        # Only allow in tenant context (not public schema)
        if connection.schema_name == 'public':
            return Response({
                'success': False,
                'error': 'Cannot seed demo data in public schema'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Capture command output
            out = io.StringIO()
            call_command('seed_demo_data', '--skip-tenant-creation', verbosity=1, stdout=out)
            output = out.getvalue()

            return Response({
                'success': True,
                'message': 'Demo data seeded successfully',
                'output': output
            })

        except Exception as e:
            import traceback
            return Response({
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CreateDemoTenantView(APIView):
    """
    Create a complete demo tenant with all data.
    Public endpoint for quick demo setup.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from django.core.management import call_command
        import io

        subdomain = request.data.get('subdomain', 'demo')
        email = request.data.get('email', f'admin@{subdomain}.parameter.co.zw')
        password = request.data.get('password', 'demo123')

        try:
            out = io.StringIO()
            call_command(
                'create_demo_tenant',
                f'--subdomain={subdomain}',
                f'--email={email}',
                f'--password={password}',
                verbosity=1,
                stdout=out
            )

            # Get domain suffix from settings
            from django.conf import settings
            domain_suffix = getattr(settings, 'TENANT_DOMAIN_SUFFIX', 'localhost')
            protocol = getattr(settings, 'TENANT_PROTOCOL', 'https')

            return Response({
                'success': True,
                'message': 'Demo tenant created successfully',
                'tenant': {
                    'subdomain': subdomain,
                    'login_url': f'{protocol}://{subdomain}.{domain_suffix}',
                    'email': email,
                    'password': password
                },
                'output': out.getvalue()
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            import traceback
            return Response({
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DemoSignupView(APIView):
    """
    Public demo signup endpoint.
    Stores signup request and returns immediately.
    Actual tenant creation happens via ProcessDemoSignupView.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        import logging
        import json
        logger = logging.getLogger(__name__)

        # Validate input
        serializer = DemoSignupSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'errors': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        try:
            # Store signup request in GlobalSettings (using it as a simple key-value store)
            # This avoids needing a separate migration
            import secrets
            request_id = secrets.token_urlsafe(16)

            signup_data = {
                'request_id': request_id,
                'status': 'pending',
                'company_name': data['company_name'],
                'subdomain': data['subdomain'],
                'company_email': data['company_email'],
                'company_phone': data.get('company_phone', ''),
                'default_currency': data.get('default_currency', 'USD'),
                'admin_email': data['admin_email'],
                'admin_password': data['admin_password'],
                'admin_first_name': data['admin_first_name'],
                'admin_last_name': data['admin_last_name'],
                'admin_phone': data.get('admin_phone', ''),
            }

            # Store in GlobalSettings as JSON
            GlobalSettings.objects.update_or_create(
                key=f'demo_signup_{request_id}',
                defaults={'value': json.dumps(signup_data)}
            )

            logger.info(f"Demo signup request stored: {request_id}")

            return Response({
                'success': True,
                'message': 'Your demo account request has been received. Please wait while we create your account.',
                'request_id': request_id,
                'status': 'pending',
                'process_url': f'/api/tenants/process-demo-signup/{request_id}/',
                'status_url': f'/api/tenants/demo-signup-status/{request_id}/',
                'instructions': 'Call the process_url to complete account creation (this may take up to 2 minutes).'
            }, status=status.HTTP_202_ACCEPTED)

        except Exception as e:
            import traceback
            logger.error(f"Demo signup failed: {str(e)}\n{traceback.format_exc()}")
            return Response({
                'success': False,
                'error': f'Failed to process signup request: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _process_demo_signup_background(request_id: str):
    """
    Background worker to process demo signup.
    Runs in a separate thread to survive connection timeouts.
    """
    import logging
    import json
    from django.db import connection
    from django.conf import settings as django_settings

    logger = logging.getLogger(__name__)

    # Close any existing database connections to get fresh ones in this thread
    connection.close()

    try:
        setting = GlobalSettings.objects.get(key=f'demo_signup_{request_id}')
        signup_data = json.loads(setting.value)

        company_data = {
            'name': signup_data['company_name'],
            'subdomain': signup_data['subdomain'],
            'email': signup_data['company_email'],
            'phone': signup_data.get('company_phone', ''),
            'address': '',
            'subscription_plan': 'free',
            'default_currency': signup_data.get('default_currency', 'USD')
        }

        admin_data = {
            'email': signup_data['admin_email'],
            'password': signup_data['admin_password'],
            'first_name': signup_data['admin_first_name'],
            'last_name': signup_data['admin_last_name'],
            'phone': signup_data.get('admin_phone', '')
        }

        logger.info(f"[BG] Creating demo tenant: {signup_data['company_name']}")

        service = OnboardingService()
        result = service.register_company(
            company_data,
            admin_data,
            {
                'create_sample_coa': False,
                'send_welcome_email': True,  # Send email when done
                'is_demo': True,
                'seed_demo_data': False
            }
        )

        logger.info(f"[BG] Demo tenant created: {signup_data['company_name']}")

        # Update status
        domain_suffix = getattr(django_settings, 'TENANT_DOMAIN_SUFFIX', 'parameter.co.zw')
        login_url = f"https://{signup_data['subdomain']}.{domain_suffix}"

        # Refresh setting from DB
        setting.refresh_from_db()
        signup_data = json.loads(setting.value)
        signup_data['status'] = 'completed'
        signup_data['login_url'] = login_url
        signup_data['admin_password'] = '[REDACTED]'
        setting.value = json.dumps(signup_data)
        setting.save()

        logger.info(f"[BG] Demo signup completed: {request_id}")

    except Exception as e:
        import traceback
        logger.error(f"[BG] Demo signup failed: {str(e)}\n{traceback.format_exc()}")
        try:
            setting = GlobalSettings.objects.get(key=f'demo_signup_{request_id}')
            signup_data = json.loads(setting.value)
            signup_data['status'] = 'failed'
            signup_data['error'] = str(e)
            setting.value = json.dumps(signup_data)
            setting.save()
        except:
            pass


class ProcessDemoSignupView(APIView):
    """
    Process a pending demo signup request.
    Starts processing in background thread and returns immediately.
    """
    permission_classes = [AllowAny]

    def post(self, request, request_id):
        import logging
        import json
        import threading
        import datetime

        logger = logging.getLogger(__name__)

        try:
            # Get signup data from GlobalSettings
            try:
                setting = GlobalSettings.objects.get(key=f'demo_signup_{request_id}')
                signup_data = json.loads(setting.value)
            except GlobalSettings.DoesNotExist:
                return Response({
                    'success': False,
                    'error': 'Signup request not found'
                }, status=status.HTTP_404_NOT_FOUND)

            # Check if already processed
            if signup_data.get('status') == 'completed':
                return Response({
                    'success': True,
                    'message': 'Account already created',
                    'status': 'completed',
                    'login_url': signup_data.get('login_url', '')
                })

            if signup_data.get('status') == 'processing':
                # Check if it's been stuck for more than 5 minutes - reset to pending
                started_at = signup_data.get('started_at')
                if started_at:
                    try:
                        started = datetime.datetime.fromisoformat(started_at)
                        if (datetime.datetime.now(datetime.timezone.utc) - started).total_seconds() > 300:
                            logger.info(f"Resetting stuck processing request: {request_id}")
                            signup_data['status'] = 'pending'
                            setting.value = json.dumps(signup_data)
                            setting.save()
                    except:
                        pass

                if signup_data.get('status') == 'processing':
                    return Response({
                        'success': True,
                        'message': 'Account creation is in progress. Check back in 1-2 minutes.',
                        'status': 'processing',
                        'status_url': f'/api/tenants/demo-signup-status/{request_id}/'
                    }, status=status.HTTP_202_ACCEPTED)

            # Mark as processing with timestamp
            signup_data['status'] = 'processing'
            signup_data['started_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            setting.value = json.dumps(signup_data)
            setting.save()

            # Start background thread for actual processing
            thread = threading.Thread(
                target=_process_demo_signup_background,
                args=(request_id,),
                daemon=True  # Allow process to exit even if thread is running
            )
            thread.start()

            logger.info(f"Started background processing for: {request_id}")

            return Response({
                'success': True,
                'message': 'Account creation started. This takes 1-2 minutes. Check status for updates.',
                'status': 'processing',
                'status_url': f'/api/tenants/demo-signup-status/{request_id}/'
            }, status=status.HTTP_202_ACCEPTED)

        except Exception as e:
            import traceback
            logger.error(f"Demo signup processing failed: {str(e)}\n{traceback.format_exc()}")
            return Response({
                'success': False,
                'error': f'Failed to start processing: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DemoSignupStatusView(APIView):
    """Check the status of a demo signup request."""
    permission_classes = [AllowAny]

    def get(self, request, request_id):
        import json
        import logging
        logger = logging.getLogger(__name__)

        try:
            setting = GlobalSettings.objects.get(key=f'demo_signup_{request_id}')
        except GlobalSettings.DoesNotExist:
            return Response({
                'error': 'Signup request not found'
            }, status=status.HTTP_404_NOT_FOUND)

        try:
            signup_data = json.loads(setting.value)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse signup data for {request_id}: {e}")
            return Response({
                'error': 'Invalid signup data format',
                'request_id': request_id
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        status_val = signup_data.get('status', 'pending')

        response_data = {
            'request_id': request_id,
            'status': status_val,
            'company_name': signup_data.get('company_name', ''),
        }

        if status_val == 'completed':
            domain_suffix = getattr(settings, 'TENANT_DOMAIN_SUFFIX', 'parameter.co.zw')
            response_data.update({
                'login_url': signup_data.get('login_url', f"https://{signup_data.get('subdomain', '')}.{domain_suffix}"),
                'admin_email': signup_data.get('admin_email', ''),
                'message': 'Your demo account is ready! Check your email for login details.'
            })
        elif status_val == 'failed':
            response_data.update({
                'error': signup_data.get('error', 'Account creation failed'),
                'message': 'We encountered an issue creating your account. Please try again.'
            })
        elif status_val == 'processing':
            response_data.update({
                'message': 'Your account is being created. This usually takes 1-2 minutes.',
                'process_url': f'/api/tenants/process-demo-signup/{request_id}/'
            })
        else:  # pending
            response_data.update({
                'message': 'Your request is ready to be processed.',
                'process_url': f'/api/tenants/process-demo-signup/{request_id}/',
                'instructions': 'Call the process_url endpoint to complete account creation.'
            })

        return Response(response_data)
