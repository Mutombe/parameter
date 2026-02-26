"""Service layer for billing business logic."""
import logging
from decimal import Decimal
from datetime import date
from calendar import monthrange

logger = logging.getLogger(__name__)


def generate_monthly_invoices(month, year, lease_ids=None, created_by=None):
    """
    Generate monthly rent invoices for all active leases.
    Returns (created_invoices, errors).
    """
    from .models import Invoice
    from apps.masterfile.models import LeaseAgreement

    leases = LeaseAgreement.objects.filter(
        status='active'
    ).select_related('tenant', 'unit')
    if lease_ids:
        leases = leases.filter(id__in=lease_ids)

    _, last_day = monthrange(year, month)
    period_start = date(year, month, 1)
    period_end = date(year, month, last_day)
    invoice_date = date.today()
    due_date = date(year, month, 15)

    existing_lease_ids = set(
        Invoice.objects.filter(
            lease__in=leases,
            period_start=period_start,
            period_end=period_end
        ).values_list('lease_id', flat=True)
    )

    invoices_to_create = []
    errors = []

    for lease in leases:
        if lease.id in existing_lease_ids:
            errors.append(f'Invoice already exists for {lease.lease_number}')
            continue

        invoices_to_create.append(Invoice(
            tenant=lease.tenant,
            lease=lease,
            unit=lease.unit,
            invoice_type=Invoice.InvoiceType.RENT,
            date=invoice_date,
            due_date=due_date,
            period_start=period_start,
            period_end=period_end,
            amount=lease.monthly_rent,
            vat_amount=Decimal('0'),
            currency=lease.currency,
            description=f'Rent for {period_start.strftime("%B %Y")} - {lease.unit}',
            created_by=created_by
        ))

    created_invoices = []
    for invoice in invoices_to_create:
        try:
            invoice.save()
            created_invoices.append(invoice)
        except Exception as e:
            errors.append(f'Error creating invoice: {str(e)}')

    return created_invoices, errors
