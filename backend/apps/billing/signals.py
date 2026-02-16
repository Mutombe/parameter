"""Django signals for billing automation.

Implements automatic journal posting as per SYSTEM OVERVIEW:
- Activity 1: Invoice → Dr Tenant A/c, Cr Unpaid Rent
- Activity 2: Receipt → Dr Cash/Bank, Cr Tenant A/c
- Activity 3: Revenue Recognition → Dr Unpaid Rent, Cr Rent Income
- Activity 4: Commission Calculation → Dr COS, Cr Commission Payable, Cr VAT
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from decimal import Decimal
from .models import Invoice, Receipt
from apps.accounting.models import AuditTrail
from middleware.tenant_middleware import get_current_user
import logging

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Invoice)
def auto_post_invoice(sender, instance, created, **kwargs):
    """
    Automatically post invoice to ledger on creation.
    Activity 1: Dr Tenant A/c (1200), Cr Unpaid Rent (2200)
    """
    user = get_current_user()

    # Create audit trail
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

    # Auto-post to ledger if newly created and not already posted
    if created and not instance.journal and instance.status == Invoice.Status.DRAFT:
        try:
            instance.post_to_ledger(user)
            logger.info(f"Auto-posted invoice {instance.invoice_number} to ledger")
        except Exception as e:
            logger.error(f"Failed to auto-post invoice {instance.invoice_number}: {e}")


@receiver(post_save, sender=Receipt)
def auto_post_receipt(sender, instance, created, **kwargs):
    """
    Automatically post receipt to ledger on creation.
    Activity 2: Dr Cash/Bank, Cr Tenant A/c
    Activity 3: Dr Unpaid Rent, Cr Rent Income (Revenue Recognition)
    Activity 4: Dr COS Commission, Cr Commission Payable, Cr VAT
    """
    user = get_current_user()

    # Create audit trail
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

    # Auto-post to ledger if newly created and not already posted
    if created and not instance.journal:
        try:
            instance.post_to_ledger_with_commission(user)
            logger.info(f"Auto-posted receipt {instance.receipt_number} to ledger with commission")
        except Exception as e:
            logger.error(f"Failed to auto-post receipt {instance.receipt_number}: {e}")
            # Fallback to basic posting
            try:
                instance.post_to_ledger(user)
                logger.info(f"Fallback: Posted receipt {instance.receipt_number} without commission")
            except Exception as e2:
                logger.error(f"Fallback also failed for receipt {instance.receipt_number}: {e2}")

    # Email tenant payment confirmation
    if created and instance.tenant:
        try:
            from apps.notifications.utils import send_tenant_email
            invoice_ref = f" for invoice {instance.invoice.invoice_number}" if instance.invoice else ""
            send_tenant_email(
                instance.tenant,
                f'Payment Received - {instance.receipt_number}',
                f"""Dear {instance.tenant.name},

We confirm receipt of your payment. Thank you!

Payment Details:
- Receipt Number: {instance.receipt_number}
- Amount: {instance.currency} {instance.amount:,.2f}
- Date: {instance.date}
- Payment Method: {instance.get_payment_method_display()}
- Reference: {instance.reference or 'N/A'}
{f'- Applied To: Invoice {instance.invoice.invoice_number}' if instance.invoice else ''}

This is an automated confirmation. Please retain this for your records.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
            )
        except Exception:
            pass
