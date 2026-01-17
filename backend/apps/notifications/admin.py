"""Admin configuration for notifications."""
from django.contrib import admin
from .models import Notification, NotificationPreference, MasterfileChangeLog


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'notification_type', 'is_read', 'created_at']
    list_filter = ['notification_type', 'is_read', 'priority', 'created_at']
    search_fields = ['title', 'message', 'user__email']
    readonly_fields = ['created_at']


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ['user', 'daily_digest', 'email_masterfile_changes', 'email_invoice_alerts']
    search_fields = ['user__email']


@admin.register(MasterfileChangeLog)
class MasterfileChangeLogAdmin(admin.ModelAdmin):
    list_display = ['entity_type', 'entity_name', 'change_type', 'changed_by_email', 'created_at']
    list_filter = ['entity_type', 'change_type', 'created_at']
    search_fields = ['entity_name', 'changed_by_email']
    readonly_fields = ['created_at']
