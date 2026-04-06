"""Service layer for billing business logic."""
import logging
from decimal import Decimal
from datetime import date
from calendar import monthrange

logger = logging.getLogger(__name__)


def generate_monthly_invoices(month, year, lease_ids=None, property_id=None, created_by=None):
    """
    Generate monthly invoices for active leases.
    Supports filtering by specific lease_ids or a single property_id.
    Returns (created_invoices, errors).
    """
    from .models import Invoice
    from apps.masterfile.models import LeaseAgreement
    from django.db.models import Q

    leases = LeaseAgreement.objects.filter(
        status='active'
    ).select_related('tenant', 'unit', 'unit__property', 'property')

    if lease_ids:
        leases = leases.filter(id__in=lease_ids)

    if property_id:
        # Filter by property — handles both rental (via unit) and levy (via property FK)
        leases = leases.filter(
            Q(unit__property_id=property_id) | Q(property_id=property_id)
        )

    _, last_day = monthrange(year, month)
    period_start = date(year, month, 1)
    period_end = date(year, month, last_day)
    invoice_date = date.today()
    due_date = date(year, month, 15)

    # Get IDs of leases already billed for this period (fast indexed query)
    lease_id_list = list(leases.values_list('id', flat=True))
    existing_lease_ids = set(
        Invoice.objects.filter(
            lease_id__in=lease_id_list,
            period_start=period_start,
            period_end=period_end
        ).values_list('lease_id', flat=True)
    ) if lease_id_list else set()

    # Only iterate unbilled leases
    unbilled_leases = [l for l in leases if l.id not in existing_lease_ids]
    invoices_to_create = []
    errors = []

    for lease in unbilled_leases:

        # Skip vacant units for rental leases (levy always bills regardless)
        if lease.lease_type == 'rental' and lease.unit and not lease.unit.is_occupied:
            errors.append(f'Skipped {lease.lease_number}: rental unit {lease.unit} is vacant')
            continue

        # Set invoice_type based on lease_type
        if lease.lease_type == 'levy':
            invoice_type = Invoice.InvoiceType.LEVY
            desc_label = 'Levy'
        else:
            invoice_type = Invoice.InvoiceType.RENT
            desc_label = 'Rent'

        # Description: use unit for rental, property for levy
        if lease.unit:
            location = f'{lease.unit.property.name} - {lease.unit.unit_number}'
        elif lease.property:
            location = lease.property.name
        else:
            location = lease.tenant.name

        # Resolve property for the invoice
        inv_property = lease.property or (lease.unit.property if lease.unit else None)

        invoices_to_create.append(Invoice(
            tenant=lease.tenant,
            lease=lease,
            unit=lease.unit,
            property=inv_property,
            invoice_type=invoice_type,
            date=invoice_date,
            due_date=due_date,
            period_start=period_start,
            period_end=period_end,
            amount=lease.monthly_rent,
            vat_amount=Decimal('0'),
            currency=lease.currency,
            description=f'{desc_label} for {period_start.strftime("%B %Y")} - {location}',
            created_by=created_by
        ))

    # Bulk create for performance — skip signals (auto-post happens separately)
    if not invoices_to_create:
        return [], errors

    # Pre-compute fields that save() normally calculates (bulk_create skips save)
    from django.utils import timezone as tz
    from django.db.models import Max
    prefix = tz.now().strftime('INV%Y%m%d')
    # Find the highest existing number with this prefix (handles gaps from failed batches)
    max_num_result = Invoice.all_objects.filter(
        invoice_number__startswith=prefix
    ).aggregate(
        max_num=Max('invoice_number')
    )['max_num']
    if max_num_result:
        start_num = int(max_num_result[len(prefix):]) + 1
    else:
        start_num = 1
    for i, inv in enumerate(invoices_to_create):
        inv.invoice_number = f'{prefix}{start_num + i:04d}'
        inv.total_amount = inv.amount + (inv.vat_amount or Decimal('0'))
        inv.balance = inv.total_amount - (inv.amount_paid or Decimal('0'))
        if inv.unit and not inv.property:
            inv.property = inv.unit.property

    try:
        created_invoices = Invoice.objects.bulk_create(
            invoices_to_create, batch_size=500, ignore_conflicts=True
        )
    except Exception as e:
        errors.append(f'Bulk create failed: {str(e)}')
        return [], errors

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
