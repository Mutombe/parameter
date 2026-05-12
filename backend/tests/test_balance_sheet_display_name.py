"""Unit tests for `_bs_display_name` — the Balance Sheet label override.

The only VAT the agency collects is on its commission revenue. The
generic "VAT Payable" label was opaque, so the rename surfaces what
the line actually represents: commission VAT owed to the revenue
authority. The override fires on either the account subtype
('vat_payable') OR the account name containing 'vat payable' so it
survives chart-of-accounts inconsistencies (some tenants seeded the
subtype, others left it blank and only named the row).
"""
from apps.reports.views import _bs_display_name


class TestBsDisplayName:
    def test_renames_when_subtype_is_vat_payable(self):
        assert (
            _bs_display_name('VAT Payable', 'vat_payable')
            == 'Commission Payable (Commission)'
        )

    def test_renames_when_name_contains_vat_payable_case_insensitive(self):
        # Catches charts where subtype was never set but the account
        # name still reads "VAT Payable" or similar.
        assert (
            _bs_display_name('VAT Payable', '')
            == 'Commission Payable (Commission)'
        )
        assert (
            _bs_display_name('Vat Payable', None)
            == 'Commission Payable (Commission)'
        )

    def test_renames_when_subtype_matches_even_if_name_differs(self):
        # Subtype is authoritative when set — even a renamed account
        # still represents the commission VAT liability.
        assert (
            _bs_display_name('Output Tax Owed', 'vat_payable')
            == 'Commission Payable (Commission)'
        )

    def test_passes_other_liability_names_through(self):
        assert _bs_display_name('Accounts Payable', 'accounts_payable') == 'Accounts Payable'
        assert _bs_display_name('Tenant Deposits', 'tenant_deposits') == 'Tenant Deposits'
        assert _bs_display_name('Loan Payable', 'loan_payable') == 'Loan Payable'

    def test_does_not_match_unrelated_vat_phrases(self):
        # Substring match is on 'vat payable' specifically, so a name
        # mentioning VAT in another context (e.g. 'VAT Receivable')
        # must NOT be renamed.
        assert _bs_display_name('VAT Receivable', '') == 'VAT Receivable'

    def test_handles_empty_inputs(self):
        # No crash on missing/blank inputs — the loop that emits rows
        # has no guarantee that every account has both fields set.
        assert _bs_display_name('', '') == ''
        assert _bs_display_name(None, None) == ''
        assert _bs_display_name('Some Account', None) == 'Some Account'
