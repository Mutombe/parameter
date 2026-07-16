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

function BankToIncomeReport() {
  const navigate = useNavigate()
  const [drillState, setDrillState] = useState<{
    level: 1 | 2 | 3
    bankAccountId?: number
    bankAccountName?: string
    incomeType?: string
    incomeTypeDisplay?: string
  }>({ level: 1 })

  // Level 1 data
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['bank-to-income'],
    queryFn: () => reportsApi.incomeItemAnalysis().then(r => r.data),
    placeholderData: keepPreviousData,
  })

  // Level 2 data
  const { data: l2Data, isLoading: l2Loading } = useQuery({
    queryKey: ['bank-to-income-l2', drillState.bankAccountId],
    queryFn: () => reportsApi.incomeItemDrilldown({ level: 2, bank_account_id: drillState.bankAccountId! }).then(r => r.data),
    enabled: drillState.level >= 2 && !!drillState.bankAccountId,
    placeholderData: keepPreviousData,
  })

  // Level 3 data
  const { data: l3Data, isLoading: l3Loading } = useQuery({
    queryKey: ['bank-to-income-l3', drillState.bankAccountId, drillState.incomeType],
    queryFn: () => reportsApi.incomeItemDrilldown({ level: 3, bank_account_id: drillState.bankAccountId!, income_type: drillState.incomeType }).then(r => r.data),
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
      rcpt.receipt_number?.toLowerCase().includes(q)
    )
  }, [allL3Receipts, l3Search])

  const l3TotalPages = Math.ceil(filteredL3Receipts.length / l3PageSize)
  const paginatedL3Receipts = useMemo(() => {
    const start = (l3Page - 1) * l3PageSize
    return filteredL3Receipts.slice(start, start + l3PageSize)
  }, [filteredL3Receipts, l3Page])

  useEffect(() => { setL3Page(1) }, [l3Search])

  // Reset L3 search/page when drill state changes
  useEffect(() => { setL3Search(''); setL3Page(1) }, [drillState.incomeType, drillState.bankAccountId])

  const matrix = data?.matrix || []
  const bankColumns = data?.bank_columns || []
  const totals = data?.totals || {}

  // Find max value for heatmap coloring
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

  // Breadcrumb
  const Breadcrumb = () => {
    if (drillState.level === 1) return null
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 px-6 pt-4">
        <button onClick={() => setDrillState({ level: 1 })} className="hover:text-gray-900 hover:underline transition-colors">
          Income Source Summary
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

  // Level 2: Bank drilldown
  const renderLevel2 = () => {
    if (l2Loading) return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
      </div>
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
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Gross Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categories.map((cat: any, idx: number) => (
              <motion.tr
                key={cat.income_type}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.03 }}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => handleCategoryClick(cat.income_type, cat.income_type_display)}
              >
                <td className="px-6 py-3 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline">{cat.income_type_display}</td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-600">{cat.transaction_count}</td>
                <td className="px-6 py-3 text-sm text-right font-semibold tabular-nums text-gray-900">{formatCurrency(cat.total_amount)}</td>
              </motion.tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr className="font-bold">
              <td className="px-6 py-3 text-sm text-gray-700">Total</td>
              <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-700">{l2Data?.total_transactions || 0}</td>
              <td className="px-6 py-3 text-sm text-right tabular-nums text-gray-900">{formatCurrency(l2Data?.grand_total || 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  // Level 3: Receipt detail
  const renderLevel3 = () => {
    if (l3Loading) return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
      </div>
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
      <TableFilter searchPlaceholder="Search by tenant, property, or receipt#..." searchValue={l3Search} onSearchChange={setL3Search} resultCount={filteredL3Receipts.length} />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Receipt #</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Property</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Unit</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tenant</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedL3Receipts.map((rcpt: any, idx: number) => (
              <motion.tr
                key={idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.02 }}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-3 text-sm text-gray-700">{formatDate(rcpt.date)}</td>
                <td className="px-4 py-3 text-sm font-mono">
                  {rcpt.receipt_id ? (
                    <button onClick={() => navigate(`/dashboard/receipts/${rcpt.receipt_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{rcpt.receipt_number}</button>
                  ) : (
                    <span className="text-gray-600">{rcpt.receipt_number}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  {rcpt.property_id ? (
                    <button onClick={() => navigate(`/dashboard/properties/${rcpt.property_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{rcpt.property}</button>
                  ) : (
                    <span className="text-gray-700">{rcpt.property || '-'}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  {rcpt.unit_id ? (
                    <button onClick={() => navigate(`/dashboard/units/${rcpt.unit_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{rcpt.unit}</button>
                  ) : (
                    <span className="text-gray-600">{rcpt.unit || '-'}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  {rcpt.tenant_id ? (
                    <button onClick={() => navigate(`/dashboard/tenants/${rcpt.tenant_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{rcpt.tenant}</button>
                  ) : (
                    <span className="text-gray-700">{rcpt.tenant || '-'}</span>
                  )}
                </td>
                <td className="px-6 py-3 text-sm text-right font-semibold tabular-nums text-gray-900">{formatCurrency(rcpt.amount)}</td>
              </motion.tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr className="font-bold">
              <td colSpan={5} className="px-6 py-3 text-sm text-gray-700">
                Total ({l3Data?.transaction_count || 0} transactions)
              </td>
              <td className="px-6 py-3 text-sm text-right tabular-nums text-gray-900">{formatCurrency(l3Data?.total || 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Pagination currentPage={l3Page} totalPages={l3TotalPages} totalItems={filteredL3Receipts.length} pageSize={l3PageSize} onPageChange={setL3Page} showPageSize={false} />
      </>
    )
  }

  // Level 1: Matrix table
  const renderLevel1 = () => {
    if (isLoading) return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
      </div>
    )
    if (matrix.length === 0) return (
      <div className="p-12 text-center text-gray-500">
        <Landmark className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="font-medium">No data available</p>
        <p className="text-sm mt-1">Record receipts to see bank vs income analysis</p>
      </div>
    )
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Income Type</th>
              {bankColumns.map((col: any) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-right text-xs font-semibold text-blue-600 uppercase cursor-pointer hover:text-blue-800 hover:underline"
                  onClick={() => col.id && handleBankClick(col.id, col.label)}
                >
                  {col.label}
                </th>
              ))}
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {matrix.map((row: any, idx: number) => (
              <motion.tr key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{row.income_type_display || row.income_type}</td>
                {bankColumns.map((col: any) => {
                  const val = row[col.key] || 0
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3 text-sm text-right font-semibold tabular-nums",
                        heatColor(val),
                        val > 0 && col.id ? 'cursor-pointer hover:underline' : ''
                      )}
                      onClick={() => val > 0 && col.id && handleCellClick(col.id, col.label, row.income_type, row.income_type_display || row.income_type)}
                    >
                      {val > 0 ? formatCurrency(val) : <span className="text-gray-300">-</span>}
                    </td>
                  )
                })}
                <td className="px-6 py-3 text-sm text-right font-bold tabular-nums text-gray-900">{formatCurrency(row.total || 0)}</td>
              </motion.tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr className="font-bold">
              <td className="px-6 py-3 text-sm text-gray-700">Total</td>
              {bankColumns.map((col: any) => (
                <td key={col.key} className="px-4 py-3 text-sm text-right tabular-nums text-gray-900">{formatCurrency(totals[col.key] || 0)}</td>
              ))}
              <td className="px-6 py-3 text-sm text-right tabular-nums text-gray-900">{formatCurrency(totals.grand_total || 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-pink-50 dark:bg-pink-900/30 flex items-center justify-center"><Landmark className="w-5 h-5 text-pink-600" /></div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Bank to Income Analysis</h2>
            <p className="text-sm text-gray-500">Income distribution across bank accounts</p>
          </div>
        </div>
        <button onClick={() => { setDrillState({ level: 1 }); refetch() }} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><RefreshCw className="w-5 h-5" /></button>
      </div>

      <Breadcrumb />

      {drillState.level === 1 && renderLevel1()}
      {drillState.level === 2 && renderLevel2()}
      {drillState.level === 3 && renderLevel3()}
    </div>
  )
}

// ─── Receipts Listing Report ─────────────────────────────────────────────────

function ReceiptsListingReport() {
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['receipts-listing'],
    queryFn: () => reportsApi.receiptListing().then(r => r.data),
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
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['deposits-listing'],
    queryFn: () => reportsApi.depositSummary().then(r => r.data),
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
