"""Admin configuration for imports."""
from django.contrib import admin
from .models import ImportJob, ImportError


@admin.register(ImportJob)
class ImportJobAdmin(admin.ModelAdmin):
    """Admin for import jobs."""
    list_display = ['id', 'import_type', 'status', 'file_name', 'total_rows',
                    'success_count', 'error_count', 'created_by', 'created_at']
    list_filter = ['status', 'import_type', 'created_at']
    search_fields = ['file_name', 'created_by__email']
    readonly_fields = ['created_at', 'started_at', 'completed_at']


@admin.register(ImportError)
class ImportErrorAdmin(admin.ModelAdmin):
    """Admin for import errors."""
    list_display = ['id', 'job', 'sheet_name', 'row_number', 'field_name', 'error_message']
    list_filter = ['sheet_name']
    search_fields = ['error_message', 'field_name']
