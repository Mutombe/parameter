"""Django signals for automated accounting entries."""
from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver
from .models import AuditTrail, ChartOfAccount
from middleware.tenant_middleware import get_current_user


@receiver(post_save, sender=ChartOfAccount)
def audit_account_changes(sender, instance, created, **kwargs):
    """Create audit trail for chart of accounts changes."""
    user = get_current_user()
    action = 'account_created' if created else 'account_updated'

    try:
        AuditTrail.objects.create(
            action=action,
            model_name='ChartOfAccount',
            record_id=instance.id,
            changes={
                'code': instance.code,
                'name': instance.name,
                'account_type': instance.account_type,
                'is_active': instance.is_active
            },
            user=user
        )
    except Exception:
        pass  # Don't fail the save if audit fails


@receiver(pre_delete, sender=ChartOfAccount)
def prevent_system_account_deletion(sender, instance, **kwargs):
    """Prevent deletion of system accounts."""
    from django.core.exceptions import ValidationError
    if instance.is_system:
        raise ValidationError('System accounts cannot be deleted')
