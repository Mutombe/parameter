"""Maintenance request and work order models."""
from django.db import models
from django.conf import settings
from apps.soft_delete import SoftDeleteModel


class MaintenanceRequest(SoftDeleteModel):
    """A maintenance request reported by a tenant or staff."""

    class Priority(models.TextChoices):
        LOW = 'low', 'Low'
        MEDIUM = 'medium', 'Medium'
        HIGH = 'high', 'High'
        EMERGENCY = 'emergency', 'Emergency'

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        IN_PROGRESS = 'in_progress', 'In Progress'
        COMPLETED = 'completed', 'Completed'
        CANCELLED = 'cancelled', 'Cancelled'

    property = models.ForeignKey(
        'masterfile.Property', on_delete=models.CASCADE,
        related_name='maintenance_requests'
    )
    unit = models.ForeignKey(
        'masterfile.Unit', on_delete=models.CASCADE,
        related_name='maintenance_requests',
        null=True, blank=True,
    )
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='reported_maintenance'
    )

    title = models.CharField(max_length=255)
    description = models.TextField()
    priority = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
    )

    # Photos stored as list of URLs
    photos = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Maintenance Request'
        verbose_name_plural = 'Maintenance Requests'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'priority']),
            models.Index(fields=['property', 'status']),
            models.Index(fields=['-created_at']),
        ]

    def __str__(self):
        return f'MR-{self.pk}: {self.title}'


class WorkOrder(SoftDeleteModel):
    """A work order assigned to handle a maintenance request."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        SCHEDULED = 'scheduled', 'Scheduled'
        IN_PROGRESS = 'in_progress', 'In Progress'
        COMPLETED = 'completed', 'Completed'
        CANCELLED = 'cancelled', 'Cancelled'

    request = models.ForeignKey(
        MaintenanceRequest, on_delete=models.CASCADE,
        related_name='work_orders'
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='assigned_work_orders'
    )

    vendor_name = models.CharField(max_length=255, blank=True)
    estimated_cost = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True
    )
    actual_cost = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True
    )
    currency = models.CharField(max_length=3, default='USD')

    scheduled_date = models.DateField(null=True, blank=True)
    completed_date = models.DateField(null=True, blank=True)

    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Work Order'
        verbose_name_plural = 'Work Orders'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['request', 'status']),
            models.Index(fields=['status']),
            models.Index(fields=['scheduled_date']),
        ]

    def __str__(self):
        return f'WO-{self.pk} for {self.request}'
