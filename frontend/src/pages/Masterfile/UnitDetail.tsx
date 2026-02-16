import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
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
} from 'lucide-react'
import { unitApi, leaseApi, invoiceApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { Button } from '../../components/ui'
import { TbUserSquareRounded } from 'react-icons/tb'
import { PiBuildingApartmentLight } from 'react-icons/pi'

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

export default function UnitDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const unitId = Number(id)

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

  const leases = leasesData?.results || leasesData || []
  const invoices = invoicesData?.results || invoicesData || []
  const activeLease = leases.find((l: any) => l.status === 'active')

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
                  unit?.is_occupied
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-rose-50 text-rose-600'
                )}>
                  {unit?.is_occupied ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {unit?.is_occupied ? 'Occupied' : 'Vacant'}
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
          value={unit?.is_occupied ? 'Occupied' : 'Vacant'}
          icon={Home}
          color="orange"
          isLoading={loadingUnit}
          valueClassName={unit?.is_occupied ? 'text-emerald-600' : 'text-rose-600'}
        />
      </motion.div>

      {/* Active Lease Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Leases</h3>
          <p className="text-sm text-gray-500">Lease agreements for this unit</p>
        </div>
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
                {leases.map((lease: any) => (
                  <tr
                    key={lease.id}
                    onClick={() => navigate(`/dashboard/leases/${lease.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-primary-600">{lease.lease_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{lease.tenant_name}</td>
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
                {invoices.slice(0, 10).map((inv: any) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/dashboard/invoices/${inv.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-primary-600">{inv.invoice_number}</td>
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
        </div>
      </motion.div>
    </div>
  )
}
