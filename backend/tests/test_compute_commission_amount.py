"""Unit tests for `IncomeExpenditureReportView._compute_commission_amount`.

The report-side helper used to inline its own property-resolution chain
that only checked `invoice.unit.property` and `invoice.property`. That
chain drifted from the receipt-time resolver, so per-property commission
overrides applied at receipt time were ignored on the I&E report.

The fix routes through `Receipt._resolve_property_for_commission`, which
walks the full fallback chain (invoice.unit → invoice.property →
invoice.lease.* → tenant's active lease). These tests pin the
delegation so the two paths can't drift again.
"""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch, MagicMock

from apps.reports.views import IncomeExpenditureReportView


def _receipt(amount='100.00', income_type=None):
    return SimpleNamespace(
        amount=Decimal(amount),
        income_type=income_type,
        income_type_id=getattr(income_type, 'id', None),
        invoice=None,
        invoice_id=None,
        tenant_id=42,
    )


class TestComputeCommissionAmount:
    def test_resolves_property_via_shared_helper(self):
        # The receipt-side resolver is the single source of truth for
        # property linkage. The report helper must call it — anything
        # else means the two paths can drift and overrides will be
        # honoured at receipt time but ignored in reports.
        income_type = MagicMock(id=1, is_commissionable=True)
        receipt = _receipt(income_type=income_type)

        with patch(
            'apps.billing.models.Receipt._resolve_property_for_commission',
            return_value=99,
        ) as resolve, patch(
            'apps.reports.views._resolve_commission_rate_pct',
            return_value=Decimal('10'),
        ) as rate_fn:
            IncomeExpenditureReportView._compute_commission_amount(
                receipt, landlord=None,
            )

        # Property resolver was invoked on the receipt; rate resolver
        # was invoked with that property id and the receipt's income type.
        resolve.assert_called_once_with(receipt)
        rate_fn.assert_called_once_with(income_type, 99)

    def test_applies_resolved_rate_to_amount(self):
        # Final commission = amount × rate%; verifies arithmetic and
        # that the rate percent is divided by 100 before multiplication.
        receipt = _receipt(amount='250.00')
        with patch(
            'apps.billing.models.Receipt._resolve_property_for_commission',
            return_value=99,
        ), patch(
            'apps.reports.views._resolve_commission_rate_pct',
            return_value=Decimal('12'),  # 12%
        ):
            commission = IncomeExpenditureReportView._compute_commission_amount(
                receipt, landlord=None,
            )
        assert commission == Decimal('30.00')  # 250 * 0.12

    def test_zero_rate_returns_zero_commission(self):
        receipt = _receipt(amount='500.00')
        with patch(
            'apps.billing.models.Receipt._resolve_property_for_commission',
            return_value=None,
        ), patch(
            'apps.reports.views._resolve_commission_rate_pct',
            return_value=Decimal('0'),
        ):
            commission = IncomeExpenditureReportView._compute_commission_amount(
                receipt, landlord=None,
            )
        assert commission == Decimal('0')

    def test_landlord_arg_is_kept_for_signature_stability(self):
        # The `landlord` arg is now vestigial — the resolver does its
        # own lookup. Pin that passing any value (None, mock, etc.)
        # does not break the call and is not consulted.
        receipt = _receipt(amount='100.00')
        sentinel = MagicMock(name='unused-landlord')
        with patch(
            'apps.billing.models.Receipt._resolve_property_for_commission',
            return_value=99,
        ) as resolve, patch(
            'apps.reports.views._resolve_commission_rate_pct',
            return_value=Decimal('10'),
        ):
            IncomeExpenditureReportView._compute_commission_amount(
                receipt, landlord=sentinel,
            )
        # The resolver call must NOT include the landlord arg.
        resolve.assert_called_once_with(receipt)
        # Sanity: sentinel was never accessed (no attribute reads).
        assert sentinel.mock_calls == []
