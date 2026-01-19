"""Views for user accounts and authentication."""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.views import APIView
from django.contrib.auth import login, logout
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.middleware.csrf import get_token
from .models import User, UserActivity, UserInvitation
from .serializers import (
    UserSerializer, UserCreateSerializer, LoginSerializer,
    ChangePasswordSerializer, UserActivitySerializer,
    UserInvitationSerializer, CreateInvitationSerializer, AcceptInvitationSerializer
)


class AuthViewSet(viewsets.ViewSet):
    """Authentication endpoints."""
    permission_classes = [AllowAny]

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
            return Response({
                'error': 'An unexpected error occurred. Please try again.',
                'details': str(e) if request.user.is_superuser else None
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

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        user = self.get_object()
        user.is_active = False
        user.save()
        return Response({'message': f'User {user.email} deactivated'})

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
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
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        return UserInvitation.objects.all()

    def get_serializer_class(self):
        if self.action == 'create':
            return CreateInvitationSerializer
        return UserInvitationSerializer

    def create(self, request):
        """Create and send a new invitation."""
        from datetime import timedelta
        from django.core.mail import send_mail
        from django.conf import settings

        serializer = CreateInvitationSerializer(data=request.data)
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
        import logging
        logger = logging.getLogger(__name__)

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
