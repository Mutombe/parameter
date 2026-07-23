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

function TrialBalanceReport() {
  const { landlordId, propertyId, periodEnd, currency } = useReportFilters()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['trial-balance', landlordId, propertyId, periodEnd, currency],
    queryFn: () => reportsApi.trialBalance({
      ...(landlordId ? { landlord_id: Number(landlordId) } : {}),
      ...(currency ? { currency } : {}),
      ...(propertyId ? { property_id: Number(propertyId) } : {}),
      // Trial Balance is cumulative — balances "as at" the period end.
      ...(periodEnd ? { as_of_date: periodEnd } : {}),
    }).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  // Store data for export
  if (data) reportDataStore.data = data

  const isBalanced = data?.totals?.balanced

  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 25

  const allAccounts = data?.accounts || []
  const filteredAccounts = useMemo(() => {
    if (!searchQuery) return allAccounts
    const q = searchQuery.toLowerCase()
    return allAccounts.filter((acc: any) => {
      const code = (acc.code ?? acc.account_code ?? '').toString().toLowerCase()
      const name = (acc.name ?? acc.account_name ?? '').toString().toLowerCase()
      return code.includes(q) || name.includes(q)
    })
  }, [allAccounts, searchQuery])

  const totalPages = Math.ceil(filteredAccounts.length / pageSize)
  const paginatedAccounts = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredAccounts.slice(start, start + pageSize)
  }, [filteredAccounts, currentPage])

  useEffect(() => { setCurrentPage(1) }, [searchQuery])

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
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
      ) : allAccounts.length > 0 ? (
        <>
        <TableFilter searchPlaceholder="Search by code or name..." searchValue={searchQuery} onSearchChange={setSearchQuery} resultCount={filteredAccounts.length} />
        {/* Grouped accordions by account type — Assets / Liabilities /
            Equity / Revenue / Expenses. Each group shows its own debit /
            credit subtotal in the header so collapsed sections still
            communicate the section weight. */}
        <div className="p-6 space-y-3">
          {groupTrialBalance(filteredAccounts).map(group => {
            const groupDr = sumRows(group.rows, 'debit')
            const groupCr = sumRows(group.rows, 'credit')
            return (
              <Accordion
                key={group.key}
                title={group.label}
                right={
                  <span className="flex items-center gap-4 text-xs tabular-nums">
                    <span className="text-blue-600 font-semibold">Dr {formatCurrency(groupDr)}</span>
                    <span className="text-rose-600 font-semibold">Cr {formatCurrency(groupCr)}</span>
                  </span>
                }
              >
                <table className="w-full">
                  <thead className="bg-gray-50/60">
                    <tr>
                      <th className="px-5 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em] w-20">Code</th>
                      <th className="px-5 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em]">Account</th>
                      <th className="px-5 py-2 text-right text-[10px] font-semibold text-blue-700 uppercase tracking-[0.1em]">Debit</th>
                      <th className="px-5 py-2 text-right text-[10px] font-semibold text-rose-700 uppercase tracking-[0.1em]">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {group.rows.map((acc: any, idx: number) => (
                      <tr key={`${acc.code}-${idx}`} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-2">
                          <span className="font-mono text-xs text-gray-500">{acc.code ?? acc.account_code ?? '—'}</span>
                        </td>
                        <td className="px-5 py-2 text-sm text-gray-700 truncate" title={acc.name}>
                          {acc.name ?? acc.account_name ?? '—'}
                        </td>
                        <td className="px-5 py-2 text-right tabular-nums">
                          {acc.debit > 0
                            ? <span className="text-sm font-semibold text-blue-600">{formatCurrency(acc.debit)}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-2 text-right tabular-nums">
                          {acc.credit > 0
                            ? <span className="text-sm font-semibold text-rose-600">{formatCurrency(acc.credit)}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Accordion>
            )
          })}

          {/* Grand total — always visible, sits outside accordions so the
              balance check is one glance away. */}
          <div className="mt-4 rounded-xl bg-gray-900 text-white px-5 py-3 flex justify-between font-bold">
            <span>Total</span>
            <span className="flex items-center gap-6 tabular-nums">
              <span>Dr {formatCurrency(data?.totals?.debits || 0)}</span>
              <span>Cr {formatCurrency(data?.totals?.credits || 0)}</span>
            </span>
          </div>
        </div>
        </>
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

export { TrialBalanceReport }
