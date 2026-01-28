"""Models for data import tracking."""
from django.db import models
from django.conf import settings


class ImportJob(models.Model):
    """Tracks an import job with its status and results."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        VALIDATING = 'validating', 'Validating'
        VALIDATED = 'validated', 'Validated'
        PROCESSING = 'processing', 'Processing'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'
        CANCELLED = 'cancelled', 'Cancelled'

    class ImportType(models.TextChoices):
        LANDLORDS = 'landlords', 'Landlords'
        PROPERTIES = 'properties', 'Properties'
        TENANTS = 'tenants', 'Tenants'
        LEASES = 'leases', 'Leases'
        INVOICES = 'invoices', 'Invoices'
        RECEIPTS = 'receipts', 'Receipts'
        COMBINED = 'combined', 'Combined (Multi-sheet)'

    # Job metadata
    import_type = models.CharField(max_length=20, choices=ImportType.choices)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )
    file_name = models.CharField(max_length=255)
    file = models.FileField(upload_to='imports/')

    # Processing stats
    total_rows = models.PositiveIntegerField(default=0)
    processed_rows = models.PositiveIntegerField(default=0)
    success_count = models.PositiveIntegerField(default=0)
    error_count = models.PositiveIntegerField(default=0)

    # Validation preview data (JSON)
    preview_data = models.JSONField(null=True, blank=True)

    # Error details
    error_message = models.TextField(blank=True)

    # Audit
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='import_jobs'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Import Job'
        verbose_name_plural = 'Import Jobs'

    def __str__(self):
        return f"{self.import_type} - {self.file_name} ({self.status})"

    @property
    def progress_percent(self):
        if self.total_rows == 0:
            return 0
        return int((self.processed_rows / self.total_rows) * 100)


class ImportError(models.Model):
    """Tracks individual row errors during import."""

    job = models.ForeignKey(
        ImportJob,
        on_delete=models.CASCADE,
        related_name='errors'
    )
    sheet_name = models.CharField(max_length=100, blank=True)
    row_number = models.PositiveIntegerField()
    field_name = models.CharField(max_length=100, blank=True)
    error_message = models.TextField()
    row_data = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ['sheet_name', 'row_number']

    def __str__(self):
        return f"Row {self.row_number}: {self.error_message}"
