import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Edit2,
  DoorOpen,
  Home,
  DollarSign,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Bed,
  Bath,
  Square,
  Layers,
  FileText,
  Plus,
  BarChart3,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { unitApi, leaseApi, invoiceApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { Button, TableFilter, Modal } from '../../components/ui'
import { TbUserSquareRounded } from 'react-icons/tb'
import { PiBuildingApartmentLight } from 'react-icons/pi'
import { usePagination } from '../../hooks/usePagination'
import { usePrefetch } from '../../hooks/usePrefetch'
import LeaseForm from '../../components/forms/LeaseForm'
import { showToast, parseApiError } from '../../lib/toast'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

const unitTypeLabels: Record<string, string> = {
  studio: 'Studio',
  apartment: 'Apartment',
  '1bed': '1 Bedroom',
  '2bed': '2 Bedroom',
  '3bed': '3 Bedroom',
  house: 'House',
  commercial: 'Commercial',
  office: 'Office',
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  color: 'blue' | 'green' | 'purple' | 'orange'
  isLoading?: boolean
  valueClassName?: string
}

const colorConfig = {
  blue: { bg: 'bg-blue-50', icon: 'bg-blue-500', text: 'text-blue-600' },
  green: { bg: 'bg-emerald-50', icon: 'bg-emerald-500', text: 'text-emerald-600' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-500', text: 'text-purple-600' },
  orange: { bg: 'bg-orange-50', icon: 'bg-orange-500', text: 'text-orange-600' },
}

function StatCard({ title, value, subtitle, icon: Icon, color, isLoading, valueClassName }: StatCardProps) {
  const colors = colorConfig[color]
  return (
    <motion.div
      variants={item}
      className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 hover:shadow-lg hover:border-gray-300 transition-all duration-300"
    >
      <div className="flex items-start justify-between">
        <div className={cn('p-2 md:p-3 rounded-xl', colors.bg)}>
          <div className={cn('p-1.5 md:p-2 rounded-lg', colors.icon)}>
            <Icon className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
        </div>
      </div>
      <div className="mt-3 md:mt-4">
        {isLoading ? (
          <div className="h-8 md:h-9 w-20 md:w-24 bg-gray-200 rounded animate-pulse" />
        ) : (
          <h3 className={cn("text-2xl md:text-3xl font-bold text-gray-900 tabular-nums", valueClassName)}>{value}</h3>
        )}
        <p className="text-xs md:text-sm text-gray-500 mt-1">{title}</p>
        {isLoading ? (
          <div className="h-3 md:h-4 w-16 md:w-20 bg-gray-200 rounded animate-pulse mt-1" />
        ) : subtitle ? (
          <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
        ) : null}
      </div>
    </motion.div>
  )
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex gap-4 animate-pulse">
          <div className="h-4 flex-[2] bg-gray-200 rounded" />
          <div className="h-4 flex-1 bg-gray-200 rounded" />
          <div className="h-4 flex-1 bg-gray-200 rounded" />
          <div className="h-4 flex-1 bg-gray-200 rounded" />
          <div className="h-4 flex-1 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="w-full h-full flex flex-col justify-end gap-2 px-4 pb-4">
      <div className="flex items-end gap-3 h-full">
        {[40, 55, 65, 50, 70, 60, 75].map((h, i) => (
          <div key={i} className="flex-1 flex flex-col gap-1 justify-end h-full">
            <div
              className="w-full bg-gray-200 rounded-t animate-pulse"
              style={{ height: `${h}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-3 w-8 bg-gray-200 rounded animate-pulse" />
        ))}
      </div>
    </div>
  )
}

export default function UnitDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const unitId = Number(id)
  const prefetch = usePrefetch()
  const queryClient = useQueryClient()

  // Create Lease modal
  const [showLeaseModal, setShowLeaseModal] = useState(false)

  const { data: unit, isLoading: loadingUnit } = useQuery({
    queryKey: ['unit', unitId],
    queryFn: () => unitApi.get(unitId).then((r) => r.data),
    enabled: !!unitId,
  })

  const { data: leasesData, isLoading: loadingLeases } = useQuery({
    queryKey: ['unit-leases', unitId],
    queryFn: () => leaseApi.list({ unit: unitId }).then((r) => r.data),
    enabled: !!unitId,
  })

  const { data: invoicesData, isLoading: loadingInvoices } = useQuery({
    queryKey: ['unit-invoices', unitId],
    queryFn: () => invoiceApi.list({ unit: unitId }).then((r) => r.data),
    enabled: !!unitId,
  })

  const createLeaseMutation = useMutation({
    mutationFn: (data: any) => {
      const formData = new FormData()
      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          formData.append(key, value as string)
        }
      })
      return leaseApi.create(formData)
    },
    onSuccess: () => {
      showToast.success('Lease created successfully')
      setShowLeaseModal(false)
      queryClient.invalidateQueries({ queryKey: ['unit-leases'] })
      queryClient.invalidateQueries({ queryKey: ['unit'] })
      queryClient.invalidateQueries({ queryKey: ['leases'] })
    },
    onError: (error) => {
      showToast.error(parseApiError(error, 'Failed to create lease'))
    },
  })

  const leases = leasesData?.results || leasesData || []
  const invoices = invoicesData?.results || invoicesData || []
  const activeLease = leases.find((l: any) => l.status === 'active')
  // Derive occupancy from actual lease/tenant data instead of the static is_occupied boolean
  const isOccupied = !!activeLease || !!unit?.current_tenant

  // Process invoices into monthly data for area chart
  const monthlyData = useMemo(() => {
    if (!invoices?.length) return []
    const grouped: Record<string, { month: string; invoiced: number; paid: number }> = {}
    invoices.forEach((inv: any) => {
      const month = inv.invoice_date?.slice(0, 7) || inv.date?.slice(0, 7) || 'Unknown'
      if (!grouped[month]) grouped[month] = { month, invoiced: 0, paid: 0 }
      grouped[month].invoiced += Number(inv.total_amount || 0)
      grouped[month].paid += Number(inv.total_amount || 0) - Number(inv.balance || 0)
    })
    return Object.values(grouped).sort((a, b) => a.month.localeCompare(b.month))
  }, [invoices])

  // Invoice status breakdown for pie chart
  const statusData = useMemo(() => {
    if (!invoices?.length) return []
    const counts: Record<string, number> = {}
    invoices.forEach((inv: any) => {
      const status = inv.status || 'unknown'
      counts[status] = (counts[status] || 0) + 1
    })
    const colors: Record<string, string> = {
      paid: '#10b981',
      partial: '#f59e0b',
      overdue: '#ef4444',
      sent: '#3b82f6',
      draft: '#9ca3af',
      cancelled: '#6b7280',
    }
    return Object.entries(counts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: colors[name] || '#9ca3af',
    }))
  }, [invoices])

  // --- Leases table filter state ---
  const [leasesSearch, setLeasesSearch] = useState('')
  const [leasesStatus, setLeasesStatus] = useState('')

  const filteredLeases = useMemo(() => {
    let result = leases || []
    if (leasesSearch) {
      const q = leasesSearch.toLowerCase()
      result = result.filter((l: any) =>
        (l.lease_number || '').toLowerCase().includes(q) ||
        (l.tenant_name || '').toLowerCase().includes(q)
      )
    }
    if (leasesStatus) {
      result = result.filter((l: any) => l.status === leasesStatus)
    }
    return result
  }, [leases, leasesSearch, leasesStatus])

  const { paginatedData: paginatedLeases, currentPage: leasesPage, totalPages: leasesTotalPages, setCurrentPage: setLeasesPage, totalItems: leasesTotal, startIndex: leasesStart, endIndex: leasesEnd } = usePagination(filteredLeases, { pageSize: 10 })

  useEffect(() => { setLeasesPage(1) }, [leasesSearch, leasesStatus])

  // --- Invoices table filter state ---
  const [invSearch, setInvSearch] = useState('')
  const [invDateFrom, setInvDateFrom] = useState('')
  const [invDateTo, setInvDateTo] = useState('')
  const [invStatus, setInvStatus] = useState('')

  const filteredInvoices = useMemo(() => {
    let result = invoices || []
    if (invSearch) {
      const q = invSearch.toLowerCase()
      result = result.filter((inv: any) =>
        (inv.invoice_number || '').toLowerCase().includes(q)
      )
    }
    if (invDateFrom) {
      result = result.filter((inv: any) => {
        const date = inv.date || inv.invoice_date || ''
        return date >= invDateFrom
      })
    }
    if (invDateTo) {
      result = result.filter((inv: any) => {
        const date = inv.date || inv.invoice_date || ''
        return date <= invDateTo
      })
    }
    if (invStatus) {
      result = result.filter((inv: any) => inv.status === invStatus)
    }
    return result
  }, [invoices, invSearch, invDateFrom, invDateTo, invStatus])

  const { paginatedData: paginatedInvoices, currentPage: invPage, totalPages: invTotalPages, setCurrentPage: setInvPage, totalItems: invTotal, startIndex: invStart, endIndex: invEnd } = usePagination(filteredInvoices, { pageSize: 10 })

  useEffect(() => { setInvPage(1) }, [invSearch, invDateFrom, invDateTo, invStatus])

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard/units')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-3">
            {loadingUnit ? (
              <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">Unit {unit?.unit_number}</h1>
                <span className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                  isOccupied
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-rose-50 text-rose-600'
                )}>
                  {isOccupied ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {isOccupied ? 'Occupied' : 'Vacant'}
                </span>
              </>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate('/dashboard/units')} className="gap-2">
          <Edit2 className="w-4 h-4" />
          Edit
        </Button>
      </motion.div>

      {/* Profile Info Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-white rounded-xl border border-gray-200 p-4 md:p-6"
      >
        {loadingUnit ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2 animate-pulse">
                <div className="h-3 w-16 bg-gray-200 rounded" />
                <div className="h-4 w-32 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Property */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Property</p>
              <button
                onClick={() => unit?.property && navigate(`/dashboard/properties/${unit.property}`)}
                onMouseEnter={() => unit?.property && prefetch(`/dashboard/properties/${unit.property}`)}
                className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
              >
                <PiBuildingApartmentLight className="w-3.5 h-3.5" />
                <span>{unit?.property_name}</span>
              </button>
            </div>

            {/* Details */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Details</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <DoorOpen className="w-3.5 h-3.5 text-gray-400" />
                  <span>{unitTypeLabels[unit?.unit_type] || unit?.unit_type}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  {unit?.floor_number > 0 && (
                    <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5 text-gray-400" /> Floor {unit.floor_number}</span>
                  )}
                  {unit?.square_meters > 0 && (
                    <span className="flex items-center gap-1"><Square className="w-3.5 h-3.5 text-gray-400" /> {unit.square_meters}m²</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span className="flex items-center gap-1"><Bed className="w-3.5 h-3.5 text-gray-400" /> {unit?.bedrooms} bed</span>
                  <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5 text-gray-400" /> {unit?.bathrooms} bath</span>
                </div>
              </div>
            </div>

            {/* Financial */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Financial</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                  <span>{formatCurrency(unit?.rental_amount || 0)} /month</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                  <span>{formatCurrency(unit?.deposit_amount || 0)} deposit</span>
                </div>
                <div className="text-xs text-gray-400">{unit?.currency}</div>
              </div>
            </div>

            {/* Tenant */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Tenant</p>
              {unit?.current_tenant ? (
                <button
                  onClick={() => navigate(`/dashboard/tenants/${unit.current_tenant.id}`)}
                  onMouseEnter={() => prefetch(`/dashboard/tenants/${unit.current_tenant.id}`)}
                  className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
                >
                  <TbUserSquareRounded className="w-3.5 h-3.5" />
                  <span>{unit.current_tenant.name}</span>
                </button>
              ) : (
                <span className="text-sm text-gray-400">Vacant</span>
              )}
            </div>
          </div>
        )}
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Monthly Rent" value={formatCurrency(unit?.rental_amount || 0)} subtitle={unit?.currency} icon={DollarSign} color="blue" isLoading={loadingUnit} />
        <StatCard title="Deposit" value={formatCurrency(unit?.deposit_amount || 0)} icon={DollarSign} color="green" isLoading={loadingUnit} />
        <StatCard
          title="Lease Status"
          value={activeLease ? 'Active' : 'No Lease'}
          subtitle={activeLease ? `Expires ${formatDate(activeLease.end_date)}` : undefined}
          icon={FileText}
          color="purple"
          isLoading={loadingUnit || loadingLeases}
          valueClassName={activeLease ? 'text-emerald-600' : 'text-gray-400'}
        />
        <StatCard
          title="Occupancy"
          value={isOccupied ? 'Occupied' : 'Vacant'}
          icon={Home}
          color="orange"
          isLoading={loadingUnit || loadingLeases}
          valueClassName={isOccupied ? 'text-emerald-600' : 'text-rose-600'}
        />
      </motion.div>

      {/* Active Lease Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Leases</h3>
            <p className="text-sm text-gray-500">Lease agreements for this unit</p>
          </div>
          <button
            onClick={() => setShowLeaseModal(true)}
            className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Lease
          </button>
        </div>
        {!loadingLeases && leases.length > 0 && (
          <TableFilter
            searchPlaceholder="Search by lease number or tenant..."
            searchValue={leasesSearch}
            onSearchChange={setLeasesSearch}
            showStatusFilter
            statusOptions={[
              { value: 'active', label: 'Active' },
              { value: 'expired', label: 'Expired' },
              { value: 'terminated', label: 'Terminated' },
              { value: 'draft', label: 'Draft' },
            ]}
            statusValue={leasesStatus}
            onStatusChange={setLeasesStatus}
            resultCount={filteredLeases.length}
          />
        )}
        <div className="overflow-x-auto">
          {loadingLeases ? (
            <div className="p-6"><TableSkeleton /></div>
          ) : leases.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No leases found for this unit</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Lease #</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Tenant</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Start Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">End Date</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Rent</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedLeases.map((lease: any) => (
                  <tr
                    key={lease.id}
                    onClick={() => navigate(`/dashboard/leases/${lease.id}`)}
                    onMouseEnter={() => prefetch(`/dashboard/leases/${lease.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/leases/${lease.id}`) }}
                        className="text-primary-600 hover:text-primary-700 hover:underline"
                      >
                        {lease.lease_number}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {lease.tenant ? (
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/tenants/${lease.tenant}`) }} onMouseEnter={() => prefetch(`/dashboard/tenants/${lease.tenant}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                          {lease.tenant_name}
                        </button>
                      ) : (
                        <span className="text-gray-900">{lease.tenant_name}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(lease.start_date)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(lease.end_date)}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">{formatCurrency(lease.monthly_rent || 0)}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                        lease.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                        lease.status === 'expired' ? 'bg-amber-50 text-amber-700' :
                        lease.status === 'terminated' ? 'bg-red-50 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      )}>
                        {lease.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {leasesTotalPages > 1 && (
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Showing {leasesStart}-{leasesEnd} of {leasesTotal}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setLeasesPage(Math.max(1, leasesPage - 1))}
                  disabled={leasesPage === 1}
                  className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(leasesTotalPages, 5) }, (_, i) => {
                  const page = leasesTotalPages <= 5 ? i + 1 :
                    leasesPage <= 3 ? i + 1 :
                    leasesPage >= leasesTotalPages - 2 ? leasesTotalPages - 4 + i :
                    leasesPage - 2 + i
                  return (
                    <button
                      key={page}
                      onClick={() => setLeasesPage(page)}
                      className={`px-3 py-1 text-sm rounded-lg ${page === leasesPage ? 'bg-primary-600 text-white' : 'border border-gray-200 hover:bg-gray-50'}`}
                    >
                      {page}
                    </button>
                  )
                })}
                <button
                  onClick={() => setLeasesPage(Math.min(leasesTotalPages, leasesPage + 1))}
                  disabled={leasesPage === leasesTotalPages}
                  className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Recent Invoices Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Recent Invoices</h3>
          <p className="text-sm text-gray-500">Invoices for this unit</p>
        </div>
        {!loadingInvoices && invoices.length > 0 && (
          <TableFilter
            searchPlaceholder="Search by invoice number..."
            searchValue={invSearch}
            onSearchChange={setInvSearch}
            showDateFilter
            dateFrom={invDateFrom}
            dateTo={invDateTo}
            onDateFromChange={setInvDateFrom}
            onDateToChange={setInvDateTo}
            showStatusFilter
            statusOptions={[
              { value: 'paid', label: 'Paid' },
              { value: 'partial', label: 'Partial' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'sent', label: 'Sent' },
              { value: 'draft', label: 'Draft' },
            ]}
            statusValue={invStatus}
            onStatusChange={setInvStatus}
            resultCount={filteredInvoices.length}
          />
        )}
        <div className="overflow-x-auto">
          {loadingInvoices ? (
            <div className="p-6"><TableSkeleton /></div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No invoices found for this unit</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Invoice #</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Balance</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedInvoices.map((inv: any) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/dashboard/invoices/${inv.id}`)}
                    onMouseEnter={() => prefetch(`/dashboard/invoices/${inv.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/invoices/${inv.id}`) }}
                        className="text-primary-600 hover:text-primary-700 hover:underline"
                      >
                        {inv.invoice_number}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(inv.date)}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">{formatCurrency(inv.total_amount || 0)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-right">
                      <span className={(inv.balance || 0) > 0 ? 'text-red-600' : 'text-gray-900'}>
                        {formatCurrency(inv.balance || 0)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                        inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                        inv.status === 'overdue' ? 'bg-red-50 text-red-700' :
                        inv.status === 'draft' ? 'bg-gray-100 text-gray-600' :
                        'bg-amber-50 text-amber-700'
                      )}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {invTotalPages > 1 && (
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Showing {invStart}-{invEnd} of {invTotal}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setInvPage(Math.max(1, invPage - 1))}
                  disabled={invPage === 1}
                  className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(invTotalPages, 5) }, (_, i) => {
                  const page = invTotalPages <= 5 ? i + 1 :
                    invPage <= 3 ? i + 1 :
                    invPage >= invTotalPages - 2 ? invTotalPages - 4 + i :
                    invPage - 2 + i
                  return (
                    <button
                      key={page}
                      onClick={() => setInvPage(page)}
                      className={`px-3 py-1 text-sm rounded-lg ${page === invPage ? 'bg-primary-600 text-white' : 'border border-gray-200 hover:bg-gray-50'}`}
                    >
                      {page}
                    </button>
                  )
                })}
                <button
                  onClick={() => setInvPage(Math.min(invTotalPages, invPage + 1))}
                  disabled={invPage === invTotalPages}
                  className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Analytics Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-50 rounded-lg">
            <BarChart3 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Analytics</h3>
            <p className="text-sm text-gray-500">Payment trends and invoice breakdown</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Invoice Payment Timeline - 2/3 width */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Invoice Payment Timeline</h3>
                <p className="text-sm text-gray-500">Invoiced vs paid amounts over time</p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-gray-600">Invoiced</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-gray-600">Paid</span>
                </div>
              </div>
            </div>
            <div className="h-72">
              {loadingInvoices ? (
                <ChartSkeleton />
              ) : monthlyData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-400">
                  No invoice data available to display
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData}>
                    <defs>
                      <linearGradient id="gradientInvoiced" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradientPaid" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="month"
                      stroke="#94a3b8"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    />
                    <RechartsTooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="invoiced"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#gradientInvoiced)"
                      name="Invoiced"
                    />
                    <Area
                      type="monotone"
                      dataKey="paid"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#gradientPaid)"
                      name="Paid"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Invoice Status Breakdown - 1/3 width */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Invoice Status</h3>
              <p className="text-sm text-gray-500">Breakdown by status</p>
            </div>
            <div className="h-48 relative">
              {loadingInvoices ? (
                <div className="h-full flex items-center justify-center">
                  <div className="h-36 w-36 rounded-full border-8 border-gray-200 animate-pulse" />
                </div>
              ) : statusData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-400">
                  No invoice data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {!loadingInvoices && statusData.length > 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{invoices.length}</p>
                    <p className="text-xs text-gray-500">Total</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4">
              {loadingInvoices ? (
                <div className="flex gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                statusData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-sm text-gray-600">{entry.name}</span>
                    <span className="text-sm font-semibold text-gray-900">{entry.value}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Create Lease Modal */}
      <Modal
        open={showLeaseModal}
        onClose={() => setShowLeaseModal(false)}
        title="Add Lease"
        icon={Plus}
      >
        <LeaseForm
          initialValues={{ unit: unitId, property: unit?.property }}
          onSubmit={(data, doc) => {
            if (doc) {
              const formData: any = { ...data }
              formData.document = doc
              createLeaseMutation.mutate(formData)
            } else {
              createLeaseMutation.mutate(data)
            }
          }}
          isSubmitting={createLeaseMutation.isPending}
          onCancel={() => setShowLeaseModal(false)}
        />
      </Modal>
    </div>
  )
}
