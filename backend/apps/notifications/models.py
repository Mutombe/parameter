"""
Notification models for Parameter Real Estate Accounting System.
Handles in-app notifications, email alerts, and masterfile change tracking.
"""
from django.db import models
from django.conf import settings


class Notification(models.Model):
    """In-app notification for users."""

    class NotificationType(models.TextChoices):
        # Masterfile Changes
        MASTERFILE_CREATED = 'masterfile_created', 'Masterfile Created'
        MASTERFILE_UPDATED = 'masterfile_updated', 'Masterfile Updated'
        MASTERFILE_DELETED = 'masterfile_deleted', 'Masterfile Deleted'

        # Billing
        INVOICE_CREATED = 'invoice_created', 'Invoice Created'
        INVOICE_OVERDUE = 'invoice_overdue', 'Invoice Overdue'
        INVOICE_REMINDER = 'invoice_reminder', 'Invoice Reminder'
        PAYMENT_RECEIVED = 'payment_received', 'Payment Received'

        # Lease
        LEASE_EXPIRING = 'lease_expiring', 'Lease Expiring'
        LEASE_ACTIVATED = 'lease_activated', 'Lease Activated'
        LEASE_TERMINATED = 'lease_terminated', 'Lease Terminated'

        # Due Dates & Penalties
        RENTAL_DUE = 'rental_due', 'Rental Due Reminder'
        LATE_PENALTY = 'late_penalty', 'Late Payment Penalty'

        # System
        SYSTEM_ALERT = 'system_alert', 'System Alert'
        USER_INVITED = 'user_invited', 'User Invited'
        USER_JOINED = 'user_joined', 'User Joined'

    class Priority(models.TextChoices):
        LOW = 'low', 'Low'
        MEDIUM = 'medium', 'Medium'
        HIGH = 'high', 'High'
        URGENT = 'urgent', 'Urgent'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    notification_type = models.CharField(
        max_length=30,
        choices=NotificationType.choices
    )
    priority = models.CharField(
        max_length=10,
        choices=Priority.choices,
        default=Priority.MEDIUM
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    data = models.JSONField(default=dict, blank=True)

    # Status
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    # Email
    email_sent = models.BooleanField(default=False)
    email_sent_at = models.DateTimeField(null=True, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read']),
            models.Index(fields=['notification_type']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"{self.title} - {self.user.email}"

    def mark_as_read(self):
        """Mark notification as read."""
        from django.utils import timezone
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=['is_read', 'read_at'])


class NotificationPreference(models.Model):
    """User notification preferences."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notification_preferences'
    )

    # Email notifications
    email_masterfile_changes = models.BooleanField(default=True)
    email_invoice_alerts = models.BooleanField(default=True)
    email_payment_received = models.BooleanField(default=True)
    email_lease_alerts = models.BooleanField(default=True)
    email_system_alerts = models.BooleanField(default=True)

    # Due dates & penalties
    email_rental_due = models.BooleanField(default=True)
    email_late_penalty = models.BooleanField(default=True)

    # In-app notifications
    push_masterfile_changes = models.BooleanField(default=True)
    push_invoice_alerts = models.BooleanField(default=True)
    push_payment_received = models.BooleanField(default=True)
    push_lease_alerts = models.BooleanField(default=True)
    push_system_alerts = models.BooleanField(default=True)
    push_rental_due = models.BooleanField(default=True)
    push_late_penalty = models.BooleanField(default=True)

    # Daily digest
    daily_digest = models.BooleanField(default=False)
    digest_time = models.TimeField(default='08:00')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Preferences for {self.user.email}"


class MasterfileChangeLog(models.Model):
    """
    Tracks all masterfile changes for audit and notification purposes.
    More detailed than AuditTrail - specifically for masterfile entities.
    """

    class ChangeType(models.TextChoices):
        CREATED = 'created', 'Created'
        UPDATED = 'updated', 'Updated'
        DELETED = 'deleted', 'Deleted'

    class EntityType(models.TextChoices):
        LANDLORD = 'landlord', 'Landlord'
        PROPERTY = 'property', 'Property'
        UNIT = 'unit', 'Unit'
        TENANT = 'tenant', 'Tenant'
        LEASE = 'lease', 'Lease Agreement'

    entity_type = models.CharField(max_length=20, choices=EntityType.choices)
    entity_id = models.PositiveIntegerField()
    entity_name = models.CharField(max_length=255)  # Stored for reference after deletion

    change_type = models.CharField(max_length=10, choices=ChangeType.choices)
    changes = models.JSONField(default=dict)  # Before/after values for updates

    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='masterfile_changes'
    )
    changed_by_email = models.EmailField()  # Preserved even if user deleted

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['entity_type', 'entity_id']),
            models.Index(fields=['change_type']),
            models.Index(fields=['changed_by']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"{self.change_type} {self.entity_type}: {self.entity_name}"
