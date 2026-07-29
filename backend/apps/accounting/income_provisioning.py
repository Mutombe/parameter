"""
Income Account Auto-Provisioning.
Auto-creates IncomeType records (and their GL accounts if a schema somehow
lacks them) based on property management type.

The GL side targets the hierarchical brand chart: Property Income lives in
5000-5499, and ONE dual-currency account serves both USD and ZWG (reports
slice by transaction currency). The old per-currency 4x00/"(USD)" accounts
this module used to create collided with the Long-term Liabilities range
(4000-4999) and must never be created again — `heal_legacy_income_accounts`
retires them.
"""
from .models import IncomeType, ChartOfAccount


# Definitions:
# (code, name, gl_code, gl_subtype, commissionable, vatable, order, management_type)
# gl_code/name match install_brand_chart's canonical 5000-range rows exactly.
RENTAL_INCOME_TYPES = [
    ('RENT', 'Rental Income', '5000', 'rental_income', True, False, 1, 'rental'),
    ('RATES', 'Rates Recovery', '5040', 'rates_income', False, False, 4, 'both'),
    ('VAT', 'VAT Income', '5060', 'vat_income', False, True, 6, 'rental'),
    ('MAINTENANCE', 'Maintenance Recovery', '5030', 'other_income', False, False, 9, 'both'),
]

LEVY_INCOME_TYPES = [
    ('LEVY', 'Levy Income', '5010', 'levy_income', False, False, 2, 'levy'),
    ('SPECIAL_LEVY', 'Special Levy', '5020', 'special_levy_income', False, False, 3, 'levy'),
    ('RATES', 'Rates Recovery', '5040', 'rates_income', False, False, 4, 'both'),
    ('MAINTENANCE', 'Maintenance Recovery', '5030', 'other_income', False, False, 9, 'both'),
    ('PARKING', 'Parking Income', '5050', 'parking_income', True, False, 5, 'levy'),
]

# Canonical GL names for the accounts above (used only when the account is
# missing from the schema — normally install_brand_chart has created them).
CANONICAL_GL_NAMES = {
    '5000': 'Rental Income',
    '5010': 'Levy Income',
    '5020': 'Special Levy Income',
    '5030': 'Maintenance Income',
    '5040': 'Rates Income',
    '5050': 'Parking Income',
    '5060': 'VAT Income',
}

# The retired old-chart codes this module used to provision, and where each
# one's meaning moved to in the hierarchical chart.
LEGACY_TO_CANONICAL = {
    '4100': '5000',   # Rental Income (USD)
    '4200': '5010',   # Levy Income (USD)
    '4300': '5020',   # Special Levy (USD)
    '4400': '5040',   # Rates Recovery (USD)
    '4500': '5050',   # Parking Income (USD)
    '4600': '5060',   # VAT Income (USD)
    '4900': '5030',   # Maintenance Recovery (USD)
}


def _get_or_create_gl(gl_code, gl_subtype):
    account, _ = ChartOfAccount.objects.get_or_create(
        code=gl_code,
        defaults={
            'name': CANONICAL_GL_NAMES.get(gl_code, 'Property Income'),
            'report_type': 'profit_loss',
            'account_class': 'income',
            'account_subclass': 'property_income',
            'hierarchy_type': 'Property Income',
            'account_type': 'revenue',
            'account_subtype': gl_subtype,
            'is_system': True,
            'is_active': True,
        },
    )
    return account


def provision_income_accounts(property_instance):
    """
    Auto-create IncomeType records for property.management_type, linked to
    the canonical 5000-range Property Income GL accounts. Idempotent.
    """
    if property_instance.management_type == 'levy':
        type_defs = LEVY_INCOME_TYPES
    else:
        type_defs = RENTAL_INCOME_TYPES

    created_types = []

    for code, name, gl_code, gl_subtype, commissionable, vatable, order, mgmt_type in type_defs:
        gl_account = _get_or_create_gl(gl_code, gl_subtype)

        income_type, was_created = IncomeType.objects.get_or_create(
            code=code,
            defaults={
                'name': name,
                'gl_account': gl_account,
                'is_commissionable': commissionable,
                'is_vatable': vatable,
                'display_order': order,
                'is_system': True,
                'management_type': mgmt_type,
            }
        )
        if was_created:
            created_types.append(income_type)
        elif income_type.gl_account_id and str(income_type.gl_account.code) in LEGACY_TO_CANONICAL:
            # Existing IncomeType still pointing at a retired 4x00 account —
            # repoint it to the canonical Property Income account.
            income_type.gl_account = gl_account
            income_type.save(update_fields=['gl_account', 'updated_at'])

    return created_types


def heal_legacy_income_accounts():
    """
    Retire the old-chart 4x00 income accounts (they render under Long-term
    Liabilities, 4000-4999, in the hierarchical chart) and repoint any
    IncomeType still using one. Accounts WITH postings are left active and
    reported — those need a balance-transfer journal, not a silent flip.

    Returns (deactivated_codes, skipped_codes).
    """
    from django.db.models import Count

    deactivated, skipped = [], []
    legacy_codes = list(LEGACY_TO_CANONICAL.keys()) + [
        f'{c}Z' for c in LEGACY_TO_CANONICAL
    ]
    for account in ChartOfAccount.objects.filter(code__in=legacy_codes):
        canonical_code = LEGACY_TO_CANONICAL[account.code.rstrip('Z')]
        canonical = ChartOfAccount.objects.filter(code=canonical_code).first()
        if canonical is not None:
            IncomeType.objects.filter(gl_account=account).update(gl_account=canonical)
        has_postings = account.entries.aggregate(n=Count('id'))['n'] > 0
        if has_postings:
            skipped.append(account.code)
            continue
        if account.is_active:
            account.is_active = False
            account.save(update_fields=['is_active', 'updated_at'])
            deactivated.append(account.code)
    return deactivated, skipped
