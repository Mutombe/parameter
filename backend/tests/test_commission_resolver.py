"""Unit tests for commission rate resolution.

Pure-logic tests with the PropertyIncomeCommission lookup mocked out so
no database is required. The full resolution chain is:

    1. PropertyIncomeCommission(property, income_type) override —
       APPLIES regardless of IncomeType.is_commissionable
    2. IncomeType.default_commission_rate — only when is_commissionable
    3. 0%

These tests pin the contract; if the chain ever changes silently
(e.g. someone re-introduces an early-return on is_commissionable
before the override lookup) the tests will catch it.
"""
from decimal import Decimal
from unittest.mock import MagicMock, patch

from apps.reports.views import _resolve_commission_rate_pct


def _income_type(*, is_commissionable=True, default_rate='10.00', it_id=1):
    """Build a MagicMock that quacks like an IncomeType row."""
    return MagicMock(
        id=it_id,
        is_commissionable=is_commissionable,
        default_commission_rate=Decimal(default_rate),
    )


def _patch_override(rate):
    """Patch PropertyIncomeCommission.objects to return `rate` from
    .filter(...).values_list('rate', flat=True).first(). Pass None to
    simulate no override row.
    """
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


class TestResolveCommissionRatePct:
    """Pin the resolver chain. One test per branch."""

    def test_returns_zero_when_no_income_type(self):
        # No income type = no commission, period.
        assert _resolve_commission_rate_pct(None, 1) == Decimal('0')
        assert _resolve_commission_rate_pct(None) == Decimal('0')
        assert _resolve_commission_rate_pct(None, None) == Decimal('0')

    def test_default_rate_when_commissionable_and_no_override(self):
        income_type = _income_type(is_commissionable=True, default_rate='10.00')
        with _patch_override(None):
            assert _resolve_commission_rate_pct(income_type, 99) == Decimal('10.00')

    def test_override_wins_over_default(self):
        income_type = _income_type(is_commissionable=True, default_rate='10.00')
        with _patch_override(Decimal('15.50')):
            assert _resolve_commission_rate_pct(income_type, 99) == Decimal('15.50')

    def test_override_applies_even_on_non_commissionable(self):
        # CRITICAL: this is the user-requested behaviour (Levy types
        # globally non-commissionable, but agency negotiates a rate
        # for a specific property).
        income_type = _income_type(is_commissionable=False, default_rate='0.00')
        with _patch_override(Decimal('12.00')):
            assert _resolve_commission_rate_pct(income_type, 99) == Decimal('12.00')

    def test_zero_when_not_commissionable_and_no_override(self):
        income_type = _income_type(is_commissionable=False, default_rate='10.00')
        with _patch_override(None):
            # is_commissionable=False + no override → ignore the default.
            assert _resolve_commission_rate_pct(income_type, 99) == Decimal('0')

    def test_no_property_id_uses_default(self):
        # Without a propertyId we can't look up an override; fall
        # straight through to the IncomeType default.
        income_type = _income_type(is_commissionable=True, default_rate='10.00')
        result = _resolve_commission_rate_pct(income_type)
        assert result == Decimal('10.00')

    def test_no_property_id_returns_zero_when_not_commissionable(self):
        income_type = _income_type(is_commissionable=False, default_rate='0.00')
        assert _resolve_commission_rate_pct(income_type) == Decimal('0')

    def test_zero_default_returns_zero(self):
        income_type = _income_type(is_commissionable=True, default_rate='0.00')
        with _patch_override(None):
            assert _resolve_commission_rate_pct(income_type, 99) == Decimal('0')

    def test_decimal_precision_preserved(self):
        # Two decimal places must not get truncated by float coercion.
        income_type = _income_type(is_commissionable=True, default_rate='10.00')
        with _patch_override(Decimal('12.75')):
            assert _resolve_commission_rate_pct(income_type, 99) == Decimal('12.75')

    def test_override_rate_from_string_coerces_to_decimal(self):
        # PropertyIncomeCommission.rate comes back as Decimal from the
        # DB but defensively the helper str()-coerces. Verify a string
        # override would still produce a Decimal result.
        income_type = _income_type(is_commissionable=True, default_rate='10.00')
        with _patch_override('15.25'):
            result = _resolve_commission_rate_pct(income_type, 99)
            assert result == Decimal('15.25')
            assert isinstance(result, Decimal)
