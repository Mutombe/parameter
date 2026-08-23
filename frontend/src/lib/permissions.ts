/**
 * Capability-based access helpers (frontend mirror of
 * backend/apps/accounts/capabilities.py).
 *
 * User Type (identity) is separate from Permission Role (the capability set).
 * Gating is done at the individual capability/action level — e.g. a Cashier
 * may VIEW expenditure (CAP.EXPENDITURE_VIEW) while being unable to POST it
 * (CAP.EXPENDITURE_POST_CASH).
 *
 * These are UI guardrails only; the backend independently enforces the same
 * capabilities on every sensitive endpoint.
 */
import { useAuthStore } from '@/stores/authStore'

export type Capability = string

/** Canonical capability codes — keep in sync with the backend registry. */
export const CAP = {
  DASHBOARD_VIEW: 'dashboard.view',

  PORTFOLIO_VIEW: 'portfolio.view',
  PORTFOLIO_MANAGE: 'portfolio.manage',

  INVOICES_VIEW: 'invoices.view',
  INVOICES_CREATE: 'invoices.create',
  INVOICES_EDIT: 'invoices.edit',
  INVOICES_VOID: 'invoices.void',
  INVOICES_PRINT: 'invoices.print',

  RECEIPTS_VIEW: 'receipts.view',
  RECEIPTS_CREATE: 'receipts.create',
  RECEIPTS_VOID: 'receipts.void',
  RECEIPTS_PRINT: 'receipts.print',

  EXPENDITURE_VIEW: 'expenditure.view',
  EXPENDITURE_CREATE: 'expenditure.create',
  EXPENDITURE_POST_CASH: 'expenditure.post_cash',
  EXPENDITURE_POST_NON_CASH: 'expenditure.post_non_cash',
  EXPENDITURE_EDIT: 'expenditure.edit',
  EXPENDITURE_VOID: 'expenditure.void',
  EXPENDITURE_PRINT: 'expenditure.print',

  JOURNALS_VIEW: 'journals.view',
  JOURNALS_CREATE_GENERAL: 'journals.create_general',
  JOURNALS_POST_GENERAL: 'journals.post_general',
  JOURNALS_OWNER_CONTRIBUTION: 'journals.owner_contribution',
  JOURNALS_POST_WITHDRAWAL: 'journals.post_withdrawal',

  BANK_VIEW: 'bank.view',
  BANK_CREATE_ACCOUNT: 'bank.create_account',
  BANK_RECONCILE: 'bank.reconcile',
  BANK_MANAGE: 'bank.manage',

  COA_VIEW: 'coa.view',
  COA_MANAGE: 'coa.manage',
  INCOME_CATEGORY_CREATE: 'income_category.create',
  EXPENSE_CATEGORY_CREATE: 'expense_category.create',

  OPENING_BALANCES_MANAGE: 'opening_balances.manage',

  REPORTS_VIEW: 'reports.view',
  REPORTS_PRINT: 'reports.print',

  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',
  AUDIT_VIEW: 'audit.view',
  DATA_IMPORT: 'data.import',
  TRASH_MANAGE: 'trash.manage',

  PORTAL_TENANT: 'portal.tenant',
  PORTAL_ACCOUNT_HOLDER: 'portal.account_holder',
} as const

type MaybeUser = {
  capabilities?: string[]
  user_type?: string
  is_superuser?: boolean
} | null | undefined

/** Does this user hold `cap`? super_admin / Django superuser always pass. */
export function userCan(user: MaybeUser, cap: Capability): boolean {
  if (!user) return false
  if (user.is_superuser || user.user_type === 'super_admin') return true
  return Array.isArray(user.capabilities) && user.capabilities.includes(cap)
}

/** True if the user holds ANY of the given capabilities. */
export function userCanAny(user: MaybeUser, capsList: Capability[]): boolean {
  return capsList.some((c) => userCan(user, c))
}

/**
 * Hook returning a `can(cap)` predicate bound to the current user. Also
 * exposes `canAny` and the raw user for convenience.
 *
 *   const { can } = usePermissions()
 *   if (can(CAP.RECEIPTS_CREATE)) { ... }
 */
export function usePermissions() {
  const user = useAuthStore((s) => s.user)
  return {
    can: (cap: Capability) => userCan(user, cap),
    canAny: (capsList: Capability[]) => userCanAny(user, capsList),
    user,
  }
}
