import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
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
} from 'recharts'
import { reportsApi, tenantApi, landlordApi, propertyApi } from '../../services/api'
import { formatCurrency, formatPercent, formatDate, cn } from '../../lib/utils'
import { printElement } from '../../lib/printTemplate'
import { exportReport } from '../../lib/export'
import { PageHeader, Button, Badge, Skeleton, EmptyState } from '../../components/ui'
import { AsyncSelect } from '../../components/ui/AsyncSelect'
import toast from 'react-hot-toast'
import { PiBuildingApartmentLight } from "react-icons/pi";

type ReportType =
  | 'trial-balance' | 'income-statement' | 'balance-sheet' | 'cash-flow' | 'aged-analysis'
  | 'vacancy' | 'rent-roll' | 'tenant-account' | 'landlord-account'
  | 'commission-property' | 'commission-income' | 'bank-to-income'
  | 'receipts-listing' | 'deposits-listing' | 'lease-charges'

// Store for current report data (for export)
let currentReportData: any = null
let currentReportType: ReportType = 'trial-balance'

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
      { id: 'balance-sheet', name: 'Balance Sheet', icon: FileText, desc: 'Assets & Liabilities', color: 'text-purple-600', bgColor: 'bg-purple-50' },
      { id: 'income-statement', name: 'Income Statement', icon: DollarSign, desc: 'Profit & Loss', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
      { id: 'cash-flow', name: 'Cash Flow', icon: Banknote, desc: 'Cash movements', color: 'text-cyan-600', bgColor: 'bg-cyan-50' },
      { id: 'trial-balance', name: 'Trial Balance', icon: Scale, desc: 'Verify accounts balance', color: 'text-blue-600', bgColor: 'bg-blue-50' },
      { id: 'aged-analysis', name: 'Aged Analysis', icon: Clock, desc: 'Invoice aging', color: 'text-orange-600', bgColor: 'bg-orange-50' },
    ],
  },
  {
    title: 'Property Management',
    reports: [
      { id: 'vacancy', name: 'Vacancy Report', icon: Home, desc: 'Unit occupancy', color: 'text-amber-600', bgColor: 'bg-amber-50' },
      { id: 'rent-roll', name: 'Rent Roll', icon: Building2, desc: 'Active leases', color: 'text-rose-600', bgColor: 'bg-rose-50' },
      { id: 'tenant-account', name: 'Tenant Account', icon: Users, desc: 'Tenant transactions', color: 'text-sky-600', bgColor: 'bg-sky-50' },
      { id: 'landlord-account', name: 'Landlord Account', icon: PiBuildingApartmentLight, desc: 'Landlord statement', color: 'text-violet-600', bgColor: 'bg-violet-50' },
    ],
  },
  {
    title: 'Comparative Reports',
    reports: [
      { id: 'commission-property', name: 'Commission by Property', icon: PiBuildingApartmentLight, desc: 'Property commissions', color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
      { id: 'commission-income', name: 'Commission by Income', icon: DollarSign, desc: 'Income type commissions', color: 'text-teal-600', bgColor: 'bg-teal-50' },
      { id: 'bank-to-income', name: 'Bank to Income', icon: Landmark, desc: 'Income by bank account', color: 'text-pink-600', bgColor: 'bg-pink-50' },
    ],
  },
  {
    title: 'Administrative Reports',
    reports: [
      { id: 'receipts-listing', name: 'Receipts Listing', icon: Receipt, desc: 'All receipts', color: 'text-lime-600', bgColor: 'bg-lime-50' },
      { id: 'deposits-listing', name: 'Deposits Listing', icon: CreditCard, desc: 'Deposit accounts', color: 'text-fuchsia-600', bgColor: 'bg-fuchsia-50' },
      { id: 'lease-charges', name: 'Lease Charges', icon: ClipboardList, desc: 'Charges summary', color: 'text-stone-600', bgColor: 'bg-stone-50' },
    ],
  },
]

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

const reportNames: Record<ReportType, string> = {
  'trial-balance': 'Trial Balance',
  'income-statement': 'Income Statement',
  'balance-sheet': 'Balance Sheet',
  'cash-flow': 'Cash Flow Statement',
  'aged-analysis': 'Aged Analysis',
  'vacancy': 'Vacancy Report',
  'rent-roll': 'Rent Roll',
  'tenant-account': 'Tenant Account',
  'landlord-account': 'Landlord Account',
  'commission-property': 'Commission by Property',
  'commission-income': 'Commission by Income',
  'bank-to-income': 'Bank to Income',
  'receipts-listing': 'Receipts Listing',
  'deposits-listing': 'Deposits Listing',
  'lease-charges': 'Lease Charges',
}

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialReport = (searchParams.get('report') as ReportType) || 'trial-balance'
  const [activeReport, setActiveReport] = useState<ReportType>(initialReport)
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  })

  // Deep-linking: read ?report= on mount
  useEffect(() => {
    const reportParam = searchParams.get('report') as ReportType | null
    if (reportParam && reportParam in reportNames) {
      setActiveReport(reportParam)
    }
  }, [searchParams])

  const handlePrint = () => {
    printElement('report-content', {
      title: reportNames[activeReport],
      subtitle: `Generated on ${formatDate(new Date())}`,
      orientation: ['rent-roll', 'receipts-listing', 'bank-to-income'].includes(activeReport) ? 'landscape' : 'portrait',
    })
  }

  const handleExportCSV = () => {
    if (!currentReportData) {
      toast.error('No report data to export')
      return
    }
    exportReport(activeReport, currentReportData, 'csv')
    toast.success('Report exported to CSV')
  }

  const handleExportExcel = () => {
    if (!currentReportData) {
      toast.error('No report data to export')
      return
    }
    exportReport(activeReport, currentReportData, 'excel')
    toast.success('Report exported to Excel')
  }

  // Update current report type when it changes
  currentReportType = activeReport

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Accounting and operational reports"
        icon={BarChart3}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Reports' },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline" className="gap-2" onClick={handlePrint}>
              <Printer className="w-4 h-4" />
              Print
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExportCSV}>
              <Download className="w-4 h-4" />
              CSV
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExportExcel}>
              <Download className="w-4 h-4" />
              Excel
            </Button>
          </div>
        }
      />

      {/* Report Selector - Categorized */}
      <div className="space-y-5">
        {reportCategories.map(category => (
          <div key={category.title} className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
              {category.title}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {category.reports.map((report) => {
                const ReportIcon = report.icon
                const isActive = activeReport === report.id
                return (
                  <motion.button
                    key={report.id}
                    whileHover={{ y: -2 }}
                    onClick={() => {
                      setActiveReport(report.id)
                      setSearchParams({ report: report.id })
                    }}
                    className={cn(
                      'p-3 rounded-xl border text-left transition-all',
                      isActive
                        ? 'bg-white border-primary-300 ring-2 ring-primary-100 shadow-lg'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center mb-2',
                      isActive ? 'bg-primary-100' : report.bgColor
                    )}>
                      <ReportIcon className={cn('w-4 h-4', isActive ? 'text-primary-600' : report.color)} />
                    </div>
                    <h3 className={cn('font-semibold text-sm leading-tight', isActive ? 'text-primary-700' : 'text-gray-900')}>
                      {report.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">{report.desc}</p>
                  </motion.button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

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
          {activeReport === 'trial-balance' && <TrialBalanceReport />}
          {activeReport === 'income-statement' && <IncomeStatementReport />}
          {activeReport === 'balance-sheet' && <BalanceSheetReport />}
          {activeReport === 'cash-flow' && <CashFlowReport />}
          {activeReport === 'aged-analysis' && <AgedAnalysisReport />}
          {activeReport === 'vacancy' && <VacancyReport />}
          {activeReport === 'rent-roll' && <RentRollReport />}
          {activeReport === 'tenant-account' && <TenantAccountReport />}
          {activeReport === 'landlord-account' && <LandlordAccountReport />}
          {activeReport === 'commission-property' && <CommissionByPropertyReport />}
          {activeReport === 'commission-income' && <CommissionByIncomeReport />}
          {activeReport === 'bank-to-income' && <BankToIncomeReport />}
          {activeReport === 'receipts-listing' && <ReceiptsListingReport />}
          {activeReport === 'deposits-listing' && <DepositsListingReport />}
          {activeReport === 'lease-charges' && <LeaseChargeSummaryReport />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function TrialBalanceReport() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['trial-balance'],
    queryFn: () => reportsApi.trialBalance().then(r => r.data),
  })

  // Store data for export
  if (data) currentReportData = data

  const isBalanced = data?.totals?.balanced

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Scale className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Trial Balance</h2>
              {isLoading ? (
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-sm text-gray-500">As of {data?.as_of_date ? formatDate(data.as_of_date) : formatDate(new Date())}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className="w-5 h-5" />
          </button>
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
      </div>

      {isLoading ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Code</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Name</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    Debit
                  </span>
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    <ArrowDownLeft className="w-3 h-3" />
                    Credit
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-40 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 w-20 bg-gray-200 rounded ml-auto" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 w-20 bg-gray-200 rounded ml-auto" /></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr className="font-bold">
                <td colSpan={2} className="px-6 py-4 text-gray-700">Total</td>
                <td className="px-6 py-4 text-right"><div className="h-4 w-24 bg-gray-200 rounded ml-auto animate-pulse" /></td>
                <td className="px-6 py-4 text-right"><div className="h-4 w-24 bg-gray-200 rounded ml-auto animate-pulse" /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : data?.accounts?.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Code</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Name</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    Debit
                  </span>
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    <ArrowDownLeft className="w-3 h-3" />
                    Credit
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.accounts?.map((acc: any, idx: number) => (
                <motion.tr
                  key={idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm font-semibold text-primary-600">{acc.account_code}</span>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">{acc.account_name}</td>
                  <td className="px-6 py-4 text-right">
                    {acc.debit > 0 ? (
                      <span className="font-semibold text-blue-600 tabular-nums">{formatCurrency(acc.debit)}</span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {acc.credit > 0 ? (
                      <span className="font-semibold text-rose-600 tabular-nums">{formatCurrency(acc.credit)}</span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr className="font-bold">
                <td colSpan={2} className="px-6 py-4 text-gray-700">Total</td>
                <td className="px-6 py-4 text-right text-blue-700 tabular-nums">{formatCurrency(data?.totals?.debits || 0)}</td>
                <td className="px-6 py-4 text-right text-rose-700 tabular-nums">{formatCurrency(data?.totals?.credits || 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="p-12 text-center text-gray-500">
          <Scale className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="font-medium">No trial balance data available</p>
          <p className="text-sm mt-1">Post some journal entries to see the trial balance</p>
        </div>
      )}
    </div>
  )
}

function IncomeStatementReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['income-statement'],
    queryFn: () => reportsApi.incomeStatement().then(r => r.data),
  })

  // Store data for export
  if (data) currentReportData = data

  const isProfit = data?.is_profit
  const netIncome = Math.abs(data?.net_income || 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Income Statement (Profit & Loss)</h2>
            <p className="text-sm text-gray-500">For the current period</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Income vs Expense Chart */}
        {data && (data?.revenue?.total > 0 || data?.expenses?.total > 0) && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="h-64 mb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                ...(data?.revenue?.accounts || []).map((a: any) => ({ name: a.name, Revenue: a.balance, Expense: 0 })),
                ...(data?.expenses?.accounts || []).map((a: any) => ({ name: a.name, Revenue: 0, Expense: a.balance })),
              ].slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} angle={-20} textAnchor="end" height={60} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                <Bar dataKey="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* Revenue Section */}
        <div className="rounded-xl border border-emerald-200 overflow-hidden">
          <div className="px-5 py-4 bg-emerald-50 border-b border-emerald-200">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <h3 className="font-semibold text-emerald-800">Revenue</h3>
            </div>
          </div>
          <div className="divide-y divide-emerald-100">
            {data?.revenue?.accounts?.map((acc: any, idx: number) => (
              <div key={idx} className="px-5 py-3 flex justify-between hover:bg-emerald-50/50 transition-colors">
                <span className="text-gray-700">{acc.name}</span>
                <span className="font-semibold text-emerald-700 tabular-nums">{formatCurrency(acc.balance)}</span>
              </div>
            ))}
            {(!data?.revenue?.accounts || data?.revenue?.accounts?.length === 0) && (
              <div className="px-5 py-4 text-center text-gray-400 text-sm">No revenue accounts</div>
            )}
          </div>
          <div className="px-5 py-4 bg-emerald-100 flex justify-between font-bold text-emerald-800">
            <span>Total Revenue</span>
            {isLoading ? (
              <div className="h-5 w-24 bg-emerald-200 rounded animate-pulse" />
            ) : (
              <span className="tabular-nums">{formatCurrency(data?.revenue?.total || 0)}</span>
            )}
          </div>
        </div>

        {/* Expenses Section */}
        <div className="rounded-xl border border-rose-200 overflow-hidden">
          <div className="px-5 py-4 bg-rose-50 border-b border-rose-200">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-rose-600" />
              <h3 className="font-semibold text-rose-800">Expenses</h3>
            </div>
          </div>
          <div className="divide-y divide-rose-100">
            {data?.expenses?.accounts?.map((acc: any, idx: number) => (
              <div key={idx} className="px-5 py-3 flex justify-between hover:bg-rose-50/50 transition-colors">
                <span className="text-gray-700">{acc.name}</span>
                <span className="font-semibold text-rose-700 tabular-nums">{formatCurrency(acc.balance)}</span>
              </div>
            ))}
            {(!data?.expenses?.accounts || data?.expenses?.accounts?.length === 0) && (
              <div className="px-5 py-4 text-center text-gray-400 text-sm">No expense accounts</div>
            )}
          </div>
          <div className="px-5 py-4 bg-rose-100 flex justify-between font-bold text-rose-800">
            <span>Total Expenses</span>
            {isLoading ? (
              <div className="h-5 w-24 bg-rose-200 rounded animate-pulse" />
            ) : (
              <span className="tabular-nums">{formatCurrency(data?.expenses?.total || 0)}</span>
            )}
          </div>
        </div>

        {/* Net Income */}
        <div className={cn(
          'rounded-xl p-6',
          isLoading ? 'bg-gradient-to-r from-gray-400 to-gray-500' : isProfit ? 'bg-gradient-to-r from-emerald-500 to-emerald-600' : 'bg-gradient-to-r from-rose-500 to-rose-600'
        )}>
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              {isLoading ? (
                <>
                  <TrendingUp className="w-8 h-8" />
                  <span className="text-xl font-semibold">Net Income</span>
                </>
              ) : (
                <>
                  {isProfit ? <TrendingUp className="w-8 h-8" /> : <TrendingDown className="w-8 h-8" />}
                  <span className="text-xl font-semibold">Net {isProfit ? 'Profit' : 'Loss'}</span>
                </>
              )}
            </div>
            {isLoading ? (
              <div className="h-9 w-32 bg-white/30 rounded animate-pulse" />
            ) : (
              <span className="text-3xl font-bold tabular-nums">{formatCurrency(netIncome)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function BalanceSheetReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['balance-sheet'],
    queryFn: () => reportsApi.balanceSheet().then(r => r.data),
  })

  // Store data for export
  if (data) currentReportData = data

  const isBalanced = data?.totals?.balanced

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
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

      <div className="p-6">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Assets */}
          <div className="rounded-xl border border-blue-200 overflow-hidden">
            <div className="px-5 py-4 bg-blue-50 border-b border-blue-200">
              <h3 className="font-semibold text-blue-800">Assets</h3>
            </div>
            <div className="divide-y divide-blue-100">
              {data?.assets?.accounts?.map((acc: any, idx: number) => (
                <div key={idx} className="px-5 py-3 flex justify-between hover:bg-blue-50/50 transition-colors">
                  <span className="text-gray-700">{acc.name}</span>
                  <span className="font-semibold text-blue-700 tabular-nums">{formatCurrency(acc.balance)}</span>
                </div>
              ))}
              {(!data?.assets?.accounts || data?.assets?.accounts?.length === 0) && (
                <div className="px-5 py-4 text-center text-gray-400 text-sm">No asset accounts</div>
              )}
            </div>
            <div className="px-5 py-4 bg-blue-100 flex justify-between font-bold text-blue-800">
              <span>Total Assets</span>
              <span className="tabular-nums">{formatCurrency(data?.assets?.total || 0)}</span>
            </div>
          </div>

          {/* Liabilities & Equity */}
          <div className="space-y-6">
            {/* Liabilities */}
            <div className="rounded-xl border border-rose-200 overflow-hidden">
              <div className="px-5 py-4 bg-rose-50 border-b border-rose-200">
                <h3 className="font-semibold text-rose-800">Liabilities</h3>
              </div>
              <div className="divide-y divide-rose-100">
                {data?.liabilities?.accounts?.map((acc: any, idx: number) => (
                  <div key={idx} className="px-5 py-3 flex justify-between hover:bg-rose-50/50 transition-colors">
                    <span className="text-gray-700">{acc.name}</span>
                    <span className="font-semibold text-rose-700 tabular-nums">{formatCurrency(acc.balance)}</span>
                  </div>
                ))}
                {(!data?.liabilities?.accounts || data?.liabilities?.accounts?.length === 0) && (
                  <div className="px-5 py-4 text-center text-gray-400 text-sm">No liability accounts</div>
                )}
              </div>
              <div className="px-5 py-4 bg-rose-100 flex justify-between font-bold text-rose-800">
                <span>Total Liabilities</span>
                <span className="tabular-nums">{formatCurrency(data?.liabilities?.total || 0)}</span>
              </div>
            </div>

            {/* Equity */}
            <div className="rounded-xl border border-purple-200 overflow-hidden">
              <div className="px-5 py-4 bg-purple-50 border-b border-purple-200">
                <h3 className="font-semibold text-purple-800">Equity</h3>
              </div>
              <div className="divide-y divide-purple-100">
                {data?.equity?.accounts?.map((acc: any, idx: number) => (
                  <div key={idx} className="px-5 py-3 flex justify-between hover:bg-purple-50/50 transition-colors">
                    <span className="text-gray-700">{acc.name}</span>
                    <span className="font-semibold text-purple-700 tabular-nums">{formatCurrency(acc.balance)}</span>
                  </div>
                ))}
                {(!data?.equity?.accounts || data?.equity?.accounts?.length === 0) && (
                  <div className="px-5 py-4 text-center text-gray-400 text-sm">No equity accounts</div>
                )}
              </div>
              <div className="px-5 py-4 bg-purple-100 flex justify-between font-bold text-purple-800">
                <span>Total Equity</span>
                <span className="tabular-nums">{formatCurrency(data?.equity?.total || 0)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Total Liabilities + Equity */}
        <div className="mt-6 p-4 bg-gray-100 rounded-xl flex justify-between font-bold text-lg">
          <span>Total Liabilities + Equity</span>
          <span className="tabular-nums">{formatCurrency((data?.liabilities?.total || 0) + (data?.equity?.total || 0))}</span>
        </div>
      </div>
    </div>
  )
}

function CashFlowReport() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cash-flow'],
    queryFn: () => reportsApi.cashFlow().then(r => r.data),
  })

  // Store data for export
  if (data) currentReportData = data

  const netChange = data?.summary?.net_change_in_cash || 0
  const isPositive = netChange >= 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center">
            <Banknote className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Cash Flow Statement</h2>
            <p className="text-sm text-gray-500">
              {data?.period?.start ? `${data.period.start} to ${data.period.end}` : 'Current Period'}
            </p>
          </div>
        </div>
        <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Operating Activities */}
        <div className="rounded-xl border border-emerald-200 overflow-hidden">
          <div className="px-5 py-4 bg-emerald-50 border-b border-emerald-200">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <h3 className="font-semibold text-emerald-800">Operating Activities</h3>
            </div>
          </div>
          <div className="divide-y divide-emerald-100">
            <div className="px-5 py-3 flex justify-between hover:bg-emerald-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                Cash receipts from tenants
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-emerald-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-emerald-700 tabular-nums">
                  {formatCurrency(data?.operating_activities?.inflows?.tenant_receipts || 0)}
                </span>
              )}
            </div>
            <div className="px-5 py-3 flex justify-between hover:bg-emerald-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-rose-500" />
                Cash paid for expenses
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-rose-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-rose-700 tabular-nums">
                  ({formatCurrency(data?.operating_activities?.outflows?.expense_payments || 0)})
                </span>
              )}
            </div>
            <div className="px-5 py-3 flex justify-between hover:bg-emerald-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-rose-500" />
                Cash paid to landlords
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-rose-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-rose-700 tabular-nums">
                  ({formatCurrency(data?.operating_activities?.outflows?.landlord_payments || 0)})
                </span>
              )}
            </div>
          </div>
          <div className="px-5 py-4 bg-emerald-100 flex justify-between font-bold text-emerald-800">
            <span>Net Cash from Operating</span>
            {isLoading ? (
              <div className="h-5 w-28 bg-emerald-200 rounded animate-pulse" />
            ) : (
              <span className="tabular-nums">{formatCurrency(data?.operating_activities?.net_cash || 0)}</span>
            )}
          </div>
        </div>

        {/* Investing Activities */}
        <div className="rounded-xl border border-blue-200 overflow-hidden">
          <div className="px-5 py-4 bg-blue-50 border-b border-blue-200">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-blue-800">Investing Activities</h3>
            </div>
          </div>
          <div className="divide-y divide-blue-100">
            <div className="px-5 py-3 flex justify-between hover:bg-blue-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                Proceeds from asset sales
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-emerald-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-emerald-700 tabular-nums">
                  {formatCurrency(data?.investing_activities?.inflows?.asset_sales || 0)}
                </span>
              )}
            </div>
            <div className="px-5 py-3 flex justify-between hover:bg-blue-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-rose-500" />
                Purchase of assets
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-rose-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-rose-700 tabular-nums">
                  ({formatCurrency(data?.investing_activities?.outflows?.asset_purchases || 0)})
                </span>
              )}
            </div>
          </div>
          <div className="px-5 py-4 bg-blue-100 flex justify-between font-bold text-blue-800">
            <span>Net Cash from Investing</span>
            {isLoading ? (
              <div className="h-5 w-28 bg-blue-200 rounded animate-pulse" />
            ) : (
              <span className="tabular-nums">{formatCurrency(data?.investing_activities?.net_cash || 0)}</span>
            )}
          </div>
        </div>

        {/* Financing Activities */}
        <div className="rounded-xl border border-purple-200 overflow-hidden">
          <div className="px-5 py-4 bg-purple-50 border-b border-purple-200">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-purple-800">Financing Activities</h3>
            </div>
          </div>
          <div className="divide-y divide-purple-100">
            <div className="px-5 py-3 flex justify-between hover:bg-purple-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                Owner contributions
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-emerald-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-emerald-700 tabular-nums">
                  {formatCurrency(data?.financing_activities?.inflows?.owner_contributions || 0)}
                </span>
              )}
            </div>
            <div className="px-5 py-3 flex justify-between hover:bg-purple-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-rose-500" />
                Owner withdrawals
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-rose-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-rose-700 tabular-nums">
                  ({formatCurrency(data?.financing_activities?.outflows?.owner_withdrawals || 0)})
                </span>
              )}
            </div>
          </div>
          <div className="px-5 py-4 bg-purple-100 flex justify-between font-bold text-purple-800">
            <span>Net Cash from Financing</span>
            {isLoading ? (
              <div className="h-5 w-28 bg-purple-200 rounded animate-pulse" />
            ) : (
              <span className="tabular-nums">{formatCurrency(data?.financing_activities?.net_cash || 0)}</span>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-3">
          <div className="p-4 bg-gray-50 rounded-xl flex justify-between">
            <span className="text-gray-600">Beginning Cash Balance</span>
            {isLoading ? (
              <div className="h-5 w-28 bg-gray-200 rounded animate-pulse" />
            ) : (
              <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(data?.summary?.beginning_cash || 0)}</span>
            )}
          </div>

          <div className={cn(
            'rounded-xl p-6',
            isLoading ? 'bg-gradient-to-r from-gray-400 to-gray-500' : isPositive ? 'bg-gradient-to-r from-cyan-500 to-cyan-600' : 'bg-gradient-to-r from-rose-500 to-rose-600'
          )}>
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                {isLoading ? <TrendingUp className="w-8 h-8" /> : isPositive ? <TrendingUp className="w-8 h-8" /> : <TrendingDown className="w-8 h-8" />}
                <span className="text-xl font-semibold">Net Change in Cash</span>
              </div>
              {isLoading ? (
                <div className="h-9 w-32 bg-white/30 rounded animate-pulse" />
              ) : (
                <span className="text-3xl font-bold tabular-nums">
                  {isPositive ? '' : '-'}{formatCurrency(Math.abs(netChange))}
                </span>
              )}
            </div>
          </div>

          <div className="p-4 bg-gray-900 text-white rounded-xl flex justify-between">
            <span className="text-gray-300">Ending Cash Balance</span>
            {isLoading ? (
              <div className="h-8 w-32 bg-gray-700 rounded animate-pulse" />
            ) : (
              <span className="font-bold text-2xl tabular-nums">{formatCurrency(data?.summary?.ending_cash || 0)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function VacancyReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['vacancy-report'],
    queryFn: () => reportsApi.vacancy().then(r => r.data),
  })

  // Store data for export
  if (data) currentReportData = data

  const overallVacancy = data?.summary?.overall_vacancy_rate || 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Home className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Vacancy Report</h2>
              <p className="text-sm text-gray-500">Property occupancy status</p>
            </div>
          </div>
          {isLoading ? (
            <div className="h-10 w-32 bg-gray-200 rounded-full animate-pulse" />
          ) : (
            <div className={cn(
              'px-4 py-2 rounded-full font-semibold',
              overallVacancy > 20 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
            )}>
              {formatPercent(100 - overallVacancy)} Occupied
            </div>
          )}
        </div>
      </div>

      {/* Vacancy Chart */}
      {!isLoading && data?.properties?.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 border-b border-gray-100">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.properties.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={120} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                <Bar dataKey="occupied" stackId="a" fill="#10b981" name="Occupied" radius={[0, 0, 0, 0]} />
                <Bar dataKey="vacant" stackId="a" fill="#f43f5e" name="Vacant" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {isLoading ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Property</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Landlord</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Occupied</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Vacant</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Vacancy Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-4 w-32 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-28 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4 text-center"><div className="h-4 w-8 bg-gray-200 rounded mx-auto" /></td>
                  <td className="px-6 py-4 text-center"><div className="h-4 w-8 bg-gray-200 rounded mx-auto" /></td>
                  <td className="px-6 py-4 text-center"><div className="h-4 w-8 bg-gray-200 rounded mx-auto" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-6 w-16 bg-gray-200 rounded-full ml-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data?.properties?.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Property</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Landlord</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Occupied</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Vacant</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Vacancy Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.properties?.map((prop: any, idx: number) => (
                <motion.tr
                  key={prop.property_id || idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 font-medium text-gray-900">{prop.name}</td>
                  <td className="px-6 py-4 text-gray-600">{prop.landlord}</td>
                  <td className="px-6 py-4 text-center font-semibold text-gray-900">{prop.total_units}</td>
                  <td className="px-6 py-4 text-center font-semibold text-emerald-600">{prop.occupied}</td>
                  <td className="px-6 py-4 text-center font-semibold text-rose-600">{prop.vacant}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={cn(
                      'inline-block px-3 py-1 rounded-full text-xs font-semibold',
                      prop.vacancy_rate > 20 ? 'bg-rose-100 text-rose-700' :
                      prop.vacancy_rate > 10 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    )}>
                      {formatPercent(prop.vacancy_rate)}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-12 text-center text-gray-500">
          <Home className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="font-medium">No properties found</p>
          <p className="text-sm mt-1">Add properties and units to see the vacancy report</p>
        </div>
      )}
    </div>
  )
}

function RentRollReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['rent-roll'],
    queryFn: () => reportsApi.rentRoll().then(r => r.data),
  })

  // Store data for export
  if (data) currentReportData = data

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Rent Roll</h2>
              {isLoading ? (
                <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-sm text-gray-500">
                  {data?.summary?.total_leases || 0} active leases
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Total Monthly Rent</p>
            {isLoading ? (
              <div className="h-8 w-32 bg-gray-200 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-2xl font-bold text-primary-600">{formatCurrency(data?.summary?.total_monthly_rent || 0)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Rent Distribution Chart */}
      {!isLoading && data?.leases?.length > 0 && (() => {
        const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316']
        const propertyRentMap: Record<string, number> = {}
        data.leases.forEach((l: any) => {
          propertyRentMap[l.property] = (propertyRentMap[l.property] || 0) + (l.monthly_rent || 0)
        })
        const pieData = Object.entries(propertyRentMap).map(([name, value]) => ({ name, value }))
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-500 mb-4">Rent Distribution by Property</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false} fontSize={11}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )
      })()}

      {isLoading ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Lease #</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tenant</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Property</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Monthly Rent</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">End Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-28 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-32 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 w-20 bg-gray-200 rounded ml-auto" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data?.leases?.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Lease #</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tenant</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Property</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Monthly Rent</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">End Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.leases?.map((lease: any, idx: number) => (
                <motion.tr
                  key={idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm font-semibold text-primary-600">{lease.lease_number}</span>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">{lease.tenant}</td>
                  <td className="px-6 py-4 text-gray-600">{lease.property}</td>
                  <td className="px-6 py-4">{lease.unit}</td>
                  <td className="px-6 py-4 text-right font-semibold text-gray-900 tabular-nums">{formatCurrency(lease.monthly_rent)}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      'text-sm',
                      new Date(lease.end_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                        ? 'text-amber-600 font-medium'
                        : 'text-gray-600'
                    )}>
                      {lease.end_date}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-12 text-center text-gray-500">
          <Building2 className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="font-medium">No active leases found</p>
          <p className="text-sm mt-1">Create leases to see the rent roll</p>
        </div>
      )}
    </div>
  )
}

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#3b82f6']

function CommissionByPropertyReport() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['commission-property'],
    queryFn: () => reportsApi.commission().then(r => r.data),
  })

  if (data) currentReportData = data

  const totalCommission = data?.summary?.total_commission || 0
  const properties = data?.by_property || []

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
            <PiBuildingApartmentLight className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Commission by Property</h2>
            {isLoading ? (
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-sm text-gray-500">
                {data?.period?.start ? `${data.period.start} to ${data.period.end}` : 'All time'}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className="w-5 h-5" />
          </button>
          {!isLoading && (
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium bg-indigo-50 text-indigo-700">
              <DollarSign className="w-4 h-4" />
              {formatCurrency(totalCommission)}
            </span>
          )}
        </div>
      </div>

      {/* Bar Chart */}
      {!isLoading && properties.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-500 mb-4">Top Properties by Commission</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={properties.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis dataKey="property_name" type="category" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={140} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                <Bar dataKey="commission" fill="#6366f1" radius={[0, 4, 4, 0]} name="Commission" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {isLoading ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rank</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Property</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Landlord</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Rate</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Commission</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">% of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-4 w-8 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-32 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-28 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 w-12 bg-gray-200 rounded ml-auto" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 w-20 bg-gray-200 rounded ml-auto" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 w-20 bg-gray-200 rounded ml-auto" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 w-12 bg-gray-200 rounded ml-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : properties.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rank</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Property</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Landlord</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Rate</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Commission</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">% of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {properties.map((prop: any, idx: number) => (
                <motion.tr
                  key={idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className={cn(
                      'inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold',
                      idx === 0 ? 'bg-amber-100 text-amber-700' :
                      idx === 1 ? 'bg-gray-200 text-gray-700' :
                      idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                    )}>
                      {prop.rank}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">{prop.property_name}</td>
                  <td className="px-6 py-4 text-gray-600">{prop.landlord_name}</td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-sm font-medium">
                      {prop.commission_rate}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-gray-900 tabular-nums">{formatCurrency(prop.collected)}</td>
                  <td className="px-6 py-4 text-right font-semibold text-indigo-600 tabular-nums">{formatCurrency(prop.commission)}</td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm text-gray-600">{prop.percentage?.toFixed(1)}%</span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr className="font-bold">
                <td colSpan={4} className="px-6 py-4 text-gray-700">Total</td>
                <td className="px-6 py-4 text-right text-gray-900 tabular-nums">{formatCurrency(data?.summary?.total_collected || 0)}</td>
                <td className="px-6 py-4 text-right text-indigo-700 tabular-nums">{formatCurrency(totalCommission)}</td>
                <td className="px-6 py-4 text-right text-gray-700">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="p-12 text-center text-gray-500">
          <PiBuildingApartmentLight className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="font-medium">No commission data available</p>
          <p className="text-sm mt-1">Record receipts to see commission by property</p>
        </div>
      )}
    </div>
  )
}

function CommissionByIncomeReport() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['commission-income'],
    queryFn: () => reportsApi.commissionAnalysis().then(r => r.data),
  })

  if (data) currentReportData = data

  const totalCommission = data?.summary?.total_commission || 0
  const incomeTypes = data?.by_income_type || []

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Commission by Income Category</h2>
            {isLoading ? (
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-sm text-gray-500">
                {data?.period?.start ? `${data.period.start} to ${data.period.end}` : 'All time'}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className="w-5 h-5" />
          </button>
          {!isLoading && (
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium bg-teal-50 text-teal-700">
              <DollarSign className="w-4 h-4" />
              {formatCurrency(totalCommission)}
            </span>
          )}
        </div>
      </div>

      {/* Pie Chart */}
      {!isLoading && incomeTypes.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-500 mb-4">Commission Distribution by Income Type</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={incomeTypes.map((it: any) => ({ name: it.label, value: it.commission }))}
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                  fontSize={11}
                >
                  {incomeTypes.map((_: any, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {isLoading ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rank</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Commission</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">% of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-4 w-8 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-28 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 w-20 bg-gray-200 rounded ml-auto" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 w-20 bg-gray-200 rounded ml-auto" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 w-12 bg-gray-200 rounded ml-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : incomeTypes.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rank</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Commission</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">% of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {incomeTypes.map((item: any, idx: number) => (
                <motion.tr
                  key={idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className={cn(
                      'inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold',
                      idx === 0 ? 'bg-amber-100 text-amber-700' :
                      idx === 1 ? 'bg-gray-200 text-gray-700' :
                      idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                    )}>
                      {item.rank || idx + 1}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                      <span className="font-medium text-gray-900">{item.label}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-gray-900 tabular-nums">{formatCurrency(item.income)}</td>
                  <td className="px-6 py-4 text-right font-semibold text-teal-600 tabular-nums">{formatCurrency(item.commission)}</td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm text-gray-600">{item.percentage?.toFixed(1)}%</span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr className="font-bold">
                <td colSpan={2} className="px-6 py-4 text-gray-700">Total</td>
                <td className="px-6 py-4 text-right text-gray-900 tabular-nums">{formatCurrency(data?.summary?.total_income || 0)}</td>
                <td className="px-6 py-4 text-right text-teal-700 tabular-nums">{formatCurrency(totalCommission)}</td>
                <td className="px-6 py-4 text-right text-gray-700">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="p-12 text-center text-gray-500">
          <DollarSign className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="font-medium">No commission data available</p>
          <p className="text-sm mt-1">Record receipts to see commission by income type</p>
        </div>
      )}
    </div>
  )
}

// ─── Aged Analysis Report ────────────────────────────────────────────────────

const bucketConfig = [
  { key: 'current', label: 'Current (0-30)', color: 'bg-green-500', textColor: 'text-green-700', bgLight: 'bg-green-50' },
  { key: 'days_31_60', label: '31-60 Days', color: 'bg-amber-500', textColor: 'text-amber-700', bgLight: 'bg-amber-50' },
  { key: 'days_61_90', label: '61-90 Days', color: 'bg-orange-500', textColor: 'text-orange-700', bgLight: 'bg-orange-50' },
  { key: 'days_91_120', label: '91-120 Days', color: 'bg-red-500', textColor: 'text-red-700', bgLight: 'bg-red-50' },
  { key: 'days_over_120', label: '120+ Days', color: 'bg-red-800', textColor: 'text-red-900', bgLight: 'bg-red-100' },
] as const

function AgedAnalysisReport() {
  const today = new Date().toISOString().split('T')[0]
  const [asOfDate, setAsOfDate] = useState(today)
  const [propertyFilter, setPropertyFilter] = useState<string>('')
  const [landlordFilter, setLandlordFilter] = useState<string>('')

  const { data: analysisData, isLoading, refetch } = useQuery({
    queryKey: ['aged-analysis', asOfDate, propertyFilter, landlordFilter],
    queryFn: () => reportsApi.agedAnalysis({
      as_of_date: asOfDate,
      ...(propertyFilter ? { property_id: Number(propertyFilter) } : {}),
      ...(landlordFilter ? { landlord_id: Number(landlordFilter) } : {}),
    }).then(r => r.data),
  })

  const { data: propertiesData } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () => propertyApi.list().then(r => r.data.results || r.data),
  })

  const { data: landlordsData } = useQuery({
    queryKey: ['landlords-list'],
    queryFn: () => landlordApi.list().then(r => r.data.results || r.data),
  })

  if (analysisData) currentReportData = analysisData

  const summary = analysisData?.summary || { total_outstanding: 0, total_overdue: 0, overdue_count: 0, current: 0, days_31_60: 0, days_61_90: 0, days_91_120: 0, days_over_120: 0 }
  // Map backend field names: backend by_tenant returns `31_60`, `61_90` etc — map to `days_31_60` etc.
  const tenants: any[] = (analysisData?.by_tenant || []).map((t: any) => ({
    ...t,
    current: t.current ?? t['0_30'] ?? 0,
    days_31_60: t.days_31_60 ?? t['31_60'] ?? 0,
    days_61_90: t.days_61_90 ?? t['61_90'] ?? 0,
    days_91_120: t.days_91_120 ?? t['91_120'] ?? 0,
    days_over_120: t.days_over_120 ?? t['over_120'] ?? 0,
  }))
  const properties: any[] = Array.isArray(propertiesData) ? propertiesData : []
  const landlords: any[] = Array.isArray(landlordsData) ? landlordsData : []

  const chartMax = useMemo(() => {
    const values = bucketConfig.map(b => (summary as any)[b.key] || 0)
    return Math.max(...values, 1)
  }, [summary])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">Filters:</span>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">As of Date</label>
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <AsyncSelect label="Property" placeholder="All Properties" value={propertyFilter} onChange={(val) => setPropertyFilter(String(val))} options={properties.map((p: any) => ({ value: p.id, label: p.name }))} searchable clearable className="min-w-[180px]" />
          <AsyncSelect label="Landlord" placeholder="All Landlords" value={landlordFilter} onChange={(val) => setLandlordFilter(String(val))} options={landlords.map((l: any) => ({ value: l.id, label: l.name }))} searchable clearable className="min-w-[180px]" />
          <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors mt-4">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Total Outstanding</p>
              {isLoading ? <div className="h-6 w-28 bg-gray-200 rounded animate-pulse" /> : <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.total_outstanding)}</p>}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Overdue Invoices</p>
              {isLoading ? <div className="h-6 w-28 bg-gray-200 rounded animate-pulse" /> : <p className="text-xl font-bold text-gray-900">{summary.overdue_count}</p>}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><Clock className="w-5 h-5 text-amber-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Total Overdue</p>
              {isLoading ? <div className="h-6 w-28 bg-gray-200 rounded animate-pulse" /> : <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.total_overdue)}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Aging Buckets Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Aging Buckets</h2>
        {isLoading ? (
          <div className="space-y-3">
            {bucketConfig.map((b, i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="w-32 text-sm text-gray-400 font-medium shrink-0">{b.label}</div>
                <div className="flex-1 h-8 bg-gray-100 rounded-lg" />
                <div className="w-28 shrink-0"><div className="h-4 w-20 bg-gray-200 rounded ml-auto" /></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {bucketConfig.map((bucket) => {
              const value = (summary as any)[bucket.key] || 0
              const percentage = chartMax > 0 ? (value / chartMax) * 100 : 0
              const totalPercentage = summary.total_outstanding > 0 ? (value / summary.total_outstanding) * 100 : 0
              return (
                <div key={bucket.key} className="flex items-center gap-4">
                  <div className="w-32 text-sm text-gray-600 font-medium shrink-0">{bucket.label}</div>
                  <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(percentage, 0.5)}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} className={cn("h-full rounded-lg", bucket.color)} />
                  </div>
                  <div className="w-28 text-right shrink-0">
                    <span className="text-sm font-semibold text-gray-900">{formatCurrency(value)}</span>
                    <span className="text-xs text-gray-400 ml-1">({totalPercentage.toFixed(0)}%)</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Tenant Breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Tenant Breakdown {tenants.length > 0 && <span className="text-sm font-normal text-gray-400">({tenants.length})</span>}</h2>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : tenants.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="font-medium">No outstanding balances</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tenant</th>
                  {bucketConfig.map(b => <th key={b.key} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{b.label}</th>)}
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tenants.sort((a: any, b: any) => b.total - a.total).map((tenant: any, idx: number) => (
                  <motion.tr key={tenant.tenant_id || idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{tenant.tenant_name}</td>
                    {bucketConfig.map(bucket => {
                      const val = tenant[bucket.key] || 0
                      return (
                        <td key={bucket.key} className={cn("px-4 py-3 text-sm text-right font-medium", val > 0 ? bucket.textColor : "text-gray-300")}>
                          {val > 0 ? <span className={cn("px-2 py-0.5 rounded", bucket.bgLight)}>{formatCurrency(val)}</span> : '—'}
                        </td>
                      )
                    })}
                    <td className="px-6 py-3 text-sm text-right font-bold text-gray-900">{formatCurrency(tenant.total)}</td>
                  </motion.tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="px-6 py-3 text-sm text-gray-900">Total</td>
                  {bucketConfig.map(bucket => {
                    const total = tenants.reduce((sum: number, t: any) => sum + (t[bucket.key] || 0), 0)
                    return <td key={bucket.key} className={cn("px-4 py-3 text-sm text-right", bucket.textColor)}>{formatCurrency(total)}</td>
                  })}
                  <td className="px-6 py-3 text-sm text-right text-gray-900">{formatCurrency(summary.total_outstanding)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tenant Account Report ───────────────────────────────────────────────────

function TenantAccountReport() {
  const [selectedTenant, setSelectedTenant] = useState<string>('')

  const { data: tenantsData } = useQuery({
    queryKey: ['tenants-list'],
    queryFn: () => tenantApi.list().then(r => r.data.results || r.data),
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tenant-account', selectedTenant],
    queryFn: () => reportsApi.tenantAccount({ tenant_id: Number(selectedTenant) }).then(r => r.data),
    enabled: !!selectedTenant,
  })

  if (data) currentReportData = data

  const tenantsList: any[] = Array.isArray(tenantsData) ? tenantsData : []
  const transactions = data?.transactions || []
  const summary = data?.summary || {}

  return (
    <div className="space-y-4">
      {/* Tenant selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <AsyncSelect label="Tenant" placeholder="Select a tenant..." value={selectedTenant} onChange={(val) => setSelectedTenant(String(val))} options={tenantsList.map((t: any) => ({ value: t.id, label: `${t.code ? t.code + ' - ' : ''}${t.name}` }))} searchable className="min-w-[280px]" />
          {selectedTenant && (
            <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors mt-4">
              <RefreshCw className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {!selectedTenant ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          <Users className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="font-medium">Select a tenant to view their account</p>
        </div>
      ) : isLoading ? <SkeletonReport /> : data ? (
        <>
          {/* Tenant info + summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Invoiced</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.total_invoiced || 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Paid</p>
              <p className="text-xl font-bold text-emerald-600">{formatCurrency(summary.total_paid || 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Current Balance</p>
              <p className="text-xl font-bold text-rose-600">{formatCurrency(summary.current_balance || 0)}</p>
            </div>
          </div>

          {/* Transaction table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Transactions <span className="text-sm font-normal text-gray-400">({transactions.length})</span></h2>
            </div>
            {transactions.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <FileText className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <p className="font-medium">No transactions found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reference</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Debit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Credit</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactions.map((txn: any, idx: number) => (
                      <motion.tr key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.01 }} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 text-sm text-gray-600">{txn.date}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={cn('px-2 py-0.5 rounded text-xs font-medium', txn.type === 'invoice' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700')}>
                            {txn.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-primary-600">{txn.reference}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate">{txn.description}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums">{txn.debit > 0 ? <span className="text-blue-600">{formatCurrency(txn.debit)}</span> : <span className="text-gray-300">-</span>}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums">{txn.credit > 0 ? <span className="text-emerald-600">{formatCurrency(txn.credit)}</span> : <span className="text-gray-300">-</span>}</td>
                        <td className="px-6 py-3 text-sm text-right font-bold tabular-nums text-gray-900">{formatCurrency(txn.balance)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}

// ─── Landlord Account Report ─────────────────────────────────────────────────

function LandlordAccountReport() {
  const [selectedLandlord, setSelectedLandlord] = useState<string>('')

  const { data: landlordsData } = useQuery({
    queryKey: ['landlords-list'],
    queryFn: () => landlordApi.list().then(r => r.data.results || r.data),
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['landlord-account', selectedLandlord],
    queryFn: () => reportsApi.landlordStatement({ landlord_id: Number(selectedLandlord) }).then(r => r.data),
    enabled: !!selectedLandlord,
  })

  if (data) currentReportData = data

  const landlordsList: any[] = Array.isArray(landlordsData) ? landlordsData : []
  const transactions = data?.transactions || []
  const summary = data?.summary || {}

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <AsyncSelect label="Landlord" placeholder="Select a landlord..." value={selectedLandlord} onChange={(val) => setSelectedLandlord(String(val))} options={landlordsList.map((l: any) => ({ value: l.id, label: `${l.code ? l.code + ' - ' : ''}${l.name}` }))} searchable className="min-w-[280px]" />
          {selectedLandlord && (
            <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors mt-4">
              <RefreshCw className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {!selectedLandlord ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          <PiBuildingApartmentLight className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="font-medium">Select a landlord to view their statement</p>
        </div>
      ) : isLoading ? <SkeletonReport /> : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Invoiced</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.total_invoiced || 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Collected</p>
              <p className="text-xl font-bold text-emerald-600">{formatCurrency(summary.total_collected || 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Commission ({summary.commission_rate || 0}%)</p>
              <p className="text-xl font-bold text-indigo-600">{formatCurrency(summary.commission_amount || 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Net Payable</p>
              <p className="text-xl font-bold text-primary-600">{formatCurrency(summary.net_payable || 0)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Transactions <span className="text-sm font-normal text-gray-400">({transactions.length})</span></h2>
            </div>
            {transactions.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <FileText className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <p className="font-medium">No transactions found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reference</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Property</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Unit</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tenant</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Debit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Credit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactions.map((txn: any, idx: number) => (
                      <motion.tr key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.01 }} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-600">{txn.date}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={cn('px-2 py-0.5 rounded text-xs font-medium', txn.type === 'invoice' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700')}>{txn.type}</span>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-primary-600">{txn.reference}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{txn.property}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{txn.unit}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{txn.tenant}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums">{txn.debit > 0 ? <span className="text-blue-600">{formatCurrency(txn.debit)}</span> : <span className="text-gray-300">-</span>}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums">{txn.credit > 0 ? <span className="text-emerald-600">{formatCurrency(txn.credit)}</span> : <span className="text-gray-300">-</span>}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold tabular-nums text-gray-900">{formatCurrency(txn.balance)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}

// ─── Bank to Income Report ───────────────────────────────────────────────────

function BankToIncomeReport() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['bank-to-income'],
    queryFn: () => reportsApi.incomeItemAnalysis().then(r => r.data),
  })

  if (data) currentReportData = data

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

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-pink-50 flex items-center justify-center"><Landmark className="w-5 h-5 text-pink-600" /></div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Bank to Income Analysis</h2>
            <p className="text-sm text-gray-500">Income distribution across bank accounts</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><RefreshCw className="w-5 h-5" /></button>
      </div>

      {isLoading ? (
        <div className="p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : matrix.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <Landmark className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="font-medium">No data available</p>
          <p className="text-sm mt-1">Record receipts to see bank vs income analysis</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Income Type</th>
                {bankColumns.map((col: any) => (
                  <th key={col.key} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{col.label}</th>
                ))}
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {matrix.map((row: any, idx: number) => (
                <motion.tr key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{row.income_type}</td>
                  {bankColumns.map((col: any) => {
                    const val = row[col.key] || 0
                    return (
                      <td key={col.key} className={cn("px-4 py-3 text-sm text-right font-semibold tabular-nums", heatColor(val))}>
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
      )}
    </div>
  )
}

// ─── Receipts Listing Report ─────────────────────────────────────────────────

function ReceiptsListingReport() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['receipts-listing'],
    queryFn: () => reportsApi.receiptListing().then(r => r.data),
  })

  if (data) currentReportData = data

  const receipts = data?.receipts || []

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-lime-50 flex items-center justify-center"><Receipt className="w-5 h-5 text-lime-600" /></div>
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
              {receipts.map((r: any, idx: number) => (
                <motion.tr key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.01 }} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-600">{r.date}</td>
                  <td className="px-4 py-3 text-sm font-mono text-primary-600">{r.receipt_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{r.tenant_name || r.tenant}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.property_name || r.property}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.unit_name || r.unit}</td>
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
      )}
    </div>
  )
}

// ─── Deposits Listing Report ─────────────────────────────────────────────────

function DepositsListingReport() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['deposits-listing'],
    queryFn: () => reportsApi.depositSummary().then(r => r.data),
  })

  if (data) currentReportData = data

  const deposits = data?.deposits || []
  const summary = data?.summary || {}

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
            <div className="w-10 h-10 rounded-lg bg-fuchsia-50 flex items-center justify-center"><CreditCard className="w-5 h-5 text-fuchsia-600" /></div>
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
                {deposits.map((d: any, idx: number) => (
                  <motion.tr key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-primary-600">{d.lease_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{d.tenant_name || d.tenant}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{d.property_name || d.property}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{d.unit_name || d.unit}</td>
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
        )}
      </div>
    </div>
  )
}

// ─── Lease Charge Summary Report ─────────────────────────────────────────────

function LeaseChargeSummaryReport() {
  const [propertyFilter, setPropertyFilter] = useState<string>('')
  const [landlordFilter, setLandlordFilter] = useState<string>('')

  const { data: propertiesData } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () => propertyApi.list().then(r => r.data.results || r.data),
  })

  const { data: landlordsData } = useQuery({
    queryKey: ['landlords-list'],
    queryFn: () => landlordApi.list().then(r => r.data.results || r.data),
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['lease-charges', propertyFilter, landlordFilter],
    queryFn: () => reportsApi.leaseCharges({
      ...(propertyFilter ? { property_id: Number(propertyFilter) } : {}),
      ...(landlordFilter ? { landlord_id: Number(landlordFilter) } : {}),
    }).then(r => r.data),
  })

  if (data) currentReportData = data

  const leases = data?.leases || []
  const summary = data?.summary || {}
  const properties: any[] = Array.isArray(propertiesData) ? propertiesData : []
  const landlords: any[] = Array.isArray(landlordsData) ? landlordsData : []

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">Filters:</span>
          </div>
          <AsyncSelect label="Property" placeholder="All Properties" value={propertyFilter} onChange={(val) => setPropertyFilter(String(val))} options={properties.map((p: any) => ({ value: p.id, label: p.name }))} searchable clearable className="min-w-[180px]" />
          <AsyncSelect label="Landlord" placeholder="All Landlords" value={landlordFilter} onChange={(val) => setLandlordFilter(String(val))} options={landlords.map((l: any) => ({ value: l.id, label: l.name }))} searchable clearable className="min-w-[180px]" />
          <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors mt-4"><RefreshCw className="w-5 h-5" /></button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Total Leases</p>
          {isLoading ? <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" /> : <p className="text-xl font-bold text-gray-900">{summary.total_leases || leases.length}</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Total Rent</p>
          {isLoading ? <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" /> : <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.total_rent || 0)}</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Other Charges</p>
          {isLoading ? <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" /> : <p className="text-xl font-bold text-amber-600">{formatCurrency(summary.total_other || 0)}</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Grand Total</p>
          {isLoading ? <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" /> : <p className="text-xl font-bold text-primary-600">{formatCurrency(summary.grand_total || 0)}</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-stone-50 flex items-center justify-center"><ClipboardList className="w-5 h-5 text-stone-600" /></div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Lease Charges</h2>
            {!isLoading && <p className="text-sm text-gray-500">{leases.length} leases</p>}
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : leases.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <ClipboardList className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="font-medium">No lease charges found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Lease #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tenant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Property</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Unit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Monthly Rent</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total Charged</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Paid</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leases.map((l: any, idx: number) => (
                  <motion.tr key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-primary-600">{l.lease_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{l.tenant_name || l.tenant}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{l.property_name || l.property}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{l.unit_name || l.unit}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums text-gray-900">{formatCurrency(l.monthly_rent || 0)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums text-gray-900">{formatCurrency(l.total_charged || 0)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums text-emerald-600">{formatCurrency(l.total_paid || l.paid || 0)}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold tabular-nums text-rose-600">{formatCurrency(l.balance || 0)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
