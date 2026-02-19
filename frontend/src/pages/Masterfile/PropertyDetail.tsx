import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Edit2,
  MapPin,
  Building2,
  Home,
  DollarSign,
  Wallet,
  Users,
  Shield,
  Plus,
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
} from 'recharts'
import { propertyApi, landlordApi, unitApi, reportsApi } from '../../services/api'
import { formatCurrency, formatPercent, cn } from '../../lib/utils'
import { Modal, Button, Input, Select } from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'
import { PiBuildingApartmentLight } from 'react-icons/pi'
import { TbUserSquareRounded } from 'react-icons/tb'

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

const propertyTypeConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  residential: { label: 'Residential', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  commercial: { label: 'Commercial', color: 'text-purple-600', bgColor: 'bg-purple-50' },
  industrial: { label: 'Industrial', color: 'text-amber-600', bgColor: 'bg-amber-50' },
  mixed: { label: 'Mixed Use', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  color: 'blue' | 'green' | 'purple' | 'orange'
  isLoading?: boolean
}

const colorConfig = {
  blue: { bg: 'bg-blue-50', icon: 'bg-blue-500', text: 'text-blue-600' },
  green: { bg: 'bg-emerald-50', icon: 'bg-emerald-500', text: 'text-emerald-600' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-500', text: 'text-purple-600' },
  orange: { bg: 'bg-orange-50', icon: 'bg-orange-500', text: 'text-orange-600' },
}

function StatCard({ title, value, subtitle, icon: Icon, color, isLoading }: StatCardProps) {
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
          <h3 className="text-2xl md:text-3xl font-bold text-gray-900 tabular-nums">{value}</h3>
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

function ChartSkeleton() {
  return (
    <div className="w-full h-full flex flex-col justify-end gap-2 px-4 pb-4">
      <div className="flex items-end gap-3 h-full">
        {[40, 55, 65, 50, 70, 60, 75].map((h, i) => (
          <div key={i} className="flex-1 flex flex-col gap-1 justify-end h-full">
            <div className="w-full bg-gray-200 rounded-t animate-pulse" style={{ height: `${h}%` }} />
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
          <div className="h-4 flex-1 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  )
}

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const propertyId = Number(id)

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm] = useState({
    landlord: '',
    name: '',
    property_type: 'residential',
    address: '',
    city: 'Harare',
    total_units: 1,
    unit_definition: '',
  })

  // 1. Property profile
  const { data: property, isLoading: loadingProfile } = useQuery({
    queryKey: ['property', propertyId],
    queryFn: () => propertyApi.get(propertyId).then((r) => r.data),
    enabled: !!propertyId,
  })

  // 2. Units list
  const { data: unitsData, isLoading: loadingUnits } = useQuery({
    queryKey: ['property-units', propertyId],
    queryFn: () => unitApi.list({ property: propertyId }).then((r) => r.data),
    enabled: !!propertyId,
  })

  // 3. Lease charges
  const { data: leaseChargesData, isLoading: loadingLeaseCharges } = useQuery({
    queryKey: ['property-lease-charges', propertyId],
    queryFn: () => reportsApi.leaseCharges({ property_id: propertyId }).then((r) => r.data),
    enabled: !!propertyId,
  })

  // 4. Income vs expenditure
  const { data: incomeExpData, isLoading: loadingIncomeExp } = useQuery({
    queryKey: ['property-income-exp', propertyId],
    queryFn: () => reportsApi.incomeExpenditure({ property_id: propertyId }).then((r) => r.data),
    enabled: !!propertyId,
  })

  // 5. Aged analysis
  const { data: agedData, isLoading: loadingAged } = useQuery({
    queryKey: ['property-aged', propertyId],
    queryFn: () => reportsApi.agedAnalysis({ property_id: propertyId }).then((r) => r.data),
    enabled: !!propertyId,
  })

  // 6. Deposit summary
  const { data: depositData, isLoading: loadingDeposit } = useQuery({
    queryKey: ['property-deposits', propertyId],
    queryFn: () => reportsApi.depositSummary({ property_id: propertyId }).then((r) => r.data),
    enabled: !!propertyId,
  })

  // Landlords list for edit modal dropdown
  const { data: landlords } = useQuery({
    queryKey: ['landlords-select'],
    queryFn: () => landlordApi.list().then(r => r.data.results || r.data),
    enabled: showEditModal,
  })

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: (data: { landlord: number; name: string; property_type: string; address: string; city: string; total_units: number; unit_definition: string }) =>
      propertyApi.update(propertyId, data),
    onSuccess: () => {
      showToast.success('Property updated successfully')
      setShowEditModal(false)
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] })
      queryClient.invalidateQueries({ queryKey: ['properties'] })
    },
    onError: (error) => {
      showToast.error(parseApiError(error, 'Failed to update property'))
    },
  })

  const openEditModal = () => {
    if (!property) return
    setEditForm({
      landlord: String(property.landlord),
      name: property.name,
      property_type: property.property_type,
      address: property.address || '',
      city: property.city || 'Harare',
      total_units: property.total_units || 1,
      unit_definition: property.unit_definition || '',
    })
    setShowEditModal(true)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    editMutation.mutate({
      ...editForm,
      landlord: parseInt(editForm.landlord, 10),
    })
  }

  const typeConfig = propertyTypeConfig[property?.property_type || 'residential'] || propertyTypeConfig.residential

  // Unit data
  const units = unitsData?.results || unitsData || []
  const totalUnits = units.length || property?.total_units || 0
  // Derive occupancy from current_tenant (dynamically computed) instead of is_occupied (static boolean)
  const occupiedUnits = units.filter((u: any) => !!u.current_tenant).length
  const vacantUnits = totalUnits - occupiedUnits
  const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0

  // Deposit KPI
  const totalDeposits = depositData?.total_deposits ?? depositData?.total ?? 0

  // Outstanding balance from aged data
  const totalOutstanding = (() => {
    if (!agedData) return 0
    if (typeof agedData.total === 'number') return agedData.total
    if (typeof agedData.total_outstanding === 'number') return agedData.total_outstanding
    return 0
  })()

  // Occupancy donut
  const occupancyPieData = [
    { name: 'Occupied', value: occupiedUnits, color: '#10b981' },
    { name: 'Vacant', value: vacantUnits || 0, color: '#f43f5e' },
  ]

  // Income vs Expenditure chart
  const incomeExpChartData = (() => {
    if (!incomeExpData) return []
    if (Array.isArray(incomeExpData)) return incomeExpData
    const items: any[] = []
    if (incomeExpData.income_items) {
      incomeExpData.income_items.forEach((i: any) => {
        items.push({ name: i.name || i.category, income: i.amount || i.total, expense: 0 })
      })
    }
    if (incomeExpData.expense_items) {
      incomeExpData.expense_items.forEach((e: any) => {
        const existing = items.find((i) => i.name === (e.name || e.category))
        if (existing) {
          existing.expense = e.amount || e.total
        } else {
          items.push({ name: e.name || e.category, income: 0, expense: e.amount || e.total })
        }
      })
    }
    if (items.length === 0 && (incomeExpData.total_income || incomeExpData.total_expenses)) {
      items.push({ name: 'Total', income: incomeExpData.total_income || 0, expense: incomeExpData.total_expenses || 0 })
    }
    return items
  })()

  // Aged analysis chart
  const agedChartData = (() => {
    if (!agedData) return []
    if (Array.isArray(agedData)) {
      return agedData.map((b: any) => ({
        name: b.bucket || b.period || b.label || b.name,
        amount: b.amount || b.total || b.balance || 0,
      }))
    }
    const buckets = agedData.buckets || agedData.aging_buckets
    if (Array.isArray(buckets)) {
      return buckets.map((b: any) => ({
        name: b.bucket || b.period || b.label || b.name,
        amount: b.amount || b.total || b.balance || 0,
      }))
    }
    const fallbackKeys = ['current', '30_days', '60_days', '90_days', '120_plus']
    const labels: Record<string, string> = {
      current: 'Current', '30_days': '1-30 days', '60_days': '31-60 days', '90_days': '61-90 days', '120_plus': '90+ days',
    }
    return fallbackKeys
      .filter((k) => agedData[k] !== undefined)
      .map((k) => ({ name: labels[k] || k, amount: agedData[k] || 0 }))
  })()

  // Deposit chart
  const depositChartData = (() => {
    if (!depositData) return []
    const items = depositData.items || depositData.deposits || depositData.summary
    if (Array.isArray(items)) {
      return items.map((d: any) => ({
        name: d.tenant_name || d.tenant || d.unit || d.name,
        deposit: d.deposit_amount || d.amount || d.deposit || 0,
      }))
    }
    return []
  })()

  // Lease charges table
  const leaseChargesTable = leaseChargesData?.leases || leaseChargesData?.charges || leaseChargesData?.items || (Array.isArray(leaseChargesData) ? leaseChargesData : [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard/properties')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-3">
            {loadingProfile ? (
              <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">{property?.name}</h1>
                <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', typeConfig.bgColor, typeConfig.color)}>
                  {typeConfig.label}
                </span>
              </>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={openEditModal}
          className="gap-2"
        >
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
        {loadingProfile ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2 animate-pulse">
                <div className="h-3 w-16 bg-gray-200 rounded" />
                <div className="h-4 w-32 bg-gray-200 rounded" />
                <div className="h-4 w-28 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Location */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Location</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  <span className="truncate">{property?.address || 'No address'}</span>
                </div>
                {property?.city && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Building2 className="w-3.5 h-3.5 text-gray-400" />
                    <span>{property.city}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Landlord */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Landlord</p>
              <div className="space-y-1.5">
                <button
                  onClick={() => property?.landlord && navigate(`/dashboard/landlords/${property.landlord}`)}
                  className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
                >
                  <TbUserSquareRounded className="w-3.5 h-3.5" />
                  <span>{property?.landlord_name || 'Unknown'}</span>
                </button>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Details</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <PiBuildingApartmentLight className="w-3.5 h-3.5 text-gray-400" />
                  <span className="capitalize">{property?.property_type}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Home className="w-3.5 h-3.5 text-gray-400" />
                  <span>{totalUnits} total units</span>
                </div>
              </div>
            </div>

            {/* Managers */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Managers</p>
              <div className="space-y-1.5">
                {property?.managers_list && property.managers_list.length > 0 ? (
                  property.managers_list.map((mgr: any) => (
                    <div key={mgr.id} className="flex items-center gap-2 text-sm text-gray-600">
                      <Shield className="w-3.5 h-3.5 text-gray-400" />
                      <span className="truncate">{mgr.name}</span>
                      {mgr.is_primary && <span className="text-xs text-indigo-600">(Primary)</span>}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400">None assigned</p>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Units" value={totalUnits} subtitle={`${occupiedUnits} occupied`} icon={Home} color="blue" isLoading={loadingUnits} />
        <StatCard title="Vacancy Rate" value={formatPercent(100 - occupancyRate)} subtitle={`${vacantUnits} vacant`} icon={Building2} color="green" isLoading={loadingUnits} />
        <StatCard title="Total Deposits" value={formatCurrency(totalDeposits)} icon={Wallet} color="purple" isLoading={loadingDeposit} />
        <StatCard title="Outstanding Balance" value={formatCurrency(totalOutstanding)} icon={DollarSign} color="orange" isLoading={loadingAged} />
      </motion.div>

      {/* Charts Row 1 - Income vs Expenditure (2/3) + Occupancy Donut (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Income vs Expenditure</h3>
              <p className="text-sm text-gray-500">Breakdown by category</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-gray-600">Income</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-gray-600">Expense</span>
              </div>
            </div>
          </div>
          <div className="h-72">
            {loadingIncomeExp ? (
              <ChartSkeleton />
            ) : incomeExpChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">No income/expenditure data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={incomeExpChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="Income" />
                  <Bar dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Expense" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Occupancy Donut */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Occupancy</h3>
            <p className="text-sm text-gray-500">Unit status breakdown</p>
          </div>
          <div className="h-48 relative">
            {loadingUnits ? (
              <div className="h-full flex items-center justify-center">
                <div className="h-36 w-36 rounded-full border-8 border-gray-200 animate-pulse" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={occupancyPieData} innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="value">
                    {occupancyPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
            {!loadingUnits && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-3xl font-bold text-gray-900">{formatPercent(occupancyRate)}</p>
                  <p className="text-xs text-gray-500">Occupied</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-center gap-6 mt-4">
            {occupancyPieData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-sm text-gray-600">{entry.name}</span>
                <span className="text-sm font-semibold text-gray-900">{entry.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Charts Row 2 - Aged Outstanding (1/3) + Deposit Summary (2/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Aged Outstanding</h3>
            <p className="text-sm text-gray-500">Receivables aging</p>
          </div>
          <div className="h-72">
            {loadingAged ? (
              <ChartSkeleton />
            ) : agedChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">No aged analysis data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agedChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={80} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="amount" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Outstanding" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2"
        >
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Deposit Summary</h3>
            <p className="text-sm text-gray-500">Deposits held by tenant</p>
          </div>
          <div className="h-72">
            {loadingDeposit ? (
              <ChartSkeleton />
            ) : depositChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">No deposit data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={depositChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="deposit" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Deposit" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>
      </div>

      {/* Units Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Units</h3>
            <p className="text-sm text-gray-500">All units in this property</p>
          </div>
          <button
            onClick={() => navigate('/dashboard/units')}
            className="flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Unit
          </button>
        </div>
        <div className="overflow-x-auto">
          {loadingUnits ? (
            <div className="p-6"><TableSkeleton /></div>
          ) : units.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No units found for this property</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Unit</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Type</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Tenant</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Rent</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Deposit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {units.map((unit: any) => (
                  <tr key={unit.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium">
                      <button onClick={() => navigate(`/dashboard/units/${unit.id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                        {unit.unit_number}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 capitalize">{unit.unit_type || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                        unit.current_tenant ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      )}>
                        {unit.current_tenant ? 'Occupied' : 'Vacant'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {unit.current_tenant ? (
                        <button
                          onClick={() => unit.current_tenant?.id && navigate(`/dashboard/tenants/${unit.current_tenant.id}`)}
                          className="text-primary-600 hover:text-primary-700"
                        >
                          {unit.current_tenant.name}
                        </button>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(unit.rental_amount || 0)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(unit.deposit_amount || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>

      {/* Lease Charges Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Lease Charges</h3>
            <p className="text-sm text-gray-500">Tenant charges for this property</p>
          </div>
          <button
            onClick={() => navigate('/dashboard/leases')}
            className="flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Lease
          </button>
        </div>
        <div className="overflow-x-auto">
          {loadingLeaseCharges ? (
            <div className="p-6"><TableSkeleton rows={6} /></div>
          ) : leaseChargesTable.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No lease charges found</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Lease #</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Tenant</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Unit</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Monthly Rent</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Total Charged</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Paid</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leaseChargesTable.map((charge: any, idx: number) => (
                  <tr key={charge.lease_id || charge.id || idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium">
                      {charge.lease_id ? (
                        <button
                          onClick={() => navigate(`/dashboard/leases/${charge.lease_id}`)}
                          className="text-primary-600 hover:text-primary-700 hover:underline cursor-pointer"
                        >
                          {charge.lease_number || `#${charge.lease_id}`}
                        </button>
                      ) : (
                        <span className="text-gray-900">{charge.lease_number || '-'}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">
                      {charge.tenant_id ? (
                        <button onClick={() => navigate(`/dashboard/tenants/${charge.tenant_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline cursor-pointer">
                          {charge.tenant_name || charge.tenant}
                        </button>
                      ) : (
                        <span className="text-gray-900">{charge.tenant_name || charge.tenant}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {charge.unit_id ? (
                        <button onClick={() => navigate(`/dashboard/units/${charge.unit_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline cursor-pointer">
                          {charge.unit_name || charge.unit}
                        </button>
                      ) : (
                        <span className="text-gray-600">{charge.unit_name || charge.unit}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(charge.monthly_rent || charge.rent || 0)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(charge.total_charged || charge.charged || 0)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(charge.total_paid || charge.paid || 0)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-right">
                      <span className={(charge.balance || 0) > 0 ? 'text-red-600' : 'text-gray-900'}>
                        {formatCurrency(charge.balance || 0)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>

      {/* Edit Property Modal */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Property"
        icon={Edit2}
      >
        <form onSubmit={handleEditSubmit} className="space-y-5">
          <Select
            label="Landlord"
            value={editForm.landlord}
            onChange={(e) => setEditForm({ ...editForm, landlord: e.target.value })}
            required
            placeholder="Select a landlord"
            options={[
              { value: '', label: 'Select a landlord' },
              ...(landlords || []).map((l: any) => ({ value: String(l.id), label: l.name })),
            ]}
          />

          <Input
            label="Property Name"
            placeholder="e.g., Sunrise Apartments"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Property Type"
              value={editForm.property_type}
              onChange={(e) => setEditForm({ ...editForm, property_type: e.target.value })}
              options={[
                { value: 'residential', label: 'Residential' },
                { value: 'commercial', label: 'Commercial' },
                { value: 'industrial', label: 'Industrial' },
                { value: 'mixed', label: 'Mixed Use' },
              ]}
            />

            <Input
              type="number"
              label="Total Units"
              placeholder="1"
              min="1"
              value={editForm.total_units}
              onChange={(e) => setEditForm({ ...editForm, total_units: parseInt(e.target.value) || 1 })}
            />
          </div>

          <Input
            label="Address"
            placeholder="123 Main Street"
            value={editForm.address}
            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
            required
          />

          <Input
            label="City"
            placeholder="Harare"
            value={editForm.city}
            onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
          />

          <div>
            <Input
              label="Unit Definition"
              placeholder="e.g., 1-17 or A1-A20; B1-B15"
              value={editForm.unit_definition}
              onChange={(e) => setEditForm({ ...editForm, unit_definition: e.target.value })}
            />
            <p className="mt-1 text-xs text-gray-500">
              Define unit ranges using formats like "1-17" (numeric) or "A1-A20; B1-B15" (alphanumeric).
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={editMutation.isPending}>
              {editMutation.isPending ? 'Saving...' : 'Update Property'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
