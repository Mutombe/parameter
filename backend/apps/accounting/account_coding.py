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
    # Per-payer-type templates. A payer is ONE type, so rent/levy can both be
    # /01 and vat/special_levy both /02 with no in-account clash. Currency is
    # NOT part of the code — one sub-account per CATEGORY, currency is a
    # balance/transaction dimension.
    #   Rental: /01 Rent /02 VAT /03 Maintenance /04 Parking /05 Rates /06 Deposit
    #   Levy:   /01 Levy /02 Special Levy /03 Maintenance /04 Parking /05 Rates
    'general': 0,
    'rent': 1,
    'levy': 1,
    'vat': 2,
    'special_levy': 2,
    'maintenance': 3,
    'parking': 4,
    'rates': 5,
    'deposit': 6,
}

# The full predefined pocket template per payer side (ORDER = display order).
# One pocket per category, no currency multiplication.
RENTAL_CATEGORIES = ['rent', 'vat', 'maintenance', 'parking', 'rates', 'deposit']
LEVY_CATEGORIES = ['levy', 'special_levy', 'maintenance', 'parking', 'rates']
GENERAL_CATEGORY = 'general'

# Landlords are NOT payer-type-restricted — they can receive both rental and
# levy income — so they need a numbering where EVERY category is distinct
# (the per-payer map deliberately shares rent/levy=/01, which would collide).
LANDLORD_CATEGORY_SUFFIX = {
    'general': 0, 'rent': 1, 'vat': 2, 'maintenance': 3, 'parking': 4,
    'rates': 5, 'deposit': 6, 'levy': 7, 'special_levy': 8,
}

# Currencies a pocket keeps a balance in (per-currency balance rows).
SUPPORTED_CURRENCIES = ['USD', 'ZWG']
# Back-compat alias (older callers referenced SEED_CURRENCIES).
SEED_CURRENCIES = SUPPORTED_CURRENCIES


def template_categories(account_type):
    """The complete predefined category set for a payer type (ordered)."""
    return list(LEVY_CATEGORIES if account_type == 'levy' else RENTAL_CATEGORIES)


def allowed_categories(account_type):
    """The sub-account categories a payer may transact in. A Rental payer may
    only use the Rental structure and a Levy payer only the Levy structure
    (spec: payer type is mutually exclusive). General is shared."""
    if account_type == 'levy':
        return set(LEVY_CATEGORIES) | {GENERAL_CATEGORY}
    return set(RENTAL_CATEGORIES) | {GENERAL_CATEGORY}


def primary_category(account_type):
    """The default category for a payer type."""
    return 'levy' if account_type == 'levy' else 'rent'


def payer_side_label(account_type):
    return 'Levy' if account_type == 'levy' else 'Rental'

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


def sub_account_number(category, landlord=False):
    """Two-digit /NN suffix for a category (currency-independent). Landlords
    use a distinct-per-category map so their union of categories never clashes."""
    m = LANDLORD_CATEGORY_SUFFIX if landlord else CATEGORY_BASE_SUFFIX
    return f'{m.get(category, m["general"]):02d}'


def format_sub_code(main_code, category, landlord=False):
    """Full sub-account code, e.g. AH000001/01 (Levy) — one per category."""
    return f'{main_code}/{sub_account_number(category, landlord)}'


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
