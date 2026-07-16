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

function IncomeStatementReport() {
  const { landlordId, propertyId, periodStart, periodEnd } = useReportFilters()
  const { data, isLoading } = useQuery({
    queryKey: ['income-statement', landlordId, propertyId, periodStart, periodEnd],
    queryFn: () => reportsApi.incomeStatement({
      ...(landlordId ? { landlord_id: Number(landlordId) } : {}),
      ...(propertyId ? { property_id: Number(propertyId) } : {}),
      ...(periodStart ? { start_date: periodStart } : {}),
      ...(periodEnd ? { end_date: periodEnd } : {}),
    }).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  // Store data for export
  if (data) reportDataStore.data = data

  const isProfit = data?.is_profit
  const netIncome = Math.abs(data?.net_income || 0)
  // Landlord statement carries Cost of Sales (commission) + Gross Profit;
  // the agency-wide P&L returns gross_profit === null.
  const hasCostOfSales = data?.gross_profit != null

  return (
    <div className="bg-white border-y md:border md:rounded-md border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200 flex items-baseline justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900 tracking-tight">Income Statement</h2>
          <p className="text-[11px] uppercase tracking-[0.08em] text-gray-500 mt-0.5">Profit &amp; Loss</p>
        </div>
        <span className="text-[11px] uppercase tracking-wider text-gray-400">
          {data?.period?.start ? `${formatDate(data.period.start)} – ${formatDate(data.period.end)}` : 'Current period'}
        </span>
      </div>

      {isLoading ? (
        <div className="p-6 space-y-5 animate-pulse">
          <div className="h-[280px] bg-gray-50 border border-gray-200" />
          <div className="grid grid-cols-3 gap-px bg-gray-200">
            {[0,1,2].map(i => (
              <div key={i} className="bg-white p-4 space-y-2">
                <div className="h-3 w-20 bg-gray-200 rounded" />
                <div className="h-6 w-28 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
          {[...Array(2)].map((_, i) => (
            <div key={i} className="border-y border-gray-200">
              <div className="px-5 py-2 border-b border-gray-200"><div className="h-3 w-24 bg-gray-200 rounded" /></div>
              {[...Array(3)].map((_, j) => (
                <div key={j} className="px-5 py-2.5 flex justify-between border-b border-gray-100 last:border-0">
                  <div className="h-3 w-32 bg-gray-200 rounded" />
                  <div className="h-3 w-20 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 space-y-5">
          {/* ── Net-by-account composite (executive summary chart) ──
              Drops the green/red candy palette for slate-blue revenue and
              deep-crimson expenses with a near-black net-income line.
              Compact 280px height, thin bars, no shadows or rounded chart
              wrappers — sits flat on the page so the data is the figure. */}
          {data && (data?.revenue?.total > 0 || data?.expenses?.total > 0) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="h-[280px] -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={(() => {
                    const rev = (data?.revenue?.accounts || []).map((a: any) => ({ name: a.name, Revenue: a.balance, Expenses: 0 }))
                    const exp = (data?.expenses?.accounts || []).map((a: any) => ({ name: a.name, Revenue: 0, Expenses: a.balance }))
                    const rows = [...rev, ...exp].slice(0, 10)
                    let running = 0
                    return rows.map(r => {
                      running += (r.Revenue || 0) - (r.Expenses || 0)
                      return { ...r, Net: running }
                    })
                  })()}
                  margin={{ top: 10, right: 16, left: 8, bottom: 32 }}
                  barCategoryGap="35%"
                >
                  <CartesianGrid stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="name" stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} angle={-15} textAnchor="end" height={48} interval={0} />
                  <YAxis stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v: number) => v >= 1_000_000 ? `$${(v/1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${(v/1_000).toFixed(0)}K` : `$${v}`} />
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v)}
                    contentStyle={{
                      borderRadius: 6, border: '1px solid #E5E7EB',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                      fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12,
                    }}
                    cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 6, color: '#6B7280' }}
                    iconType="circle" iconSize={7}
                  />
                  <Bar dataKey="Revenue" fill="#1E40AF" barSize={18} />
                  <Bar dataKey="Expenses" fill="#9F1239" barSize={18} />
                  <Line type="monotone" dataKey="Net" stroke="#111827" strokeWidth={1.5} dot={{ r: 2.5, fill: '#111827' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {/* ── KPI strip — borderless cells separated by hairlines.
              On the landlord statement we surface Revenue → Cost of Sales
              → Gross Profit → Net so the commission deduction is explicit;
              the agency-wide P&L keeps the simpler Revenue/Expenses/Net. ── */}
          {hasCostOfSales ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 border-y border-gray-200 divide-x divide-gray-200">
              <div className="px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">Revenue</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{formatCurrency(data?.revenue?.total || 0)}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">Cost of Sales</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-gray-900">({formatCurrency(data?.cost_of_sales?.total || 0)})</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">Gross Profit</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{formatCurrency(data?.gross_profit || 0)}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">Net {isProfit ? 'Income' : 'Loss'}</p>
                <p className={cn('mt-1 text-2xl font-semibold tabular-nums tracking-tight', isProfit ? 'text-emerald-700' : 'text-rose-700')}>
                  {isProfit ? formatCurrency(netIncome) : `(${formatCurrency(netIncome)})`}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 border-y border-gray-200 divide-x divide-gray-200">
              <div className="px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">Revenue</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{formatCurrency(data?.revenue?.total || 0)}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">Expenses</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{formatCurrency(data?.expenses?.total || 0)}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">Net {isProfit ? 'Income' : 'Loss'}</p>
                <p className={cn('mt-1 text-2xl font-semibold tabular-nums tracking-tight', isProfit ? 'text-emerald-700' : 'text-rose-700')}>
                  {isProfit ? formatCurrency(netIncome) : `(${formatCurrency(netIncome)})`}
                </p>
              </div>
            </div>
          )}

          {/* Revenue. On the landlord statement the rows are already the
              named buckets (Rental Income, Levy Income, …) so we render
              them flat; the agency-wide P&L groups GL accounts by subtype. */}
          <IncomeStatementSection
            title="Revenue"
            accent="emerald"
            groups={hasCostOfSales
              ? [{ label: 'Revenue', rows: data?.revenue?.accounts || [] }]
              : groupRevenue(data?.revenue?.accounts || [])}
            total={data?.revenue?.total || 0}
            emptyLabel="No revenue in this period"
            flat={hasCostOfSales}
          />

          {/* Cost of Sales (commission) + Gross Profit — landlord
              statement only. Commission is the landlord's Cost of Sales,
              deducted from gross revenue to reach Gross Profit. */}
          {hasCostOfSales && (
            <>
              <IncomeStatementSection
                title="Cost of Sales"
                accent="rose"
                groups={[{ label: 'Commission (Cost of Sales)', rows: data?.cost_of_sales?.accounts || [] }]}
                total={data?.cost_of_sales?.total || 0}
                emptyLabel="No commission charged this period"
                parenthesize
                flat
              />
              <div className="px-2 py-2.5 flex justify-between text-[13px] font-semibold border-t border-gray-300">
                <span className="text-gray-900">Gross Profit</span>
                <span className="tabular-nums text-gray-900">{formatCurrency(data?.gross_profit || 0)}</span>
              </div>
            </>
          )}

          <IncomeStatementSection
            title={hasCostOfSales ? 'Operating Expenses' : 'Expenses'}
            accent="rose"
            groups={hasCostOfSales
              ? [{ label: 'Operating Expenses', rows: data?.expenses?.accounts || [] }]
              : groupExpenses(data?.expenses?.accounts || [])}
            total={data?.expenses?.total || 0}
            emptyLabel="No expenses in this period"
            parenthesize
            flat={hasCostOfSales}
          />

          {/* ── Grand-total row, accountant-double-rule ── */}
          <div className="px-2 py-3 flex justify-between text-[14px] font-semibold border-t-2 border-double border-gray-400">
            <span className="text-gray-900">Net {isProfit ? 'Income' : 'Loss'}</span>
            <span className={cn('tabular-nums', isProfit ? 'text-emerald-700' : 'text-rose-700')}>
              {isProfit ? formatCurrency(netIncome) : `(${formatCurrency(netIncome)})`}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}


function IncomeStatementSection({
  title,
  accent,
  groups,
  total,
  emptyLabel,
  parenthesize,
  flat,
}: {
  title: string
  accent: 'emerald' | 'rose'
  groups: Array<{ label: string; rows: ReportRow[] }>
  total: number
  emptyLabel: string
  parenthesize?: boolean
  // `flat` renders the rows as a plain list (no per-subtype accordions).
  // Used when the rows are already the final categories — e.g. the
  // landlord statement's named revenue buckets — so they aren't buried
  // under a generic "Other" group.
  flat?: boolean
}) {
  const palette = {
    emerald: { value: 'text-emerald-700', totalRow: 'border-emerald-200 text-emerald-800', hover: 'hover:bg-emerald-50/40' },
    rose: { value: 'text-rose-700', totalRow: 'border-rose-200 text-rose-800', hover: 'hover:bg-rose-50/40' },
  }[accent]
  const fmt = (v: number) => parenthesize ? `(${formatCurrency(v)})` : formatCurrency(v)
  const flatRows = flat ? groups.flatMap(g => g.rows) : []
  const allEmpty = flat
    ? flatRows.length === 0
    : groups.length === 0 || groups.every(g => g.rows.length === 0)

  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500 px-1">{title}</h3>
      {allEmpty ? (
        <div className="rounded-xl border border-gray-200 px-5 py-6 text-center text-gray-400 text-sm">
          {emptyLabel}
        </div>
      ) : flat ? (
        <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
          {flatRows.map((acc: any, idx: number) => (
            <div
              key={`${acc.code}-${idx}`}
              className={cn('px-5 py-2.5 flex items-center gap-3 transition-colors', palette.hover)}
            >
              <span className="text-[10px] font-mono text-gray-400 w-12 shrink-0">{acc.code || ''}</span>
              <span className="flex-1 min-w-0 text-sm text-gray-700 truncate" title={acc.name}>{acc.name}</span>
              <span className="text-sm tabular-nums shrink-0 font-medium text-gray-900">{fmt(acc.balance)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(group => (
            <Accordion
              key={group.label}
              title={group.label}
              right={
                <span className={cn('text-sm font-semibold tabular-nums', palette.value)}>
                  {fmt(sumRows(group.rows))}
                </span>
              }
            >
              <div className="divide-y divide-gray-100">
                {group.rows.map((acc: any, idx: number) => (
                  <div
                    key={`${acc.code}-${idx}`}
                    className={cn('px-5 py-2 flex items-center gap-3 transition-colors', palette.hover)}
                  >
                    <span className="text-[10px] font-mono text-gray-400 w-12 shrink-0">{acc.code || ''}</span>
                    <span className="flex-1 min-w-0 text-sm text-gray-700 truncate" title={acc.name}>
                      {acc.name}
                    </span>
                    <span className={cn('text-sm tabular-nums shrink-0 font-medium text-gray-900')}>
                      {fmt(acc.balance)}
                    </span>
                  </div>
                ))}
              </div>
            </Accordion>
          ))}
        </div>
      )}
      <div className={cn('px-5 py-3 rounded-xl flex justify-between font-semibold border-t-2', palette.totalRow, 'bg-gray-50')}>
        <span>Total {title}</span>
        <span className="tabular-nums">{fmt(total)}</span>
      </div>
    </div>
  )
}


/** Numbered notes section that renders Trust Composition, Per-Property,
 *  Equity Reconciliation and Accrued-by-Category breakdowns sent by the
 *  backend under `data.breakdowns`. Designed to mirror published financial
 *  statements' note disclosures. */

export { IncomeStatementReport }
