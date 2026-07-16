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
import { reportsApi, tenantApi, landlordApi, propertyApi } from '../../services/api'
import { formatCurrency, formatPercent, formatDate, cn } from '../../lib/utils'
import { printElement, printFinancialReport, type FinancialReportType } from '../../lib/printTemplate'
import { exportReport } from '../../lib/export'
import { PageHeader, Button, Badge, Skeleton, EmptyState, TableFilter, Pagination, Tooltip as UITooltip, DatePicker, Accordion, SplitButton, Select } from '../../components/ui'
import {
  groupAssets, groupLiabilities, groupRevenue, groupExpenses,
  groupTrialBalance, sumRows,
  type ReportRow,
} from '../../lib/reportGroups'
import { AsyncSelect } from '../../components/ui/AsyncSelect'
import toast from 'react-hot-toast'
import { PiBuildingApartmentLight } from "react-icons/pi";
import { useUIStore } from '../../stores/uiStore'

type ReportType =
  | 'trial-balance' | 'income-statement' | 'balance-sheet' | 'cash-flow' | 'aged-analysis'
  | 'vacancy' | 'rent-rollover' | 'tenant-account' | 'landlord-account'
  | 'commission-property' | 'commission-income' | 'bank-to-income'
  | 'receipts-listing' | 'deposits-listing' | 'lease-charges'
  | 'income-expenditure'

// Reports that consume the global Landlord/Property filter bar. Other
// reports either have intrinsic scoping (Tenant/Landlord Account) or
// don't decompose by landlord (Vacancy, Rent Roll, etc.).
const FINANCIAL_REPORTS: ReadonlySet<ReportType> = new Set<ReportType>([
  'trial-balance', 'income-statement', 'balance-sheet', 'cash-flow',
  'income-expenditure',
])

// Cash Flow shows only cash transactions (non-cash accruals/depreciation
// are stripped) — surface that to the user via a hint when scope is set.
const CASH_ONLY_REPORTS: ReadonlySet<ReportType> = new Set<ReportType>([
  'cash-flow',
])

// Reporting period — the financial reports (Trial Balance, Income
// Statement, Balance Sheet, Cash Flow) all read these so the figures
// strictly match the month/quarter/year the user picked. Per the
// INCOME STATEMENT REPORTING spec, period selection is mandatory and
// shared across those four statements.
const PERIOD_REPORTS: ReadonlySet<ReportType> = new Set<ReportType>([
  'trial-balance', 'income-statement', 'balance-sheet', 'cash-flow',
])

type PeriodMode = 'all' | 'month' | 'quarter' | 'half' | 'year' | 'custom'

function _ymd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const _MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Expand a (mode, anchor-month) pair into a concrete [start, end] range
// plus a short human label. anchorMonth is "YYYY-MM".
function derivePeriod(
  mode: PeriodMode, anchorMonth: string, customStart: string, customEnd: string,
): { start: string; end: string; label: string } {
  if (mode === 'all') {
    // No start bound; end at today. Reports then show everything to date
    // (matches the pre-period-selector behaviour) so data is never hidden
    // behind an empty current month.
    return { start: '', end: _ymd(new Date()), label: 'All time' }
  }
  if (mode === 'custom') {
    return { start: customStart, end: customEnd, label: `${customStart} – ${customEnd}` }
  }
  const [yStr, mStr] = anchorMonth.split('-')
  const y = Number(yStr)
  const m = Number(mStr) - 1 // 0-based month
  let startM = m, endM = m
  if (mode === 'quarter') { const q = Math.floor(m / 3); startM = q * 3; endM = q * 3 + 2 }
  else if (mode === 'half') { startM = m < 6 ? 0 : 6; endM = m < 6 ? 5 : 11 }
  else if (mode === 'year') { startM = 0; endM = 11 }
  const start = new Date(y, startM, 1)
  const end = new Date(y, endM + 1, 0) // day 0 of next month = last day of endM
  let label: string
  if (mode === 'month') label = `${_MONTHS[startM]} ${y}`
  else if (mode === 'quarter') label = `Q${Math.floor(startM / 3) + 1} ${y}`
  else if (mode === 'half') label = `${startM === 0 ? 'H1' : 'H2'} ${y}`
  else label = `FY ${y}`
  return { start: _ymd(start), end: _ymd(end), label }
}

interface ReportFilterContextValue {
  landlordId: string
  propertyId: string
  setLandlordId: (v: string) => void
  setPropertyId: (v: string) => void
  // Shared reporting period (resolved [start, end] for the active selection).
  periodStart: string
  periodEnd: string
  periodLabel: string
}
const ReportFilterContext = createContext<ReportFilterContextValue | null>(null)
function useReportFilters() {
  // Returns inert defaults outside the provider so legacy report components
  // that haven't been migrated still render without crashing.
  const ctx = useContext(ReportFilterContext)
  if (!ctx) return {
    landlordId: '', propertyId: '', setLandlordId: () => {}, setPropertyId: () => {},
    periodStart: '', periodEnd: '', periodLabel: '',
  }
  return ctx
}

// Store for current report data (for export)

// Module-level store for the currently rendered report payload — written
// by whichever report component is mounted, read by the shell's
// print/export handlers. (Was two mutable module globals; a store object
// survives the move across module boundaries, since ES imports are
// read-only views.)
export const reportDataStore: { data: any; type: ReportType } = { data: null, type: 'trial-balance' }

function SkeletonReport() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <div className="p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}


export { FINANCIAL_REPORTS, CASH_ONLY_REPORTS, PERIOD_REPORTS, derivePeriod, _ymd, _MONTHS, ReportFilterContext, useReportFilters, SkeletonReport }
export type { ReportType, PeriodMode, ReportFilterContextValue }
