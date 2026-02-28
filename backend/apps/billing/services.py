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
    ).select_related('tenant', 'unit', 'unit__property')
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

        # Skip vacant units for rental leases (levy always bills regardless)
        if lease.lease_type == 'rental' and not lease.unit.is_occupied:
            errors.append(f'Skipped {lease.lease_number}: rental unit {lease.unit} is vacant')
            continue

        # Set invoice_type based on lease_type
        if lease.lease_type == 'levy':
            invoice_type = Invoice.InvoiceType.LEVY
            desc_label = 'Levy'
        else:
            invoice_type = Invoice.InvoiceType.RENT
            desc_label = 'Rent'

        invoices_to_create.append(Invoice(
            tenant=lease.tenant,
            lease=lease,
            unit=lease.unit,
            invoice_type=invoice_type,
            date=invoice_date,
            due_date=due_date,
            period_start=period_start,
            period_end=period_end,
            amount=lease.monthly_rent,
            vat_amount=Decimal('0'),
            currency=lease.currency,
            description=f'{desc_label} for {period_start.strftime("%B %Y")} - {lease.unit}',
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


def apply_lease_escalations():
    """
    Apply annual rent escalations for leases where the anniversary month matches the current month.
    Should be called before monthly invoice generation.
    Returns list of updated leases.
    """
    from datetime import date
    from apps.masterfile.models import LeaseAgreement

    today = date.today()
    current_month = today.month
    updated_leases = []

    # Find active leases with escalation rate > 0 where start month matches current month
    leases = LeaseAgreement.objects.filter(
        status='active',
        annual_escalation_rate__gt=0,
    ).select_related('tenant', 'unit')

    for lease in leases:
        # Check if this is the anniversary month
        if lease.start_date.month != current_month:
            continue

        # Check if already escalated this year
        if lease.last_escalation_date and lease.last_escalation_date.year == today.year:
            continue

        # Calculate new rent
        old_rent = lease.monthly_rent
        escalation_factor = 1 + (lease.annual_escalation_rate / Decimal('100'))
        new_rent = (old_rent * escalation_factor).quantize(Decimal('0.01'))

        # Preserve original rent on first escalation
        if not lease.original_rent:
            lease.original_rent = old_rent

        lease.monthly_rent = new_rent
        lease.last_escalation_date = today
        lease.save(update_fields=[
            'monthly_rent', 'last_escalation_date', 'original_rent', 'updated_at'
        ])

        updated_leases.append({
            'lease_id': lease.id,
            'lease_number': lease.lease_number,
            'tenant': lease.tenant.name,
            'old_rent': str(old_rent),
            'new_rent': str(new_rent),
            'escalation_rate': str(lease.annual_escalation_rate),
        })

        logger.info(
            f"Lease escalation applied: {lease.lease_number} "
            f"{old_rent} -> {new_rent} ({lease.annual_escalation_rate}%)"
        )

    return updated_leases
