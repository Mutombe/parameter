"""Unit tests for the mandatory Balance Sheet sub-category on
ChartOfAccount (BS SECOND PROMPT spec).

Asset and liability accounts MUST carry a `balance_sheet_category` so the
landlord Balance Sheet can place every account strictly under the bucket
the user chose at creation. Equity/revenue/expense accounts don't need
one. The category must also belong to the matching account type — an
asset can't be filed under a liability bucket.

These call the serializer's `validate()` directly with plain dicts so the
checks run without a database (no unique-code / FK validation involved).
"""
import pytest
from rest_framework import serializers as drf_serializers

from apps.accounting.serializers import ChartOfAccountSerializer


class TestBalanceSheetCategoryValidation:
    def test_asset_requires_category(self):
        s = ChartOfAccountSerializer()
        with pytest.raises(drf_serializers.ValidationError) as exc:
            s.validate({'account_type': 'asset', 'balance_sheet_category': ''})
        assert 'balance_sheet_category' in exc.value.detail

    def test_liability_requires_category(self):
        s = ChartOfAccountSerializer()
        with pytest.raises(drf_serializers.ValidationError) as exc:
            s.validate({'account_type': 'liability', 'balance_sheet_category': ''})
        assert 'balance_sheet_category' in exc.value.detail

    def test_equity_does_not_require_category(self):
        s = ChartOfAccountSerializer()
        # No raise; returns the attrs unchanged.
        out = s.validate({'account_type': 'equity', 'balance_sheet_category': ''})
        assert out['account_type'] == 'equity'

    def test_revenue_and_expense_skip_category(self):
        s = ChartOfAccountSerializer()
        assert s.validate({'account_type': 'revenue', 'balance_sheet_category': ''})
        assert s.validate({'account_type': 'expense', 'balance_sheet_category': ''})

    def test_asset_accepts_valid_asset_bucket(self):
        s = ChartOfAccountSerializer()
        out = s.validate({
            'account_type': 'asset',
            'balance_sheet_category': 'other_current_assets',
        })
        assert out['balance_sheet_category'] == 'other_current_assets'

    def test_liability_accepts_valid_liability_bucket(self):
        s = ChartOfAccountSerializer()
        out = s.validate({
            'account_type': 'liability',
            'balance_sheet_category': 'accruals',
        })
        assert out['balance_sheet_category'] == 'accruals'

    def test_asset_rejects_liability_bucket(self):
        # Filing an asset under a liability bucket would scramble the sheet.
        s = ChartOfAccountSerializer()
        with pytest.raises(drf_serializers.ValidationError) as exc:
            s.validate({
                'account_type': 'asset',
                'balance_sheet_category': 'other_current_liabilities',
            })
        assert 'balance_sheet_category' in exc.value.detail

    def test_liability_rejects_asset_bucket(self):
        s = ChartOfAccountSerializer()
        with pytest.raises(drf_serializers.ValidationError) as exc:
            s.validate({
                'account_type': 'liability',
                'balance_sheet_category': 'funds_held_in_trust',
            })
        assert 'balance_sheet_category' in exc.value.detail

    @pytest.mark.parametrize('bucket', [
        'funds_held_in_trust', 'lessees_arrears',
        'prepayments', 'other_current_assets',
    ])
    def test_all_asset_buckets_accepted(self, bucket):
        s = ChartOfAccountSerializer()
        out = s.validate({'account_type': 'asset', 'balance_sheet_category': bucket})
        assert out['balance_sheet_category'] == bucket

    @pytest.mark.parametrize('bucket', [
        'funds_owed_by_trust', 'lessees_prepayments',
        'accruals', 'other_current_liabilities',
    ])
    def test_all_liability_buckets_accepted(self, bucket):
        s = ChartOfAccountSerializer()
        out = s.validate({'account_type': 'liability', 'balance_sheet_category': bucket})
        assert out['balance_sheet_category'] == bucket
