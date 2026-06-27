"""Unit tests for `_bs_display_name` — the report-wide label override.

Account 2110 holds VAT charged on the agent's commission — it is a VAT
liability, not a commission account. An earlier migration mislabelled it
"Commission Payable (Commission)"; this helper relabels any lingering rows
back to "VAT Payable (Commission)" on the way out of the report views. The
agent's commission income lives in 4100 (Agent Commission).

The plain "VAT Payable" account (code 2100, agency-level general VAT)
must NOT be touched — it is already correctly named.
"""
from apps.reports.views import _bs_display_name


class TestBsDisplayName:
    def test_renames_mislabelled_commission_payable_to_vat(self):
        # Tenants still carrying the mislabelled name see it rewritten to
        # the correct VAT label at the report layer.
        assert (
            _bs_display_name('Commission Payable (Commission)', 'vat_payable')
            == 'VAT Payable (Commission)'
        )

    def test_does_not_rename_plain_vat_payable(self):
        # Code 2100 — agency-level VAT Payable, separate liability from
        # commission VAT. Must keep its own name.
        assert _bs_display_name('VAT Payable', 'vat_payable') == 'VAT Payable'

    def test_passes_correct_vat_commission_label_through(self):
        # Once relabelled, "VAT Payable (Commission)" passes through unchanged.
        assert (
            _bs_display_name('VAT Payable (Commission)', 'vat_payable')
            == 'VAT Payable (Commission)'
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
            _bs_display_name('  Commission Payable (Commission)  ', 'vat_payable')
            == 'VAT Payable (Commission)'
        )

    def test_handles_empty_inputs(self):
        # No crash on missing/blank inputs — the loop that emits rows
        # has no guarantee that every account has both fields set.
        assert _bs_display_name('', '') == ''
        assert _bs_display_name(None, None) == ''
        assert _bs_display_name('Some Account', None) == 'Some Account'
