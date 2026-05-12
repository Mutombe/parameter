"""Q-tree shape tests for the report scope helpers.

These pin the lookup-path coverage of three module-level Q builders in
`apps.reports.views`:

  * `_receipt_scope_q`           — receipt → invoice → property linkage
  * `_aged_analysis_property_q`  — Aged Analysis property filter
  * `_aged_analysis_landlord_q`  — Aged Analysis landlord filter

The earlier bug was that each of these only matched the `invoice.unit`
path. Invoices created via flows that leave `unit` blank (the standard
InvoiceCreateSerializer takes `lease`+optional `unit`) were silently
excluded, so every landlord-scoped report — Income & Expenditure, Aged
Analysis, Balance Sheet trust composition — came back empty.

Tests walk the Q tree and collect lookup keys without touching the DB.
"""
from django.db.models import Q

from apps.reports.views import (
    _receipt_scope_q,
    _aged_analysis_property_q,
    _aged_analysis_landlord_q,
)


def _collect_lookup_keys(q):
    """Walk a Q tree and return the set of lookup keys at its leaves."""
    keys = set()
    if not isinstance(q, Q):
        return keys
    for child in q.children:
        if isinstance(child, Q):
            keys |= _collect_lookup_keys(child)
        elif isinstance(child, tuple) and len(child) == 2:
            keys.add(child[0])
    return keys


class TestReceiptScopeQ:
    """receipt → invoice → property linkage."""

    def test_covers_direct_unit_path(self):
        keys = _collect_lookup_keys(_receipt_scope_q([1, 2], [3, 4]))
        assert 'invoice__unit_id__in' in keys

    def test_covers_direct_property_path(self):
        keys = _collect_lookup_keys(_receipt_scope_q([1, 2], [3, 4]))
        assert 'invoice__property_id__in' in keys

    def test_covers_lease_unit_path(self):
        # The bug fix: this path was missing, so receipts whose invoice
        # carried only a lease FK (no unit, no direct property) silently
        # dropped out of every landlord-scoped report.
        keys = _collect_lookup_keys(_receipt_scope_q([1, 2], [3, 4]))
        assert 'invoice__lease__unit_id__in' in keys

    def test_covers_lease_property_path(self):
        keys = _collect_lookup_keys(_receipt_scope_q([1, 2], [3, 4]))
        assert 'invoice__lease__property_id__in' in keys

    def test_clause_is_an_or(self):
        # Any receipt matching ANY of the four paths must be included —
        # an AND would over-restrict and exclude valid receipts.
        q = _receipt_scope_q([1], [2])
        assert q.connector == Q.OR


class TestAgedAnalysisPropertyQ:
    """Aged Analysis property filter."""

    def test_covers_direct_unit_path(self):
        keys = _collect_lookup_keys(_aged_analysis_property_q(99))
        assert 'unit__property_id' in keys

    def test_covers_direct_property_path(self):
        keys = _collect_lookup_keys(_aged_analysis_property_q(99))
        assert 'property_id' in keys

    def test_covers_lease_unit_property_path(self):
        keys = _collect_lookup_keys(_aged_analysis_property_q(99))
        assert 'lease__unit__property_id' in keys

    def test_covers_lease_property_path(self):
        keys = _collect_lookup_keys(_aged_analysis_property_q(99))
        assert 'lease__property_id' in keys

    def test_clause_is_an_or(self):
        q = _aged_analysis_property_q(99)
        assert q.connector == Q.OR


class TestAgedAnalysisLandlordQ:
    """Aged Analysis landlord filter."""

    def test_covers_unit_property_landlord_path(self):
        keys = _collect_lookup_keys(_aged_analysis_landlord_q(7))
        assert 'unit__property__landlord_id' in keys

    def test_covers_direct_property_landlord_path(self):
        keys = _collect_lookup_keys(_aged_analysis_landlord_q(7))
        assert 'property__landlord_id' in keys

    def test_covers_lease_unit_property_landlord_path(self):
        keys = _collect_lookup_keys(_aged_analysis_landlord_q(7))
        assert 'lease__unit__property__landlord_id' in keys

    def test_covers_lease_property_landlord_path(self):
        keys = _collect_lookup_keys(_aged_analysis_landlord_q(7))
        assert 'lease__property__landlord_id' in keys

    def test_clause_is_an_or(self):
        q = _aged_analysis_landlord_q(7)
        assert q.connector == Q.OR
