"""Hierarchical Chart of Accounts taxonomy (brand spec).

Six levels, mirroring the CHART OF ACCOUNTS workbook:

    1. Financial Report   (Balance Sheet | Profit & Loss)
    2. Account Class      (Asset, Contra Asset, Liability, Equity, Income, Expense)
    3. Account Subclass   (the 11 code-ranged subclasses below)
    4. Account Type       (Fixed Asset, Cash & Cash Equivalents, ...)
    5. Account Subtype    (Immovable Asset, Movable Asset, Debtors, ...)
    6. GL Account         (4-digit code + name)

GL code ranges are OWNED by subclasses. A code may be used once, ever, and
only for an account of the subclass that owns its range — no cross-subclass
use. Unassigned codes in a range stay reserved for that subclass.
"""

# subclass slug -> (label, low, high)  [inclusive, 4-digit zero-padded]
SUBCLASS_RANGES = {
    'noncurrent_assets':     ('Fixed / Non-current Assets', 1,    999),
    'current_assets':        ('Current Assets',             1000, 1999),
    'current_liabilities':   ('Current Liabilities',        2000, 2999),
    'equity':                ('Equity',                     3000, 3999),
    'longterm_liabilities':  ('Long-term Liabilities',      4000, 4999),
    'property_income':       ('Property Income',            5000, 5499),
    'other_income':          ('Other Income',               5500, 5999),
    'cost_of_sales':         ('Cost of Sales',              6000, 6999),
    'operating_expenses':    ('Operating Expenses',         7000, 7999),
    'taxation_expense':      ('Taxation Expense',           8000, 8999),
    'suspense':              ('Suspense / Opening Balances', 9000, 9999),
}

REPORT_TYPES = {
    'balance_sheet': 'Balance Sheet',
    'profit_loss': 'Profit & Loss',
}

ACCOUNT_CLASSES = {
    'asset': 'Asset',
    'contra_asset': 'Contra Asset',
    'liability': 'Liability',
    'equity': 'Equity',
    'income': 'Income',
    'expense': 'Expense',
}

# report -> classes -> subclasses (order = wizard order)
TAXONOMY = {
    'balance_sheet': {
        'asset': ['noncurrent_assets', 'current_assets'],
        'contra_asset': ['noncurrent_assets', 'current_assets'],
        'liability': ['current_liabilities', 'longterm_liabilities', 'suspense'],
        'equity': ['equity'],
    },
    'profit_loss': {
        'income': ['property_income', 'other_income'],
        'expense': ['cost_of_sales', 'operating_expenses', 'taxation_expense'],
    },
}

# Level 4 options per subclass (free text allowed when empty)
TYPES_BY_SUBCLASS = {
    'noncurrent_assets': ['Fixed Asset'],
    'current_assets': ['Cash & Cash Equivalents', 'Accounts Receivable',
                       'Short-term Investments', 'Prepayments', 'Other'],
    'current_liabilities': ['Payables', 'Deferred Revenue', 'Tax Liability', 'Other'],
    'equity': ['Equity'],
    'longterm_liabilities': ['Loans & Mortgages', 'Other'],
    'property_income': ['Property Income'],
    'other_income': ['Other Income'],
    'cost_of_sales': ['Management Fee', 'Other'],
    'operating_expenses': ['Property Expense', 'Other'],
    'taxation_expense': ['Property Tax', 'Other'],
    'suspense': ['Suspense'],
}

# Level 5 options per Level-4 type
SUBTYPES_BY_TYPE = {
    'Fixed Asset': ['Immovable Asset', 'Movable Asset'],
    'Accounts Receivable': ['Debtors'],
    'Cash & Cash Equivalents': ['Bank', 'Cash'],
    'Management Fee': ['Commission'],
    'Property Expense': [],
    'Property Tax': [],
}

# Legacy account_type slug for each class (keeps every existing report,
# posting rule and serializer working unchanged).
LEGACY_TYPE_BY_CLASS = {
    'asset': 'asset',
    'contra_asset': 'asset',
    'liability': 'liability',
    'equity': 'equity',
    'income': 'revenue',
    'expense': 'expense',
}


def subclass_for_code(code):
    """Return the subclass slug owning `code`, or None."""
    try:
        n = int(str(code).strip())
    except (TypeError, ValueError):
        return None
    for slug, (_label, lo, hi) in SUBCLASS_RANGES.items():
        if lo <= n <= hi:
            return slug
    return None


def validate_brand_code(code, subclass):
    """Validate a 4-digit GL code against its subclass range.

    Returns (ok: bool, error: str|None). Uniqueness is checked separately
    against the DB by the caller.
    """
    c = str(code).strip()
    if not (c.isdigit() and len(c) == 4):
        return False, 'GL code must be exactly 4 digits (e.g. 0050, 7130)'
    if subclass not in SUBCLASS_RANGES:
        return False, f'Unknown subclass: {subclass}'
    label, lo, hi = SUBCLASS_RANGES[subclass]
    n = int(c)
    if not (lo <= n <= hi):
        return False, (f'Code {c} is outside the {label} range '
                       f'({lo:04d}-{hi:04d}) — reserved codes cannot be used '
                       f'across subclasses')
    return True, None


def available_codes(subclass, used, step=10, limit=100):
    """Unused codes in the subclass range, stepping by `step` (spec assigns
    codes in tens). `used` is a set of code strings already taken."""
    if subclass not in SUBCLASS_RANGES:
        return []
    _label, lo, hi = SUBCLASS_RANGES[subclass]
    start = lo if lo % step == 0 else ((lo // step) + 1) * step
    out = []
    for n in range(start, hi + 1, step):
        c = f'{n:04d}'
        if c not in used:
            out.append(c)
            if len(out) >= limit:
                break
    return out
