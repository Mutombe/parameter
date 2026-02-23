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
            # Report tasks — Daily
            {
                'name': 'Send Daily Dashboard KPIs',
                'func': 'apps.reports.tasks.send_daily_dashboard_report_all_tenants',
                'schedule_type': Schedule.DAILY,
                'repeats': -1,
            },
            {
                'name': 'Send Daily Aged Analysis',
                'func': 'apps.reports.tasks.send_daily_aged_analysis_all_tenants',
                'schedule_type': Schedule.DAILY,
                'repeats': -1,
            },
            {
                'name': 'Send Daily Vacancy Report',
                'func': 'apps.reports.tasks.send_daily_vacancy_report_all_tenants',
                'schedule_type': Schedule.DAILY,
                'repeats': -1,
            },
            # Report tasks — Weekly
            {
                'name': 'Send Weekly Rent Roll',
                'func': 'apps.reports.tasks.send_weekly_rent_roll_all_tenants',
                'schedule_type': Schedule.WEEKLY,
                'repeats': -1,
            },
            {
                'name': 'Send Weekly Receipt Listing',
                'func': 'apps.reports.tasks.send_weekly_receipt_listing_all_tenants',
                'schedule_type': Schedule.WEEKLY,
                'repeats': -1,
            },
            {
                'name': 'Send Weekly Bank to Income Analysis',
                'func': 'apps.reports.tasks.send_weekly_bank_to_income_all_tenants',
                'schedule_type': Schedule.WEEKLY,
                'repeats': -1,
            },
            # Report tasks — Monthly
            {
                'name': 'Send Monthly Trial Balance',
                'func': 'apps.reports.tasks.send_monthly_trial_balance_all_tenants',
                'schedule_type': Schedule.MONTHLY,
                'repeats': -1,
            },
            {
                'name': 'Send Monthly Income Statement',
                'func': 'apps.reports.tasks.send_monthly_income_statement_all_tenants',
                'schedule_type': Schedule.MONTHLY,
                'repeats': -1,
            },
            {
                'name': 'Send Monthly Balance Sheet',
                'func': 'apps.reports.tasks.send_monthly_balance_sheet_all_tenants',
                'schedule_type': Schedule.MONTHLY,
                'repeats': -1,
            },
            {
                'name': 'Send Monthly Cash Flow Statement',
                'func': 'apps.reports.tasks.send_monthly_cash_flow_all_tenants',
                'schedule_type': Schedule.MONTHLY,
                'repeats': -1,
            },
            {
                'name': 'Send Monthly Lease Charge Summary',
                'func': 'apps.reports.tasks.send_monthly_lease_charge_summary_all_tenants',
                'schedule_type': Schedule.MONTHLY,
                'repeats': -1,
            },
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
