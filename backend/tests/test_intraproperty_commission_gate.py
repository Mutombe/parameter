"""Regression tests for `apps.accounting.transfers.commission_pct_for`.

An Intraproperty Transfer between two NON-commissionable categories (e.g.
Rates -> Maintenance, the spec's worked example) must be a pure three-step
move with no commission legs. `commission_pct_for` previously read the
income type's `default_commission_rate` while ignoring `is_commissionable`
— income types carry a non-zero default rate for other purposes, so a
Rates/Maintenance transfer wrongly entered the commission branch and then
crashed building a zero-amount VAT line. These tests pin that
`is_commissionable` is the authority.
"""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from apps.accounting.transfers import commission_pct_for


def _income_type(is_commissionable, default_rate='10.00', is_vatable=False, vat_rate='15.00'):
    return SimpleNamespace(
        is_commissionable=is_commissionable,
        default_commission_rate=Decimal(default_rate),
        is_vatable=is_vatable,
        vat_rate=Decimal(vat_rate),
    )


class TestCommissionPctGate:
    def test_non_commissionable_returns_zero_despite_default_rate(self):
        # Rates/Maintenance carry a 10% default rate but is_commissionable
        # is False — the transfer must see 0% so no commission legs post.
        it = _income_type(is_commissionable=False, default_rate='10.00')
        with patch('apps.accounting.transfers._income_type_for', return_value=it):
            pct, vat = commission_pct_for(property_obj=None, category='maintenance')
        assert pct == Decimal('0')
        # Non-vatable → 0 VAT, so no zero-amount VAT line is ever built.
        assert vat == Decimal('0')

    def test_commissionable_uses_default_rate(self):
        it = _income_type(is_commissionable=True, default_rate='10.00',
                          is_vatable=True, vat_rate='15.00')
        with patch('apps.accounting.transfers._income_type_for', return_value=it):
            pct, vat = commission_pct_for(property_obj=None, category='rent')
        assert pct == Decimal('10.00')
        assert vat == Decimal('15.00')

    def test_missing_income_type_returns_zero(self):
        with patch('apps.accounting.transfers._income_type_for', return_value=None):
            pct, vat = commission_pct_for(property_obj=None, category='unknown')
        assert pct == Decimal('0')
