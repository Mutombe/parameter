"""Signals for maintenance module - send notifications on status changes."""
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import MaintenanceRequest, WorkOrder
import logging

logger = logging.getLogger(__name__)


@receiver(post_save, sender=MaintenanceRequest)
def maintenance_request_status_changed(sender, instance, created, **kwargs):
    """Send notification when maintenance request status changes."""
    if created:
        logger.info(f"New maintenance request created: {instance.title} (Priority: {instance.priority})")
        try:
            from apps.notifications.models import Notification
            Notification.objects.create(
                title=f'New Maintenance Request: {instance.title}',
                message=f'Priority: {instance.get_priority_display()} - {instance.description[:100]}',
                notification_type='maintenance',
            )
        except Exception:
            pass  # Notification system may not be set up
    else:
        # Check if status changed by comparing update_fields
        if kwargs.get('update_fields') and 'status' in kwargs['update_fields']:
            logger.info(
                f"Maintenance request {instance.pk} status changed to {instance.status}"
            )


@receiver(post_save, sender=WorkOrder)
def work_order_status_changed(sender, instance, created, **kwargs):
    """Update maintenance request status when work order changes."""
    if not created and instance.status == WorkOrder.Status.IN_PROGRESS:
        # If any work order is in progress, set the request to in_progress
        request = instance.request
        if request.status == MaintenanceRequest.Status.OPEN:
            request.status = MaintenanceRequest.Status.IN_PROGRESS
            request.save(update_fields=['status', 'updated_at'])
