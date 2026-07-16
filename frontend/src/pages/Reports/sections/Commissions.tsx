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

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#3b82f6']

function CommissionByPropertyReport() {
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['commission-property'],
    queryFn: () => reportsApi.commission().then(r => r.data),
    placeholderData: keepPreviousData,
  })

  if (data) reportDataStore.data = data

  const totalCommission = data?.summary?.total_commission || 0
  const properties = data?.by_property || []

  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 25

  const [drillState, setDrillState] = useState<{
    level: 1 | 2; propertyId?: number; propertyName?: string
  }>({ level: 1 })

  // Level 2 query
  const { data: l2Data, isLoading: l2Loading } = useQuery({
    queryKey: ['commission-property-l2', drillState.propertyId],
    queryFn: () => reportsApi.commissionPropertyDrilldown({ property_id: drillState.propertyId! }).then(r => r.data),
    enabled: drillState.level === 2 && !!drillState.propertyId,
    placeholderData: keepPreviousData,
  })

  const filteredProperties = useMemo(() => {
    if (!searchQuery) return properties
    const q = searchQuery.toLowerCase()
    return properties.filter((prop: any) =>
      prop.property_name?.toLowerCase().includes(q) ||
      prop.landlord_name?.toLowerCase().includes(q)
    )
  }, [properties, searchQuery])

  const totalPages = Math.ceil(filteredProperties.length / pageSize)
  const paginatedProperties = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredProperties.slice(start, start + pageSize)
  }, [filteredProperties, currentPage])

  useEffect(() => { setCurrentPage(1) }, [searchQuery])
  useEffect(() => { setSearchQuery(''); setCurrentPage(1) }, [drillState.level, drillState.propertyId])

  // Breadcrumb
  const Breadcrumb = () => {
    if (drillState.level === 1) return null
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 px-6 pt-4">
        <button onClick={() => setDrillState({ level: 1 })} className="hover:text-gray-900 hover:underline transition-colors">
          Commission by Property
        </button>
        <span>/</span>
        <span className="text-gray-900 font-medium">{drillState.propertyName}</span>
      </div>
    )
  }

  // Level 2: Revenue type breakdown
  const renderLevel2 = () => {
    if (l2Loading) return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
      </div>
    )
    const revenueTypes = l2Data?.revenue_types || []
    if (revenueTypes.length === 0) return (
      <div className="p-12 text-center text-gray-500">
        <PiBuildingApartmentLight className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="font-medium">No revenue data found</p>
        <p className="text-sm mt-1">No receipts for this property</p>
      </div>
    )
    const l2Summary = l2Data?.summary || {}
    return (
      <>
        <div className="px-6 pt-4 pb-2 text-sm text-gray-500">
          <span className="font-medium text-gray-700">{l2Data?.landlord_name}</span> &middot; {l2Data?.property_name} &middot; Commission Rate: <span className="font-medium text-indigo-700">{l2Data?.commission_rate}%</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue Type</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Rate</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Commission</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">% of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {revenueTypes.map((rt: any, idx: number) => (
                <motion.tr key={rt.revenue_type} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{rt.revenue_type_display}</td>
                  <td className="px-6 py-4 text-right font-semibold text-gray-900 tabular-nums">{formatCurrency(rt.revenue)}</td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-sm font-medium">{rt.commission_rate}%</span>
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-indigo-600 tabular-nums">{formatCurrency(rt.commission)}</td>
                  <td className="px-6 py-4 text-right text-sm text-gray-600">{rt.percentage?.toFixed(1)}%</td>
                </motion.tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr className="font-bold">
                <td className="px-6 py-4 text-gray-700">Total</td>
                <td className="px-6 py-4 text-right text-gray-900 tabular-nums">{formatCurrency(l2Summary.total_revenue || 0)}</td>
                <td className="px-6 py-4 text-right" />
                <td className="px-6 py-4 text-right text-indigo-700 tabular-nums">{formatCurrency(l2Summary.total_commission || 0)}</td>
                <td className="px-6 py-4 text-right text-gray-700">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
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
          <button onClick={() => { setDrillState({ level: 1 }); refetch() }} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className="w-5 h-5" />
          </button>
          {!isLoading && (
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
              <DollarSign className="w-4 h-4" />
              {formatCurrency(totalCommission)}
            </span>
          )}
        </div>
      </div>

      <Breadcrumb />

      {drillState.level === 2 ? renderLevel2() : (
        <>
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
            <>
            <TableFilter searchPlaceholder="Search by property or landlord..." searchValue={searchQuery} onSearchChange={setSearchQuery} resultCount={filteredProperties.length} />
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
                  {paginatedProperties.map((prop: any, idx: number) => (
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
                      <td className="px-6 py-4 font-medium">
                        <button onClick={() => setDrillState({ level: 2, propertyId: prop.property_id, propertyName: prop.property_name })} className="text-primary-600 hover:text-primary-700 hover:underline">{prop.property_name}</button>
                      </td>
                      <td className="px-6 py-4">
                        {prop.landlord_id ? (
                          <button onClick={() => navigate(`/dashboard/landlords/${prop.landlord_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{prop.landlord_name}</button>
                        ) : (
                          <span className="text-gray-600">{prop.landlord_name}</span>
                        )}
                      </td>
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
            <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredProperties.length} pageSize={pageSize} onPageChange={setCurrentPage} showPageSize={false} />
            </>
          ) : (
            <div className="p-12 text-center text-gray-500">
              <PiBuildingApartmentLight className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="font-medium">No commission data available</p>
              <p className="text-sm mt-1">Record receipts to see commission by property</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CommissionByIncomeReport() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['commission-income'],
    queryFn: () => reportsApi.commissionAnalysis().then(r => r.data),
    placeholderData: keepPreviousData,
  })

  if (data) reportDataStore.data = data

  const totalCommission = data?.summary?.total_commission || 0
  const incomeTypes = data?.by_income_type || []

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center">
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
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">
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

export { CommissionByPropertyReport, CommissionByIncomeReport }
