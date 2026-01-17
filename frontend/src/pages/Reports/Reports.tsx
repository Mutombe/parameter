import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
} from 'lucide-react'
import { reportsApi } from '../../services/api'
import { formatCurrency, formatPercent, cn } from '../../lib/utils'
import { printElement } from '../../lib/print'
import { exportReport } from '../../lib/export'
import { PageHeader, Button, Badge, Skeleton, EmptyState } from '../../components/ui'
import toast from 'react-hot-toast'

type ReportType = 'trial-balance' | 'income-statement' | 'balance-sheet' | 'cash-flow' | 'vacancy' | 'rent-roll'

// Store for current report data (for export)
let currentReportData: any = null
let currentReportType: ReportType = 'trial-balance'

const reports = [
  { id: 'trial-balance', name: 'Trial Balance', icon: Scale, desc: 'Verify accounts balance', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  { id: 'income-statement', name: 'Income Statement', icon: DollarSign, desc: 'Profit & Loss', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  { id: 'balance-sheet', name: 'Balance Sheet', icon: FileText, desc: 'Assets & Liabilities', color: 'text-purple-600', bgColor: 'bg-purple-50' },
  { id: 'cash-flow', name: 'Cash Flow', icon: Banknote, desc: 'Cash movements', color: 'text-cyan-600', bgColor: 'bg-cyan-50' },
  { id: 'vacancy', name: 'Vacancy Report', icon: Home, desc: 'Unit occupancy', color: 'text-amber-600', bgColor: 'bg-amber-50' },
  { id: 'rent-roll', name: 'Rent Roll', icon: Building2, desc: 'Active leases', color: 'text-rose-600', bgColor: 'bg-rose-50' },
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

export default function Reports() {
  const [activeReport, setActiveReport] = useState<ReportType>('trial-balance')
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  })

  const reportNames: Record<ReportType, string> = {
    'trial-balance': 'Trial Balance',
    'income-statement': 'Income Statement',
    'balance-sheet': 'Balance Sheet',
    'cash-flow': 'Cash Flow Statement',
    'vacancy': 'Vacancy Report',
    'rent-roll': 'Rent Roll',
  }

  const handlePrint = () => {
    printElement('report-content', {
      title: reportNames[activeReport],
      subtitle: `Generated on ${new Date().toLocaleDateString()}`,
      orientation: activeReport === 'rent-roll' ? 'landscape' : 'portrait',
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
        title="Financial Reports"
        subtitle="Accounting and operational reports"
        icon={BarChart3}
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

      {/* Report Selector */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {reports.map((report) => {
          const ReportIcon = report.icon
          const isActive = activeReport === report.id
          return (
            <motion.button
              key={report.id}
              whileHover={{ y: -2 }}
              onClick={() => setActiveReport(report.id as ReportType)}
              className={cn(
                'p-4 rounded-xl border text-left transition-all',
                isActive
                  ? 'bg-white border-primary-300 ring-2 ring-primary-100 shadow-lg'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              )}
            >
              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center mb-3',
                isActive ? 'bg-primary-100' : report.bgColor
              )}>
                <ReportIcon className={cn('w-5 h-5', isActive ? 'text-primary-600' : report.color)} />
              </div>
              <h3 className={cn('font-semibold text-sm', isActive ? 'text-primary-700' : 'text-gray-900')}>
                {report.name}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">{report.desc}</p>
            </motion.button>
          )
        })}
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
          {activeReport === 'vacancy' && <VacancyReport />}
          {activeReport === 'rent-roll' && <RentRollReport />}
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
                <p className="text-sm text-gray-500">As of {data?.as_of_date || new Date().toLocaleDateString()}</p>
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
