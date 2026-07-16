import { useState, useEffect, useMemo, useCallback, createContext, useContext, Fragment, type ReactNode } from 'react'
import { useQuery, useIsFetching, keepPreviousData } from '@tanstack/react-query'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart3,
  FileText,
  Building2,
  DollarSign,
  Scale,
  Home,
  CheckCircle,
  XCircle,
  Download,
  Printer,
  Calendar,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  Banknote,
  ArrowRight,
  Clock,
  Users,
  Receipt,
  CreditCard,
  Filter,
  AlertTriangle,
  Landmark,
  ClipboardList,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
  Line,
} from 'recharts'
import { reportsApi, tenantApi, landlordApi, propertyApi } from '../../../services/api'
import { formatCurrency, formatPercent, formatDate, cn } from '../../../lib/utils'
import { printElement, printFinancialReport, type FinancialReportType } from '../../../lib/printTemplate'
import { exportReport } from '../../../lib/export'
import { PageHeader, Button, Badge, Skeleton, EmptyState, TableFilter, Pagination, Tooltip as UITooltip, DatePicker, Accordion, SplitButton, Select } from '../../../components/ui'
import {
  groupAssets, groupLiabilities, groupRevenue, groupExpenses,
  groupTrialBalance, sumRows,
  type ReportRow,
} from '../../../lib/reportGroups'
import { AsyncSelect } from '../../../components/ui/AsyncSelect'
import toast from 'react-hot-toast'
import { PiBuildingApartmentLight } from "react-icons/pi";
import { useUIStore } from '../../../stores/uiStore'

import { FINANCIAL_REPORTS, CASH_ONLY_REPORTS, PERIOD_REPORTS, derivePeriod, _ymd, _MONTHS, ReportFilterContext, useReportFilters, reportDataStore, SkeletonReport } from '../shared'
import type { ReportType, PeriodMode } from '../shared'

function BalanceSheetReport() {
  const { landlordId, propertyId, periodEnd } = useReportFilters()
  const { data, isLoading } = useQuery({
    queryKey: ['balance-sheet', landlordId, propertyId, periodEnd],
    queryFn: () => reportsApi.balanceSheet({
      ...(landlordId ? { landlord_id: Number(landlordId) } : {}),
      ...(propertyId ? { property_id: Number(propertyId) } : {}),
      // A balance sheet is point-in-time — "as at" the end of the period.
      ...(periodEnd ? { as_of_date: periodEnd } : {}),
    }).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  // Store data for export
  if (data) reportDataStore.data = data

  const isBalanced = data?.totals?.balanced

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
            <FileText className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Balance Sheet</h2>
            <p className="text-sm text-gray-500">Statement of Financial Position</p>
          </div>
        </div>
        {isLoading ? (
          <div className="h-10 w-28 bg-gray-200 rounded-full animate-pulse" />
        ) : (
          <span className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium',
            isBalanced ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          )}>
            {isBalanced ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
            {isBalanced ? 'Balanced' : 'Unbalanced'}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="p-6 animate-pulse">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Assets skeleton */}
            <div className="rounded-xl border border-blue-200 overflow-hidden">
              <div className="px-5 py-4 bg-blue-50 border-b border-blue-200">
                <h3 className="font-semibold text-blue-800">Assets</h3>
              </div>
              <div className="divide-y divide-blue-100">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="px-5 py-3 flex justify-between">
                    <div className="h-4 bg-gray-200 rounded" style={{ width: `${90 + i * 25}px` }} />
                    <div className="h-4 w-20 bg-blue-100 rounded" />
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 bg-blue-100 flex justify-between font-bold text-blue-800">
                <span>Total Assets</span>
                <div className="h-5 w-24 bg-blue-200 rounded" />
              </div>
            </div>

            {/* Liabilities & Equity skeleton */}
            <div className="space-y-6">
              {/* Liabilities skeleton */}
              <div className="rounded-xl border border-rose-200 overflow-hidden">
                <div className="px-5 py-4 bg-rose-50 border-b border-rose-200">
                  <h3 className="font-semibold text-rose-800">Liabilities</h3>
                </div>
                <div className="divide-y divide-rose-100">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="px-5 py-3 flex justify-between">
                      <div className="h-4 bg-gray-200 rounded" style={{ width: `${100 + i * 20}px` }} />
                      <div className="h-4 w-20 bg-rose-100 rounded" />
                    </div>
                  ))}
                </div>
                <div className="px-5 py-4 bg-rose-100 flex justify-between font-bold text-rose-800">
                  <span>Total Liabilities</span>
                  <div className="h-5 w-24 bg-rose-200 rounded" />
                </div>
              </div>

              {/* Equity skeleton */}
              <div className="rounded-xl border border-purple-200 overflow-hidden">
                <div className="px-5 py-4 bg-purple-50 border-b border-purple-200">
                  <h3 className="font-semibold text-purple-800">Equity</h3>
                </div>
                <div className="divide-y divide-purple-100">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="px-5 py-3 flex justify-between">
                      <div className="h-4 bg-gray-200 rounded" style={{ width: `${110 + i * 30}px` }} />
                      <div className="h-4 w-20 bg-purple-100 rounded" />
                    </div>
                  ))}
                </div>
                <div className="px-5 py-4 bg-purple-100 flex justify-between font-bold text-purple-800">
                  <span>Total Equity</span>
                  <div className="h-5 w-24 bg-purple-200 rounded" />
                </div>
              </div>
            </div>
          </div>

          {/* Total L+E skeleton */}
          <div className="mt-6 p-4 bg-gray-100 rounded-xl flex justify-between font-bold text-lg">
            <span>Total Liabilities + Equity</span>
            <div className="h-6 w-28 bg-gray-300 rounded" />
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {/* If the backend emits the spec'd `sub_categories` structure
              (landlord-scoped sheets), render the 4-bucket layout per
              the BS REPORTING spec — Funds Held in Trust / Lessees
              Arrears / Prepayments / Other CA on the asset side and
              Funds Owed By Trust / Lessees Prepayments / Accruals /
              Other CL on the liability side. The 4 sub-categories
              ALWAYS show, even at zero, so the structure is consistent
              across all landlords.

              Agency-wide sheets fall back to the legacy subtype-grouped
              accordion layout (Current / Non-Current / Other) because
              the spec is landlord-specific. */}
          <div className="grid md:grid-cols-2 gap-6">
            {data?.assets?.sub_categories ? (
              <div className="space-y-6">
                {Array.isArray(data?.assets?.non_current) &&
                  data.assets.non_current.some(
                    (b: any) => b.total !== 0 || (b.breakdown?.length ?? 0) > 0
                  ) && (
                    <SubCategorySection
                      title="Non-Current Assets"
                      accent="blue"
                      buckets={data.assets.non_current}
                      total={data?.assets?.non_current_total ?? 0}
                    />
                  )}
                <SubCategorySection
                  title="Current Assets"
                  accent="blue"
                  buckets={data.assets.sub_categories}
                  total={data?.assets?.current_total ?? data?.assets?.total ?? 0}
                />
                {/* Combined total of current + non-current assets. */}
                <div className="px-5 py-3 rounded-xl flex justify-between font-bold bg-blue-200 text-blue-900">
                  <span>Total Assets</span>
                  <span className="tabular-nums">{formatCurrency(data?.assets?.total || 0)}</span>
                </div>
              </div>
            ) : (
              <BalanceSheetSection
                title="Assets"
                accent="blue"
                groups={groupAssets(data?.assets?.accounts || [])}
                total={data?.assets?.total || 0}
                emptyLabel="No asset accounts"
              />
            )}
            <div className="space-y-6">
              {data?.liabilities?.sub_categories ? (
                <SubCategorySection
                  title="Current Liabilities"
                  accent="rose"
                  buckets={data.liabilities.sub_categories}
                  total={data?.liabilities?.total || 0}
                />
              ) : (
                <BalanceSheetSection
                  title="Liabilities"
                  accent="rose"
                  groups={groupLiabilities(data?.liabilities?.accounts || [])}
                  total={data?.liabilities?.total || 0}
                  emptyLabel="No liability accounts"
                />
              )}
              <BalanceSheetSection
                title="Equity"
                accent="purple"
                groups={[{ key: 'equity', label: 'Equity Accounts', rows: data?.equity?.accounts || [] }]}
                total={data?.equity?.total || 0}
                emptyLabel="No equity accounts"
                plugLabel={data?.totals?.equity_method === 'balancing_residual' ? 'Plug (Assets − Liabilities)' : undefined}
              />
            </div>
          </div>

          <div className="p-4 bg-gray-100 rounded-xl flex justify-between font-bold text-lg">
            <span>Total Liabilities + Equity</span>
            <span className="tabular-nums">
              {formatCurrency((data?.liabilities?.total || 0) + (data?.equity?.total || 0))}
            </span>
          </div>

          {data?.totals?.equity_method === 'balancing_residual' && (
            <EquityPlugExplainer components={data.totals.equity_components} />
          )}

          <BalanceSheetNotes data={data} />
        </div>
      )}
    </div>
  )
}

/** One half of a Balance Sheet (Assets, Liabilities, or Equity).
 *  Renders an accordion per subtype group with a coloured header bar
 *  showing the section subtotal, and a final total-line outside the
 *  accordions so the bottom-line is always visible.
 *
 *  `accent` controls the colour family of the section (blue/rose/purple).
 */
function BalanceSheetSection({
  title,
  accent,
  groups,
  total,
  emptyLabel,
  plugLabel,
}: {
  title: string
  accent: 'blue' | 'rose' | 'purple'
  groups: Array<{ key: string; label: string; rows: ReportRow[] }>
  total: number
  emptyLabel: string
  /** When set, renders a small amber pill next to the section header
   *  flagging that the section value isn't sourced from posted ledger
   *  rows — it's a plug. E.g. "Plug (Assets − Liabilities)" on a
   *  landlord-scoped Equity section. */
  plugLabel?: string
}) {
  const palette = {
    blue: { totalRow: 'bg-blue-100 text-blue-800', value: 'text-blue-700', hover: 'hover:bg-blue-50/50' },
    rose: { totalRow: 'bg-rose-100 text-rose-800', value: 'text-rose-700', hover: 'hover:bg-rose-50/50' },
    purple: { totalRow: 'bg-purple-100 text-purple-800', value: 'text-purple-700', hover: 'hover:bg-purple-50/50' },
  }[accent]

  const allEmpty = groups.length === 0 || groups.every(g => g.rows.length === 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <h3 className="text-xs font-bold tracking-[0.16em] uppercase text-gray-700">{title}</h3>
        {plugLabel && (
          <span
            title="This figure isn't posted to a ledger account — it's the balancing residual on the sheet. Investigate components below to verify it."
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200"
          >
            {plugLabel}
          </span>
        )}
      </div>
      {allEmpty ? (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-6 text-center text-gray-400 text-sm">
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(group => (
            <Accordion
              key={group.key}
              title={group.label}
              right={
                <span className={cn('text-sm font-semibold tabular-nums', palette.value)}>
                  {formatCurrency(sumRows(group.rows))}
                </span>
              }
            >
              <div className="divide-y divide-gray-100">
                {group.rows.map((acc: any, idx: number) => (
                  <div
                    key={`${acc.code}-${idx}`}
                    className={cn('px-5 py-2.5 flex items-center gap-3 transition-colors', palette.hover)}
                  >
                    <span className="text-[10px] font-mono text-gray-400 w-12 shrink-0">{acc.code || ''}</span>
                    <span className="flex-1 min-w-0 text-sm text-gray-700 truncate" title={acc.name}>
                      {acc.name}
                    </span>
                    <span className={cn('text-sm font-semibold tabular-nums shrink-0', palette.value)}>
                      {formatCurrency(acc.balance)}
                    </span>
                  </div>
                ))}
              </div>
            </Accordion>
          ))}
        </div>
      )}
      <div className={cn('px-5 py-3 rounded-xl flex justify-between font-bold', palette.totalRow)}>
        <span>Total {title}</span>
        <span className="tabular-nums">{formatCurrency(total)}</span>
      </div>
    </div>
  )
}


/** Spec-compliant landlord Balance Sheet section.
 *
 *  Renders the 4 sub-categories defined in the BALANCE SHEET REPORTING
 *  spec (Funds Held in Trust / Lessees Arrears / Prepayments / Other
 *  Current Assets — or the liability equivalents). Each bucket is its
 *  own accordion with its total on the right. ALL FOUR ALWAYS SHOW,
 *  even when the bucket has no rows — that's intentional, the spec is
 *  explicit about it. A toggle on the title hides zero-total buckets
 *  for users who want a tighter view.
 */
function SubCategorySection({
  title,
  accent,
  buckets,
  total,
}: {
  title: string
  accent: 'blue' | 'rose'
  buckets: Array<{
    name: string
    total: number
    breakdown: Array<any>
    description?: string
  }>
  total: number
}) {
  const palette = {
    blue: { value: 'text-blue-700', totalRow: 'bg-blue-100 text-blue-800', hover: 'hover:bg-blue-50/50' },
    rose: { value: 'text-rose-700', totalRow: 'bg-rose-100 text-rose-800', hover: 'hover:bg-rose-50/50' },
  }[accent]
  const [hideZeros, setHideZeros] = useState(false)
  // Always drop buckets that are completely empty (zero total AND no line
  // items) — e.g. an unused "Other Current Assets" — so the sheet only
  // shows sub-categories that actually carry something. A bucket that nets
  // to zero but still has underlying rows stays (and obeys the toggle).
  const nonEmpty = buckets.filter(b => b.total !== 0 || (b.breakdown?.length ?? 0) > 0)
  const visible = hideZeros ? nonEmpty.filter(b => b.total !== 0) : nonEmpty

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className="text-xs font-bold tracking-[0.16em] uppercase text-gray-700">{title}</h3>
        <button
          onClick={() => setHideZeros(h => !h)}
          className="text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-700"
        >
          {hideZeros ? 'Show all' : 'Hide zero'}
        </button>
      </div>
      <div className="space-y-2">
        {visible.map(bucket => (
          <Accordion
            key={bucket.name}
            title={
              <span className="flex items-center gap-2">
                {bucket.name}
                {bucket.description && (
                  <span className="text-[10px] font-normal text-gray-400 hidden md:inline">
                    · {bucket.description}
                  </span>
                )}
              </span>
            }
            right={
              <span className={cn('text-sm font-semibold tabular-nums', palette.value)}>
                {formatCurrency(bucket.total)}
              </span>
            }
            defaultOpen={bucket.total !== 0}
          >
            {bucket.breakdown.length === 0 ? (
              <div className="px-5 py-3 text-center text-xs text-gray-400">
                No items in this category
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {bucket.breakdown.map((row: any, idx: number) => {
                  const code = row.code || row.tenant_code || row.account_code || ''
                  const name = row.name || row.tenant_name ||
                    (row.category ? `${row.category}${row.currency ? ` (${row.currency})` : ''}` : '')
                  return (
                    <div
                      key={`${code}-${idx}`}
                      className={cn('px-5 py-2 flex items-center gap-3 text-sm transition-colors', palette.hover)}
                    >
                      {code && (
                        <span className="text-[10px] font-mono text-gray-400 w-20 shrink-0 truncate" title={code}>{code}</span>
                      )}
                      <span className="flex-1 min-w-0 text-gray-700 truncate capitalize" title={name}>
                        {name || '—'}
                      </span>
                      <span className={cn('tabular-nums font-semibold shrink-0', palette.value)}>
                        {formatCurrency(row.balance ?? 0)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </Accordion>
        ))}
      </div>
      <div className={cn('px-5 py-3 rounded-xl flex justify-between font-bold', palette.totalRow)}>
        <span>Total {title}</span>
        <span className="tabular-nums">{formatCurrency(total)}</span>
      </div>
    </div>
  )
}


/** Surfaces the math behind the "Owner's Equity" plug on a
 *  landlord-scoped Balance Sheet. Without this panel, equity is an
 *  unexplained number that absorbs any bug on either side.
 *
 *  Funds Held in Trust = Receipts − Commissions − Paid Expenses
 *  Owner's Equity      = Total Assets − Total Liabilities
 *
 *  Both equations are shown side by side. If something looks wrong on
 *  the sheet, the receipts/commissions/expenses figures here are the
 *  inputs to check.
 */
function EquityPlugExplainer({ components }: { components: any }) {
  if (!components) return null
  const fmt = (v: number | null | undefined) =>
    v == null ? '—' : formatCurrency(v)
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-5">
      <div className="flex items-baseline justify-between gap-2 pb-2 border-b border-amber-200/60">
        <h3 className="text-xs font-bold tracking-[0.16em] uppercase text-amber-800">
          Owner's Equity — How the Plug Was Computed
        </h3>
        <span className="text-[10px] uppercase tracking-wider text-amber-700/70">Verify the inputs</span>
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold tracking-wider uppercase text-amber-700/80">Sub-Account Inputs</div>
          <Row label="Funds Held in Trust"   value={fmt(components.funds_held_in_trust)} />
          <Row label="Lessees Arrears"       value={fmt(components.lessees_arrears)} />
          <Row label="Less: Funds Owed By Trust" value={fmt(components.funds_owed_by_trust)} negative />
          <Row label="Less: Lessees Prepayments" value={fmt(components.lessees_prepayments)} negative />
          <Row label="Less: Accruals"        value={fmt(components.accruals)} negative />
        </div>
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold tracking-wider uppercase text-amber-700/80">Sheet Reconciliation</div>
          <Row label="Total Assets"           value={fmt(components.total_assets)} />
          <Row label="Less: Total Liabilities" value={fmt(components.total_liabilities)} negative />
          <div className="border-t border-amber-300 pt-1 mt-1">
            <Row label="= Owner's Equity"      value={fmt(components.derived_equity)} bold />
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, bold, negative }: { label: string; value: string; bold?: boolean; negative?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={cn('text-gray-700', bold && 'font-semibold text-gray-900')}>{label}</span>
      <span className={cn(
        'tabular-nums',
        bold && 'font-semibold text-gray-900',
        negative && !bold && 'text-rose-700',
      )}>
        {negative && !bold ? `(${value})` : value}
      </span>
    </div>
  )
}


/** Income Statement section — Revenue or Expenses — grouped into
 *  accordions per subtype. Mirrors BalanceSheetSection's structure but
 *  without the two-column layout. `parenthesize` wraps expense totals
 *  in parentheses per accounting convention. */

function BalanceSheetNotes({ data }: { data: any }) {
  const breakdowns = data?.breakdowns || {}
  const trust = breakdowns.trust_composition
  const perProp: any[] = breakdowns.per_property || []
  const eq = breakdowns.equity_reconciliation
  const accruedCats: any[] = breakdowns.accrued_expenses_by_category || []
  const accruedDetail: any[] = breakdowns.accrued_expenses_detail || []
  const ob = breakdowns.opening_balances
  const obEntries: any[] = ob?.entries || []

  const hasTrust = trust && (trust.receipts_collected || trust.commission_charged ||
    trust.operating_expenses_paid || trust.landlord_remittances || trust.funds_held_in_trust)
  const hasPerProp = Array.isArray(perProp) && perProp.length > 0
  const hasEq = eq && (eq.opening_equity || eq.period_net_income || eq.drawings || eq.closing_equity)
  const hasAccrued = Array.isArray(accruedCats) && accruedCats.length > 0
  const hasAccruedDetail = Array.isArray(accruedDetail) && accruedDetail.length > 0
  const hasOB = obEntries.length > 0
  if (!hasTrust && !hasPerProp && !hasEq && !hasAccrued && !hasOB) return null

  // Group detail entries by category so each category subtotal is followed
  // by the line items it contains — supplier visible on every row.
  const detailByCategory = new Map<string, any[]>()
  for (const entry of accruedDetail) {
    const key = entry.category || 'Uncategorised'
    const arr = detailByCategory.get(key) || []
    arr.push(entry)
    detailByCategory.set(key, arr)
  }

  let n = 0
  return (
    <div className="mt-10">
      <div className="flex items-baseline justify-between pb-2 border-b border-gray-900">
        <h3 className="text-xs font-bold tracking-[0.16em] uppercase text-gray-900">
          Notes to the Balance Sheet
        </h3>
        <span className="text-[10px] tracking-[0.1em] uppercase text-gray-500">Supporting detail</span>
      </div>

      {hasTrust && (
        <BalanceSheetNote
          number={++n}
          title="Composition of Funds Held in Trust"
          meta="Cash basis · since inception"
        >
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-1.5 text-gray-700">Tenant receipts collected</td>
                <td className="py-1.5 text-right tabular-nums font-medium">{formatCurrency(trust.receipts_collected || 0)}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-1.5 text-gray-700">Less: Management commission charged</td>
                <td className="py-1.5 text-right tabular-nums font-medium text-rose-700">({formatCurrency(trust.commission_charged || 0)})</td>
              </tr>
              {Array.isArray(trust.commission_charged_by_type) && trust.commission_charged_by_type.length > 0 &&
                trust.commission_charged_by_type.map((row: any) => (
                  <tr key={`trust-comm-${row.income_type_id ?? row.income_type_name}`} className="border-b border-gray-100">
                    <td className="py-1 pl-6 text-gray-500 text-xs">
                      <span className="text-gray-400 mr-2">·</span>
                      {row.income_type_name}
                    </td>
                    <td className="py-1 text-right tabular-nums text-rose-600 text-xs">
                      ({formatCurrency(row.amount || 0)})
                    </td>
                  </tr>
                ))}
              <tr className="border-b border-gray-100">
                <td className="py-1.5 text-gray-700">Less: Operating expenses paid from trust</td>
                <td className="py-1.5 text-right tabular-nums font-medium text-rose-700">({formatCurrency(trust.operating_expenses_paid || 0)})</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-1.5 text-gray-700">Less: Remittances paid to landlord</td>
                <td className="py-1.5 text-right tabular-nums font-medium text-rose-700">({formatCurrency(trust.landlord_remittances || 0)})</td>
              </tr>
              <tr style={{ borderTop: '1pt solid #111827', borderBottom: '3pt double #111827' }}>
                <td className="pt-2 pb-1 font-bold text-gray-900">Funds Held in Trust</td>
                <td className="pt-2 pb-1 text-right tabular-nums font-bold">{formatCurrency(trust.funds_held_in_trust || 0)}</td>
              </tr>
            </tbody>
          </table>
        </BalanceSheetNote>
      )}

      {hasPerProp && (
        <BalanceSheetNote
          number={++n}
          title="Per-Property Breakdown"
          meta={`${perProp.length} ${perProp.length === 1 ? 'property' : 'properties'}`}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] tracking-[0.1em] uppercase text-gray-500 border-b border-gray-300">
                <th className="py-2 text-left font-semibold">Property</th>
                <th className="py-2 text-right font-semibold">Funds Held in Trust</th>
                <th className="py-2 text-right font-semibold">Tenant Receivables</th>
                <th className="py-2 text-right font-semibold">Accrued Expenses</th>
              </tr>
            </thead>
            <tbody>
              {perProp.map((r: any, idx: number) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="py-1.5 text-gray-700">{r.property_name || '—'}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.funds_held_in_trust || 0)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.tenant_receivables || 0)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.accrued_expenses || 0)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-900 font-bold">
                <td className="pt-2">Total</td>
                <td className="pt-2 text-right tabular-nums">{formatCurrency(perProp.reduce((s: number, r: any) => s + (r.funds_held_in_trust || 0), 0))}</td>
                <td className="pt-2 text-right tabular-nums">{formatCurrency(perProp.reduce((s: number, r: any) => s + (r.tenant_receivables || 0), 0))}</td>
                <td className="pt-2 text-right tabular-nums">{formatCurrency(perProp.reduce((s: number, r: any) => s + (r.accrued_expenses || 0), 0))}</td>
              </tr>
            </tbody>
          </table>
        </BalanceSheetNote>
      )}

      {hasEq && (
        <BalanceSheetNote
          number={++n}
          title="Reconciliation of Owner's Equity"
          meta={eq.period_start && eq.period_end ? `${eq.period_start} – ${eq.period_end}` : 'Year-to-date'}
        >
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-1.5 text-gray-700">Opening equity</td>
                <td className="py-1.5 text-right tabular-nums font-medium">{formatCurrency(eq.opening_equity || 0)}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-1.5 text-gray-700">Add: Period net income</td>
                <td className={cn(
                  'py-1.5 text-right tabular-nums font-medium',
                  (eq.period_net_income || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                )}>{formatCurrency(eq.period_net_income || 0)}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-1.5 text-gray-700">Less: Drawings (remittances to owner)</td>
                <td className="py-1.5 text-right tabular-nums font-medium text-rose-700">({formatCurrency(eq.drawings || 0)})</td>
              </tr>
              <tr style={{ borderTop: '1pt solid #111827', borderBottom: '3pt double #111827' }}>
                <td className="pt-2 pb-1 font-bold text-gray-900">Closing equity</td>
                <td className="pt-2 pb-1 text-right tabular-nums font-bold">{formatCurrency(eq.closing_equity || 0)}</td>
              </tr>
            </tbody>
          </table>
        </BalanceSheetNote>
      )}

      {hasAccrued && (
        <BalanceSheetNote
          number={++n}
          title="Accrued Expenses"
          meta={
            hasAccruedDetail
              ? `${accruedDetail.length} ${accruedDetail.length === 1 ? 'entry' : 'entries'} · ${accruedCats.length} ${accruedCats.length === 1 ? 'category' : 'categories'}`
              : `${accruedCats.length} ${accruedCats.length === 1 ? 'category' : 'categories'}`
          }
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] tracking-[0.1em] uppercase text-gray-500 border-b border-gray-300">
                <th className="py-2 pr-3 text-left font-semibold w-24">Date</th>
                <th className="py-2 pr-3 text-left font-semibold">Supplier / Payee</th>
                <th className="py-2 pr-3 text-left font-semibold">Description</th>
                <th className="py-2 text-right font-semibold w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {accruedCats.map((cat: any, catIdx: number) => {
                const entries = detailByCategory.get(cat.category) || []
                return (
                  <Fragment key={`cat-${catIdx}`}>
                    <tr className="bg-gray-50 border-y border-gray-200">
                      <td colSpan={3} className="py-1.5 px-1 text-[11px] tracking-[0.1em] uppercase font-bold text-gray-700">
                        {cat.category || 'Uncategorised'}
                      </td>
                      <td className="py-1.5 text-right tabular-nums font-bold text-gray-900">
                        {formatCurrency(cat.amount || 0)}
                      </td>
                    </tr>
                    {entries.length > 0 ? (
                      entries.map((e: any) => (
                        <tr key={e.id} className="border-b border-gray-100">
                          <td className="py-1.5 pr-3 text-xs text-gray-500 tabular-nums">{e.date}</td>
                          <td className="py-1.5 pr-3 text-gray-800">
                            <span className="font-medium">{e.supplier_name || '—'}</span>
                            {e.supplier_code && (
                              <span className="ml-1.5 text-[10px] font-mono text-gray-400">{e.supplier_code}</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-gray-600 truncate max-w-[280px]">
                            {e.description || (e.reference ? `Ref ${e.reference}` : '—')}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">{formatCurrency(e.amount || 0)}</td>
                        </tr>
                      ))
                    ) : null}
                  </Fragment>
                )
              })}
              <tr className="border-t-2 border-gray-900 font-bold">
                <td colSpan={3} className="pt-2 text-gray-900">Total Accrued Expenses</td>
                <td className="pt-2 text-right tabular-nums">{formatCurrency(accruedCats.reduce((s: number, r: any) => s + (r.amount || 0), 0))}</td>
              </tr>
            </tbody>
          </table>
        </BalanceSheetNote>
      )}

      {hasOB && (
        <BalanceSheetNote
          number={++n}
          title="Opening Layer Adjustments"
          meta={`${obEntries.length} ${obEntries.length === 1 ? 'entry' : 'entries'}`}
        >
          <p className="text-xs text-gray-500 leading-relaxed mb-3">
            {ob.note ||
              'Pre-takeover balances brought in via the Opening Layer. ' +
              'Reflected in the Balance Sheet totals above; do not move cash.'}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] tracking-[0.1em] uppercase text-gray-500 border-b border-gray-300">
                <th className="py-2 pr-3 text-left font-semibold w-24">Date</th>
                <th className="py-2 pr-3 text-left font-semibold">Account</th>
                <th className="py-2 pr-3 text-left font-semibold">Description</th>
                <th className="py-2 pr-3 text-center font-semibold w-16">Dir</th>
                <th className="py-2 text-right font-semibold w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {obEntries.map((e: any) => (
                <tr key={e.id} className="border-b border-gray-100">
                  <td className="py-1.5 pr-3 text-xs text-gray-500 tabular-nums">{e.date}</td>
                  <td className="py-1.5 pr-3 text-gray-800">
                    <span className="font-mono text-[11px] text-gray-400 mr-1.5">{e.account_code}</span>
                    {e.account_name}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-600 truncate max-w-[280px]">{e.description}</td>
                  <td className="py-1.5 pr-3 text-center">
                    <span className={cn(
                      'inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase',
                      e.direction === 'debit' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                    )}>
                      {e.direction === 'debit' ? 'Dr' : 'Cr'}
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(e.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-300 text-xs">
                <td colSpan={4} className="pt-2 text-right text-gray-500">Assets introduced</td>
                <td className="pt-2 text-right tabular-nums text-gray-800 font-semibold">
                  {formatCurrency(ob.total_assets_introduced || 0)}
                </td>
              </tr>
              <tr className="text-xs">
                <td colSpan={4} className="pt-1 text-right text-gray-500">Liabilities introduced</td>
                <td className="pt-1 text-right tabular-nums text-gray-800 font-semibold">
                  ({formatCurrency(ob.total_liabilities_introduced || 0)})
                </td>
              </tr>
              <tr className="border-t-2 border-gray-900 font-bold">
                <td colSpan={4} className="pt-2 text-right text-gray-900">Net equity impact</td>
                <td className="pt-2 text-right tabular-nums">
                  {formatCurrency(ob.net_equity_impact || 0)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Per-supplier rollup — answers "who do I owe?" for the
              landlord. Only renders when at least one OB has a supplier
              tag (e.g. Apex Finance loan). */}
          {Array.isArray(ob.by_supplier) && ob.by_supplier.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-200">
              <div className="text-[10px] tracking-[0.12em] uppercase font-bold text-gray-500 mb-2">
                Amount owed by supplier
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {ob.by_supplier.map((row: any) => (
                    <tr key={row.supplier_id} className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-800">
                        <span className="font-mono text-[11px] text-gray-400 mr-1.5">
                          {row.supplier_code}
                        </span>
                        {row.supplier_name}
                        <span className="ml-2 text-[10px] text-gray-400">
                          ({row.entry_count} {row.entry_count === 1 ? 'entry' : 'entries'})
                        </span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums font-semibold text-rose-700">
                        {formatCurrency(row.amount_owed)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-300 font-bold">
                    <td className="pt-2 text-gray-900">Total owed via Opening Layer</td>
                    <td className="pt-2 text-right tabular-nums text-rose-800">
                      {formatCurrency(
                        ob.by_supplier.reduce((s: number, r: any) => s + (r.amount_owed || 0), 0),
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </BalanceSheetNote>
      )}
    </div>
  )
}

function BalanceSheetNote({ number, title, meta, children }: {
  number: number; title: string; meta?: string; children: ReactNode
}) {
  return (
    <div className="mt-6 break-inside-avoid">
      <div className="flex items-baseline gap-3 pb-1.5 border-b border-gray-200">
        <span className="text-[10px] tracking-[0.12em] uppercase font-bold text-gray-500 min-w-[3.5rem]">
          Note {number}
        </span>
        <h4 className="text-sm font-semibold text-gray-900 flex-1">{title}</h4>
        {meta && <span className="text-xs text-gray-500">{meta}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

export { BalanceSheetReport }
