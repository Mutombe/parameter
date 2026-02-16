"""Serializers for user accounts."""
from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import User, UserActivity, UserInvitation, PasswordResetToken


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()
    tenant_info = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name',
            'role', 'phone', 'avatar', 'preferred_currency',
            'notifications_enabled', 'is_active', 'is_demo_user',
            'account_status', 'last_activity', 'created_at', 'updated_at',
            'tenant_info'
        ]
        read_only_fields = ['created_at', 'updated_at', 'last_activity']

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_avatar(self, obj):
        if obj.avatar:
            from django.conf import settings
            request = self.context.get('request')

            # Try to build absolute URI from request
            if request:
                try:
                    absolute_url = request.build_absolute_uri(obj.avatar.url)
                    # Check if it's a valid URL (not just filename)
                    if absolute_url.startswith('http'):
                        return absolute_url
                except Exception:
                    pass

            # Fallback: construct URL using SITE_URL or backend URL
            avatar_url = obj.avatar.url
            if avatar_url.startswith('/'):
                # Use backend URL for media files
                backend_url = getattr(settings, 'BACKEND_URL', None) or getattr(settings, 'SITE_URL', '')
                # For production, use the backend domain
                if hasattr(settings, 'RENDER') or not settings.DEBUG:
                    backend_url = 'https://parameter-backend.onrender.com'
                return f"{backend_url}{avatar_url}"
            return avatar_url
        return None

    def get_tenant_info(self, obj):
        """Get current tenant info including demo status."""
        request = self.context.get('request')
        if request and hasattr(request, 'tenant'):
            tenant = request.tenant
            return {
                'name': tenant.name,
                'is_demo': tenant.is_demo,
                'demo_expires_at': tenant.demo_expires_at.isoformat() if tenant.demo_expires_at else None,
                'demo_time_remaining': tenant.demo_time_remaining,
                'account_status': tenant.account_status
            }
        return None


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            'email', 'password', 'confirm_password',
            'first_name', 'last_name', 'role', 'phone'
        ]

    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match'})
        return data

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        user = authenticate(
            email=data['email'],
            password=data['password']
        )
        if not user:
            raise serializers.ValidationError('Invalid email or password')
        if not user.is_active:
            raise serializers.ValidationError('User account is disabled')

        # Check account status
        if hasattr(user, 'account_status'):
            if user.account_status == User.AccountStatus.SUSPENDED:
                raise serializers.ValidationError('Your account has been suspended. Please contact support.')
            if user.account_status == User.AccountStatus.DEMO_EXPIRED:
                raise serializers.ValidationError(
                    'Your demo has expired. Please contact our sales team to activate your account.'
                )

        data['user'] = user
        return data


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, data):
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match'})
        return data


class UserActivitySerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source='user.email', read_only=True)

    class Meta:
        model = UserActivity
        fields = ['id', 'user', 'user_email', 'action', 'details', 'ip_address', 'timestamp']


class UserInvitationSerializer(serializers.ModelSerializer):
    """Serializer for viewing invitations."""
    invited_by_name = serializers.CharField(source='invited_by.get_full_name', read_only=True)
    is_valid = serializers.BooleanField(read_only=True)

    class Meta:
        model = UserInvitation
        fields = [
            'id', 'email', 'first_name', 'last_name', 'role',
            'status', 'invited_by', 'invited_by_name',
            'created_at', 'expires_at', 'is_valid'
        ]
        read_only_fields = ['status', 'invited_by', 'created_at', 'expires_at']


class CreateInvitationSerializer(serializers.Serializer):
    """Serializer for creating invitations."""
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=User.Role.choices, default=User.Role.CLERK)

    def validate_email(self, value):
        # Check if user already exists
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('A user with this email already exists')

        # Check for pending invitation
        pending = UserInvitation.objects.filter(
            email=value,
            status=UserInvitation.Status.PENDING
        ).exists()
        if pending:
            raise serializers.ValidationError('A pending invitation already exists for this email')

        return value

    def validate_role(self, value):
        # Only allow certain roles to be invited
        if value == User.Role.SUPER_ADMIN:
            raise serializers.ValidationError('Cannot invite super admin users')
        return value

    def validate(self, data):
        """Validate that inviter can invite the requested role."""
        from .permissions import get_allowed_invite_roles

        request = self.context.get('request')
        if not request or not request.user:
            raise serializers.ValidationError('Authentication required')

        inviter = request.user
        invited_role = data.get('role', User.Role.CLERK)

        # Get allowed roles for this inviter
        allowed_roles = get_allowed_invite_roles(inviter)

        # Check if inviter can invite this role
        if invited_role not in allowed_roles:
            allowed_names = [r.label for r in allowed_roles] if allowed_roles else []
            raise serializers.ValidationError({
                'role': f'You cannot invite users with this role. Allowed roles: {", ".join(allowed_names) or "None"}'
            })

        return data


class AcceptInvitationSerializer(serializers.Serializer):
    """Serializer for accepting an invitation."""
    token = serializers.CharField()
    password = serializers.CharField(min_length=8, write_only=True)
    confirm_password = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)

    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match'})
        return data

    def validate_token(self, value):
        try:
            invitation = UserInvitation.objects.get(token=value)
        except UserInvitation.DoesNotExist:
            raise serializers.ValidationError('Invalid invitation token')

        if invitation.status != UserInvitation.Status.PENDING:
            raise serializers.ValidationError('This invitation has already been used or cancelled')

        if invitation.is_expired:
            invitation.status = UserInvitation.Status.EXPIRED
            invitation.save()
            raise serializers.ValidationError('This invitation has expired')

        return value


class RequestPasswordResetSerializer(serializers.Serializer):
    """Serializer for requesting a password reset."""
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    """Serializer for resetting a password with a token."""
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8, write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, data):
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match'})
        return data

    def validate_token(self, value):
        try:
            token_obj = PasswordResetToken.objects.get(token=value)
        except PasswordResetToken.DoesNotExist:
            raise serializers.ValidationError('Invalid or expired reset link')
        if not token_obj.is_valid:
            raise serializers.ValidationError('This reset link has expired. Please request a new one.')
        return value
