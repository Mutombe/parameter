"""Unit tests for _gl_filter_for_landlord — specifically the
opening-balance integration added to wire the Opening Layer into
landlord-scoped reporting.

Tests verify the SHAPE of the Q clause generated, not actual DB
behaviour (which would need a tenant + DB setup). The shape proves
that opening_balance entries are picked up under the right scoping
conditions.
"""
from unittest.mock import patch
from django.db.models import Q

from apps.reports.views import _gl_filter_for_landlord


class TestGlFilterForLandlord:
    def test_returns_none_when_no_scope(self):
        assert _gl_filter_for_landlord() is None
        assert _gl_filter_for_landlord(None, None) is None

    def test_landlord_scope_includes_opening_balance_source_type(self):
        """When scoped to a landlord (no property), the Q clause MUST
        include the opening_balance source_type so OB entries on the
        GL flow into the landlord's Balance Sheet."""
        q = _gl_filter_for_landlord(landlord_id=1)
        # The Q tree is a complex OR — flatten it to source_type literals.
        sources = _collect_source_types(q)
        assert 'receipt' in sources
        assert 'expense' in sources
        assert 'invoice' in sources
        assert 'opening_balance' in sources, (
            'Opening balances are landlord-level; they must be included '
            'when scoped by landlord without a property filter.'
        )

    def test_property_scope_excludes_opening_balance(self):
        """When scoped to a single property, opening balances are
        excluded (they are landlord-portfolio-wide, not property-
        specific). Including them on a single-property view would
        misattribute portfolio-level loans/assets to one property."""
        q = _gl_filter_for_landlord(landlord_id=1, property_id=99)
        sources = _collect_source_types(q)
        assert 'opening_balance' not in sources, (
            'Single-property scope should not pull in landlord-level '
            'opening balance entries.'
        )

    def test_property_only_scope_excludes_opening_balance(self):
        """No landlord_id but property_id set — also exclude OB."""
        q = _gl_filter_for_landlord(landlord_id=None, property_id=99)
        sources = _collect_source_types(q)
        assert 'opening_balance' not in sources

    def test_landlord_scope_keeps_existing_source_types(self):
        """Pin the existing receipt/expense/invoice coverage so the
        OB extension doesn't accidentally drop them."""
        q = _gl_filter_for_landlord(landlord_id=1)
        sources = _collect_source_types(q)
        assert sources >= {'receipt', 'expense', 'invoice', 'opening_balance'}


def _collect_source_types(q: Q) -> set:
    """Walk a Q tree and collect literal values passed to
    ``journal_entry__source_type=...`` filters."""
    collected = set()
    if not isinstance(q, Q):
        return collected
    for child in q.children:
        if isinstance(child, Q):
            collected |= _collect_source_types(child)
        elif isinstance(child, tuple) and len(child) == 2:
            key, value = child
            if key == 'journal_entry__source_type':
                collected.add(value)
    return collected
