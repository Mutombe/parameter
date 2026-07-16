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

function VacancyReport() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['vacancy-report'],
    queryFn: () => reportsApi.vacancy().then(r => r.data),
    placeholderData: keepPreviousData,
  })

  // Store data for export
  if (data) reportDataStore.data = data

  const overallVacancy = data?.summary?.overall_vacancy_rate || 0

  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 25

  const allProperties = data?.properties || []
  const filteredProperties = useMemo(() => {
    if (!searchQuery) return allProperties
    const q = searchQuery.toLowerCase()
    return allProperties.filter((prop: any) =>
      prop.name?.toLowerCase().includes(q) ||
      prop.landlord?.toLowerCase().includes(q)
    )
  }, [allProperties, searchQuery])

  const totalPages = Math.ceil(filteredProperties.length / pageSize)
  const paginatedProperties = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredProperties.slice(start, start + pageSize)
  }, [filteredProperties, currentPage])

  useEffect(() => { setCurrentPage(1) }, [searchQuery])

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
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
      ) : allProperties.length > 0 ? (
        <>
        <TableFilter searchPlaceholder="Search by property or landlord..." searchValue={searchQuery} onSearchChange={setSearchQuery} resultCount={filteredProperties.length} />
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
              {paginatedProperties.map((prop: any, idx: number) => (
                <motion.tr
                  key={prop.property_id || idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 font-medium">
                    {prop.property_id ? (
                      <button onClick={() => navigate(`/dashboard/properties/${prop.property_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{prop.name}</button>
                    ) : (
                      <span className="text-gray-900">{prop.name}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {prop.landlord_id ? (
                      <button onClick={() => navigate(`/dashboard/landlords/${prop.landlord_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{prop.landlord}</button>
                    ) : (
                      <span className="text-gray-600">{prop.landlord}</span>
                    )}
                  </td>
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
        <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredProperties.length} pageSize={pageSize} onPageChange={setCurrentPage} showPageSize={false} />
        </>
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

function RentRolloverReport() {
  const navigate = useNavigate()
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])

  const [drillState, setDrillState] = useState<{
    level: 1 | 2
    propertyId?: number
    propertyName?: string
    landlordName?: string
    currency?: string
  }>({ level: 1 })

  // Level 1 query
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['rent-rollover', startDate, endDate],
    queryFn: () => reportsApi.rentRollover({ start_date: startDate, end_date: endDate }).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  // Level 2 query
  const { data: l2Data, isLoading: l2Loading } = useQuery({
    queryKey: ['rent-rollover-l2', drillState.propertyId, startDate, endDate],
    queryFn: () => reportsApi.rentRollover({ start_date: startDate, end_date: endDate, property_id: drillState.propertyId! }).then(r => r.data),
    enabled: drillState.level === 2 && !!drillState.propertyId,
    placeholderData: keepPreviousData,
  })

  if (data) reportDataStore.data = data

  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 25

  useEffect(() => { setCurrentPage(1) }, [searchQuery])
  useEffect(() => { setSearchQuery(''); setCurrentPage(1) }, [drillState.level, drillState.propertyId])

  // Breadcrumb
  const Breadcrumb = () => {
    if (drillState.level === 1) return null
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 px-6 pt-4">
        <button onClick={() => setDrillState({ level: 1 })} className="hover:text-gray-900 hover:underline transition-colors">
          Property Summary
        </button>
        <span>/</span>
        <span className="text-gray-900 font-medium">{drillState.propertyName}</span>
      </div>
    )
  }

  const carriedForwardColor = (value: number) =>
    value < 0 ? 'text-emerald-600' : value > 0 ? 'text-red-600' : 'text-gray-900'

  // Level 2 rendering
  const renderLevel2 = () => {
    if (l2Loading) return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
      </div>
    )
    const leases = l2Data?.leases || []
    if (leases.length === 0) return (
      <div className="p-12 text-center text-gray-500">
        <Building2 className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="font-medium">No lease data found</p>
        <p className="text-sm mt-1">No active leases for this property in the selected period</p>
      </div>
    )

    const filteredLeases = searchQuery
      ? leases.filter((l: any) =>
          l.tenant_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.lease_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.unit_number?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : leases
    const totalPages = Math.ceil(filteredLeases.length / pageSize)
    const paginated = filteredLeases.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    const summary = l2Data?.summary || {}

    return (
      <>
        <div className="px-6 pt-4 pb-2 text-sm text-gray-500">
          <span className="font-medium text-gray-700">{drillState.landlordName}</span> &middot; {drillState.propertyName} &middot; {l2Data?.currency || ''} &middot; {startDate} to {endDate}
        </div>
        <TableFilter searchPlaceholder="Search by tenant, lease#, or unit..." searchValue={searchQuery} onSearchChange={setSearchQuery} resultCount={filteredLeases.length} />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Lease #</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tenant</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance B/F</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Charged</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Due</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Paid</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Carried Forward</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((lease: any, idx: number) => (
                <motion.tr key={lease.lease_id || idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <button onClick={() => navigate(`/dashboard/leases/${lease.lease_id}`)} className="font-mono text-sm font-semibold text-primary-600 hover:text-primary-700 hover:underline">{lease.lease_number}</button>
                  </td>
                  <td className="px-6 py-4 font-medium">
                    <button onClick={() => navigate(`/dashboard/tenants/${lease.tenant_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{lease.tenant_name}</button>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => navigate(`/dashboard/units/${lease.unit_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{lease.unit_number}</button>
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums text-gray-900">{formatCurrency(lease.balance_bf)}</td>
                  <td className="px-6 py-4 text-right tabular-nums text-gray-900">{formatCurrency(lease.amount_charged)}</td>
                  <td className="px-6 py-4 text-right tabular-nums font-semibold text-gray-900">{formatCurrency(lease.amount_due)}</td>
                  <td className="px-6 py-4 text-right tabular-nums text-gray-900">{formatCurrency(lease.amount_paid)}</td>
                  <td className={cn('px-6 py-4 text-right tabular-nums font-semibold', carriedForwardColor(lease.carried_forward))}>{formatCurrency(lease.carried_forward)}</td>
                </motion.tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr className="font-bold">
                <td colSpan={3} className="px-6 py-4 text-gray-700">Total</td>
                <td className="px-6 py-4 text-right tabular-nums text-gray-900">{formatCurrency(summary.total_balance_bf || 0)}</td>
                <td className="px-6 py-4 text-right tabular-nums text-gray-900">{formatCurrency(summary.total_charged || 0)}</td>
                <td className="px-6 py-4 text-right tabular-nums font-semibold text-gray-900">{formatCurrency(summary.total_due || 0)}</td>
                <td className="px-6 py-4 text-right tabular-nums text-gray-900">{formatCurrency(summary.total_paid || 0)}</td>
                <td className={cn('px-6 py-4 text-right tabular-nums font-semibold', carriedForwardColor(summary.total_carried_forward || 0))}>{formatCurrency(summary.total_carried_forward || 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredLeases.length} pageSize={pageSize} onPageChange={setCurrentPage} showPageSize={false} />
      </>
    )
  }

  // Level 1 rendering
  const properties = data?.properties || []
  const filteredProperties = useMemo(() => {
    if (!searchQuery || drillState.level !== 1) return properties
    const q = searchQuery.toLowerCase()
    return properties.filter((p: any) =>
      p.property_name?.toLowerCase().includes(q) ||
      p.landlord_name?.toLowerCase().includes(q)
    )
  }, [properties, searchQuery, drillState.level])

  const l1TotalPages = Math.ceil(filteredProperties.length / pageSize)
  const paginatedProperties = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredProperties.slice(start, start + pageSize)
  }, [filteredProperties, currentPage])

  const summary = data?.summary || {}

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center">
            <ArrowRight className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Rent Rollover</h2>
            <p className="text-sm text-gray-500">Period balance movements</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">From</label>
            <DatePicker value={startDate} onChange={v => setStartDate(v)} className="min-w-[160px]" />
            <label className="text-sm text-gray-500">To</label>
            <DatePicker value={endDate} onChange={v => setEndDate(v)} className="min-w-[160px]" />
          </div>
          <button onClick={() => { setDrillState({ level: 1 }); refetch() }} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      <Breadcrumb />

      {drillState.level === 2 ? renderLevel2() : (
        <>
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : properties.length > 0 ? (
            <>
              <TableFilter searchPlaceholder="Search by property or landlord..." searchValue={searchQuery} onSearchChange={setSearchQuery} resultCount={filteredProperties.length} />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Property</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Landlord</th>
                      <th className="px-4 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Leases</th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance B/F</th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Charged</th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Due</th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Paid</th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Carried Forward</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedProperties.map((prop: any, idx: number) => (
                      <motion.tr key={prop.property_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium">
                          <button onClick={() => setDrillState({ level: 2, propertyId: prop.property_id, propertyName: prop.property_name, landlordName: prop.landlord_name, currency: prop.currency })} className="text-primary-600 hover:text-primary-700 hover:underline">{prop.property_name}</button>
                        </td>
                        <td className="px-6 py-4 text-gray-600">{prop.landlord_name}</td>
                        <td className="px-4 py-4 text-right tabular-nums text-gray-600">{prop.lease_count}</td>
                        <td className="px-6 py-4 text-right tabular-nums text-gray-900">{formatCurrency(prop.balance_bf)}</td>
                        <td className="px-6 py-4 text-right tabular-nums text-gray-900">{formatCurrency(prop.amount_charged)}</td>
                        <td className="px-6 py-4 text-right tabular-nums font-semibold text-gray-900">{formatCurrency(prop.amount_due)}</td>
                        <td className="px-6 py-4 text-right tabular-nums text-gray-900">{formatCurrency(prop.amount_paid)}</td>
                        <td className={cn('px-6 py-4 text-right tabular-nums font-semibold', carriedForwardColor(prop.carried_forward))}>{formatCurrency(prop.carried_forward)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                    <tr className="font-bold">
                      <td colSpan={3} className="px-6 py-4 text-gray-700">Total</td>
                      <td className="px-6 py-4 text-right tabular-nums text-gray-900">{formatCurrency(summary.total_balance_bf || 0)}</td>
                      <td className="px-6 py-4 text-right tabular-nums text-gray-900">{formatCurrency(summary.total_charged || 0)}</td>
                      <td className="px-6 py-4 text-right tabular-nums font-semibold text-gray-900">{formatCurrency(summary.total_due || 0)}</td>
                      <td className="px-6 py-4 text-right tabular-nums text-gray-900">{formatCurrency(summary.total_paid || 0)}</td>
                      <td className={cn('px-6 py-4 text-right tabular-nums font-semibold', carriedForwardColor(summary.total_carried_forward || 0))}>{formatCurrency(summary.total_carried_forward || 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <Pagination currentPage={currentPage} totalPages={l1TotalPages} totalItems={filteredProperties.length} pageSize={pageSize} onPageChange={setCurrentPage} showPageSize={false} />
            </>
          ) : (
            <div className="p-12 text-center text-gray-500">
              <ArrowRight className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="font-medium">No rollover data found</p>
              <p className="text-sm mt-1">No active leases with invoices in the selected period</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}


const bucketConfig = [
  { key: 'current', label: 'Current (0-30)', color: 'bg-green-500', textColor: 'text-green-700', bgLight: 'bg-green-50' },
  { key: 'days_31_60', label: '31-60 Days', color: 'bg-amber-500', textColor: 'text-amber-700', bgLight: 'bg-amber-50' },
  { key: 'days_61_90', label: '61-90 Days', color: 'bg-orange-500', textColor: 'text-orange-700', bgLight: 'bg-orange-50' },
  { key: 'days_91_120', label: '91-120 Days', color: 'bg-red-500', textColor: 'text-red-700', bgLight: 'bg-red-50' },
  { key: 'days_over_120', label: '120+ Days', color: 'bg-red-800', textColor: 'text-red-900', bgLight: 'bg-red-100' },
] as const

function AgedAnalysisReport() {
  const navigate = useNavigate()
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
    placeholderData: keepPreviousData,
  })

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

  if (analysisData) reportDataStore.data = analysisData

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

  const [tenantSearch, setTenantSearch] = useState('')
  const [tenantPage, setTenantPage] = useState(1)
  const tenantPageSize = 25

  const filteredTenants = useMemo(() => {
    if (!tenantSearch) return tenants
    const q = tenantSearch.toLowerCase()
    return tenants.filter((t: any) => t.tenant_name?.toLowerCase().includes(q))
  }, [tenants, tenantSearch])

  const tenantTotalPages = Math.ceil(filteredTenants.length / tenantPageSize)
  const paginatedTenants = useMemo(() => {
    const start = (tenantPage - 1) * tenantPageSize
    return filteredTenants.slice(start, start + tenantPageSize)
  }, [filteredTenants, tenantPage])

  useEffect(() => { setTenantPage(1) }, [tenantSearch])

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
            <DatePicker value={asOfDate} onChange={(v) => setAsOfDate(v)} className="min-w-[180px]" />
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
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Total Outstanding</p>
              {isLoading ? <div className="h-6 w-28 bg-gray-200 rounded animate-pulse" /> : <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.total_outstanding)}</p>}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Overdue Invoices</p>
              {isLoading ? <div className="h-6 w-28 bg-gray-200 rounded animate-pulse" /> : <p className="text-xl font-bold text-gray-900">{summary.overdue_count}</p>}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center"><Clock className="w-5 h-5 text-amber-600" /></div>
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
          <>
          <TableFilter searchPlaceholder="Search by tenant name..." searchValue={tenantSearch} onSearchChange={setTenantSearch} resultCount={filteredTenants.length} />
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
                {paginatedTenants.sort((a: any, b: any) => b.total - a.total).map((tenant: any, idx: number) => (
                  <motion.tr key={tenant.tenant_id || idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-sm font-medium">
                      {tenant.tenant_id ? (
                        <button onClick={() => navigate(`/dashboard/tenants/${tenant.tenant_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{tenant.tenant_name}</button>
                      ) : (
                        <span className="text-gray-900">{tenant.tenant_name}</span>
                      )}
                    </td>
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
          <Pagination currentPage={tenantPage} totalPages={tenantTotalPages} totalItems={filteredTenants.length} pageSize={tenantPageSize} onPageChange={setTenantPage} showPageSize={false} />
          </>
        )}
      </div>
    </div>
  )
}

// ─── Tenant Account Report ───────────────────────────────────────────────────


function LeaseChargeSummaryReport() {
  const navigate = useNavigate()
  const [propertyFilter, setPropertyFilter] = useState<string>('')
  const [landlordFilter, setLandlordFilter] = useState<string>('')

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

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['lease-charges', propertyFilter, landlordFilter],
    queryFn: () => reportsApi.leaseCharges({
      ...(propertyFilter ? { property_id: Number(propertyFilter) } : {}),
      ...(landlordFilter ? { landlord_id: Number(landlordFilter) } : {}),
    }).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  if (data) reportDataStore.data = data

  const charges: any[] = data?.charges || []
  const summary: any = data?.summary || {}
  const properties: any[] = Array.isArray(propertiesData) ? propertiesData : []
  const landlords: any[] = Array.isArray(landlordsData) ? landlordsData : []

  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 25

  const filteredCharges = useMemo(() => {
    if (!searchQuery) return charges
    const q = searchQuery.toLowerCase()
    return charges.filter((c: any) =>
      (c.tenant || '').toLowerCase().includes(q) ||
      (c.property || '').toLowerCase().includes(q) ||
      (c.unit || '').toLowerCase().includes(q) ||
      String(c.lease_id).includes(q)
    )
  }, [charges, searchQuery])

  const totalPages = Math.ceil(filteredCharges.length / pageSize)
  const paginatedCharges = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredCharges.slice(start, start + pageSize)
  }, [filteredCharges, currentPage])

  useEffect(() => { setCurrentPage(1) }, [searchQuery])

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
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Total Leases</p>
          {isLoading ? <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" /> : <p className="text-xl font-bold text-gray-900">{summary.total_leases || charges.length}</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Total Charge Amount</p>
          {isLoading ? <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" /> : <p className="text-xl font-bold text-primary-600">{formatCurrency(summary.total_charge_amount || 0)}</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-stone-50 dark:bg-stone-900/30 flex items-center justify-center"><ClipboardList className="w-5 h-5 text-stone-600" /></div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Lease Charge Summary</h2>
            {!isLoading && <p className="text-sm text-gray-500">Masterfile billing configuration &mdash; {charges.length} leases</p>}
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : charges.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <ClipboardList className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="font-medium">No lease charges found</p>
          </div>
        ) : (
          <>
          <TableFilter searchPlaceholder="Search by tenant, property, unit, or lease ID..." searchValue={searchQuery} onSearchChange={setSearchQuery} resultCount={filteredCharges.length} />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Lease ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Property</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tenant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Charge Type</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Currency</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Charge Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Commission %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedCharges.map((c: any, idx: number) => (
                  <motion.tr key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono">
                      <button onClick={() => navigate(`/dashboard/leases/${c.lease_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{c.lease_id}</button>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button onClick={() => navigate(`/dashboard/properties/${c.property_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{c.property}</button>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button onClick={() => navigate(`/dashboard/tenants/${c.tenant_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{c.tenant}</button>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Badge className={c.charge_type === 'Levy' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}>{c.charge_type}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-center font-medium text-gray-700">{c.charge_currency}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums text-gray-900">{formatCurrency(c.charge_amount || 0)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums text-amber-700">{formatPercent((c.charge_commission || 0) / 100)}</td>
                  </motion.tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                  <td colSpan={5} className="px-4 py-3 text-sm text-gray-900">Total</td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-900">{formatCurrency(summary.total_charge_amount || 0)}</td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums text-amber-700">
                    {charges.length > 0 ? formatPercent((charges.reduce((s: number, c: any) => s + (c.charge_commission || 0), 0) / charges.length) / 100) : '-'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredCharges.length} pageSize={pageSize} onPageChange={setCurrentPage} showPageSize={false} />
          </>
        )}
      </div>
    </div>
  )
}

// ─── Income & Expenditure Report ────────────────────────────────────────────

export { VacancyReport, RentRolloverReport, AgedAnalysisReport, LeaseChargeSummaryReport }
