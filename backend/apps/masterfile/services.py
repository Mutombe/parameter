"""Service layer for masterfile business logic."""
import logging
from decimal import Decimal
from django.db.models import Sum, Count, Q

logger = logging.getLogger(__name__)


def send_lease_activation_emails(lease, activated_by_user):
    """Send activation emails to tenant, staff, and landlord."""
    # Email tenant
    try:
        from apps.notifications.utils import send_tenant_email
        send_tenant_email(
            lease.tenant,
            f'Lease Activated - {lease.lease_number}',
            f"""Dear {lease.tenant.name},

Your lease agreement has been activated.

Lease Details:
- Lease Number: {lease.lease_number}
- Unit: {lease.unit.unit_number}
- Start Date: {lease.start_date}
- End Date: {lease.end_date}
- Monthly Rent: {lease.currency} {lease.monthly_rent:,.2f}

Welcome to your new home! If you have any questions, please contact your property management office.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
        )
    except Exception:
        pass

    # Email staff
    try:
        from apps.notifications.utils import send_staff_email
        send_staff_email(
            f'Lease Activated: {lease.tenant.name} - {lease.unit.unit_number}',
            f"""A lease has been activated.

Lease Details:
- Lease Number: {lease.lease_number}
- Tenant: {lease.tenant.name}
- Unit: {lease.unit.unit_number}
- Property: {lease.unit.property.name if lease.unit.property else 'N/A'}
- Monthly Rent: {lease.currency} {lease.monthly_rent:,.2f}
- Period: {lease.start_date} to {lease.end_date}
- Activated By: {activated_by_user.get_full_name() or activated_by_user.email}

Best regards,
Parameter System
"""
        )
    except Exception:
        pass

    # Email landlord
    try:
        from apps.notifications.utils import send_landlord_email
        landlord = lease.unit.property.landlord if lease.unit.property else None
        if landlord:
            send_landlord_email(
                landlord,
                f'New Tenant Moved In - {lease.unit.unit_number}',
                f"""Dear {landlord.name},

A new tenant has moved into your property.

Details:
- Property: {lease.unit.property.name}
- Unit: {lease.unit.unit_number}
- Tenant: {lease.tenant.name}
- Monthly Rent: {lease.currency} {lease.monthly_rent:,.2f}
- Lease Period: {lease.start_date} to {lease.end_date}

Best regards,
Property Management
Powered by Parameter.co.zw
"""
            )
    except Exception:
        pass


def send_lease_termination_emails(lease, reason, terminated_by_user):
    """Send termination emails to tenant, staff, and landlord."""
    # Email tenant
    try:
        from apps.notifications.utils import send_tenant_email
        send_tenant_email(
            lease.tenant,
            f'Lease Terminated - {lease.lease_number}',
            f"""Dear {lease.tenant.name},

Your lease agreement has been terminated.

Lease Details:
- Lease Number: {lease.lease_number}
- Unit: {lease.unit.unit_number}
- Termination Reason: {reason}

Please contact your property management office for any outstanding matters or questions regarding your move-out process.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
        )
    except Exception:
        pass

    # Email staff
    try:
        from apps.notifications.utils import send_staff_email
        send_staff_email(
            f'Lease Terminated: {lease.tenant.name} - {lease.unit.unit_number}',
            f"""A lease has been terminated.

Lease Details:
- Lease Number: {lease.lease_number}
- Tenant: {lease.tenant.name}
- Unit: {lease.unit.unit_number}
- Property: {lease.unit.property.name if lease.unit.property else 'N/A'}
- Reason: {reason}
- Terminated By: {terminated_by_user.get_full_name() or terminated_by_user.email}

The unit is now vacant.

Best regards,
Parameter System
"""
        )
    except Exception:
        pass

    # Email landlord
    try:
        from apps.notifications.utils import send_landlord_email
        landlord = lease.unit.property.landlord if lease.unit.property else None
        if landlord:
            send_landlord_email(
                landlord,
                f'Unit Vacated - {lease.unit.unit_number}',
                f"""Dear {landlord.name},

A tenant has vacated a unit in your property.

Details:
- Property: {lease.unit.property.name}
- Unit: {lease.unit.unit_number}
- Former Tenant: {lease.tenant.name}
- Termination Reason: {reason}

The unit is now vacant and available for re-letting.

Best regards,
Property Management
Powered by Parameter.co.zw
"""
            )
    except Exception:
        pass


def get_landlord_summary(landlord):
    """Compute landlord statement summary via DB aggregation."""
    summary = landlord.properties.aggregate(
        total_properties=Count('id'),
        total_units=Count('units'),
        occupied_units=Count('units', filter=Q(units__is_occupied=True)),
        vacant_units=Count('units', filter=Q(units__is_occupied=False)),
    )
    total_units = summary['total_units'] or 0
    occupied_units = summary['occupied_units'] or 0
    return {
        'total_properties': summary['total_properties'] or 0,
        'total_units': total_units,
        'occupied_units': occupied_units,
        'vacant_units': summary['vacant_units'] or 0,
        'occupancy_rate': (occupied_units / total_units * 100) if total_units else 0,
    }


def get_tenant_detail(tenant):
    """Compute tenant detail view data via DB queries."""
    from apps.billing.serializers import InvoiceSerializer, ReceiptSerializer

    active_leases = tenant.leases.filter(
        status='active'
    ).select_related('unit', 'unit__property').order_by('-start_date')
    past_leases = tenant.leases.exclude(
        status='active'
    ).select_related('unit', 'unit__property').order_by('-start_date')

    billing = tenant.invoices.aggregate(
        total_invoiced=Sum('total_amount'),
        overdue_amount=Sum('total_amount', filter=Q(status='overdue')),
        invoice_count=Count('id'),
    )
    receipt_agg = tenant.receipts.aggregate(
        total_paid=Sum('amount'),
        receipt_count=Count('id'),
    )

    total_invoiced = billing['total_invoiced'] or 0
    total_paid = receipt_agg['total_paid'] or 0

    recent_invoices = tenant.invoices.order_by('-date')[:5]
    recent_receipts = tenant.receipts.order_by('-date')[:5]

    return {
        'active_leases': [{
            'id': l.id,
            'lease_number': l.lease_number,
            'unit': str(l.unit),
            'property': l.unit.property.name if l.unit and l.unit.property else '-',
            'monthly_rent': str(l.monthly_rent),
            'currency': l.currency,
            'start_date': l.start_date,
            'end_date': l.end_date,
            'status': l.status,
        } for l in active_leases],
        'lease_history': [{
            'id': l.id,
            'lease_number': l.lease_number,
            'unit': str(l.unit),
            'property': l.unit.property.name if l.unit and l.unit.property else '-',
            'monthly_rent': str(l.monthly_rent),
            'start_date': l.start_date,
            'end_date': l.end_date,
            'status': l.status,
            'termination_reason': l.termination_reason,
        } for l in past_leases],
        'billing_summary': {
            'total_invoiced': total_invoiced,
            'total_paid': total_paid,
            'balance_due': total_invoiced - total_paid,
            'overdue_amount': billing['overdue_amount'] or 0,
            'invoice_count': billing['invoice_count'] or 0,
            'receipt_count': receipt_agg['receipt_count'] or 0,
        },
        'recent_invoices': InvoiceSerializer(recent_invoices, many=True).data,
        'recent_receipts': ReceiptSerializer(recent_receipts, many=True).data,
    }


def get_tenant_ledger(tenant):
    """Compute tenant ledger data via DB queries."""
    from apps.billing.serializers import InvoiceSerializer, ReceiptSerializer

    invoices = tenant.invoices.order_by('-date')
    receipts = tenant.receipts.order_by('-date')

    agg = tenant.invoices.aggregate(total_invoiced=Sum('total_amount'))
    receipt_agg = tenant.receipts.aggregate(total_paid=Sum('amount'))

    total_invoiced = agg['total_invoiced'] or 0
    total_paid = receipt_agg['total_paid'] or 0

    return {
        'invoices': InvoiceSerializer(invoices, many=True).data,
        'receipts': ReceiptSerializer(receipts, many=True).data,
        'summary': {
            'total_invoiced': total_invoiced,
            'total_paid': total_paid,
            'balance_due': total_invoiced - total_paid,
        },
    }
