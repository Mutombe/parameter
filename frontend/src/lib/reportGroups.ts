/**
 * Subtype → display-group mappings for financial reports.
 *
 * The COA's `account_subtype` field is the source of truth for
 * categorisation (current_asset, accounts_receivable, etc.). The
 * report UIs roll those subtypes up into the human-readable buckets
 * that show on a published Balance Sheet or P&L.
 *
 * Anything not in the map falls into "Other" within its account_type.
 */

export interface ReportRow {
  code: string
  name: string
  subtype?: string
  balance?: number
  debit?: number
  credit?: number
}

// --- Balance Sheet groups ----------------------------------------------------

const ASSET_CURRENT = new Set([
  'cash', 'bank', 'accounts_receivable', 'prepaid', 'inventory',
  'short_term_investment', 'tax_receivable',
])
const ASSET_NONCURRENT = new Set([
  'fixed_asset', 'depreciation', 'intangible', 'long_term_investment',
  'goodwill', 'other_asset',
])

const LIABILITY_CURRENT = new Set([
  'accounts_payable', 'vat_payable', 'tenant_deposits', 'accrued_expenses',
  'short_term_loan', 'tax_payable',
])
const LIABILITY_NONCURRENT = new Set([
  'long_term_loan', 'mortgage', 'bond_payable', 'deferred_tax',
  'other_liability',
])

export function groupAssets(rows: ReportRow[]) {
  const current: ReportRow[] = []
  const nonCurrent: ReportRow[] = []
  const other: ReportRow[] = []
  for (const r of rows) {
    const s = (r.subtype || '').toLowerCase()
    if (ASSET_CURRENT.has(s)) current.push(r)
    else if (ASSET_NONCURRENT.has(s)) nonCurrent.push(r)
    else other.push(r)
  }
  return [
    { key: 'current', label: 'Current Assets', rows: current },
    { key: 'noncurrent', label: 'Non-Current Assets', rows: nonCurrent },
    { key: 'other', label: 'Other Assets', rows: other },
  ].filter(g => g.rows.length > 0)
}

export function groupLiabilities(rows: ReportRow[]) {
  const current: ReportRow[] = []
  const nonCurrent: ReportRow[] = []
  const other: ReportRow[] = []
  for (const r of rows) {
    const s = (r.subtype || '').toLowerCase()
    if (LIABILITY_CURRENT.has(s)) current.push(r)
    else if (LIABILITY_NONCURRENT.has(s)) nonCurrent.push(r)
    else other.push(r)
  }
  return [
    { key: 'current', label: 'Current Liabilities', rows: current },
    { key: 'noncurrent', label: 'Non-Current Liabilities', rows: nonCurrent },
    { key: 'other', label: 'Other Liabilities', rows: other },
  ].filter(g => g.rows.length > 0)
}

// --- Income Statement groups ------------------------------------------------

const REVENUE_LABEL: Record<string, string> = {
  rental_income: 'Rental Income',
  commission_income: 'Commission Revenue',
  other_income: 'Other Income',
}

const EXPENSE_LABEL: Record<string, string> = {
  operating_expense: 'Operating Expenses',
  maintenance: 'Repairs & Maintenance',
  utilities: 'Utilities',
  cost_of_sales: 'Cost of Sales / Commission',
  staff: 'Staff Costs',
  rent_expense: 'Rent',
  marketing: 'Marketing',
  depreciation: 'Depreciation',
}

function groupBySubtype(rows: ReportRow[], labels: Record<string, string>) {
  const byGroup: Record<string, { label: string; rows: ReportRow[] }> = {}
  for (const r of rows) {
    const s = (r.subtype || '').toLowerCase()
    const label = labels[s] || 'Other'
    if (!byGroup[label]) byGroup[label] = { label, rows: [] }
    byGroup[label].rows.push(r)
  }
  return Object.values(byGroup).sort((a, b) => {
    if (a.label === 'Other') return 1
    if (b.label === 'Other') return -1
    return a.label.localeCompare(b.label)
  })
}

export const groupRevenue = (rows: ReportRow[]) => groupBySubtype(rows, REVENUE_LABEL)
export const groupExpenses = (rows: ReportRow[]) => groupBySubtype(rows, EXPENSE_LABEL)

// --- Trial Balance: group by account_type then by subtype --------------------

export const TRIAL_BALANCE_TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const
export type TrialBalanceType = (typeof TRIAL_BALANCE_TYPE_ORDER)[number]

export const TRIAL_BALANCE_TYPE_LABEL: Record<TrialBalanceType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
}

export function groupTrialBalance(rows: Array<ReportRow & { type?: string }>) {
  const groups = TRIAL_BALANCE_TYPE_ORDER.map(t => ({
    key: t,
    label: TRIAL_BALANCE_TYPE_LABEL[t],
    rows: rows.filter(r => r.type === t),
  }))
  return groups.filter(g => g.rows.length > 0)
}

export function sumRows(rows: ReportRow[], field: 'balance' | 'debit' | 'credit' = 'balance'): number {
  return rows.reduce((s, r) => s + (r[field] || 0), 0)
}
