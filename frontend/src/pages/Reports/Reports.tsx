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

import { lazy, Suspense } from 'react'
import { FINANCIAL_REPORTS, CASH_ONLY_REPORTS, PERIOD_REPORTS, derivePeriod, _ymd, _MONTHS, ReportFilterContext, useReportFilters, reportDataStore, SkeletonReport } from './shared'
import type { ReportType, PeriodMode, ReportFilterContextValue } from './shared'

// Each report section is its own lazy chunk — /reports first paint only
// loads the shell; the active report's code arrives on demand.
const TrialBalanceReport = lazy(() => import('./sections/TrialBalance').then(m => ({ default: m.TrialBalanceReport })))
const IncomeStatementReport = lazy(() => import('./sections/IncomeStatement').then(m => ({ default: m.IncomeStatementReport })))
const BalanceSheetReport = lazy(() => import('./sections/BalanceSheet').then(m => ({ default: m.BalanceSheetReport })))
const CashFlowReport = lazy(() => import('./sections/CashFlow').then(m => ({ default: m.CashFlowReport })))
const VacancyReport = lazy(() => import('./sections/Operational').then(m => ({ default: m.VacancyReport })))
const RentRolloverReport = lazy(() => import('./sections/Operational').then(m => ({ default: m.RentRolloverReport })))
const AgedAnalysisReport = lazy(() => import('./sections/Operational').then(m => ({ default: m.AgedAnalysisReport })))
const LeaseChargeSummaryReport = lazy(() => import('./sections/Operational').then(m => ({ default: m.LeaseChargeSummaryReport })))
const CommissionByPropertyReport = lazy(() => import('./sections/Commissions').then(m => ({ default: m.CommissionByPropertyReport })))
const CommissionByIncomeReport = lazy(() => import('./sections/Commissions').then(m => ({ default: m.CommissionByIncomeReport })))
const BankToIncomeReport = lazy(() => import('./sections/Listings').then(m => ({ default: m.BankToIncomeReport })))
const ReceiptsListingReport = lazy(() => import('./sections/Listings').then(m => ({ default: m.ReceiptsListingReport })))
const DepositsListingReport = lazy(() => import('./sections/Listings').then(m => ({ default: m.DepositsListingReport })))
const IncomeExpenditureReport = lazy(() => import('./sections/IncomeExpenditure').then(m => ({ default: m.IncomeExpenditureReport })))

interface ReportDef {
  id: ReportType
  name: string
  icon: React.ComponentType<{ className?: string }>
  desc: string
  color: string
  bgColor: string
}

interface ReportCategory {
  title: string
  reports: ReportDef[]
}

const reportCategories: ReportCategory[] = [
  {
    title: 'Financial Reports',
    reports: [
      { id: 'balance-sheet', name: 'Balance Sheet', icon: FileText, desc: 'Assets & Liabilities', color: 'text-purple-600', bgColor: 'bg-purple-50 dark:bg-purple-900/30' },
      { id: 'income-statement', name: 'Income Statement', icon: DollarSign, desc: 'Profit & Loss', color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-900/30' },
      { id: 'cash-flow', name: 'Cash Flow', icon: Banknote, desc: 'Cash movements', color: 'text-cyan-600', bgColor: 'bg-cyan-50 dark:bg-cyan-900/30' },
      { id: 'trial-balance', name: 'Trial Balance', icon: Scale, desc: 'Verify accounts balance', color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-900/30' },
      { id: 'aged-analysis', name: 'Aged Analysis', icon: Clock, desc: 'Invoice aging', color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-900/30' },
    ],
  },
  {
    title: 'Property Management',
    reports: [
      { id: 'vacancy', name: 'Vacancy Report', icon: Home, desc: 'Unit occupancy', color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/30' },
      { id: 'rent-rollover', name: 'Rent Rollover', icon: ArrowRight, desc: 'Balance rollover', color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-900/30' },
      // Tenant Account & Landlord Account statements are reached directly from
      // the tenant/landlord detail pages, so they're not duplicated here.
      { id: 'income-expenditure', name: 'Income & Expenditure', icon: BarChart3, desc: 'Monthly income vs expenses', color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-900/30' },
    ],
  },
  {
    title: 'Comparative Reports',
    reports: [
      { id: 'commission-property', name: 'Commission by Property', icon: PiBuildingApartmentLight, desc: 'Property commissions', color: 'text-indigo-600', bgColor: 'bg-indigo-50 dark:bg-indigo-900/30' },
      { id: 'commission-income', name: 'Commission by Income', icon: DollarSign, desc: 'Income type commissions', color: 'text-teal-600', bgColor: 'bg-teal-50 dark:bg-teal-900/30' },
      { id: 'bank-to-income', name: 'Bank to Income', icon: Landmark, desc: 'Income by bank account', color: 'text-pink-600', bgColor: 'bg-pink-50 dark:bg-pink-900/30' },
    ],
  },
  {
    title: 'Administrative Reports',
    reports: [
      { id: 'receipts-listing', name: 'Receipts Listing', icon: Receipt, desc: 'All receipts', color: 'text-lime-600', bgColor: 'bg-lime-50 dark:bg-lime-900/30' },
      { id: 'deposits-listing', name: 'Deposits Listing', icon: CreditCard, desc: 'Deposit accounts', color: 'text-fuchsia-600', bgColor: 'bg-fuchsia-50 dark:bg-fuchsia-900/30' },
      { id: 'lease-charges', name: 'Lease Charges', icon: ClipboardList, desc: 'Charges summary', color: 'text-stone-600', bgColor: 'bg-stone-50 dark:bg-stone-900/30' },
    ],
  },
]

const reportNames: Record<ReportType, string> = {
  'trial-balance': 'Trial Balance',
  'income-statement': 'Income Statement',
  'balance-sheet': 'Balance Sheet',
  'cash-flow': 'Cash Flow Statement',
  'aged-analysis': 'Aged Analysis',
  'vacancy': 'Vacancy Report',
  'rent-rollover': 'Rent Rollover',
  'tenant-account': 'Tenant Account',
  'landlord-account': 'Landlord Account',
  'commission-property': 'Commission by Property',
  'commission-income': 'Commission by Income',
  'bank-to-income': 'Bank to Income',
  'receipts-listing': 'Receipts Listing',
  'deposits-listing': 'Deposits Listing',
  'lease-charges': 'Lease Charges',
  'income-expenditure': 'Income & Expenditure',
}

const RECENT_REPORTS_KEY = 'parameter-recent-reports'
const REPORTS_SIDEBAR_COLLAPSED_KEY = 'parameter-reports-sidebar-collapsed'

function getRecentReports(): ReportType[] {
  try {
    const stored = localStorage.getItem(RECENT_REPORTS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch { return [] }
}

function addRecentReport(id: ReportType) {
  const recent = getRecentReports().filter(r => r !== id)
  recent.unshift(id)
  localStorage.setItem(RECENT_REPORTS_KEY, JSON.stringify(recent.slice(0, 3)))
}

function findReportDef(id: ReportType): ReportDef | undefined {
  for (const cat of reportCategories) {
    const found = cat.reports.find(r => r.id === id)
    if (found) return found
  }
  return undefined
}

/* ─── Reports Sidebar ─── */
function ReportsSidebar({
  activeReport,
  onSelect,
  collapsed,
  onToggleCollapse,
}: {
  activeReport: ReportType
  onSelect: (id: ReportType) => void
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const recentReports = getRecentReports()

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 56 : 260 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="h-full bg-white border-r border-gray-200 flex flex-col flex-shrink-0 overflow-hidden shadow-[1px_0_3px_0_rgba(0,0,0,0.04)]"
    >
      {/* Header / collapse toggle */}
      <div className={cn(
        "flex items-center px-3 py-3 border-b border-gray-100",
        collapsed ? "justify-center" : "justify-between"
      )}>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap"
            >
              Reports
            </motion.span>
          )}
        </AnimatePresence>
        <button
          onClick={onToggleCollapse}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-5 sidebar-scroll">
        {/* Recent reports — plain shortcuts, no active highlight */}
        {recentReports.length > 0 && !collapsed && (
          <div>
            <h4 className="px-2 mb-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Recent
            </h4>
            <div className="space-y-0.5">
              {recentReports.map(id => {
                const def = findReportDef(id)
                if (!def) return null
                const Icon = def.icon
                return (
                  <button
                    key={`recent-${id}`}
                    onClick={() => onSelect(id)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-all duration-150 group text-left text-gray-500 hover:bg-gray-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1"
                  >
                    <Icon className="w-4 h-4 flex-shrink-0 text-gray-400 group-hover:text-gray-500" />
                    <span className="text-sm truncate">{def.name}</span>
                  </button>
                )
              })}
            </div>
            <div className="border-t border-gray-100 mx-2 mt-2.5" />
          </div>
        )}

        {/* Category sections */}
        {reportCategories.map((category) => (
          <div key={category.title}>
            <AnimatePresence>
              {!collapsed && (
                <motion.h4
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-2 mb-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider"
                >
                  {category.title}
                </motion.h4>
              )}
            </AnimatePresence>

            {collapsed && category.title !== reportCategories[0].title && (
              <div className="border-t border-gray-100 mx-1 mb-1" />
            )}

            <div className="space-y-1">
              {category.reports.map((report) => {
                const isActive = activeReport === report.id
                const Icon = report.icon

                const itemButton = (
                  <button
                    key={report.id}
                    onClick={() => onSelect(report.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 rounded-lg transition-all duration-150 group relative text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
                      collapsed ? 'py-2.5 justify-center' : 'px-2.5 py-2',
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                  >
                    {isActive && !collapsed && (
                      <motion.div
                        layoutId="reportActiveIndicator"
                        className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary-600 rounded-r-full"
                        transition={{ type: 'spring', duration: 0.3 }}
                      />
                    )}
                    <Icon className={cn(
                      'flex-shrink-0 transition-colors',
                      collapsed ? 'w-5 h-5' : 'w-4 h-4',
                      isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'
                    )} />
                    <AnimatePresence>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -6 }}
                          className={cn("text-sm whitespace-nowrap truncate", isActive ? "font-semibold" : "font-medium")}
                        >
                          {report.name}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                )

                if (collapsed) {
                  return (
                    <UITooltip key={report.id} content={report.name} side="right" delay={100}>
                      {itemButton}
                    </UITooltip>
                  )
                }

                return itemButton
              })}
            </div>
          </div>
        ))}
      </nav>
    </motion.aside>
  )
}

/* ─── Mobile Report Selector ─── */
function MobileReportSelector({
  activeReport,
  onSelect,
}: {
  activeReport: ReportType
  onSelect: (id: ReportType) => void
}) {
  const [open, setOpen] = useState(false)
  const activeDef = findReportDef(activeReport)

  return (
    <div className="lg:hidden mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl text-left"
      >
        <div className="flex items-center gap-3">
          {activeDef && <activeDef.icon className="w-5 h-5 text-primary-600" />}
          <div>
            <p className="text-sm font-semibold text-gray-900">{activeDef?.name || 'Select Report'}</p>
            <p className="text-xs text-gray-500">{activeDef?.desc}</p>
          </div>
        </div>
        <ChevronDown className={cn('w-5 h-5 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/30 z-40"
            />
            {/* Bottom sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl max-h-[70vh] overflow-y-auto shadow-2xl"
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>
              <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Select Report</h3>
                <button onClick={() => setOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3 space-y-4 pb-8">
                {reportCategories.map(category => (
                  <div key={category.title}>
                    <h4 className="px-2 mb-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      {category.title}
                    </h4>
                    <div className="space-y-0.5">
                      {category.reports.map(report => {
                        const isActive = activeReport === report.id
                        const Icon = report.icon
                        return (
                          <button
                            key={report.id}
                            onClick={() => {
                              onSelect(report.id)
                              setOpen(false)
                            }}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left',
                              isActive
                                ? 'bg-primary-50 text-primary-700'
                                : 'text-gray-600 hover:bg-gray-50'
                            )}
                          >
                            <Icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-primary-600' : 'text-gray-400')} />
                            <div className="flex-1 min-w-0">
                              <p className={cn('text-sm font-medium', isActive && 'text-primary-700')}>{report.name}</p>
                              <p className="text-xs text-gray-500">{report.desc}</p>
                            </div>
                            {isActive && <CheckCircle className="w-4 h-4 text-primary-600 flex-shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Indeterminate top-of-content progress strip ─── */
function FinancialReportProgressStrip() {
  const fetching = useIsFetching({
    predicate: (q) => {
      const k = q.queryKey?.[0]
      return typeof k === 'string' && (
        k === 'trial-balance' || k === 'income-statement' ||
        k === 'balance-sheet' || k === 'cash-flow' ||
        k === 'income-expenditure'
      )
    },
  })
  if (!fetching) return null
  return (
    <div className="h-0.5 bg-gray-100 overflow-hidden -mt-3 mb-3">
      <div
        className="h-full bg-primary-500"
        style={{
          width: '40%',
          animation: 'reports-progress 1.1s ease-in-out infinite',
        }}
      />
      <style>{`@keyframes reports-progress { 0% { transform: translateX(-100%) } 100% { transform: translateX(350%) } }`}</style>
    </div>
  )
}

/* These four statements are landlord-specific — the agency-wide variant has
 * been retired, so a landlord must be picked before they render. */
function SelectLandlordPrompt({ reportName }: { reportName: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
        <Building2 className="w-7 h-7 text-primary-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900">Select a landlord</h3>
      <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto">
        The {reportName} is prepared per landlord. Pick a landlord in the filter bar
        above to generate it.
      </p>
    </div>
  )
}

/* ─── Global Landlord + Property filter bar ─── */
function ReportFilterBar() {
  const { landlordId, propertyId, setLandlordId, setPropertyId } = useReportFilters()
  // Surface "Updating…" while any of the financial-report queries is in
  // flight. Picking a landlord no longer feels frozen — the chip ticks on
  // immediately, then off when data lands.
  const fetching = useIsFetching({
    predicate: (q) => {
      const k = q.queryKey?.[0]
      return typeof k === 'string' && (
        k === 'trial-balance' || k === 'income-statement' ||
        k === 'balance-sheet' || k === 'cash-flow' ||
        k === 'income-expenditure'
      )
    },
  })

  // Always load landlords; Properties depend on the chosen landlord so they
  // re-fetch (cached per id) when the landlord changes.
  const { data: landlordsData } = useQuery({
    queryKey: ['reports-filter-landlords'],
    queryFn: () => landlordApi.list({ page_size: 500 }).then((r: any) => r.data.results || r.data),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
  const { data: propertiesData } = useQuery({
    queryKey: ['reports-filter-properties', landlordId],
    queryFn: () => propertyApi.list({ landlord: Number(landlordId), page_size: 500 } as any).then((r: any) => r.data.results || r.data),
    enabled: !!landlordId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })

  const landlords: any[] = Array.isArray(landlordsData) ? landlordsData : (landlordsData?.results || [])
  const properties: any[] = Array.isArray(propertiesData) ? propertiesData : (propertiesData?.results || [])
  const selectedLandlord = landlords.find(l => String(l.id) === String(landlordId))
  const selectedProperty = properties.find(p => String(p.id) === String(propertyId))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Filter className="w-4 h-4 text-gray-400 mb-3" />
        <AsyncSelect
          label="Landlord"
          placeholder="Select a landlord…"
          value={landlordId}
          onChange={(val) => {
            setLandlordId(String(val))
            // Picking a different landlord invalidates the prior property pick.
            if (String(val) !== landlordId) setPropertyId('')
          }}
          options={landlords.map((l: any) => ({
            value: l.id,
            label: l.name,
            description: l.code || '',
          }))}
          searchable
          clearable
          className="min-w-[260px]"
        />
        <AsyncSelect
          label="Property"
          placeholder={landlordId ? 'All properties under this landlord' : 'Pick a landlord first'}
          value={propertyId}
          onChange={(val) => setPropertyId(String(val))}
          options={properties.map((p: any) => ({
            value: p.id,
            label: p.name,
            description: p.address || '',
          }))}
          searchable
          clearable
          disabled={!landlordId}
          className="min-w-[260px]"
        />
        {(landlordId || propertyId) && (
          <button
            type="button"
            onClick={() => { setLandlordId(''); setPropertyId('') }}
            className="mb-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Clear filters"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-3 mb-2">
          {fetching > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
              <RefreshCw className="w-3 h-3 animate-spin text-primary-500" />
              Updating reports…
            </span>
          )}
          {(selectedLandlord || selectedProperty) && (
            <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
              <span className="uppercase tracking-wider">Scope</span>
              {selectedLandlord && (
                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{selectedLandlord.name}</span>
              )}
              {selectedProperty ? (
                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{selectedProperty.name}</span>
              ) : selectedLandlord && (
                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">All properties</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Main Reports Page ─── */
export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialReport = (searchParams.get('report') as ReportType) || 'trial-balance'
  const [activeReport, setActiveReport] = useState<ReportType>(initialReport)
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  })

  // Global Landlord/Property filter — applies to financial reports only.
  // Seeded from URL (?landlord_id=… &property_id=…) so deep-links from
  // LandlordDetail/PropertyDetail still work.
  const [landlordId, setLandlordId] = useState<string>(() => searchParams.get('landlord_id') || '')
  const [propertyId, setPropertyId] = useState<string>(() => searchParams.get('property_id') || '')
  const [currency, setCurrency] = useState('')  // '' = all currencies

  // Shared reporting period — defaults to the current month. Drives the
  // Trial Balance / Income Statement / Balance Sheet / Cash Flow queries.
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all')
  const [anchorMonth, setAnchorMonth] = useState<string>(() => new Date().toISOString().slice(0, 7))
  const [customStart, setCustomStart] = useState<string>(() => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10))
  const [customEnd, setCustomEnd] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const period = useMemo(
    () => derivePeriod(periodMode, anchorMonth, customStart, customEnd),
    [periodMode, anchorMonth, customStart, customEnd],
  )

  // Resolve landlord/property names so the bank-statement export can
  // print "Account Holder: Acme Holdings" instead of just an ID. Cached
  // alongside the ones the filter bar uses so we don't double-fetch.
  const { data: landlordsForExport } = useQuery({
    queryKey: ['reports-filter-landlords'],
    queryFn: () => landlordApi.list({ page_size: 500 }).then((r: any) => r.data.results || r.data),
    staleTime: 60_000,
    enabled: FINANCIAL_REPORTS.has(activeReport),
  })
  const { data: propertiesForExport } = useQuery({
    queryKey: ['reports-filter-properties', landlordId],
    queryFn: () => propertyApi.list({ landlord: Number(landlordId), page_size: 500 } as any).then((r: any) => r.data.results || r.data),
    enabled: !!landlordId && FINANCIAL_REPORTS.has(activeReport),
    staleTime: 60_000,
  })
  const exportLandlords: any[] = Array.isArray(landlordsForExport) ? landlordsForExport : (landlordsForExport?.results || [])
  const exportProperties: any[] = Array.isArray(propertiesForExport) ? propertiesForExport : (propertiesForExport?.results || [])

  // Sidebar collapse state from localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(REPORTS_SIDEBAR_COLLAPSED_KEY) === 'true'
    } catch { return false }
  })

  const { reportsSidebarOpen, setReportsSidebarOpen, setSidebarOpen } = useUIStore()

  // Auto-expand reports sidebar and collapse main sidebar when entering the page
  useEffect(() => {
    setReportsSidebarOpen(true)
    return () => {
      // Restore main sidebar when leaving reports page
      setSidebarOpen(true)
    }
  }, [])

  // Deep-linking: read ?report= on mount
  useEffect(() => {
    const reportParam = searchParams.get('report') as ReportType | null
    if (reportParam && reportParam in reportNames) {
      setActiveReport(reportParam)
    }
  }, [searchParams])

  const handleSelectReport = useCallback((id: ReportType) => {
    setActiveReport(id)
    setSearchParams({ report: id })
    addRecentReport(id)
  }, [setSearchParams])

  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem(REPORTS_SIDEBAR_COLLAPSED_KEY, String(next))
      return next
    })
  }, [])

  // Build the scope block the bank-statement template prints across the
  // top of every financial report (Account Holder, Property, Period, etc.).
  const buildExportScope = () => {
    const ll = exportLandlords.find(l => String(l.id) === landlordId)
    const pr = exportProperties.find(p => String(p.id) === propertyId)
    const d = reportDataStore.data || {}
    return {
      landlordName: ll?.name,
      propertyName: pr?.name,
      currency: d?.currency || d?.scope?.currency || 'USD',
      periodStart: d?.period?.start,
      periodEnd: d?.period?.end,
      asOfDate: d?.as_of_date,
    }
  }

  const handlePrint = (detail = false) => {
    if (FINANCIAL_REPORTS.has(activeReport) && reportDataStore.data) {
      printFinancialReport({
        reportType: activeReport as FinancialReportType,
        reportName: reportNames[activeReport],
        data: reportDataStore.data,
        detail,
        scope: buildExportScope(),
      })
      return
    }
    printElement('report-content', {
      title: reportNames[activeReport],
      subtitle: `Generated on ${formatDate(new Date())}`,
      orientation: ['rent-rollover', 'receipts-listing', 'bank-to-income', 'income-expenditure'].includes(activeReport) ? 'landscape' : 'portrait',
    })
  }

  // PDF for financial reports uses a dedicated bank-statement template —
  // letterhead + statement particulars + accountant-style tables — instead
  // of dumping the on-screen DOM into the generic print template. The
  // user picks "Save as PDF" as the destination in the print dialog.
  const handleExportPDF = () => {
    if (!reportDataStore.data) {
      toast.error('No report data to export')
      return
    }
    if (FINANCIAL_REPORTS.has(activeReport)) {
      printFinancialReport({
        reportType: activeReport as FinancialReportType,
        reportName: reportNames[activeReport],
        data: reportDataStore.data,
        scope: buildExportScope(),
      })
      toast.success('Pick "Save as PDF" in the print dialog')
      return
    }
    printElement('report-content', {
      title: reportNames[activeReport],
      subtitle: `Generated on ${formatDate(new Date())}`,
      orientation: ['rent-rollover', 'receipts-listing', 'bank-to-income', 'income-expenditure'].includes(activeReport) ? 'landscape' : 'portrait',
    })
    toast.success('Pick "Save as PDF" in the print dialog')
  }

  const handleExportCSV = () => {
    if (!reportDataStore.data) {
      toast.error('No report data to export')
      return
    }
    exportReport(activeReport, reportDataStore.data, 'csv')
    toast.success('Report exported to CSV')
  }

  const handleExportExcel = () => {
    if (!reportDataStore.data) {
      toast.error('No report data to export')
      return
    }
    exportReport(activeReport, reportDataStore.data, 'excel')
    toast.success('Report exported to Excel')
  }

  // Update current report type when it changes
  reportDataStore.type = activeReport

  return (
    <div className="-mx-4 md:-mx-6 -mt-4 md:-mt-6 flex h-[calc(100vh-64px)]">
      {/* Desktop Sidebar — hidden when AI sidebar is open */}
      {reportsSidebarOpen && (
        <div className="hidden lg:flex">
          <ReportsSidebar
            activeReport={activeReport}
            onSelect={handleSelectReport}
            collapsed={sidebarCollapsed}
            onToggleCollapse={handleToggleCollapse}
          />
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 space-y-6">
          {/* Mobile selector */}
          <MobileReportSelector activeReport={activeReport} onSelect={handleSelectReport} />

          <PageHeader
            title={reportNames[activeReport]}
            subtitle="Accounting and operational reports"
            icon={BarChart3}
            breadcrumbs={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Reports' },
              { label: reportNames[activeReport] },
            ]}
            actions={
              <div className="flex items-center gap-2">
                {activeReport === 'balance-sheet' ? (
                  <SplitButton
                    onClick={() => handlePrint(false)}
                    className="!px-3 !py-2"
                    menuItems={[
                      { label: 'Summarised', icon: Printer, onClick: () => handlePrint(false) },
                      { label: 'Detailed (as shown)', icon: Printer, onClick: () => handlePrint(true) },
                    ]}
                  >
                    <Printer className="w-4 h-4" />
                    <span className="hidden sm:inline">Print</span>
                  </SplitButton>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handlePrint(false)}>
                    <Printer className="w-4 h-4" />
                    <span className="hidden sm:inline">Print</span>
                  </Button>
                )}
                {/* Financial reports get PDF; everything else still gets
                    CSV since spreadsheet data is more useful there. */}
                {FINANCIAL_REPORTS.has(activeReport) ? (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportPDF}>
                    <FileText className="w-4 h-4" />
                    <span className="hidden sm:inline">PDF</span>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCSV}>
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">CSV</span>
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportExcel}>
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Excel</span>
                </Button>
              </div>
            }
          />

          <ReportFilterContext.Provider value={{
            landlordId, propertyId, setLandlordId, setPropertyId,
            currency, setCurrency,
            periodStart: period.start, periodEnd: period.end, periodLabel: period.label,
          }}>
            {/* Filter bar shown only on the financial reports the filter applies to. */}
            {FINANCIAL_REPORTS.has(activeReport) && <ReportFilterBar />}
            {/* Currency switcher — one GL account serves USD & ZWG; this
                slices every financial report to a single currency. */}
            {FINANCIAL_REPORTS.has(activeReport) && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">Currency</span>
                <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5">
                  {[['', 'All'], ['USD', 'USD'], ['ZWG', 'ZWG']].map(([v, l]) => (
                    <button
                      key={l}
                      onClick={() => setCurrency(v)}
                      className={cn(
                        'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                        currency === v ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100',
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Period selector — Trial Balance / Income Statement / Balance
                Sheet / Cash Flow report strictly within the chosen period. */}
            {PERIOD_REPORTS.has(activeReport) && (
              <PeriodSelector
                mode={periodMode} setMode={setPeriodMode}
                anchorMonth={anchorMonth} setAnchorMonth={setAnchorMonth}
                customStart={customStart} setCustomStart={setCustomStart}
                customEnd={customEnd} setCustomEnd={setCustomEnd}
                label={period.label}
              />
            )}
            {/* Indeterminate progress strip — top-of-content tell that data
                is being recomputed (slow first-hit) without re-rendering
                the whole report skeleton. */}
            {FINANCIAL_REPORTS.has(activeReport) && <FinancialReportProgressStrip />}

            {/* Cash Flow excludes non-cash expense entries by definition —
                surface that so users don't compare cash-flow expense totals
                to the income-statement expense total and find them lower. */}
            {CASH_ONLY_REPORTS.has(activeReport) && (
              <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-2.5 flex items-start gap-2.5 text-xs text-cyan-900">
                <Banknote className="w-3.5 h-3.5 text-cyan-600 mt-0.5 flex-shrink-0" />
                <span>
                  <span className="font-medium">Cash transactions only.</span> Non-cash entries (accruals, depreciation) are excluded — see <button onClick={() => handleSelectReport('income-statement')} className="underline font-medium">Income Statement</button> for the full P&amp;L.
                </span>
              </div>
            )}

          {/* Report Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeReport}
              id="report-content"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Suspense fallback={<SkeletonReport />}>
              {activeReport === 'trial-balance' && (landlordId ? <TrialBalanceReport /> : <SelectLandlordPrompt reportName="Trial Balance" />)}
              {activeReport === 'income-statement' && (landlordId ? <IncomeStatementReport /> : <SelectLandlordPrompt reportName="Income Statement" />)}
              {activeReport === 'balance-sheet' && (landlordId ? <BalanceSheetReport /> : <SelectLandlordPrompt reportName="Balance Sheet" />)}
              {activeReport === 'cash-flow' && (landlordId ? <CashFlowReport /> : <SelectLandlordPrompt reportName="Cash Flow Statement" />)}
              {activeReport === 'aged-analysis' && <AgedAnalysisReport />}
              {activeReport === 'vacancy' && <VacancyReport />}
              {activeReport === 'rent-rollover' && <RentRolloverReport />}
              {/* Tenant/Landlord Account statements live on their detail pages. */}
              {activeReport === 'commission-property' && <CommissionByPropertyReport />}
              {activeReport === 'commission-income' && <CommissionByIncomeReport />}
              {activeReport === 'bank-to-income' && <BankToIncomeReport />}
              {activeReport === 'receipts-listing' && <ReceiptsListingReport />}
              {activeReport === 'deposits-listing' && <DepositsListingReport />}
              {activeReport === 'lease-charges' && <LeaseChargeSummaryReport />}
              {activeReport === 'income-expenditure' && <IncomeExpenditureReport />}
              </Suspense>
            </motion.div>
          </AnimatePresence>
          </ReportFilterContext.Provider>
        </div>
      </div>
    </div>
  )
}

function PeriodSelector({
  mode, setMode, anchorMonth, setAnchorMonth,
  customStart, setCustomStart, customEnd, setCustomEnd, label,
}: {
  mode: PeriodMode
  setMode: (m: PeriodMode) => void
  anchorMonth: string
  setAnchorMonth: (v: string) => void
  customStart: string
  setCustomStart: (v: string) => void
  customEnd: string
  setCustomEnd: (v: string) => void
  label: string
}) {
  const modes: { value: PeriodMode; label: string }[] = [
    { value: 'all', label: 'All time' },
    { value: 'month', label: 'Monthly' },
    { value: 'quarter', label: 'Quarterly' },
    { value: 'half', label: 'Half-Year' },
    { value: 'year', label: 'Annual' },
    { value: 'custom', label: 'Custom' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-gray-50/60 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <CalendarDays className="w-4 h-4 text-gray-400" />
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">Period</span>
      </div>
      <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5">
        {modes.map(m => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded transition-colors',
              mode === m.value ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'custom' ? (
        <div className="flex items-center gap-2">
          <DatePicker value={customStart} onChange={setCustomStart} className="min-w-[150px]" />
          <span className="text-gray-400 text-sm">to</span>
          <DatePicker value={customEnd} onChange={setCustomEnd} className="min-w-[150px]" />
        </div>
      ) : mode === 'all' ? null : (
        <input
          type="month"
          value={anchorMonth}
          onChange={e => setAnchorMonth(e.target.value)}
          className="h-9 rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-900 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
      )}

      <span className="ml-auto text-xs text-gray-500">
        Reporting: <span className="font-semibold text-gray-700">{label}</span>
      </span>
    </div>
  )
}
