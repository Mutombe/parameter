"""Capability & permission-role registry — the single source of truth.

Design principle (per product spec): **User Type is separate from Permission
Role.** A user's *type* (Admin, Accounts Officer, Clerk, Cashier, Portfolio
Manager, Tenant, Account Holder) is their identity/category. Their *permission
role* is the set of individual capabilities they may exercise. For internal
users an Admin may reassign the permission role (or hand-tune a custom set);
Tenant and Account Holder are permanently constrained to their portals and can
NEVER be changed.

Permissions are modelled at the *individual capability/action level*, never
merely at the page level — e.g. a Cashier may VIEW expenditure while being
prohibited from POSTING it.

Nothing here touches accounting/posting logic; it only decides who may invoke
which action. Keep this module free of Django-model imports so it can be used
from migrations, serializers, permissions and management commands alike.
"""

# ---------------------------------------------------------------------------
# 1. Capability catalog — grouped by domain for the admin UI.
#    Each entry: code -> (human label, group).
# ---------------------------------------------------------------------------

CAPABILITY_GROUPS = [
    ('Dashboard', [
        ('dashboard.view', 'View Dashboard'),
    ]),
    ('Portfolio', [
        ('portfolio.view', 'View Portfolio (landlords, properties, units, tenants, leases)'),
        ('portfolio.manage', 'Create & Edit Portfolio records'),
    ]),
    ('Invoices', [
        ('invoices.view', 'View Invoices'),
        ('invoices.create', 'Create Invoice'),
        ('invoices.edit', 'Edit Invoice'),
        ('invoices.void', 'Void Invoice'),
        ('invoices.print', 'Print Invoice'),
    ]),
    ('Receipts', [
        ('receipts.view', 'View Receipts'),
        ('receipts.create', 'Create Receipt'),
        ('receipts.void', 'Void Receipt'),
        ('receipts.print', 'Print Receipt'),
    ]),
    ('Expenditure', [
        ('expenditure.view', 'View Expenditure'),
        ('expenditure.create', 'Create Expenditure'),
        ('expenditure.post_cash', 'Post Cash Expenditure'),
        ('expenditure.post_non_cash', 'Post Non-Cash Expenditure'),
        ('expenditure.edit', 'Edit Expenditure'),
        ('expenditure.void', 'Void Expenditure'),
        ('expenditure.print', 'Print Expenditure'),
    ]),
    ('Journals', [
        ('journals.view', 'View Journals'),
        ('journals.create_general', 'Create General Journal'),
        ('journals.post_general', 'Post General Journal'),
        ('journals.owner_contribution', 'Owner Contribution Journal'),
        ('journals.post_withdrawal', 'Post Withdrawal Journal'),
    ]),
    ('Banking', [
        ('bank.view', 'View Bank Accounts'),
        ('bank.create_account', 'Create Bank Account'),
        ('bank.reconcile', 'Bank Reconciliation'),
        ('bank.manage', 'Edit Bank Accounts & Transactions'),
    ]),
    ('Setup', [
        ('coa.view', 'View Chart of Accounts'),
        ('coa.manage', 'Manage Chart of Accounts'),
        ('income_category.create', 'Create Income Category'),
        ('expense_category.create', 'Create Expenditure Category'),
    ]),
    ('Opening & Transfers', [
        ('opening_balances.manage', 'Opening Balances & Account Transfers'),
    ]),
    ('Reports', [
        ('reports.view', 'View Reports'),
        ('reports.print', 'Print / Export Reports'),
    ]),
    ('Administration', [
        ('users.view', 'View Team'),
        ('users.manage', 'Manage Team & Permissions'),
        ('audit.view', 'View Audit Trail'),
        ('data.import', 'Data Import'),
        ('trash.manage', 'Manage Trash'),
    ]),
    ('Portal', [
        ('portal.tenant', 'Tenant Portal (own account only)'),
        ('portal.account_holder', 'Account Holder Portal (own account only)'),
    ]),
]

# Flat {code: label} and ordered list of all codes.
CAPABILITY_LABELS = {
    code: label for _group, items in CAPABILITY_GROUPS for code, label in items
}
ALL_CAPABILITIES = [code for _group, items in CAPABILITY_GROUPS for code, _label in items]

# Portal-only capabilities are never part of an internal permission set.
_PORTAL_CAPS = {'portal.tenant', 'portal.account_holder'}
# Every internal capability (everything that is not a portal capability).
_INTERNAL_ALL = [c for c in ALL_CAPABILITIES if c not in _PORTAL_CAPS]


def _internal_except(*excluded):
    excluded = set(excluded)
    return [c for c in _INTERNAL_ALL if c not in excluded]


# ---------------------------------------------------------------------------
# 2. User types (identities). super_admin is the platform owner and sits
#    ABOVE the seven business types — kept unchanged, full access.
# ---------------------------------------------------------------------------

USER_TYPES = [
    ('super_admin', 'Super Admin'),
    ('admin', 'Admin'),
    ('accounts_officer', 'Accounts Officer'),
    ('clerk', 'Clerk'),
    ('cashier', 'Cashier'),
    ('portfolio_manager', 'Portfolio Manager'),
    ('tenant', 'Tenant'),
    ('account_holder', 'Account Holder'),
]
USER_TYPE_LABELS = dict(USER_TYPES)

# Portal user types are permanently constrained — their permission role can
# NEVER be changed by anyone.
LOCKED_USER_TYPES = {'tenant', 'account_holder'}


# ---------------------------------------------------------------------------
# 3. Permission roles (named capability sets) + their default capabilities.
# ---------------------------------------------------------------------------

PERMISSION_ROLES = [
    ('super_admin_full', 'Super Admin (Full Platform)'),
    ('admin_default', 'Admin Default'),
    ('accounts_officer_default', 'Accounts Officer Default'),
    ('clerk_default', 'Clerk Default'),
    ('cashier_default', 'Cashier Default'),
    ('portfolio_manager_default', 'Portfolio Manager Default'),
    ('tenant_portal_only', 'Tenant Portal Only'),
    ('account_holder_portal_only', 'Account Holder Portal Only'),
    ('custom', 'Custom / Internal Role'),
]
PERMISSION_ROLE_LABELS = dict(PERMISSION_ROLES)

DEFAULT_CAPABILITIES = {
    # Platform owner — everything, including both portals.
    'super_admin_full': list(ALL_CAPABILITIES),

    # Admin: full access EXCEPT receipting (creating/voiding receipts).
    # Owner Contribution allowed. Managing team & permissions is an Admin
    # authority, so it stays here.
    'admin_default': _internal_except('receipts.create', 'receipts.void'),

    # Accounts Officer: full access EXCEPT bank-account creation,
    # income-category creation and receipting. Owner Contribution allowed.
    # Team/permission management stays an Admin authority (view only here).
    'accounts_officer_default': _internal_except(
        'bank.create_account', 'income_category.create',
        'receipts.create', 'receipts.void',
        'users.manage',
    ),

    # Clerk: general operational access; NO account creation, non-cash
    # expenditure, receipting or voiding.
    'clerk_default': [
        'dashboard.view',
        'portfolio.view', 'portfolio.manage',
        'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.print',
        'receipts.view', 'receipts.print',
        'expenditure.view', 'expenditure.create', 'expenditure.post_cash',
        'expenditure.edit', 'expenditure.print',
        'journals.view', 'journals.create_general', 'journals.post_general',
        'bank.view', 'bank.reconcile',
        'coa.view',
        'reports.view', 'reports.print',
        'users.view',
    ],

    # Cashier: cash / receipting oriented; NO account creation, expenditure
    # posting, voiding or general journals. May VIEW expenditure.
    'cashier_default': [
        'dashboard.view',
        'portfolio.view',
        'invoices.view', 'invoices.print',
        'receipts.view', 'receipts.create', 'receipts.print',
        'expenditure.view', 'expenditure.print',
        'journals.view',
        'bank.view',
        'reports.view', 'reports.print',
    ],

    # Portfolio Manager: view & print only.
    'portfolio_manager_default': [
        'dashboard.view',
        'portfolio.view',
        'invoices.view', 'invoices.print',
        'receipts.view', 'receipts.print',
        'expenditure.view', 'expenditure.print',
        'journals.view',
        'bank.view',
        'coa.view',
        'reports.view', 'reports.print',
        'users.view',
    ],

    # Portals — permanently constrained to their own account.
    'tenant_portal_only': ['portal.tenant'],
    'account_holder_portal_only': ['portal.account_holder'],

    # Custom starts empty; the per-user override list supplies capabilities.
    'custom': [],
}


# ---------------------------------------------------------------------------
# 4. User-type wiring: default permission role, legacy-role mirror, and the
#    legacy -> new backfill mapping used by the data migration.
# ---------------------------------------------------------------------------

# Each user type's default permission role (used on creation / when resetting).
DEFAULT_PERMISSION_ROLE_FOR_TYPE = {
    'super_admin': 'super_admin_full',
    'admin': 'admin_default',
    'accounts_officer': 'accounts_officer_default',
    'clerk': 'clerk_default',
    'cashier': 'cashier_default',
    'portfolio_manager': 'portfolio_manager_default',
    'tenant': 'tenant_portal_only',
    'account_holder': 'account_holder_portal_only',
}

# The permission roles an internal user type is allowed to hold. Admin can
# pick any predefined internal set OR 'custom'. Portal types are locked to a
# single role.
INTERNAL_ASSIGNABLE_ROLES = [
    'admin_default',
    'accounts_officer_default',
    'clerk_default',
    'cashier_default',
    'portfolio_manager_default',
    'custom',
]

# Legacy `User.role` values (kept for backward compatibility) mirrored from
# the new user_type, so pre-existing role-based checks keep working. New
# internal types with no legacy equivalent map to the least-privileged
# internal legacy role ('clerk'); the new capability system governs them.
LEGACY_ROLE_FOR_TYPE = {
    'super_admin': 'super_admin',
    'admin': 'admin',
    'accounts_officer': 'accountant',
    'clerk': 'clerk',
    'cashier': 'clerk',
    'portfolio_manager': 'clerk',
    'tenant': 'tenant_portal',
    'account_holder': 'landlord_portal',
}

# Backfill: existing legacy role -> (user_type, permission_role).
LEGACY_ROLE_TO_TYPE = {
    'super_admin': ('super_admin', 'super_admin_full'),
    'admin': ('admin', 'admin_default'),
    'accountant': ('accounts_officer', 'accounts_officer_default'),
    'clerk': ('clerk', 'clerk_default'),
    'tenant_portal': ('tenant', 'tenant_portal_only'),
    'landlord_portal': ('account_holder', 'account_holder_portal_only'),
}


# ---------------------------------------------------------------------------
# 5. Effective-capability resolution.
# ---------------------------------------------------------------------------

def effective_capabilities(user_type, permission_role, custom_capabilities=None):
    """Resolve the concrete set of capability codes for a user.

    - super_admin type always gets everything (belt & braces).
    - Locked portal types always get exactly their portal capability,
      regardless of any stored permission_role or override.
    - permission_role == 'custom' uses the per-user override list (filtered
      to known, non-portal capabilities).
    - Otherwise the predefined set for the permission role.
    """
    if user_type == 'super_admin':
        return set(ALL_CAPABILITIES)

    if user_type in LOCKED_USER_TYPES:
        return set(DEFAULT_CAPABILITIES[DEFAULT_PERMISSION_ROLE_FOR_TYPE[user_type]])

    if permission_role == 'custom':
        override = custom_capabilities or []
        # Only honour known internal capabilities; portals stay portal-only.
        return {c for c in override if c in CAPABILITY_LABELS and c not in _PORTAL_CAPS}

    return set(DEFAULT_CAPABILITIES.get(permission_role, []))


def capability_catalog():
    """Serializable catalog for the admin permission UI."""
    return {
        'groups': [
            {
                'title': title,
                'capabilities': [
                    {'code': code, 'label': label} for code, label in items
                ],
            }
            for title, items in CAPABILITY_GROUPS
        ],
        'user_types': [
            {'value': v, 'label': l, 'locked': v in LOCKED_USER_TYPES}
            for v, l in USER_TYPES
        ],
        'permission_roles': [
            {
                'value': v,
                'label': l,
                'assignable': v in INTERNAL_ASSIGNABLE_ROLES,
                'capabilities': list(DEFAULT_CAPABILITIES.get(v, [])),
            }
            for v, l in PERMISSION_ROLES
        ],
    }
