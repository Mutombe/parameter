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

function IncomeExpenditureReport() {
  const navigate = useNavigate()
  // Landlord + property come from the global Reports filter bar so picks
  // persist across financial reports. Currency and the date window are
  // local because they're only meaningful here.
  const { landlordId: selectedLandlord, propertyId: selectedProperty, setLandlordId } = useReportFilters()
  const [searchParams] = useSearchParams()
  const [currency, setCurrency] = useState<string>('USD')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-01-01`
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  // Whether the "Supplier Payments" line is expanded to show each supplier.
  const [supplierPaymentsOpen, setSupplierPaymentsOpen] = useState(false)

  // Seed the global filter from ?landlord_id=… on first mount (deep-link
  // from LandlordDetail). Won't override if the global filter already has
  // a value.
  useEffect(() => {
    const fromUrl = searchParams.get('landlord_id')
    if (fromUrl && !selectedLandlord) setLandlordId(fromUrl)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['income-expenditure', selectedLandlord, selectedProperty, startDate, endDate, currency],
    queryFn: () => reportsApi.incomeExpenditure({
      landlord_id: Number(selectedLandlord),
      ...(selectedProperty ? { property_id: Number(selectedProperty) } : {}),
      start_date: startDate, end_date: endDate, currency,
    }).then(r => r.data),
    enabled: !!selectedLandlord,
    retry: 1,
    placeholderData: keepPreviousData,
  })

  if (data) { reportDataStore.data = data; reportDataStore.type = 'income-expenditure' }

  const months: any[] = data?.months || []
  const consolidated: any = data?.consolidated || {}
  const managementType: string = data?.management_type || 'rental'
  const incomeCategoryLabels: any[] = data?.income_category_labels || []
  const expenseCategoryLabels: any[] = data?.expense_category_labels || []
  const supplierPaymentsKey: string = data?.supplier_payments_key || 'Supplier Payments'
  const supplierPaymentsBreakdown: any[] = data?.supplier_payments_breakdown || []
  const incomeSummary: any = data?.income_summary || {}
  const workingCapital: any = data?.working_capital || {}
  const tenants: any[] = incomeSummary?.tenants || []

  const adjDebtorsSubtotal = workingCapital.debtors?.subtotal || 0
  const adjCreditorsSubtotal = workingCapital.creditors?.subtotal || 0
  const adjNetWorkingCapital = adjDebtorsSubtotal - adjCreditorsSubtotal

  const balColor = (v: number) => v < 0 ? 'text-red-600 font-semibold' : 'text-emerald-700 font-semibold'
  const fmtNum = (v: number | undefined) => formatCurrency(v ?? 0)

  // Column header label for income summary
  const accountHolderLabel = managementType === 'levy' ? 'Account Holder' : 'Tenant'

  return (
    <div className="space-y-4">
      {/* ── Controls (date + currency only — Landlord/Property come from the global filter bar) ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <DatePicker value={startDate} onChange={v => setStartDate(v)} className="min-w-[160px]" />
            <span className="text-gray-400 text-sm">to</span>
            <DatePicker value={endDate} onChange={v => setEndDate(v)} className="min-w-[160px]" />
          </div>
          {/* Currency toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setCurrency('USD')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                currency === 'USD' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              USD
            </button>
            <button
              onClick={() => setCurrency('ZWG')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                currency === 'ZWG' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              ZWG
            </button>
          </div>
          {selectedLandlord && (
            <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <RefreshCw className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {!selectedLandlord ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          <BarChart3 className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="font-medium">Pick a landlord in the filter bar above to view Income &amp; Expenditure.</p>
        </div>
      ) : isLoading ? (
        <SkeletonIncomeExpenditure />
      ) : isError ? (
        <div className="bg-white rounded-xl border border-red-200 p-8 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-red-400 mb-3" />
          <p className="font-medium text-red-700 mb-1">Failed to load report</p>
          <p className="text-sm text-gray-500 mb-4">{(error as any)?.response?.data?.error || (error as any)?.message || 'An unexpected error occurred'}</p>
          <button onClick={() => refetch()} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      ) : data ? (
        <>
          {/* ── Summary cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Opening Balance</p>
              <p className={cn('text-xl font-bold', balColor(consolidated.balance_bf || 0))}>{fmtNum(consolidated.balance_bf)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Income</p>
              <p className="text-xl font-bold text-emerald-600">{fmtNum(consolidated.levies)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Expenditure</p>
              <p className="text-xl font-bold text-red-600">{fmtNum(consolidated.total_expenditure)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Closing Balance</p>
              <p className={cn('text-xl font-bold', balColor(consolidated.balance_cf || 0))}>{fmtNum(consolidated.balance_cf)}</p>
            </div>
          </div>

          {/* ── Section 1: Monthly Income & Expenditure table ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {(data.properties || []).join(', ') || data.entity?.name}
                </h2>
                <p className="text-sm text-gray-500">Income and Expenditure for the period {data.period?.start} to {data.period?.end}</p>
              </div>
              {data.currency && (
                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full uppercase">{data.currency}</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider sticky left-0 bg-gray-50 min-w-[200px]">Item</th>
                    {months.map(m => (
                      <th key={m.month} className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[120px]">{m.label}</th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-800 uppercase tracking-wider min-w-[130px] bg-gray-100">Consolidated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {/* INCOME HEADER */}
                  <tr className="bg-emerald-50/50">
                    <td colSpan={months.length + 2} className="px-4 py-2 text-xs font-bold text-emerald-800 uppercase tracking-wider">Income</td>
                  </tr>
                  {/* Balance b/forward */}
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-700 sticky left-0 bg-white">Balance b/forward</td>
                    {months.map(m => (
                      <td key={m.month} className={cn('px-4 py-2.5 text-right tabular-nums', balColor(m.balance_bf))}>{fmtNum(m.balance_bf)}</td>
                    ))}
                    <td className={cn('px-4 py-2.5 text-right tabular-nums bg-gray-50 font-bold', balColor(consolidated.balance_bf))}>{fmtNum(consolidated.balance_bf)}</td>
                  </tr>
                  {/* Income category rows */}
                  {incomeCategoryLabels.length > 0 ? (
                    incomeCategoryLabels.map(cat => (
                      <tr key={cat.key} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-700 sticky left-0 bg-white pl-8">{cat.label}</td>
                        {months.map(m => (
                          <td key={m.month} className="px-4 py-2.5 text-right tabular-nums text-gray-900">{fmtNum(m.income_categories?.[cat.key])}</td>
                        ))}
                        <td className="px-4 py-2.5 text-right tabular-nums bg-gray-50 font-bold text-gray-900">{fmtNum(consolidated.income_categories?.[cat.key])}</td>
                      </tr>
                    ))
                  ) : (
                    /* Fallback: single Levies row when income_category_labels not provided */
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-700 sticky left-0 bg-white pl-8">Levies</td>
                      {months.map(m => (
                        <td key={m.month} className="px-4 py-2.5 text-right tabular-nums text-gray-900">{fmtNum(m.levies)}</td>
                      ))}
                      <td className="px-4 py-2.5 text-right tabular-nums bg-gray-50 font-bold text-gray-900">{fmtNum(consolidated.levies)}</td>
                    </tr>
                  )}
                  {/* Amount before Expenditure */}
                  <tr className="bg-emerald-50/30 border-t border-emerald-200">
                    <td className="px-4 py-2.5 font-semibold text-emerald-800 sticky left-0 bg-emerald-50/30">Amount before Expenditure</td>
                    {months.map(m => (
                      <td key={m.month} className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-800">{fmtNum(m.amount_before_expenditure)}</td>
                    ))}
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-emerald-800 bg-emerald-50">{fmtNum(consolidated.total_income)}</td>
                  </tr>

                  {/* EXPENDITURE HEADER */}
                  <tr className="bg-red-50/50">
                    <td colSpan={months.length + 2} className="px-4 py-2 text-xs font-bold text-red-800 uppercase tracking-wider">Expenditure</td>
                  </tr>
                  {/* Expense category rows */}
                  {expenseCategoryLabels.map(cat => {
                    // "Supplier Payments" collapses/expands to reveal each
                    // supplier that was paid; other categories are plain rows.
                    const isSupplierPayments = cat.key === supplierPaymentsKey && supplierPaymentsBreakdown.length > 0
                    return (
                      <Fragment key={cat.key}>
                        <tr className={cn('hover:bg-gray-50', isSupplierPayments && 'cursor-pointer')}
                          onClick={isSupplierPayments ? () => setSupplierPaymentsOpen(o => !o) : undefined}>
                          <td className="px-4 py-2.5 text-gray-700 sticky left-0 bg-white pl-8">
                            {isSupplierPayments ? (
                              <span className="inline-flex items-center gap-1.5">
                                <ChevronRight className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', supplierPaymentsOpen && 'rotate-90')} />
                                {cat.label}
                                <span className="text-[10px] text-gray-400">({supplierPaymentsBreakdown.length})</span>
                              </span>
                            ) : cat.label}
                          </td>
                          {months.map(m => (
                            <td key={m.month} className="px-4 py-2.5 text-right tabular-nums text-gray-900">{fmtNum(m.expenditure_categories?.[cat.key])}</td>
                          ))}
                          <td className="px-4 py-2.5 text-right tabular-nums bg-gray-50 font-bold text-gray-900">{fmtNum(consolidated.expenditure_categories?.[cat.key])}</td>
                        </tr>
                        {isSupplierPayments && supplierPaymentsOpen && supplierPaymentsBreakdown.map((s: any) => (
                          <tr key={`sup-${s.supplier}`} className="hover:bg-gray-50">
                            <td className="px-4 py-1.5 text-gray-500 text-xs sticky left-0 bg-white pl-12">
                              <span className="text-gray-300 mr-2">·</span>{s.supplier}
                            </td>
                            {months.map(m => (
                              <td key={m.month} className="px-4 py-1.5 text-right tabular-nums text-gray-300 text-xs">—</td>
                            ))}
                            <td className="px-4 py-1.5 text-right tabular-nums bg-gray-50/60 text-gray-700 text-xs font-medium">{fmtNum(s.amount)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                  {/* Management Commission — aggregate row */}
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-700 sticky left-0 bg-white pl-8">Management Commission (inc VAT)</td>
                    {months.map(m => (
                      <td key={m.month} className="px-4 py-2.5 text-right tabular-nums text-gray-900">{fmtNum(m.management_commission)}</td>
                    ))}
                    <td className="px-4 py-2.5 text-right tabular-nums bg-gray-50 font-bold text-gray-900">{fmtNum(consolidated.management_commission)}</td>
                  </tr>
                  {/* Per-income-type commission rows — one row per
                      sub-account (Rent, Maintenance, Parking, …) so the
                      landlord sees exactly which income source each
                      commission slice came from. */}
                  {Object.keys(consolidated.management_commission_by_type || {})
                    .sort()
                    .map((ctype) => (
                      <tr key={`comm-${ctype}`} className="hover:bg-gray-50">
                        <td className="px-4 py-1.5 text-gray-500 text-xs sticky left-0 bg-white pl-12">
                          <span className="text-gray-300 mr-2">·</span>
                          Commission — {ctype}
                        </td>
                        {months.map(m => (
                          <td key={m.month} className="px-4 py-1.5 text-right tabular-nums text-gray-600 text-xs">
                            {fmtNum((m.management_commission_by_type || {})[ctype])}
                          </td>
                        ))}
                        <td className="px-4 py-1.5 text-right tabular-nums bg-gray-50/60 text-gray-700 text-xs font-medium">
                          {fmtNum((consolidated.management_commission_by_type || {})[ctype])}
                        </td>
                      </tr>
                    ))}
                  {/* Total Expenditure */}
                  <tr className="bg-red-50/30 border-t border-red-200">
                    <td className="px-4 py-2.5 font-semibold text-red-800 sticky left-0 bg-red-50/30">Total Expenditure</td>
                    {months.map(m => (
                      <td key={m.month} className="px-4 py-2.5 text-right tabular-nums font-semibold text-red-800">{fmtNum(m.total_expenditure)}</td>
                    ))}
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-red-800 bg-red-50">{fmtNum(consolidated.total_expenditure)}</td>
                  </tr>

                  {/* BALANCE C/F */}
                  <tr className="bg-gray-100 border-t-2 border-gray-300">
                    <td className="px-4 py-3 font-bold text-gray-900 sticky left-0 bg-gray-100">Balance c/f</td>
                    {months.map(m => (
                      <td key={m.month} className={cn('px-4 py-3 text-right tabular-nums font-bold', balColor(m.balance_cf))}>{fmtNum(m.balance_cf)}</td>
                    ))}
                    <td className={cn('px-4 py-3 text-right tabular-nums font-bold bg-gray-200', balColor(consolidated.balance_cf))}>{fmtNum(consolidated.balance_cf)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Section 2: Income Summary (per tenant/account holder) ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Income Summary</h2>
              <p className="text-sm text-gray-500">as at {incomeSummary.as_of}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{accountHolderLabel}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Balance B/F</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Charge</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount Due</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount Paid</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Penalty</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Carried Forward</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tenants.map((t: any, i: number) => {
                    const displayName = managementType === 'levy' ? (t.account_holder || t.name) : t.name
                    const linkId = t.account_holder_id || t.tenant_id || t.id
                    const linkPath = managementType === 'levy'
                      ? (linkId ? `/dashboard/tenants/${linkId}` : null)
                      : (linkId ? `/dashboard/tenants/${linkId}` : null)
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-900 font-medium">
                          {linkPath ? (
                            <button
                              onClick={() => navigate(linkPath)}
                              className="text-primary-600 hover:text-primary-700 hover:underline text-left"
                            >
                              {displayName}
                            </button>
                          ) : displayName}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmtNum(t.balance_bf)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmtNum(t.charge)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 font-medium">{fmtNum(t.amount_due)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{fmtNum(t.amount_paid)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">{fmtNum(t.penalty)}</td>
                        <td className={cn('px-4 py-2.5 text-right tabular-nums font-semibold', t.carried_forward > 0 ? 'text-red-600' : t.carried_forward < 0 ? 'text-emerald-600' : 'text-gray-700')}>{fmtNum(t.carried_forward)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                    <td className="px-4 py-3 text-gray-900">Total</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">{fmtNum(incomeSummary.totals?.balance_bf)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">{fmtNum(incomeSummary.totals?.charge)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">{fmtNum(incomeSummary.totals?.amount_due)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{fmtNum(incomeSummary.totals?.amount_paid)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-700">{fmtNum(incomeSummary.totals?.penalty)}</td>
                    <td className={cn('px-4 py-3 text-right tabular-nums', (incomeSummary.totals?.carried_forward || 0) > 0 ? 'text-red-600' : 'text-emerald-600')}>{fmtNum(incomeSummary.totals?.carried_forward)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Section 3: Working Capital ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Working Capital</h2>
              <p className="text-sm text-gray-500">as at {workingCapital.as_of}</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ── Debtors and Cash Balances ── */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Debtors and Cash Balances</h3>
                  <div className="space-y-2">
                    {/* Auto-calculated items */}
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-600">Cash balances</span>
                      <span className={cn('tabular-nums font-medium', balColor(workingCapital.debtors?.cash_balances || 0))}>{fmtNum(workingCapital.debtors?.cash_balances)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-600">Levies in arrears</span>
                      <span className="tabular-nums font-medium text-red-600">{fmtNum(workingCapital.debtors?.levies_in_arrears ?? workingCapital.debtors?.arrears)}</span>
                    </div>
                    {/* Subtotal */}
                    <div className="flex justify-between py-2 bg-blue-50 rounded px-2 -mx-2">
                      <span className="font-semibold text-gray-900">Total Assets</span>
                      <span className="tabular-nums font-bold text-blue-700">{fmtNum(adjDebtorsSubtotal)}</span>
                    </div>
                  </div>
                </div>

                {/* ── Creditors ── */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Creditors</h3>
                  <div className="space-y-2">
                    {/* Auto-calculated items */}
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-600">Overdraft</span>
                      <span className="tabular-nums font-medium text-red-600">{fmtNum(workingCapital.creditors?.overdraft)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-600">Prepayments in levies</span>
                      <span className="tabular-nums font-medium text-gray-700">{fmtNum(workingCapital.creditors?.prepayments)}</span>
                    </div>
                    {/* Subtotal */}
                    <div className="flex justify-between py-2 bg-orange-50 rounded px-2 -mx-2">
                      <span className="font-semibold text-gray-900">Total Liabilities</span>
                      <span className="tabular-nums font-bold text-orange-700">{fmtNum(adjCreditorsSubtotal)}</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Net Working Capital */}
              <div className="mt-6 pt-4 border-t-2 border-gray-300">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-gray-900">Net Working Capital</span>
                  <span className={cn('text-2xl tabular-nums font-bold', adjNetWorkingCapital >= 0 ? 'text-emerald-700' : 'text-red-600')}>{fmtNum(adjNetWorkingCapital)}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

function SkeletonIncomeExpenditure() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-7 w-32" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100"><Skeleton className="h-5 w-64 mb-1" /><Skeleton className="h-4 w-48" /></div>
        <div className="p-4 space-y-3">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-4 w-40" />
              {[...Array(4)].map((_, j) => <Skeleton key={j} className="h-4 w-24 ml-auto" />)}
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100"><Skeleton className="h-5 w-48" /></div>
        <div className="p-4 space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-4 w-48" />
              {[...Array(6)].map((_, j) => <Skeleton key={j} className="h-4 w-20 ml-auto" />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export { IncomeExpenditureReport }
