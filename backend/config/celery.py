"""
Celery configuration for Parameter Real Estate Accounting System.
Handles automated billing, notifications, and background tasks.
"""
import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('parameter')

# Load config from Django settings with CELERY_ prefix
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks in all installed apps
app.autodiscover_tasks()

# Celery Beat Schedule - Automated Tasks
app.conf.beat_schedule = {
    # Generate monthly invoices on the 1st of each month at 6 AM
    'generate-monthly-invoices': {
        'task': 'apps.billing.tasks.generate_monthly_invoices_all_tenants',
        'schedule': crontab(hour=6, minute=0, day_of_month=1),
    },
    # Mark overdue invoices daily at midnight
    'mark-overdue-invoices': {
        'task': 'apps.billing.tasks.mark_overdue_invoices_all_tenants',
        'schedule': crontab(hour=0, minute=0),
    },
    # Send lease expiry reminders daily at 8 AM
    'lease-expiry-reminders': {
        'task': 'apps.masterfile.tasks.send_lease_expiry_reminders',
        'schedule': crontab(hour=8, minute=0),
    },
    # Clean up old notifications weekly on Sunday at 3 AM
    'cleanup-old-notifications': {
        'task': 'apps.notifications.tasks.cleanup_old_notifications',
        'schedule': crontab(hour=3, minute=0, day_of_week=0),
    },
}

app.conf.timezone = 'Africa/Harare'


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
