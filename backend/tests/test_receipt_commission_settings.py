"""Unit tests for Receipt._get_commission_settings.

This is the receipt-time resolver — what gets posted to the GL when a
payment lands. Same chain as _resolve_commission_rate_pct but invoked
on a Receipt instance with .invoice / .income_type relations.

Tests skip Django's model machinery by calling the method as an
unbound function with a SimpleNamespace standing in for `self`.
This avoids the `_state.fields_cache` lookups Django's descriptors
do for FK access.
"""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from apps.billing.models import Receipt


def _make_receipt(*, income_type=None, invoice=None, tenant_id=None):
    """Build a SimpleNamespace that quacks like a Receipt for the
    purposes of _get_commission_settings — only the attributes that
    method actually reads need to be present.

    `tenant_id` is consulted by the active-lease fallback when the
    invoice has no property linkage (or there is no invoice).
    """
    return SimpleNamespace(
        income_type=income_type,
        income_type_id=getattr(income_type, 'id', None),
        invoice=invoice,
        invoice_id=getattr(invoice, 'id', None) if invoice else None,
        tenant_id=tenant_id,
    )


def _call_settings(receipt):
    """Invoke the method as an unbound function so SimpleNamespace
    works as `self`."""
    return Receipt._get_commission_settings(receipt)


def _income_type(*, is_commissionable=True, default_rate='10.00',
                 it_id=1, is_vatable=False, vat_rate='15.00'):
    return MagicMock(
        id=it_id,
        is_commissionable=is_commissionable,
        default_commission_rate=Decimal(default_rate),
        is_vatable=is_vatable,
        vat_rate=Decimal(vat_rate),
    )


def _invoice(*, unit_property_id=None, property_id=None, inv_id=42):
    """Build a mock Invoice. Either unit.property_id (rental) or
    direct property_id (levy)."""
    inv = MagicMock(id=inv_id)
    if unit_property_id is not None:
        inv.unit_id = 7
        inv.unit = MagicMock(property_id=unit_property_id)
        inv.property_id = None
    elif property_id is not None:
        inv.unit_id = None
        inv.unit = None
        inv.property_id = property_id
    else:
        inv.unit_id = None
        inv.unit = None
        inv.property_id = None
    return inv


def _patch_override(rate):
    return patch(
        'apps.masterfile.models.PropertyIncomeCommission.objects',
        new=MagicMock(
            filter=MagicMock(return_value=MagicMock(
                values_list=MagicMock(return_value=MagicMock(
                    first=MagicMock(return_value=rate),
                )),
            )),
        ),
    )


def _patch_active_lease(lease=None):
    """Patch LeaseAgreement.objects.filter().select_related().first() to
    return the given lease (or None for no active lease found). The
    receipt resolver consults this when the invoice doesn't carry a
    property linkage."""
    return patch(
        'apps.masterfile.models.LeaseAgreement.objects',
        new=MagicMock(
            filter=MagicMock(return_value=MagicMock(
                select_related=MagicMock(return_value=MagicMock(
                    first=MagicMock(return_value=lease),
                )),
            )),
        ),
    )


def _active_lease(*, unit_property_id=None, property_id=None):
    """Build a mock active LeaseAgreement for the receipt's tenant."""
    lease = MagicMock()
    if unit_property_id is not None:
        lease.unit_id = 7
        lease.unit = MagicMock(property_id=unit_property_id)
        lease.property_id = None
    elif property_id is not None:
        lease.unit_id = None
        lease.unit = None
        lease.property_id = property_id
    else:
        lease.unit_id = None
        lease.unit = None
        lease.property_id = None
    return lease


class TestGetCommissionSettings:
    def test_zero_when_no_income_type(self):
        r = _make_receipt(income_type=None, invoice=_invoice(unit_property_id=99))
        commission_rate, vat_rate = _call_settings(r)
        assert commission_rate == Decimal('0')
        # VAT default = 15% as fraction (0.15) when no income type.
        assert vat_rate == Decimal('0.15')

    def test_default_rate_used_when_commissionable_no_override(self):
        income_type = _income_type(is_commissionable=True, default_rate='10.00')
        r = _make_receipt(income_type=income_type, invoice=_invoice(unit_property_id=99))
        with _patch_override(None):
            commission_rate, _ = _call_settings(r)
            # 10% as fraction
            assert commission_rate == Decimal('0.10')

    def test_property_override_wins_over_default(self):
        income_type = _income_type(is_commissionable=True, default_rate='10.00')
        r = _make_receipt(income_type=income_type, invoice=_invoice(unit_property_id=99))
        with _patch_override(Decimal('12.50')):
            commission_rate, _ = _call_settings(r)
            assert commission_rate == Decimal('0.125')

    def test_override_applies_on_non_commissionable_type(self):
        # CRITICAL: matches the user-requested behaviour.
        income_type = _income_type(is_commissionable=False, default_rate='0.00')
        r = _make_receipt(income_type=income_type, invoice=_invoice(unit_property_id=99))
        with _patch_override(Decimal('9.00')):
            commission_rate, _ = _call_settings(r)
            assert commission_rate == Decimal('0.09')

    def test_zero_when_non_commissionable_and_no_override(self):
        income_type = _income_type(is_commissionable=False, default_rate='10.00')
        r = _make_receipt(income_type=income_type, invoice=_invoice(unit_property_id=99))
        with _patch_override(None):
            commission_rate, _ = _call_settings(r)
            assert commission_rate == Decimal('0')

    def test_invoice_with_only_property_id_resolves_override(self):
        # Levy invoices have no unit, just a property. The resolver
        # should still find the override via invoice.property_id.
        income_type = _income_type(is_commissionable=True, default_rate='10.00')
        r = _make_receipt(income_type=income_type, invoice=_invoice(property_id=99))
        with _patch_override(Decimal('15.00')):
            commission_rate, _ = _call_settings(r)
            assert commission_rate == Decimal('0.15')

    def test_no_invoice_falls_back_to_default(self):
        # Receipt with no invoice and no active lease can't look up a
        # property override. Should fall through to IncomeType default.
        income_type = _income_type(is_commissionable=True, default_rate='10.00')
        r = _make_receipt(income_type=income_type, invoice=None, tenant_id=1)
        with _patch_active_lease(None):
            commission_rate, _ = _call_settings(r)
            assert commission_rate == Decimal('0.10')

    def test_no_invoice_falls_back_to_active_lease_unit_property(self):
        # Ad-hoc receipt (no invoice) — resolver should pull property
        # from the tenant's active lease's unit. This fixes the bug where
        # configured commission overrides were ignored on invoice-less
        # payments because no property could be resolved.
        income_type = _income_type(is_commissionable=True, default_rate='10.00')
        r = _make_receipt(income_type=income_type, invoice=None, tenant_id=1)
        with _patch_active_lease(_active_lease(unit_property_id=99)):
            with _patch_override(Decimal('12.50')):
                commission_rate, _ = _call_settings(r)
                assert commission_rate == Decimal('0.125')

    def test_invoice_without_property_falls_back_to_active_lease(self):
        # Invoice exists but was created via a flow that left both unit
        # and property blank (e.g. lease-only API). The resolver must
        # not give up — it should consult the tenant's active lease.
        income_type = _income_type(is_commissionable=True, default_rate='10.00')
        bare_invoice = _invoice()  # no unit, no property
        r = _make_receipt(income_type=income_type, invoice=bare_invoice, tenant_id=1)
        # Make sure invoice.lease_id is falsy so the resolver moves on
        # to the tenant active lease branch.
        bare_invoice.lease_id = None
        bare_invoice.lease = None
        with _patch_active_lease(_active_lease(property_id=99)):
            with _patch_override(Decimal('11.00')):
                commission_rate, _ = _call_settings(r)
                assert commission_rate == Decimal('0.11')

    def test_vat_rate_uses_income_type_when_vatable(self):
        income_type = _income_type(
            is_commissionable=True, default_rate='10.00',
            is_vatable=True, vat_rate='14.50',
        )
        r = _make_receipt(income_type=income_type, invoice=_invoice(unit_property_id=99))
        with _patch_override(None):
            _, vat_rate = _call_settings(r)
            assert vat_rate == Decimal('0.145')

    def test_vat_rate_default_when_not_vatable(self):
        income_type = _income_type(
            is_commissionable=True, default_rate='10.00',
            is_vatable=False, vat_rate='15.00',
        )
        r = _make_receipt(income_type=income_type, invoice=_invoice(unit_property_id=99))
        with _patch_override(None):
            _, vat_rate = _call_settings(r)
            assert vat_rate == Decimal('0.15')
