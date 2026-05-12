"""Unit tests for `_bs_display_name` — the report-wide label override.

Migration 0016 renames ChartOfAccount 2110 from
"VAT Payable (Commission)" to "Commission Payable (Commission)" at the
data layer. This helper is a display-time safety net for tenant
schemas where that migration hasn't landed yet — it does the same
rename on the way out of the report views.

The plain "VAT Payable" account (code 2100, agency-level general VAT)
must NOT be renamed — it represents a different liability and the
override only applies to the commission-specific row.
"""
from apps.reports.views import _bs_display_name


class TestBsDisplayName:
    def test_renames_vat_payable_commission_exactly(self):
        # Pre-migration tenants still see the old name on the COA row.
        # The helper rewrites it at the report layer so financial reports
        # are consistent across tenants regardless of migration state.
        assert (
            _bs_display_name('VAT Payable (Commission)', 'vat_payable')
            == 'Commission Payable (Commission)'
        )

    def test_does_not_rename_plain_vat_payable(self):
        # Code 2100 — agency-level VAT Payable, separate liability from
        # commission VAT. Must keep its own name.
        assert _bs_display_name('VAT Payable', 'vat_payable') == 'VAT Payable'

    def test_does_not_rename_post_migration_label(self):
        # After migration 0016 the row reads "Commission Payable
        # (Commission)" directly. The helper passes it through unchanged.
        assert (
            _bs_display_name('Commission Payable (Commission)', 'vat_payable')
            == 'Commission Payable (Commission)'
        )

    def test_passes_other_liability_names_through(self):
        assert _bs_display_name('Accounts Payable', 'accounts_payable') == 'Accounts Payable'
        assert _bs_display_name('Tenant Deposits', 'tenant_deposits') == 'Tenant Deposits'
        assert _bs_display_name('Loan Payable', 'loan_payable') == 'Loan Payable'

    def test_does_not_match_unrelated_vat_phrases(self):
        # Substring match is exact on the literal string — a name
        # mentioning VAT in another context (e.g. "VAT Receivable")
        # must NOT be renamed.
        assert _bs_display_name('VAT Receivable', '') == 'VAT Receivable'

    def test_trims_whitespace_before_matching(self):
        # COA seeds occasionally carry trailing whitespace. The helper
        # trims before matching so the rename still fires.
        assert (
            _bs_display_name('  VAT Payable (Commission)  ', 'vat_payable')
            == 'Commission Payable (Commission)'
        )

    def test_handles_empty_inputs(self):
        # No crash on missing/blank inputs — the loop that emits rows
        # has no guarantee that every account has both fields set.
        assert _bs_display_name('', '') == ''
        assert _bs_display_name(None, None) == ''
        assert _bs_display_name('Some Account', None) == 'Some Account'
