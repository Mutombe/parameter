"""Service layer for billing business logic."""
import logging
from decimal import Decimal
from datetime import date
from calendar import monthrange

logger = logging.getLogger(__name__)


def generate_monthly_invoices(month, year, lease_ids=None, property_id=None, created_by=None,
                              invoice_date_override=None, due_date_override=None):
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
    ).select_related('tenant', 'unit', 'unit__property', 'property').prefetch_related('charges')

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
    invoice_date = invoice_date_override or period_start  # Default: 1st of billing month
    due_date = due_date_override or date(year, month, 15)  # Default: 15th of billing month

    # Evaluate leases once, then check which are already billed
    all_leases = list(leases)
    if not all_leases:
        return [], []

    lease_id_list = [l.id for l in all_leases]
    # A lease can carry MULTIPLE configured charge items (rent, maintenance,
    # parking, …) — dedupe per (lease, item) so re-running the month only
    # fills in items that haven't been billed yet.
    existing_pairs = set(
        Invoice.objects.filter(
            lease_id__in=lease_id_list,
            period_start=period_start,
            period_end=period_end
        ).values_list('lease_id', 'invoice_type')
    )

    invoices_to_create = []
    errors = []

    ITEM_LABELS = {
        'rent': 'Rent', 'levy': 'Levy', 'special_levy': 'Special Levy',
        'maintenance': 'Maintenance', 'parking': 'Parking',
        'rates': 'Rates', 'vat': 'VAT',
    }

    for lease in all_leases:

        # Skip vacant units for rental leases (levy always bills regardless)
        if lease.lease_type == 'rental' and lease.unit and not lease.unit.is_occupied:
            errors.append(f'Skipped {lease.lease_number}: rental unit {lease.unit} is vacant')
            continue

        # Billing items: the lease's configured charge schedule (one invoice
        # per active item); leases without a schedule fall back to the single
        # legacy rent/levy line from monthly_rent.
        configured = [
            c for c in lease.charges.all()
            if c.is_active and c.amount and c.amount > 0
        ]
        if configured:
            items = [(c.charge_type, c.amount, c.currency or lease.currency) for c in configured]
        else:
            default_type = (Invoice.InvoiceType.LEVY if lease.lease_type == 'levy'
                            else Invoice.InvoiceType.RENT)
            items = [(default_type, lease.monthly_rent, lease.currency)]

        # Resolve property for the invoice
        inv_property = lease.property or (lease.unit.property if lease.unit else None)

        for charge_type, amount, currency in items:
            if (lease.id, charge_type) in existing_pairs:
                continue
            desc_label = ITEM_LABELS.get(charge_type, str(charge_type).replace('_', ' ').title())
            invoices_to_create.append(Invoice(
                tenant=lease.tenant,
                lease=lease,
                unit=lease.unit,
                property=inv_property,
                invoice_type=charge_type,
                date=invoice_date,
                due_date=due_date,
                period_start=period_start,
                period_end=period_end,
                amount=amount,
                vat_amount=Decimal('0'),
                currency=currency,
                description=f'{period_start.strftime("%B")} {desc_label} Charge',
                created_by=created_by
            ))

    if not invoices_to_create and all_leases and not errors:
        errors.append(f'All {len(all_leases)} leases already billed for {period_start.strftime("%B %Y")}')

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

    # Auto-post to GL — invoices are recognized debt the moment they exist.
    # Per-invoice try/except so one bad post doesn't abort the batch.
    import logging
    logger = logging.getLogger(__name__)
    for inv in created_invoices:
        if inv.id and not inv.journal_id:
            try:
                inv.post_to_ledger()
            except Exception as e:
                logger.warning(
                    f'Auto-post failed for invoice {inv.invoice_number}: {e}',
                    exc_info=True,
                )

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
