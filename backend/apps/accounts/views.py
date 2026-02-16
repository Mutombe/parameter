"""Views for user accounts and authentication."""
import logging
from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.views import APIView
from django.contrib.auth import login, logout
from django.db import connection
from django.db.models import Sum, Q
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.middleware.csrf import get_token
from django_tenants.utils import schema_context
from .models import User, UserActivity, UserInvitation
from .serializers import (
    UserSerializer, UserCreateSerializer, LoginSerializer,
    ChangePasswordSerializer, UserActivitySerializer,
    UserInvitationSerializer, CreateInvitationSerializer, AcceptInvitationSerializer
)
from rest_framework.throttling import ScopedRateThrottle
from .permissions import CanInviteUsers, CanManageUsers, get_allowed_invite_roles, IsTenantPortalUser, IsTenantPortalOrStaff

logger = logging.getLogger(__name__)


class LoginThrottle(ScopedRateThrottle):
    scope = 'login'


class AuthViewSet(viewsets.ViewSet):
    """Authentication endpoints."""
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    @method_decorator(csrf_exempt)
    @action(detail=False, methods=['post'])
    def login(self, request):
        try:
            # Check if tenant is a demo that has expired
            tenant = getattr(request, 'tenant', None)
            if tenant and tenant.is_demo and tenant.is_demo_expired:
                # Update tenant and user status
                tenant.account_status = 'demo_expired'
                tenant.save(update_fields=['account_status'])

                return Response({
                    'error': 'Your demo has expired. Please contact our sales team to activate your account.',
                    'demo_expired': True
                }, status=status.HTTP_403_FORBIDDEN)

            serializer = LoginSerializer(data=request.data)

            if not serializer.is_valid():
                # Return user-friendly error messages
                errors = serializer.errors
                error_message = 'Invalid credentials'

                if 'email' in errors:
                    error_message = errors['email'][0] if isinstance(errors['email'], list) else str(errors['email'])
                elif 'password' in errors:
                    error_message = errors['password'][0] if isinstance(errors['password'], list) else str(errors['password'])
                elif 'non_field_errors' in errors:
                    error_message = errors['non_field_errors'][0] if isinstance(errors['non_field_errors'], list) else str(errors['non_field_errors'])

                return Response({
                    'error': error_message,
                    'details': errors
                }, status=status.HTTP_400_BAD_REQUEST)

            user = serializer.validated_data['user']
            login(request, user)

            # Update last activity
            user.last_activity = timezone.now()
            user.save(update_fields=['last_activity'])

            # Log activity
            UserActivity.objects.create(
                user=user,
                action='login',
                ip_address=self.get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', '')
            )

            # Get CSRF token for subsequent requests
            csrf_token = get_token(request)

            response_data = {
                'message': 'Login successful',
                'user': UserSerializer(user, context={'request': request}).data
            }

            # Add demo warning if applicable
            if tenant and tenant.is_demo:
                response_data['demo_warning'] = True
                response_data['demo_expires_at'] = tenant.demo_expires_at.isoformat() if tenant.demo_expires_at else None
                response_data['demo_time_remaining'] = tenant.demo_time_remaining

            response = Response(response_data)

            # Set CSRF cookie for frontend
            response.set_cookie('csrftoken', csrf_token, samesite='Lax')

            return response

        except Exception as e:
            logger.exception(f"Login error: {e}")
            return Response({
                'error': 'An unexpected error occurred. Please try again.',
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def logout(self, request):
        UserActivity.objects.create(
            user=request.user,
            action='logout',
            ip_address=self.get_client_ip(request)
        )
        logout(request)
        return Response({'message': 'Logout successful'})

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        return Response(UserSerializer(request.user, context={'request': request}).data)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def change_password(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data['current_password']):
            return Response(
                {'error': 'Current password is incorrect'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.set_password(serializer.validated_data['new_password'])
        user.save()

        UserActivity.objects.create(
            user=user,
            action='password_changed',
            ip_address=self.get_client_ip(request)
        )

        return Response({'message': 'Password changed successfully'})

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def upload_avatar(self, request):
        """Upload user avatar."""
        if 'avatar' not in request.FILES:
            return Response(
                {'error': 'No avatar file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )

        avatar = request.FILES['avatar']

        # Validate file type
        allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        if avatar.content_type not in allowed_types:
            return Response(
                {'error': 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate file size (max 5MB)
        if avatar.size > 5 * 1024 * 1024:
            return Response(
                {'error': 'File too large. Maximum size is 5MB'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = request.user

        # Delete old avatar if exists
        if user.avatar:
            user.avatar.delete(save=False)

        user.avatar = avatar
        user.save()

        UserActivity.objects.create(
            user=user,
            action='avatar_uploaded',
            ip_address=self.get_client_ip(request)
        )

        return Response({
            'message': 'Avatar uploaded successfully',
            'avatar_url': request.build_absolute_uri(user.avatar.url) if user.avatar else None
        })

    @action(detail=False, methods=['delete'], permission_classes=[IsAuthenticated])
    def remove_avatar(self, request):
        """Remove user avatar."""
        user = request.user

        if user.avatar:
            user.avatar.delete(save=True)

        UserActivity.objects.create(
            user=user,
            action='avatar_removed',
            ip_address=self.get_client_ip(request)
        )

        return Response({'message': 'Avatar removed successfully'})

    @action(detail=False, methods=['patch'], permission_classes=[IsAuthenticated])
    def update_profile(self, request):
        """Update user profile."""
        user = request.user
        allowed_fields = ['first_name', 'last_name', 'phone', 'preferred_currency', 'notifications_enabled']

        for field in allowed_fields:
            if field in request.data:
                setattr(user, field, request.data[field])

        user.save()

        UserActivity.objects.create(
            user=user,
            action='profile_updated',
            ip_address=self.get_client_ip(request)
        )

        return Response({
            'message': 'Profile updated successfully',
            'user': UserSerializer(user, context={'request': request}).data
        })

    def get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0]
        return request.META.get('REMOTE_ADDR')


class UserViewSet(viewsets.ModelViewSet):
    """CRUD for users (Admin only)."""
    queryset = User.objects.all()
    permission_classes = [IsAdminUser]

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        role = self.request.query_params.get('role')
        if role:
            queryset = queryset.filter(role=role)
        return queryset

    @action(detail=True, methods=['post'], permission_classes=[CanManageUsers])
    def deactivate(self, request, pk=None):
        """Deactivate a user. Only admins can do this."""
        user = self.get_object()
        if user == request.user:
            return Response(
                {'error': 'You cannot deactivate yourself'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user.is_active = False
        user.save()
        return Response({'message': f'User {user.email} deactivated'})

    @action(detail=True, methods=['post'], permission_classes=[CanManageUsers])
    def activate(self, request, pk=None):
        """Activate a user. Only admins can do this."""
        user = self.get_object()
        user.is_active = True
        user.save()
        return Response({'message': f'User {user.email} activated'})


class UserActivityViewSet(viewsets.ReadOnlyModelViewSet):
    """View user activity logs (Admin only)."""
    queryset = UserActivity.objects.all()
    serializer_class = UserActivitySerializer
    permission_classes = [IsAdminUser]
    filterset_fields = ['user', 'action']
    search_fields = ['action', 'details']


class UserInvitationViewSet(viewsets.ModelViewSet):
    """Manage user invitations."""
    serializer_class = UserInvitationSerializer
    permission_classes = [CanInviteUsers]

    def get_queryset(self):
        return UserInvitation.objects.all()

    def get_serializer_class(self):
        if self.action == 'create':
            return CreateInvitationSerializer
        return UserInvitationSerializer

    @action(detail=False, methods=['get'])
    def allowed_roles(self, request):
        """Get the list of roles the current user can invite."""
        allowed = get_allowed_invite_roles(request.user)
        return Response({
            'allowed_roles': [
                {'value': role.value, 'label': role.label}
                for role in allowed
            ]
        })

    def create(self, request):
        """Create and send a new invitation."""
        from datetime import timedelta
        from django.core.mail import send_mail
        from django.conf import settings

        # Pass request context for role validation
        serializer = CreateInvitationSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        # Create invitation
        invitation = UserInvitation.objects.create(
            email=data['email'],
            first_name=data.get('first_name', ''),
            last_name=data.get('last_name', ''),
            role=data['role'],
            token=UserInvitation.generate_token(),
            invited_by=request.user,
            expires_at=timezone.now() + timedelta(days=7)
        )

        # Send invitation email
        self._send_invitation_email(invitation, request)

        return Response({
            'message': f'Invitation sent to {invitation.email}',
            'invitation': UserInvitationSerializer(invitation).data
        }, status=status.HTTP_201_CREATED)

    def _send_invitation_email(self, invitation, request):
        """Send the invitation email."""
        from django.core.mail import send_mail
        from django.conf import settings

        # Get tenant info if available
        tenant = getattr(request, 'tenant', None)
        company_name = tenant.name if tenant else 'Our Company'

        # Get site URL - prefer production URL
        site_url = getattr(settings, 'SITE_URL', 'https://parameter.co.zw')

        # Warn if still using localhost in production
        if 'localhost' in site_url:
            logger.warning(f"SITE_URL is set to localhost ({site_url}). Set SITE_URL env var for production.")
            # Use production URL as fallback
            if not settings.DEBUG:
                site_url = 'https://parameter.co.zw'

        invite_url = f"{site_url}/accept-invite?token={invitation.token}"

        # Get inviter details
        inviter_name = invitation.invited_by.get_full_name() if invitation.invited_by else 'Admin'
        inviter_email = invitation.invited_by.email if invitation.invited_by else ''

        subject = f"You're invited to join {company_name} on Parameter"

        message = f"""
Hello{' ' + invitation.first_name if invitation.first_name else ''},

You've been invited to join {company_name} on Parameter.co.zw - Real Estate Accounting Platform.

Role: {invitation.get_role_display()}
Invited by: {inviter_name} ({inviter_email})

Click the link below to accept your invitation and create your account:
{invite_url}

This invitation expires in 7 days.

If you did not expect this invitation, you can safely ignore this email.

Best regards,
{company_name}
Powered by Parameter.co.zw
"""

        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=f"{company_name} <{settings.DEFAULT_FROM_EMAIL}>",
                recipient_list=[invitation.email],
                fail_silently=False
            )
            logger.info(f"User invitation email sent to {invitation.email} with URL: {invite_url}")
        except Exception as e:
            logger.error(f"Failed to send invitation email to {invitation.email}: {str(e)}")

    @action(detail=True, methods=['post'])
    def resend(self, request, pk=None):
        """Resend invitation email."""
        from datetime import timedelta

        invitation = self.get_object()

        if invitation.status != UserInvitation.Status.PENDING:
            return Response({
                'error': 'Can only resend pending invitations'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Extend expiry
        invitation.expires_at = timezone.now() + timedelta(days=7)
        invitation.save()

        # Resend email
        self._send_invitation_email(invitation, request)

        return Response({
            'message': f'Invitation resent to {invitation.email}'
        })

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a pending invitation."""
        invitation = self.get_object()

        if invitation.status != UserInvitation.Status.PENDING:
            return Response({
                'error': 'Can only cancel pending invitations'
            }, status=status.HTTP_400_BAD_REQUEST)

        invitation.status = UserInvitation.Status.CANCELLED
        invitation.save()

        return Response({
            'message': f'Invitation to {invitation.email} cancelled'
        })


class AcceptInvitationView(APIView):
    """Accept an invitation and create user account."""
    permission_classes = [AllowAny]

    def get(self, request):
        """Validate invitation token and return invitation details."""
        token = request.query_params.get('token')

        if not token:
            return Response({
                'error': 'Token is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            invitation = UserInvitation.objects.get(token=token)
        except UserInvitation.DoesNotExist:
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
            'first_name': invitation.first_name,
            'last_name': invitation.last_name,
            'role': invitation.role,
            'expires_at': invitation.expires_at
        })

    def post(self, request):
        """Accept invitation and create user account."""
        serializer = AcceptInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        token = data['token']

        invitation = UserInvitation.objects.get(token=token)

        # Create user
        user = User.objects.create_user(
            email=invitation.email,
            password=data['password'],
            first_name=data.get('first_name') or invitation.first_name,
            last_name=data.get('last_name') or invitation.last_name,
            role=invitation.role
        )

        # Update invitation
        invitation.status = UserInvitation.Status.ACCEPTED
        invitation.accepted_user = user
        invitation.accepted_at = timezone.now()
        invitation.save()

        # Log activity
        UserActivity.objects.create(
            user=user,
            action='account_created_via_invitation',
            details={'invited_by': invitation.invited_by.email if invitation.invited_by else None}
        )

        return Response({
            'message': 'Account created successfully',
            'user': UserSerializer(user, context={'request': request}).data
        }, status=status.HTTP_201_CREATED)


class TenantPortalViewSet(viewsets.ViewSet):
    """
    Tenant Portal API.
    Allows invited tenants to view their account information, invoices,
    receipts, lease details, and submit payment notifications.
    """
    permission_classes = [IsTenantPortalOrStaff]

    def _get_schema(self):
        """Get current tenant schema name for explicit schema context."""
        return connection.schema_name

    def get_tenant(self, request):
        """Get the RentalTenant linked to the current user."""
        from apps.masterfile.models import RentalTenant

        current_schema = self._get_schema()
        with schema_context(current_schema):
            # Staff impersonation: allow staff to view any tenant's portal
            if request.user.role in [
                User.Role.SUPER_ADMIN, User.Role.ADMIN,
                User.Role.ACCOUNTANT, User.Role.CLERK,
            ]:
                tenant_id = request.query_params.get('tenant_id')
                if tenant_id:
                    try:
                        return RentalTenant.objects.get(id=tenant_id)
                    except RentalTenant.DoesNotExist:
                        return None
                return None

            if request.user.role == User.Role.TENANT_PORTAL:
                try:
                    return request.user.rental_tenant
                except RentalTenant.DoesNotExist:
                    return None
            return None

    @action(detail=False, methods=['get'])
    def profile(self, request):
        """Get tenant profile information."""
        tenant = self.get_tenant(request)

        if not tenant:
            return Response(
                {'error': 'No tenant profile linked to this account'},
                status=status.HTTP_404_NOT_FOUND
            )

        from apps.masterfile.serializers import RentalTenantSerializer
        return Response(RentalTenantSerializer(tenant).data)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Get tenant dashboard summary."""
        tenant = self.get_tenant(request)

        if not tenant:
            return Response(
                {'error': 'No tenant profile linked to this account'},
                status=status.HTTP_404_NOT_FOUND
            )

        from apps.billing.models import Invoice, Receipt
        from apps.masterfile.models import LeaseAgreement

        # Use explicit schema context to prevent ASGI schema context loss
        current_schema = self._get_schema()
        with schema_context(current_schema):
            # Get active lease
            active_lease = LeaseAgreement.objects.filter(
                tenant=tenant,
                status='active'
            ).select_related('unit').first()

            # Get invoice totals
            invoices = Invoice.objects.filter(tenant=tenant)
            total_invoiced = invoices.aggregate(total=Sum('total_amount'))['total'] or Decimal('0')
            total_paid = invoices.aggregate(paid=Sum('amount_paid'))['paid'] or Decimal('0')
            total_balance = total_invoiced - total_paid

            # Get overdue invoices
            overdue = invoices.filter(
                status='overdue'
            ).aggregate(total=Sum('balance'))['total'] or Decimal('0')

            # Recent invoices
            recent_invoices = list(invoices.order_by('-date')[:5])

            # Recent receipts
            recent_receipts = list(Receipt.objects.filter(tenant=tenant).order_by('-date')[:5])

        return Response({
            'tenant': {
                'id': tenant.id,
                'code': tenant.code,
                'name': tenant.name,
                'email': tenant.email,
                'phone': tenant.phone,
            },
            'lease': {
                'id': active_lease.id if active_lease else None,
                'unit': str(active_lease.unit) if active_lease else None,
                'monthly_rent': active_lease.monthly_rent if active_lease else None,
                'currency': active_lease.currency if active_lease else None,
                'start_date': active_lease.start_date if active_lease else None,
                'end_date': active_lease.end_date if active_lease else None,
                'payment_day': active_lease.billing_day if active_lease else None,
            } if active_lease else None,
            'account_summary': {
                'total_invoiced': total_invoiced,
                'total_paid': total_paid,
                'current_balance': total_balance,
                'overdue_amount': overdue,
            },
            'recent_invoices': [
                {
                    'id': inv.id,
                    'invoice_number': inv.invoice_number,
                    'date': inv.date,
                    'due_date': inv.due_date,
                    'amount': inv.total_amount,
                    'balance': inv.balance,
                    'status': inv.status,
                }
                for inv in recent_invoices
            ],
            'recent_receipts': [
                {
                    'id': rec.id,
                    'receipt_number': rec.receipt_number,
                    'date': rec.date,
                    'amount': rec.amount,
                    'payment_method': rec.payment_method,
                }
                for rec in recent_receipts
            ]
        })

    @action(detail=False, methods=['get'])
    def invoices(self, request):
        """Get tenant invoices with filtering."""
        tenant = self.get_tenant(request)

        if not tenant:
            return Response(
                {'error': 'No tenant profile linked to this account'},
                status=status.HTTP_404_NOT_FOUND
            )

        from apps.billing.models import Invoice
        from apps.billing.serializers import InvoiceSerializer

        current_schema = self._get_schema()
        with schema_context(current_schema):
            invoices = Invoice.objects.filter(tenant=tenant).select_related(
                'tenant', 'unit', 'lease', 'unit__property', 'created_by', 'journal'
            )

            # Filter by status
            status_filter = request.query_params.get('status')
            if status_filter:
                invoices = invoices.filter(status=status_filter)

            # Filter by date range
            start_date = request.query_params.get('start_date')
            end_date = request.query_params.get('end_date')
            if start_date:
                invoices = invoices.filter(date__gte=start_date)
            if end_date:
                invoices = invoices.filter(date__lte=end_date)

            invoices = invoices.order_by('-date')

            result = {
                'count': invoices.count(),
                'total_amount': invoices.aggregate(total=Sum('total_amount'))['total'] or Decimal('0'),
                'total_balance': invoices.aggregate(balance=Sum('balance'))['balance'] or Decimal('0'),
                'invoices': InvoiceSerializer(invoices, many=True).data
            }

        return Response(result)

    @action(detail=False, methods=['get'])
    def receipts(self, request):
        """Get tenant receipts."""
        tenant = self.get_tenant(request)

        if not tenant:
            return Response(
                {'error': 'No tenant profile linked to this account'},
                status=status.HTTP_404_NOT_FOUND
            )

        from apps.billing.models import Receipt
        from apps.billing.serializers import ReceiptSerializer

        current_schema = self._get_schema()
        with schema_context(current_schema):
            receipts = Receipt.objects.filter(tenant=tenant).select_related(
                'tenant', 'invoice', 'invoice__unit', 'created_by', 'journal'
            )

            # Filter by date range
            start_date = request.query_params.get('start_date')
            end_date = request.query_params.get('end_date')
            if start_date:
                receipts = receipts.filter(date__gte=start_date)
            if end_date:
                receipts = receipts.filter(date__lte=end_date)

            receipts = receipts.order_by('-date')

            result = {
                'count': receipts.count(),
                'total_paid': receipts.aggregate(total=Sum('amount'))['total'] or Decimal('0'),
                'receipts': ReceiptSerializer(receipts, many=True).data
            }

        return Response(result)

    @action(detail=False, methods=['get'])
    def statement(self, request):
        """Get tenant account statement."""
        tenant = self.get_tenant(request)

        if not tenant:
            return Response(
                {'error': 'No tenant profile linked to this account'},
                status=status.HTTP_404_NOT_FOUND
            )

        from apps.billing.models import Invoice, Receipt

        current_schema = self._get_schema()
        with schema_context(current_schema):
            # Get date range
            start_date = request.query_params.get('start_date')
            end_date = request.query_params.get('end_date', timezone.now().date())

            # Get all invoices and receipts
            invoices = Invoice.objects.filter(tenant=tenant)
            receipts = Receipt.objects.filter(tenant=tenant)

            if start_date:
                invoices = invoices.filter(date__gte=start_date)
                receipts = receipts.filter(date__gte=start_date)
            if end_date:
                invoices = invoices.filter(date__lte=end_date)
                receipts = receipts.filter(date__lte=end_date)

            # Build statement entries
            entries = []

            for inv in invoices:
                entries.append({
                    'date': inv.date,
                    'type': 'invoice',
                    'reference': inv.invoice_number,
                    'description': f'{inv.get_invoice_type_display()} - {inv.description or ""}',
                    'debit': inv.total_amount,
                    'credit': Decimal('0'),
                })

            for rec in receipts:
                entries.append({
                    'date': rec.date,
                    'type': 'receipt',
                    'reference': rec.receipt_number,
                    'description': f'Payment - {rec.get_payment_method_display()}',
                    'debit': Decimal('0'),
                    'credit': rec.amount,
                })

        # Sort by date
        entries.sort(key=lambda x: x['date'])

        # Calculate running balance
        running_balance = Decimal('0')
        for entry in entries:
            running_balance += entry['debit'] - entry['credit']
            entry['balance'] = running_balance

        # Totals
        total_debit = sum(e['debit'] for e in entries)
        total_credit = sum(e['credit'] for e in entries)

        return Response({
            'tenant': {
                'id': tenant.id,
                'name': tenant.name,
                'code': tenant.code,
            },
            'period': {
                'start_date': start_date,
                'end_date': str(end_date),
            },
            'entries': entries,
            'totals': {
                'total_debit': total_debit,
                'total_credit': total_credit,
                'closing_balance': running_balance,
            }
        })

    @action(detail=False, methods=['get'])
    def lease(self, request):
        """Get tenant lease details."""
        tenant = self.get_tenant(request)

        if not tenant:
            return Response(
                {'error': 'No tenant profile linked to this account'},
                status=status.HTTP_404_NOT_FOUND
            )

        from apps.masterfile.models import LeaseAgreement
        from apps.masterfile.serializers import LeaseAgreementSerializer

        current_schema = self._get_schema()
        with schema_context(current_schema):
            leases = LeaseAgreement.objects.filter(tenant=tenant).select_related(
                'tenant', 'unit', 'unit__property', 'created_by'
            ).order_by('-start_date')

            active_lease = leases.filter(status='active').first()
            past_leases = list(leases.exclude(status__in=['active', 'draft']))

        def lease_with_document(lease_data, lease_obj):
            """Add document_url and payment_day to lease serializer data."""
            if lease_obj and lease_obj.document:
                lease_data['document_url'] = request.build_absolute_uri(lease_obj.document.url)
            else:
                lease_data['document_url'] = None
            lease_data['payment_day'] = lease_obj.billing_day if lease_obj else None
            return lease_data

        active_data = None
        if active_lease:
            active_data = lease_with_document(
                LeaseAgreementSerializer(active_lease).data,
                active_lease
            )

        past_data = []
        for pl in past_leases:
            past_data.append(lease_with_document(
                LeaseAgreementSerializer(pl).data,
                pl
            ))

        return Response({
            'active_lease': active_data,
            'past_leases': past_data
        })

    @action(detail=False, methods=['post'])
    def notify_payment(self, request):
        """
        Submit payment notification.
        Tenants can notify about a payment they've made.
        """
        tenant = self.get_tenant(request)

        if not tenant:
            return Response(
                {'error': 'No tenant profile linked to this account'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Validate required fields
        amount = request.data.get('amount')
        payment_method = request.data.get('payment_method')
        reference = request.data.get('reference', '')
        notes = request.data.get('notes', '')
        payment_date = request.data.get('payment_date', str(timezone.now().date()))

        if not amount or not payment_method:
            return Response(
                {'error': 'amount and payment_method are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create payment notification (this could be a separate model)
        # For now, we'll create an activity log
        UserActivity.objects.create(
            user=request.user,
            action='payment_notification',
            details={
                'tenant_id': tenant.id,
                'tenant_name': tenant.name,
                'amount': str(amount),
                'payment_method': payment_method,
                'reference': reference,
                'payment_date': payment_date,
                'notes': notes,
            }
        )

        # Email confirmation to tenant
        try:
            from apps.notifications.utils import send_tenant_email
            send_tenant_email(
                tenant,
                'Payment Notification Received',
                f"""Dear {tenant.name},

We have received your payment notification. Our team will process it shortly.

Payment Details You Submitted:
- Amount: {amount}
- Payment Method: {payment_method}
- Reference: {reference or 'N/A'}
- Payment Date: {payment_date}
{f'- Notes: {notes}' if notes else ''}

You will receive a receipt once your payment has been verified and processed.

Thank you.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
            )
        except Exception:
            pass

        # Email staff about the payment notification
        try:
            from apps.notifications.utils import send_staff_email
            send_staff_email(
                f'Payment Notification from {tenant.name}: {amount}',
                f"""A tenant has submitted a payment notification via the portal.

Tenant: {tenant.name}
Amount: {amount}
Payment Method: {payment_method}
Reference: {reference or 'N/A'}
Payment Date: {payment_date}
{f'Notes: {notes}' if notes else ''}

Please verify and process this payment.

Best regards,
Parameter System
"""
            )
        except Exception:
            pass

        return Response({
            'message': 'Payment notification submitted successfully. Our team will process it shortly.',
            'notification': {
                'tenant': tenant.name,
                'amount': amount,
                'payment_method': payment_method,
                'reference': reference,
                'payment_date': payment_date,
            }
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def payment_history(self, request):
        """Get payment history with chart data."""
        tenant = self.get_tenant(request)

        if not tenant:
            return Response(
                {'error': 'No tenant profile linked to this account'},
                status=status.HTTP_404_NOT_FOUND
            )

        from apps.billing.models import Receipt
        from django.db.models.functions import TruncMonth

        current_schema = self._get_schema()
        with schema_context(current_schema):
            # Get monthly payment totals for the last 12 months
            receipts = Receipt.objects.filter(tenant=tenant)

            monthly_payments = list(receipts.annotate(
                month=TruncMonth('date')
            ).values('month').annotate(
                total=Sum('amount')
            ).order_by('month'))

            # Payment method breakdown
            method_breakdown = list(receipts.values('payment_method').annotate(
                total=Sum('amount'),
                count=Sum(1)
            ))

        return Response({
            'monthly_payments': [
                {
                    'month': p['month'].strftime('%Y-%m') if p['month'] else None,
                    'total': p['total'],
                }
                for p in monthly_payments
            ],
            'payment_methods': [
                {
                    'method': p['payment_method'],
                    'total': p['total'],
                    'count': p['count'],
                }
                for p in method_breakdown
            ],
            'chart_data': {
                'type': 'bar',
                'labels': [p['month'].strftime('%b %Y') if p['month'] else 'Unknown' for p in monthly_payments],
                'datasets': [
                    {
                        'label': 'Monthly Payments',
                        'data': [float(p['total']) for p in monthly_payments],
                    }
                ]
            }
        })
