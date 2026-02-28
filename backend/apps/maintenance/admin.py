from django.contrib import admin
from .models import MaintenanceRequest, WorkOrder


@admin.register(MaintenanceRequest)
class MaintenanceRequestAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'property', 'unit', 'priority', 'status', 'created_at']
    list_filter = ['status', 'priority', 'property']
    search_fields = ['title', 'description']
    ordering = ['-created_at']


@admin.register(WorkOrder)
class WorkOrderAdmin(admin.ModelAdmin):
    list_display = ['id', 'request', 'vendor_name', 'status', 'scheduled_date', 'completed_date']
    list_filter = ['status']
    search_fields = ['vendor_name', 'notes']
    ordering = ['-created_at']
