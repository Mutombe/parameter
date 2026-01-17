"""Serializers for tenant management."""
from rest_framework import serializers
from .models import Client, Domain, GlobalSettings


class DomainSerializer(serializers.ModelSerializer):
    class Meta:
        model = Domain
        fields = ['id', 'domain', 'is_primary']


class ClientSerializer(serializers.ModelSerializer):
    domains = DomainSerializer(many=True, read_only=True)

    class Meta:
        model = Client
        fields = [
            'id', 'schema_name', 'name', 'description', 'logo',
            'email', 'phone', 'address', 'is_active', 'subscription_plan',
            'ai_accounting_enabled', 'ai_reconciliation_enabled',
            'ai_reports_enabled', 'ai_ocr_enabled', 'default_currency',
            'created_at', 'updated_at', 'domains'
        ]
        read_only_fields = ['schema_name', 'created_at', 'updated_at']


class ClientCreateSerializer(serializers.ModelSerializer):
    subdomain = serializers.CharField(write_only=True)

    class Meta:
        model = Client
        fields = [
            'name', 'description', 'email', 'phone', 'address',
            'subscription_plan', 'default_currency', 'subdomain'
        ]

    def create(self, validated_data):
        subdomain = validated_data.pop('subdomain')
        schema_name = subdomain.lower().replace(' ', '_').replace('-', '_')

        client = Client.objects.create(
            schema_name=schema_name,
            **validated_data
        )

        # Create primary domain
        Domain.objects.create(
            domain=f'{subdomain}.localhost',
            tenant=client,
            is_primary=True
        )

        return client


class GlobalSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = GlobalSettings
        fields = ['id', 'key', 'value', 'description', 'updated_at']


class CompanyOnboardingSerializer(serializers.Serializer):
    """Serializer for company onboarding/registration."""

    # Company Details
    company_name = serializers.CharField(max_length=255)
    subdomain = serializers.CharField(max_length=30)
    company_email = serializers.EmailField()
    company_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    company_address = serializers.CharField(required=False, allow_blank=True)
    subscription_plan = serializers.ChoiceField(
        choices=['free', 'basic', 'professional', 'enterprise'],
        default='free'
    )
    default_currency = serializers.ChoiceField(
        choices=['USD', 'ZiG'],
        default='USD'
    )

    # Admin User Details
    admin_email = serializers.EmailField()
    admin_password = serializers.CharField(min_length=8, write_only=True)
    admin_first_name = serializers.CharField(max_length=150)
    admin_last_name = serializers.CharField(max_length=150)
    admin_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    # Setup Options
    create_sample_coa = serializers.BooleanField(default=True)
    send_welcome_email = serializers.BooleanField(default=True)

    def validate_subdomain(self, value):
        from .onboarding import OnboardingService
        service = OnboardingService()
        result = service.validate_subdomain(value)
        if not result['valid'] or not result['available']:
            raise serializers.ValidationError(result['error'])
        return value.lower().strip()

    def validate_admin_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError('Password must be at least 8 characters')
        if not any(c.isdigit() for c in value):
            raise serializers.ValidationError('Password must contain at least one number')
        if not any(c.isalpha() for c in value):
            raise serializers.ValidationError('Password must contain at least one letter')
        return value


class SubdomainCheckSerializer(serializers.Serializer):
    """Serializer for checking subdomain availability."""
    subdomain = serializers.CharField(max_length=30)


class TenantInvitationSerializer(serializers.ModelSerializer):
    """Serializer for viewing tenant invitations."""
    from .models import TenantInvitation

    invited_by_name = serializers.CharField(source='invited_by.get_full_name', read_only=True)
    is_valid = serializers.BooleanField(read_only=True)

    class Meta:
        from .models import TenantInvitation
        model = TenantInvitation
        fields = [
            'id', 'email', 'company_name', 'first_name', 'last_name',
            'invitation_type', 'subscription_plan', 'status', 'message',
            'invited_by', 'invited_by_name', 'created_tenant',
            'created_at', 'expires_at', 'accepted_at', 'is_valid'
        ]
        read_only_fields = ['status', 'invited_by', 'created_tenant', 'created_at', 'expires_at', 'accepted_at']


class CreateTenantInvitationSerializer(serializers.Serializer):
    """Serializer for creating tenant invitations (Super Admin only)."""
    email = serializers.EmailField()
    company_name = serializers.CharField(max_length=255)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    invitation_type = serializers.ChoiceField(
        choices=[('full', 'Full Account'), ('demo', 'Demo Account')],
        default='full'
    )
    subscription_plan = serializers.ChoiceField(
        choices=['free', 'basic', 'professional', 'enterprise'],
        default='basic'
    )
    message = serializers.CharField(required=False, allow_blank=True)

    def validate_email(self, value):
        from .models import TenantInvitation, Client

        # Check if a tenant with this email already exists
        if Client.objects.filter(email=value).exists():
            raise serializers.ValidationError('A company with this email already exists')

        # Check for pending invitation
        pending = TenantInvitation.objects.filter(
            email=value,
            status=TenantInvitation.Status.PENDING
        ).exists()
        if pending:
            raise serializers.ValidationError('A pending invitation already exists for this email')

        return value


class AcceptTenantInvitationSerializer(serializers.Serializer):
    """Serializer for accepting a tenant invitation and creating company + admin."""
    token = serializers.CharField()
    subdomain = serializers.CharField(max_length=30)
    company_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    company_address = serializers.CharField(required=False, allow_blank=True)

    # Admin user details
    admin_password = serializers.CharField(min_length=8, write_only=True)
    admin_password_confirm = serializers.CharField(write_only=True)
    admin_first_name = serializers.CharField(max_length=150, required=False)
    admin_last_name = serializers.CharField(max_length=150, required=False)
    admin_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    default_currency = serializers.ChoiceField(
        choices=['USD', 'ZiG'],
        default='USD'
    )

    def validate(self, data):
        if data['admin_password'] != data['admin_password_confirm']:
            raise serializers.ValidationError({'admin_password_confirm': 'Passwords do not match'})
        return data

    def validate_token(self, value):
        from .models import TenantInvitation

        try:
            invitation = TenantInvitation.objects.get(token=value)
        except TenantInvitation.DoesNotExist:
            raise serializers.ValidationError('Invalid invitation token')

        if invitation.status != TenantInvitation.Status.PENDING:
            raise serializers.ValidationError('This invitation has already been used or cancelled')

        if invitation.is_expired:
            invitation.status = TenantInvitation.Status.EXPIRED
            invitation.save()
            raise serializers.ValidationError('This invitation has expired')

        return value

    def validate_subdomain(self, value):
        from .onboarding import OnboardingService
        service = OnboardingService()
        result = service.validate_subdomain(value)
        if not result['valid'] or not result['available']:
            raise serializers.ValidationError(result['error'])
        return value.lower().strip()


class DemoSignupSerializer(serializers.Serializer):
    """Serializer for demo account signup (public)."""
    # Company details
    company_name = serializers.CharField(max_length=255)
    subdomain = serializers.CharField(max_length=30)
    company_email = serializers.EmailField()
    company_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    # Admin user details
    admin_email = serializers.EmailField()
    admin_password = serializers.CharField(min_length=8, write_only=True)
    admin_password_confirm = serializers.CharField(write_only=True)
    admin_first_name = serializers.CharField(max_length=150)
    admin_last_name = serializers.CharField(max_length=150)
    admin_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    default_currency = serializers.ChoiceField(
        choices=['USD', 'ZiG'],
        default='USD'
    )

    def validate(self, data):
        if data['admin_password'] != data['admin_password_confirm']:
            raise serializers.ValidationError({'admin_password_confirm': 'Passwords do not match'})
        return data

    def validate_subdomain(self, value):
        from .onboarding import OnboardingService
        service = OnboardingService()
        result = service.validate_subdomain(value)
        if not result['valid'] or not result['available']:
            raise serializers.ValidationError(result['error'])
        return value.lower().strip()

    def validate_company_email(self, value):
        from .models import Client
        if Client.objects.filter(email=value).exists():
            raise serializers.ValidationError('A company with this email already exists')
        return value
