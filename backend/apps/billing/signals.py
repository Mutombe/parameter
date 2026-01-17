"""Django signals for billing automation."""
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Invoice, Receipt
from apps.accounting.models import AuditTrail
from middleware.tenant_middleware import get_current_user


@receiver(post_save, sender=Invoice)
def audit_invoice_changes(sender, instance, created, **kwargs):
    """Create audit trail for invoice changes."""
    user = get_current_user()
    action = 'invoice_created' if created else 'invoice_updated'

    try:
        AuditTrail.objects.create(
            action=action,
            model_name='Invoice',
            record_id=instance.id,
            changes={
                'invoice_number': instance.invoice_number,
                'tenant': instance.tenant.name,
                'amount': str(instance.total_amount),
                'status': instance.status
            },
            user=user
        )
    except Exception:
        pass


@receiver(post_save, sender=Receipt)
def audit_receipt_changes(sender, instance, created, **kwargs):
    """Create audit trail for receipt changes."""
    user = get_current_user()
    action = 'receipt_created' if created else 'receipt_updated'

    try:
        AuditTrail.objects.create(
            action=action,
            model_name='Receipt',
            record_id=instance.id,
            changes={
                'receipt_number': instance.receipt_number,
                'tenant': instance.tenant.name,
                'amount': str(instance.amount),
                'payment_method': instance.payment_method
            },
            user=user
        )
    except Exception:
        pass
