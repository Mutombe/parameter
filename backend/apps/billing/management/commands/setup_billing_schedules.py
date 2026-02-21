"""
Management command to set up Django-Q2 schedules for all recurring tasks.
Run: python manage.py setup_billing_schedules
"""
from django.core.management.base import BaseCommand
from django_q.models import Schedule


class Command(BaseCommand):
    help = 'Set up recurring task schedules (Django-Q2)'

    def handle(self, *args, **options):
        schedules = [
            # Billing tasks
            {
                'name': 'Generate Monthly Invoices',
                'func': 'apps.billing.tasks.generate_monthly_invoices_all_tenants',
                'schedule_type': Schedule.MONTHLY,
                'repeats': -1,
            },
            {
                'name': 'Mark Overdue Invoices',
                'func': 'apps.billing.tasks.mark_overdue_invoices_all_tenants',
                'schedule_type': Schedule.DAILY,
                'repeats': -1,
            },
            {
                'name': 'Send Rental Due Reminders',
                'func': 'apps.billing.tasks.send_rental_due_reminders_all_tenants',
                'schedule_type': Schedule.DAILY,
                'repeats': -1,
            },
            {
                'name': 'Apply Late Penalties',
                'func': 'apps.billing.tasks.apply_late_penalties_all_tenants',
                'schedule_type': Schedule.DAILY,
                'repeats': -1,
            },
            # Masterfile tasks
            {
                'name': 'Lease Expiry Reminders',
                'func': 'apps.masterfile.tasks.send_lease_expiry_reminders',
                'schedule_type': Schedule.DAILY,
                'repeats': -1,
            },
            # Report tasks
            {
                'name': 'Send Monthly Commission Reports',
                'func': 'apps.reports.tasks.send_monthly_commission_reports_all_tenants',
                'schedule_type': Schedule.MONTHLY,
                'repeats': -1,
            },
            # Notification tasks
            {
                'name': 'Cleanup Old Notifications',
                'func': 'apps.notifications.tasks.cleanup_old_notifications',
                'schedule_type': Schedule.WEEKLY,
                'repeats': -1,
            },
            {
                'name': 'Send Daily Digest',
                'func': 'apps.notifications.tasks.send_daily_digest',
                'schedule_type': Schedule.DAILY,
                'repeats': -1,
            },
        ]

        for sched_data in schedules:
            name = sched_data.pop('name')
            schedule, created = Schedule.objects.update_or_create(
                name=name,
                defaults=sched_data
            )
            status = 'Created' if created else 'Updated'
            self.stdout.write(self.style.SUCCESS(f'{status}: {name}'))

        self.stdout.write(self.style.SUCCESS(f'\n{len(schedules)} task schedules configured successfully.'))
