"""
Management command to test report email delivery.

Usage:
    python manage.py send_test_report_email --list
    python manage.py send_test_report_email --email user@example.com
    python manage.py send_test_report_email --report dashboard
    python manage.py send_test_report_email --frequency daily
    python manage.py send_test_report_email --tenant demo
    python manage.py send_test_report_email --email user@example.com --report dashboard --tenant demo
"""
from django.core.management.base import BaseCommand
from django_tenants.utils import tenant_context, get_tenant_model

from apps.reports.tasks import REPORT_REGISTRY


class Command(BaseCommand):
    help = 'Send test report emails to verify formatting and data'

    def add_arguments(self, parser):
        parser.add_argument('--list', action='store_true', help='List all available reports')
        parser.add_argument('--email', type=str, help='Override recipient email address')
        parser.add_argument('--report', type=str, help='Single report key (e.g. dashboard, aged_analysis)')
        parser.add_argument('--frequency', type=str, choices=['daily', 'weekly', 'monthly'],
                            help='Run all reports of a given frequency')
        parser.add_argument('--tenant', type=str, help='Tenant schema_name to run against (default: all active)')

    def handle(self, *args, **options):
        if options['list']:
            self._list_reports()
            return

        # Determine which reports to run
        report_keys = self._resolve_report_keys(options)
        if not report_keys:
            self.stderr.write(self.style.ERROR('No reports selected. Use --list to see available reports.'))
            return

        # Determine tenants
        tenants = self._resolve_tenants(options)
        if not tenants:
            return

        override_email = options.get('email')
        total_sent = 0
        total_skipped = 0
        total_failed = 0

        for tenant in tenants:
            self.stdout.write(f"\n--- Tenant: {tenant.name} ({tenant.schema_name}) ---")
            with tenant_context(tenant):
                for key in report_keys:
                    freq, gen_fn, build_fn, label = REPORT_REGISTRY[key]
                    if gen_fn is None:
                        # Commission uses its own flow
                        self.stdout.write(self.style.WARNING(
                            f"  [{key}] Skipped — commission uses its own task function"))
                        total_skipped += 1
                        continue

                    try:
                        data = gen_fn()
                        if data is None:
                            self.stdout.write(self.style.WARNING(f"  [{key}] Skipped — no data (skip condition met)"))
                            total_skipped += 1
                            continue

                        period = data.pop('_period_label', '')
                        subject = f'{label} — {period}' if period else label
                        body = build_fn(data)

                        if override_email:
                            from apps.notifications.utils import send_email
                            send_email(override_email, subject, body, blocking=True)
                        else:
                            from apps.notifications.utils import send_staff_email
                            send_staff_email(subject, body, blocking=True)

                        self.stdout.write(self.style.SUCCESS(f"  [{key}] Sent: {subject}"))
                        total_sent += 1

                    except Exception as e:
                        self.stderr.write(self.style.ERROR(f"  [{key}] FAILED: {e}"))
                        total_failed += 1

        self.stdout.write(f"\nDone — sent={total_sent}, skipped={total_skipped}, failed={total_failed}")

    def _list_reports(self):
        self.stdout.write('\nAvailable reports:\n')
        self.stdout.write(f"  {'Key':<20} {'Frequency':<10} {'Label'}")
        self.stdout.write(f"  {'---':<20} {'---------':<10} {'-----'}")
        for key, (freq, gen_fn, build_fn, label) in sorted(REPORT_REGISTRY.items()):
            note = ' (separate task)' if gen_fn is None else ''
            self.stdout.write(f"  {key:<20} {freq:<10} {label}{note}")
        self.stdout.write(f"\n  Total: {len(REPORT_REGISTRY)} reports")

    def _resolve_report_keys(self, options):
        if options.get('report'):
            key = options['report']
            if key not in REPORT_REGISTRY:
                self.stderr.write(self.style.ERROR(f"Unknown report: {key}. Use --list to see options."))
                return []
            return [key]
        if options.get('frequency'):
            freq = options['frequency']
            return [k for k, (f, *_) in REPORT_REGISTRY.items() if f == freq]
        # Default: all reports
        return list(REPORT_REGISTRY.keys())

    def _resolve_tenants(self, options):
        TenantModel = get_tenant_model()
        if options.get('tenant'):
            try:
                tenant = TenantModel.objects.get(schema_name=options['tenant'])
                return [tenant]
            except TenantModel.DoesNotExist:
                self.stderr.write(self.style.ERROR(
                    f"Tenant '{options['tenant']}' not found. Available schemas:"))
                for t in TenantModel.objects.exclude(schema_name='public').values_list('schema_name', flat=True):
                    self.stderr.write(f"  - {t}")
                return []
        tenants = list(TenantModel.objects.filter(is_active=True).exclude(schema_name='public'))
        if not tenants:
            self.stderr.write(self.style.ERROR('No active tenants found.'))
        return tenants
