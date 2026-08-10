"""Single source of truth for the account-coding standard.

Main account codes: <PREFIX><6 digits>, an independent sequence per prefix.
    Tenant          -> TN000001
    Account Holder  -> AH000001
    Landlord        -> LD000001

Sub-account codes: <MainCode>/<NN>, where NN comes from a currency-banded
category map. The primary currency (USD) occupies the base band (/00-/19);
each additional currency occupies the next band of 20 (ZWG -> +20, /20-/39).
This keeps every (category, currency) pocket on a unique code while staying
inside the two-digit /NN format.

The maps here are the ONLY place category/currency numbering lives — change
them here to re-map without touching the numbering engine (spec §11).
"""
import re

# ── Main-account prefixes ────────────────────────────────────────────
TENANT_PREFIX = 'TN'
ACCOUNT_HOLDER_PREFIX = 'AH'
LANDLORD_PREFIX = 'LD'
MAIN_CODE_DIGITS = 6

ENTITY_PREFIX = {
    'tenant': TENANT_PREFIX,
    'account_holder': ACCOUNT_HOLDER_PREFIX,
    'landlord': LANDLORD_PREFIX,
}

# ── Sub-account category map (primary-currency base numbers) ──────────
CATEGORY_BASE_SUFFIX = {
    'general': 0,
    'rent': 1,
    'levy': 2,
    'special_levy': 3,
    'maintenance': 4,
    'parking': 5,
    'rates': 6,
    'vat': 7,
    'deposit': 8,
}

# Currency bands: primary currency at offset 0, each extra currency +20.
CURRENCY_BAND = {
    'USD': 0,
    'ZWG': 20,
}
CURRENCY_BAND_WIDTH = 20

# Which category pockets each management side seeds (× currencies).
RENTAL_CATEGORIES = ['rent', 'rates', 'maintenance', 'parking', 'vat', 'deposit']
LEVY_CATEGORIES = ['levy', 'special_levy', 'maintenance', 'parking', 'rates']
SEED_CURRENCIES = ['USD', 'ZWG']

# ── Validation ───────────────────────────────────────────────────────
MAIN_CODE_RE = re.compile(r'^(TN|AH|LD)\d{6}$')
SUB_CODE_RE = re.compile(r'^(TN|AH|LD)\d{6}/\d{2}$')


def account_prefix(account_type=None, entity_type=None):
    """Main-account prefix. entity_type ('tenant'/'account_holder'/'landlord')
    wins when given; otherwise RentalTenant.account_type ('levy' -> AH)."""
    if entity_type:
        return ENTITY_PREFIX.get(entity_type, TENANT_PREFIX)
    if account_type == 'levy':
        return ACCOUNT_HOLDER_PREFIX
    return TENANT_PREFIX


def format_main_code(prefix, number):
    return f'{prefix}{number:0{MAIN_CODE_DIGITS}d}'


def sub_account_number(category, currency='USD'):
    """Two-digit /NN suffix for a (category, currency) pocket."""
    base = CATEGORY_BASE_SUFFIX.get(category, CATEGORY_BASE_SUFFIX['general'])
    band = CURRENCY_BAND.get((currency or 'USD').upper(), 0)
    return f'{base + band:02d}'


def format_sub_code(main_code, category, currency='USD'):
    """Full sub-account code, e.g. TN000001/03."""
    return f'{main_code}/{sub_account_number(category, currency)}'


def parent_code_of(sub_code):
    """Main account code behind any sub-account code (TN000001/03 -> TN000001)."""
    return sub_code.split('/', 1)[0] if sub_code and '/' in sub_code else sub_code


def next_main_number(existing_codes, prefix):
    """Highest existing <prefix>###### + 1 — an independent sequence per
    prefix, so tenants (TN) and account holders (AH) count separately even
    though they share one table. Never reuses a retired number."""
    hi = 0
    plen = len(prefix)
    for code in existing_codes:
        if code and code.startswith(prefix):
            tail = code[plen:]
            if tail.isdigit():
                hi = max(hi, int(tail))
    return hi + 1


def is_valid_main_code(code):
    return bool(code and MAIN_CODE_RE.match(code))


def is_valid_sub_code(code):
    return bool(code and SUB_CODE_RE.match(code))
