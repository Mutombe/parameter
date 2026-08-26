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
} from '@/lib/icons'
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
import { reportsApi, tenantApi, landlordApi, propertyApi, bankAccountApi } from '../../../services/api'
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

function BankToIncomeReport() {
  // Currency + Income Category come from the shared report filter bar; the
  // remaining filters (Date, Property, Landlord, Bank Account) are local to
  // this report — same split rent-rollover uses.
  const { currency, category } = useReportFilters()
  const navigate = useNavigate()

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [propertyId, setPropertyId] = useState('')
  const [landlordId, setLandlordId] = useState('')
  const [bankAccountId, setBankAccountId] = useState('')

  const [drillState, setDrillState] = useState<{
    level: 1 | 2 | 3
    bankAccountId?: number
    bankAccountName?: string
    incomeType?: string
    incomeTypeDisplay?: string
  }>({ level: 1 })

  // Filter option data
  const { data: propertiesData } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () => propertyApi.list().then(r => r.data.results || r.data),
    placeholderData: keepPreviousData,
  })
  const { data: landlordsData } = useQuery({
    queryKey: ['landlords-list'],
    queryFn: () => landlordApi.list().then(r => r.data.results || r.data),
    placeholderData: keepPreviousData,
  })
  const { data: banksData } = useQuery({
    queryKey: ['bank-accounts-list'],
    queryFn: () => bankAccountApi.list().then(r => r.data.results || r.data),
    placeholderData: keepPreviousData,
  })
  const properties: any[] = Array.isArray(propertiesData) ? propertiesData : []
  const landlords: any[] = Array.isArray(landlordsData) ? landlordsData : []
  const bankAccounts: any[] = Array.isArray(banksData) ? banksData : []

  // Shared params for every query. Currency is a HARD filter; income_type is
  // driven by the shared Category switcher.
  const baseParams: any = {
    ...(currency ? { currency } : {}),
    ...(startDate ? { start_date: startDate } : {}),
    ...(endDate ? { end_date: endDate } : {}),
    ...(propertyId ? { property_id: Number(propertyId) } : {}),
    ...(landlordId ? { landlord_id: Number(landlordId) } : {}),
  }
  const l1Params: any = {
    ...baseParams,
    ...(category ? { income_type: category } : {}),
    ...(bankAccountId ? { bank_account_id: Number(bankAccountId) } : {}),
  }

  // Level 1 data
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['bank-to-income', currency, category, startDate, endDate, propertyId, landlordId, bankAccountId],
    queryFn: () => reportsApi.incomeItemAnalysis(l1Params).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  // Level 2 data (a specific bank's categories) — carries the same scope.
  const { data: l2Data, isLoading: l2Loading } = useQuery({
    queryKey: ['bank-to-income-l2', drillState.bankAccountId, currency, startDate, endDate, propertyId, landlordId],
    queryFn: () => reportsApi.incomeItemDrilldown({ level: 2, bank_account_id: drillState.bankAccountId!, ...baseParams } as any).then(r => r.data),
    enabled: drillState.level >= 2 && !!drillState.bankAccountId,
    placeholderData: keepPreviousData,
  })

  // Level 3 data (a bank + category's receipts)
  const { data: l3Data, isLoading: l3Loading } = useQuery({
    queryKey: ['bank-to-income-l3', drillState.bankAccountId, drillState.incomeType, currency, startDate, endDate, propertyId, landlordId],
    queryFn: () => reportsApi.incomeItemDrilldown({ level: 3, bank_account_id: drillState.bankAccountId!, income_type: drillState.incomeType, ...baseParams } as any).then(r => r.data),
    enabled: drillState.level === 3 && !!drillState.bankAccountId && !!drillState.incomeType,
    placeholderData: keepPreviousData,
  })

  if (data) reportDataStore.data = data

  const [l3Search, setL3Search] = useState('')
  const [l3Page, setL3Page] = useState(1)
  const l3PageSize = 25

  const allL3Receipts = l3Data?.receipts || []
  const filteredL3Receipts = useMemo(() => {
    if (!l3Search) return allL3Receipts
    const q = l3Search.toLowerCase()
    return allL3Receipts.filter((rcpt: any) =>
      rcpt.tenant?.toLowerCase().includes(q) ||
      rcpt.property?.toLowerCase().includes(q) ||
      rcpt.landlord?.toLowerCase().includes(q) ||
      rcpt.receipt_number?.toLowerCase().includes(q)
    )
  }, [allL3Receipts, l3Search])

  const l3TotalPages = Math.ceil(filteredL3Receipts.length / l3PageSize)
  const paginatedL3Receipts = useMemo(() => {
    const start = (l3Page - 1) * l3PageSize
    return filteredL3Receipts.slice(start, start + l3PageSize)
  }, [filteredL3Receipts, l3Page])

  useEffect(() => { setL3Page(1) }, [l3Search])
  useEffect(() => { setL3Search(''); setL3Page(1) }, [drillState.incomeType, drillState.bankAccountId])

  const matrix = data?.matrix || []
  const bankColumns = data?.bank_columns || []
  const totals = data?.totals || {}
  const banks = data?.banks || []
  const summary = data?.summary || {}
  const reportCurrency: string = data?.currency || ''

  // fmt honours a bank column's own currency where known; the report never
  // converts — under "All" each bank keeps its own currency and cross-bank
  // totals simply span currencies (shown with a caption).
  const fmt = (v: number, cur?: string) => formatCurrency(v || 0, cur || reportCurrency || undefined)
  const pct = (v: number) => `${(v || 0).toFixed(2)}%`

  const maxValue = useMemo(() => {
    let max = 0
    matrix.forEach((row: any) => {
      bankColumns.forEach((col: any) => {
        const val = row[col.key] || 0
        if (val > max) max = val
      })
    })
    return max || 1
  }, [matrix, bankColumns])

  const heatColor = (value: number) => {
    if (value <= 0) return ''
    const intensity = Math.min(value / maxValue, 1)
    if (intensity > 0.7) return 'bg-emerald-100 text-emerald-800'
    if (intensity > 0.4) return 'bg-emerald-50 text-emerald-700'
    return 'text-gray-700'
  }

  const handleBankClick = (bankId: number, bankName: string) => {
    setDrillState({ level: 2, bankAccountId: bankId, bankAccountName: bankName })
  }
  const handleCellClick = (bankId: number, bankName: string, incomeType: string, incomeTypeDisplay: string) => {
    setDrillState({ level: 3, bankAccountId: bankId, bankAccountName: bankName, incomeType, incomeTypeDisplay })
  }
  const handleCategoryClick = (incomeType: string, incomeTypeDisplay: string) => {
    setDrillState(prev => ({ ...prev, level: 3, incomeType, incomeTypeDisplay }))
  }

  const Breadcrumb = () => {
    if (drillState.level === 1) return null
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 px-6 pt-4">
        <button onClick={() => setDrillState({ level: 1 })} className="hover:text-gray-900 hover:underline transition-colors">
          Bank → Income → Commission
        </button>
        {drillState.level >= 2 && (
          <>
            <span>/</span>
            <button
              onClick={() => setDrillState({ level: 2, bankAccountId: drillState.bankAccountId, bankAccountName: drillState.bankAccountName })}
              className={cn(drillState.level === 2 ? 'text-gray-900 font-medium' : 'hover:text-gray-900 hover:underline transition-colors')}
            >
              {drillState.bankAccountName}
            </button>
          </>
        )}
        {drillState.level === 3 && (
          <>
            <span>/</span>
            <span className="text-gray-900 font-medium">{drillState.incomeTypeDisplay}</span>
          </>
        )}
      </div>
    )
  }

  // ── Filters bar (local: Date / Property / Landlord / Bank) ────────────────
  const FiltersBar = () => (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 pb-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-600">Filters:</span>
        </div>
        <DatePicker label="Date From" value={startDate} onChange={setStartDate} className="min-w-[150px]" />
        <DatePicker label="Date To" value={endDate} onChange={setEndDate} className="min-w-[150px]" />
        <AsyncSelect label="Property" placeholder="All Properties" value={propertyId} onChange={(v) => setPropertyId(String(v))} options={properties.map((p: any) => ({ value: p.id, label: p.name }))} searchable clearable className="min-w-[170px]" />
        <AsyncSelect label="Landlord" placeholder="All Landlords" value={landlordId} onChange={(v) => setLandlordId(String(v))} options={landlords.map((l: any) => ({ value: l.id, label: l.name }))} searchable clearable className="min-w-[170px]" />
        <AsyncSelect label="Bank Account" placeholder="All Banks" value={bankAccountId} onChange={(v) => setBankAccountId(String(v))} options={bankAccounts.map((b: any) => ({ value: b.id, label: b.name }))} searchable clearable className="min-w-[170px]" />
        <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors mb-1"><RefreshCw className="w-5 h-5" /></button>
      </div>
    </div>
  )

  // ── Executive summary ─────────────────────────────────────────────────────
  const SummaryCards = () => {
    const cards = [
      { label: 'Total Gross Income', value: fmt(summary.gross_income || 0), tone: 'text-gray-900' },
      { label: 'Total Commission', value: fmt(summary.commission || 0), tone: 'text-amber-600' },
      { label: 'Net Proceeds', value: fmt(summary.net_proceeds || 0), tone: 'text-emerald-600' },
      { label: 'Effective Commission Rate', value: pct(summary.effective_commission_rate || 0), tone: 'text-blue-600' },
    ]
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{c.label}</p>
            <p className={cn('mt-1 text-2xl font-bold tabular-nums', c.tone)}>{c.value}</p>
          </div>
        ))}
        {!reportCurrency && (
          <p className="col-span-2 lg:col-span-4 text-xs text-gray-400">
            Showing all currencies — each bank keeps its own currency; cross-bank totals span currencies. Select USD or ZWG for a single-currency total.
          </p>
        )}
      </div>
    )
  }

  // ── Bank Distribution ─────────────────────────────────────────────────────
  const BankDistribution = () => (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Bank Distribution</h3></div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Bank Account</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Gross Income</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Commission</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Net Proceeds</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Commission %</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Income Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {banks.map((b: any) => (
              <tr key={b.key} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3 text-sm font-medium">
                  {b.id ? (
                    <button onClick={() => handleBankClick(b.id, b.bank)} className="text-blue-600 hover:text-blue-800 hover:underline">{b.bank}</button>
                  ) : <span className="text-gray-900">{b.bank}</span>}
                  {b.currency ? <span className="ml-1.5 text-[11px] text-gray-400">{b.currency}</span> : null}
                </td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-900">{fmt(b.income, b.currency)}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-amber-600">{b.commission ? fmt(b.commission, b.currency) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums font-semibold text-emerald-700">{fmt(b.net, b.currency)}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-600">{pct(b.commission_pct)}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-600">{pct(b.income_share)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr className="font-bold">
              <td className="px-6 py-3 text-sm text-gray-700">Total</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-900">{fmt(summary.gross_income || 0)}</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-amber-700">{fmt(summary.commission || 0)}</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-emerald-700">{fmt(summary.net_proceeds || 0)}</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-700">{pct(summary.effective_commission_rate || 0)}</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-700">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )

  // ── Main Bank → Income → Commission matrix ────────────────────────────────
  const MainMatrix = () => {
    if (isLoading) return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
      </div>
    )
    if (matrix.length === 0) return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
        <Landmark className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="font-medium">No data available</p>
        <p className="text-sm mt-1">Record receipts to see the bank → income → commission analysis</p>
      </div>
    )
    const cell = 'px-3 py-3 text-sm text-right tabular-nums'
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Income → Bank → Commission</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th rowSpan={2} className="px-6 py-2 text-left text-xs font-semibold text-gray-500 uppercase align-bottom">Income Type</th>
                {bankColumns.map((col: any) => (
                  <th key={col.key} colSpan={3} className="px-3 py-2 text-center text-xs font-semibold text-blue-600 uppercase border-l border-gray-200 cursor-pointer hover:text-blue-800" onClick={() => col.id && handleBankClick(col.id, col.label)}>
                    {col.label}{col.currency ? <span className="ml-1 text-[10px] text-gray-400">{col.currency}</span> : null}
                  </th>
                ))}
                <th colSpan={3} className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase border-l border-gray-300">Total</th>
              </tr>
              <tr className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase text-gray-400">
                {[...bankColumns, { key: '__total', label: 'Total' }].map((col: any, ci: number) => (
                  <Fragment key={col.key}>
                    <th className={cn('px-3 py-1 text-right font-medium', ci === 0 ? 'border-l border-gray-300' : 'border-l border-gray-200')}>Income</th>
                    <th className="px-3 py-1 text-right font-medium">Comm.</th>
                    <th className="px-3 py-1 text-right font-medium">Net</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {matrix.map((row: any, idx: number) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{row.income_type_display || row.income_type}</td>
                  {bankColumns.map((col: any) => {
                    const inc = row[col.key] || 0
                    const comm = row[col.key + '_commission'] || 0
                    const net = row[col.key + '_net'] || 0
                    return (
                      <Fragment key={col.key}>
                        <td className={cn(cell, 'border-l border-gray-200', heatColor(inc), inc > 0 && col.id ? 'cursor-pointer hover:underline' : '')} onClick={() => inc > 0 && col.id && handleCellClick(col.id, col.label, row.income_type, row.income_type_display || row.income_type)}>
                          {inc > 0 ? fmt(inc, col.currency) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className={cn(cell, 'text-amber-600')}>{comm ? fmt(comm, col.currency) : <span className="text-gray-300">—</span>}</td>
                        <td className={cn(cell, 'text-emerald-700 font-medium')}>{inc > 0 ? fmt(net, col.currency) : <span className="text-gray-300">—</span>}</td>
                      </Fragment>
                    )
                  })}
                  <td className={cn(cell, 'border-l border-gray-300 font-bold text-gray-900')}>{fmt(row.total || 0)}</td>
                  <td className={cn(cell, 'font-bold text-amber-700')}>{row.total_commission ? fmt(row.total_commission) : <span className="text-gray-300">—</span>}</td>
                  <td className={cn(cell, 'font-bold text-emerald-700')}>{fmt(row.total_net || 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr className="font-bold">
                <td className="px-6 py-3 text-sm text-gray-700">Total</td>
                {bankColumns.map((col: any) => (
                  <Fragment key={col.key}>
                    <td className={cn(cell, 'border-l border-gray-200 text-gray-900')}>{fmt(totals[col.key] || 0, col.currency)}</td>
                    <td className={cn(cell, 'text-amber-700')}>{fmt(totals[col.key + '_commission'] || 0, col.currency)}</td>
                    <td className={cn(cell, 'text-emerald-700')}>{fmt(totals[col.key + '_net'] || 0, col.currency)}</td>
                  </Fragment>
                ))}
                <td className={cn(cell, 'border-l border-gray-300 text-gray-900')}>{fmt(totals.grand_total || 0)}</td>
                <td className={cn(cell, 'text-amber-700')}>{fmt(totals.grand_commission || 0)}</td>
                <td className={cn(cell, 'text-emerald-700')}>{fmt(totals.grand_net || 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    )
  }

  // ── Commission Analysis by Bank ───────────────────────────────────────────
  const CommissionAnalysis = () => (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Commission Analysis by Bank</h3></div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Bank</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Gross Income</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Commission</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Effective Rate</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Share of Total Commission</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {banks.map((b: any) => (
              <tr key={b.key} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{b.bank}{b.currency ? <span className="ml-1.5 text-[11px] text-gray-400">{b.currency}</span> : null}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-900">{fmt(b.income, b.currency)}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-amber-600">{b.commission ? fmt(b.commission, b.currency) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-600">{pct(b.commission_pct)}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-600">{pct(b.commission_share)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr className="font-bold">
              <td className="px-6 py-3 text-sm text-gray-700">Total</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-900">{fmt(summary.gross_income || 0)}</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-amber-700">{fmt(summary.commission || 0)}</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-700">{pct(summary.effective_commission_rate || 0)}</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-700">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )

  // ── Income Distribution across banks ──────────────────────────────────────
  const IncomeDistribution = () => (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Income Distribution Across Banks</h3></div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Income Category</th>
              {bankColumns.map((col: any) => (
                <th key={col.key} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{col.label}</th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">% of Total Income</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {matrix.map((row: any, idx: number) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{row.income_type_display || row.income_type}</td>
                {bankColumns.map((col: any) => {
                  const inc = row[col.key] || 0
                  return <td key={col.key} className="px-4 py-3 text-sm text-right tabular-nums text-gray-700">{inc > 0 ? fmt(inc, col.currency) : <span className="text-gray-300">—</span>}</td>
                })}
                <td className="px-4 py-3 text-sm text-right tabular-nums font-semibold text-gray-900">{fmt(row.total || 0)}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-600">{pct(row.income_share)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr className="font-bold">
              <td className="px-6 py-3 text-sm text-gray-700">Total</td>
              {bankColumns.map((col: any) => (
                <td key={col.key} className="px-4 py-3 text-sm text-right tabular-nums text-gray-900">{fmt(totals[col.key] || 0, col.currency)}</td>
              ))}
              <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-900">{fmt(totals.grand_total || 0)}</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-700">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )

  // ── Level 2: Bank → categories (income + commission + net) ─────────────────
  const renderLevel2 = () => {
    if (l2Loading) return (
      <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
    )
    const categories = l2Data?.categories || []
    if (categories.length === 0) return (
      <div className="p-12 text-center text-gray-500">
        <Landmark className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="font-medium">No transactions found</p>
        <p className="text-sm mt-1">No receipts for this bank account in the selected period</p>
      </div>
    )
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Income Category</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Transactions</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Gross Income</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Commission</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categories.map((cat: any, idx: number) => (
              <motion.tr key={cat.income_type} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => handleCategoryClick(cat.income_type, cat.income_type_display)}>
                <td className="px-6 py-3 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline">{cat.income_type_display}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-600">{cat.transaction_count}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums text-gray-900">{fmt(cat.total_amount)}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-amber-600">{cat.commission ? fmt(cat.commission) : <span className="text-gray-300">—</span>}</td>
                <td className="px-6 py-3 text-sm text-right tabular-nums font-medium text-emerald-700">{fmt(cat.net)}</td>
              </motion.tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr className="font-bold">
              <td className="px-6 py-3 text-sm text-gray-700">Total</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-700">{l2Data?.total_transactions || 0}</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-900">{fmt(l2Data?.grand_total || 0)}</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-amber-700">{fmt(l2Data?.grand_commission || 0)}</td>
              <td className="px-6 py-3 text-sm text-right tabular-nums text-emerald-700">{fmt(l2Data?.grand_net || 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  // ── Level 3: transaction detail (with commission + net) ───────────────────
  const renderLevel3 = () => {
    if (l3Loading) return (
      <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
    )
    if (allL3Receipts.length === 0) return (
      <div className="p-12 text-center text-gray-500">
        <Receipt className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="font-medium">No receipts found</p>
        <p className="text-sm mt-1">No individual receipts match this filter</p>
      </div>
    )
    return (
      <>
      <TableFilter searchPlaceholder="Search by tenant, property, landlord, or receipt#..." searchValue={l3Search} onSearchChange={setL3Search} resultCount={filteredL3Receipts.length} />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Receipt #</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Property</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Landlord</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tenant</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cur.</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Gross</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Commission</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedL3Receipts.map((rcpt: any, idx: number) => (
              <motion.tr key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{formatDate(rcpt.date)}</td>
                <td className="px-4 py-3 text-sm font-mono">
                  {rcpt.receipt_id ? <button onClick={() => navigate(`/dashboard/receipts/${rcpt.receipt_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{rcpt.receipt_number}</button> : <span className="text-gray-600">{rcpt.receipt_number}</span>}
                </td>
                <td className="px-4 py-3 text-sm">
                  {rcpt.property_id ? <button onClick={() => navigate(`/dashboard/properties/${rcpt.property_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{rcpt.property}</button> : <span className="text-gray-700">{rcpt.property || '-'}</span>}
                </td>
                <td className="px-4 py-3 text-sm">
                  {rcpt.landlord_id ? <button onClick={() => navigate(`/dashboard/landlords/${rcpt.landlord_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{rcpt.landlord}</button> : <span className="text-gray-700">{rcpt.landlord || '-'}</span>}
                </td>
                <td className="px-4 py-3 text-sm">
                  {rcpt.tenant_id ? <button onClick={() => navigate(`/dashboard/tenants/${rcpt.tenant_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{rcpt.tenant}</button> : <span className="text-gray-700">{rcpt.tenant || '-'}</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{rcpt.income_type_display || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{rcpt.currency}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums text-gray-900">{fmt(rcpt.amount, rcpt.currency)}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-amber-600">{rcpt.commission ? fmt(rcpt.commission, rcpt.currency) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums font-medium text-emerald-700">{fmt(rcpt.net, rcpt.currency)}</td>
              </motion.tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr className="font-bold">
              <td colSpan={7} className="px-4 py-3 text-sm text-gray-700">Total ({l3Data?.transaction_count || 0} transactions)</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-900">{fmt(l3Data?.total || 0)}</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-amber-700">{fmt(l3Data?.total_commission || 0)}</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-emerald-700">{fmt(l3Data?.total_net || 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Pagination currentPage={l3Page} totalPages={l3TotalPages} totalItems={filteredL3Receipts.length} pageSize={l3PageSize} onPageChange={setL3Page} showPageSize={false} />
      </>
    )
  }

  return (
    <div className="space-y-4">
      <FiltersBar />

      {drillState.level === 1 ? (
        isLoading && matrix.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : (
          <>
            <SummaryCards />
            <BankDistribution />
            <MainMatrix />
            <CommissionAnalysis />
            <IncomeDistribution />
          </>
        )
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-pink-50 dark:bg-pink-900/30 flex items-center justify-center"><Landmark className="w-5 h-5 text-pink-600" /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Bank-to-Income-to-Commission Analysis</h2>
              <p className="text-sm text-gray-500">Drill-down to the underlying transactions</p>
            </div>
          </div>
          <Breadcrumb />
          {drillState.level === 2 && renderLevel2()}
          {drillState.level === 3 && renderLevel3()}
        </div>
      )}
    </div>
  )
}

// ─── Receipts Listing Report ─────────────────────────────────────────────────

function ReceiptsListingReport() {
  const { currency, category } = useReportFilters()
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['receipts-listing', currency, category],
    queryFn: () => reportsApi.receiptListing({
      ...(currency ? { currency } : {}),
      ...(category ? { category } : {}),
    } as any).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  if (data) reportDataStore.data = data

  const receipts = data?.receipts || []

  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 25

  const filteredReceipts = useMemo(() => {
    if (!searchQuery) return receipts
    const q = searchQuery.toLowerCase()
    return receipts.filter((r: any) =>
      r.receipt_number?.toLowerCase().includes(q) ||
      (r.tenant_name || r.tenant || '').toLowerCase().includes(q) ||
      (r.property_name || r.property || '').toLowerCase().includes(q) ||
      (r.bank_account || r.bank || '').toLowerCase().includes(q) ||
      r.income_type?.toLowerCase().includes(q)
    )
  }, [receipts, searchQuery])

  const totalPages = Math.ceil(filteredReceipts.length / pageSize)
  const paginatedReceipts = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredReceipts.slice(start, start + pageSize)
  }, [filteredReceipts, currentPage])

  useEffect(() => { setCurrentPage(1) }, [searchQuery])

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-lime-50 dark:bg-lime-900/30 flex items-center justify-center"><Receipt className="w-5 h-5 text-lime-600" /></div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Receipts Listing</h2>
            {isLoading ? <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mt-1" /> : <p className="text-sm text-gray-500">{receipts.length} receipts</p>}
          </div>
        </div>
        <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><RefreshCw className="w-5 h-5" /></button>
      </div>

      {isLoading ? (
        <div className="p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : receipts.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <Receipt className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="font-medium">No receipts found</p>
        </div>
      ) : (
        <>
        <TableFilter searchPlaceholder="Search by receipt#, tenant, property, bank, income type..." searchValue={searchQuery} onSearchChange={setSearchQuery} resultCount={filteredReceipts.length} />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Receipt #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tenant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Property</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Unit</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Income Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Bank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Method</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reference</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedReceipts.map((r: any, idx: number) => (
                <motion.tr key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.01 }} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-600">{r.date}</td>
                  <td className="px-4 py-3 text-sm font-mono">
                    {r.receipt_id ? (
                      <button onClick={() => navigate(`/dashboard/receipts/${r.receipt_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{r.receipt_number}</button>
                    ) : (
                      <span className="text-primary-600">{r.receipt_number}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.tenant_id ? (
                      <button onClick={() => navigate(`/dashboard/tenants/${r.tenant_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{r.tenant_name || r.tenant}</button>
                    ) : (
                      <span className="text-gray-900">{r.tenant_name || r.tenant}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.property_id ? (
                      <button onClick={() => navigate(`/dashboard/properties/${r.property_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{r.property_name || r.property}</button>
                    ) : (
                      <span className="text-gray-700">{r.property_name || r.property}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.unit_id ? (
                      <button onClick={() => navigate(`/dashboard/units/${r.unit_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{r.unit_name || r.unit}</button>
                    ) : (
                      <span className="text-gray-600">{r.unit_name || r.unit}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.income_type}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.bank_account || r.bank}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.payment_method}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.reference}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums text-gray-900">{formatCurrency(r.amount)}</td>
                </motion.tr>
              ))}
            </tbody>
            {data?.summary && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr className="font-bold">
                  <td colSpan={9} className="px-4 py-3 text-sm text-gray-700">Total</td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-900">{formatCurrency(data.summary.total_amount || 0)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredReceipts.length} pageSize={pageSize} onPageChange={setCurrentPage} showPageSize={false} />
        </>
      )}
    </div>
  )
}

// ─── Deposits Listing Report ─────────────────────────────────────────────────

function DepositsListingReport() {
  const { currency } = useReportFilters()
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['deposits-listing', currency],
    queryFn: () => reportsApi.depositSummary({ ...(currency ? { currency } : {}) } as any).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  if (data) reportDataStore.data = data

  const deposits = data?.deposits || []
  const summary = data?.summary || {}

  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 25

  const filteredDeposits = useMemo(() => {
    if (!searchQuery) return deposits
    const q = searchQuery.toLowerCase()
    return deposits.filter((d: any) =>
      (d.tenant_name || d.tenant || '').toLowerCase().includes(q) ||
      (d.property_name || d.property || '').toLowerCase().includes(q) ||
      (d.unit_name || d.unit || '').toLowerCase().includes(q) ||
      d.lease_number?.toLowerCase().includes(q)
    )
  }, [deposits, searchQuery])

  const totalPages = Math.ceil(filteredDeposits.length / pageSize)
  const paginatedDeposits = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredDeposits.slice(start, start + pageSize)
  }, [filteredDeposits, currentPage])

  useEffect(() => { setCurrentPage(1) }, [searchQuery])

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Required</p>
          {isLoading ? <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" /> : <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.total_required || 0)}</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Paid</p>
          {isLoading ? <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" /> : <p className="text-xl font-bold text-emerald-600">{formatCurrency(summary.total_paid || 0)}</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Outstanding</p>
          {isLoading ? <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" /> : <p className="text-xl font-bold text-rose-600">{formatCurrency(summary.total_outstanding || 0)}</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Held</p>
          {isLoading ? <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" /> : <p className="text-xl font-bold text-amber-600">{formatCurrency(summary.total_held || 0)}</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-fuchsia-50 dark:bg-fuchsia-900/30 flex items-center justify-center"><CreditCard className="w-5 h-5 text-fuchsia-600" /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Deposits Listing</h2>
              {!isLoading && <p className="text-sm text-gray-500">{deposits.length} deposits</p>}
            </div>
          </div>
          <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><RefreshCw className="w-5 h-5" /></button>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : deposits.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <CreditCard className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="font-medium">No deposit records found</p>
          </div>
        ) : (
          <>
          <TableFilter searchPlaceholder="Search by tenant, property, unit, or lease#..." searchValue={searchQuery} onSearchChange={setSearchQuery} resultCount={filteredDeposits.length} />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Lease #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tenant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Property</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Unit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Required</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Paid</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Outstanding</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedDeposits.map((d: any, idx: number) => (
                  <motion.tr key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono">
                      {d.lease_id ? (
                        <button onClick={() => navigate(`/dashboard/leases/${d.lease_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{d.lease_number}</button>
                      ) : (
                        <span className="text-primary-600">{d.lease_number}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {d.tenant_id ? (
                        <button onClick={() => navigate(`/dashboard/tenants/${d.tenant_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{d.tenant_name || d.tenant}</button>
                      ) : (
                        <span className="text-gray-900">{d.tenant_name || d.tenant}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {d.property_id ? (
                        <button onClick={() => navigate(`/dashboard/properties/${d.property_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{d.property_name || d.property}</button>
                      ) : (
                        <span className="text-gray-700">{d.property_name || d.property}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {d.unit_id ? (
                        <button onClick={() => navigate(`/dashboard/units/${d.unit_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{d.unit_name || d.unit}</button>
                      ) : (
                        <span className="text-gray-600">{d.unit_name || d.unit}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums text-gray-900">{formatCurrency(d.required || d.deposit_required || 0)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums text-emerald-600">{formatCurrency(d.paid || d.deposit_paid || 0)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums text-rose-600">{formatCurrency(d.outstanding || d.deposit_outstanding || 0)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium',
                        d.status === 'paid' || d.status === 'fully_paid' ? 'bg-emerald-50 text-emerald-700' :
                        d.status === 'partial' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'
                      )}>{d.status || 'pending'}</span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredDeposits.length} pageSize={pageSize} onPageChange={setCurrentPage} showPageSize={false} />
          </>
        )}
      </div>
    </div>
  )
}

// ─── Lease Charge Summary Report ─────────────────────────────────────────────

export { BankToIncomeReport, ReceiptsListingReport, DepositsListingReport }
