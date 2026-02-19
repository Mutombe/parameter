import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Edit2,
  Mail,
  Phone,
  MapPin,
  Percent,
  Building2,
  Home,
  Users,
  DollarSign,
  Wallet,
  Receipt,
  Briefcase,
  Shield,
  CreditCard,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
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
  Legend,
} from 'recharts'
import { landlordApi, reportsApi, propertyApi, leaseApi } from '../../services/api'
import PropertyForm from '../../components/forms/PropertyForm'
import LeaseForm from '../../components/forms/LeaseForm'
import { formatCurrency, formatPercent, cn } from '../../lib/utils'
import { Modal, Button, Input, Select, Textarea, Tooltip as UiTooltip, TableFilter } from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'
import { usePrefetch } from '../../hooks/usePrefetch'
import { usePagination } from '../../hooks/usePagination'
import { TbUserSquareRounded } from 'react-icons/tb'

// Animation variants matching Dashboard
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

const landlordTypeConfig = {
  individual: {
    icon: TbUserSquareRounded,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Individual',
  },
  company: {
    icon: Briefcase,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    label: 'Company',
  },
  trust: {
    icon: Shield,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    label: 'Trust',
  },
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  color: 'blue' | 'green' | 'purple' | 'orange'
  isLoading?: boolean
  tooltip?: string
}

const colorConfig = {
  blue: { bg: 'bg-blue-50', icon: 'bg-blue-500', text: 'text-blue-600' },
  green: { bg: 'bg-emerald-50', icon: 'bg-emerald-500', text: 'text-emerald-600' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-500', text: 'text-purple-600' },
  orange: { bg: 'bg-orange-50', icon: 'bg-orange-500', text: 'text-orange-600' },
}

function StatCard({ title, value, subtitle, icon: Icon, color, isLoading, tooltip }: StatCardProps) {
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
        {tooltip ? (
          <UiTooltip content={tooltip}>
            <p className="text-xs md:text-sm text-gray-500 mt-1 cursor-help">{title}</p>
          </UiTooltip>
        ) : (
          <p className="text-xs md:text-sm text-gray-500 mt-1">{title}</p>
        )}
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

export default function LandlordDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const prefetch = usePrefetch()
  const queryClient = useQueryClient()
  const landlordId = Number(id)

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false)

  // Property creation modal
  const [showPropertyModal, setShowPropertyModal] = useState(false)

  // Lease creation modal
  const [showLeaseModal, setShowLeaseModal] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    landlord_type: 'individual',
    email: '',
    phone: '',
    address: '',
    commission_rate: '10.00',
  })

  // 1. Landlord profile
  const { data: landlord, isLoading: loadingProfile } = useQuery({
    queryKey: ['landlord', landlordId],
    queryFn: () => landlordApi.get(landlordId).then((r) => r.data),
    enabled: !!landlordId,
  })

  // 2. Landlord statement (property/unit counts, occupancy)
  const { data: statement, isLoading: loadingStatement } = useQuery({
    queryKey: ['landlord-statement', landlordId],
    queryFn: () => landlordApi.statement(landlordId).then((r) => r.data),
    enabled: !!landlordId,
  })

  // 3. Landlord financial statement (invoiced, collected, commission, properties table)
  const { data: financialStatement, isLoading: loadingFinancial } = useQuery({
    queryKey: ['landlord-financial', landlordId],
    queryFn: () => reportsApi.landlordStatement({ landlord_id: landlordId }).then((r) => r.data),
    enabled: !!landlordId,
  })

  // 4. Commission by property
  const { data: commissionData, isLoading: loadingCommission } = useQuery({
    queryKey: ['landlord-commission', landlordId],
    queryFn: () => reportsApi.commission({ landlord_id: landlordId }).then((r) => r.data),
    enabled: !!landlordId,
  })

  // 5. Aged analysis
  const { data: agedData, isLoading: loadingAged } = useQuery({
    queryKey: ['landlord-aged', landlordId],
    queryFn: () => reportsApi.agedAnalysis({ landlord_id: landlordId }).then((r) => r.data),
    enabled: !!landlordId,
  })

  // 6. Income vs expenditure
  const { data: incomeExpData, isLoading: loadingIncomeExp } = useQuery({
    queryKey: ['landlord-income-exp', landlordId],
    queryFn: () => reportsApi.incomeExpenditure({ landlord_id: landlordId }).then((r) => r.data),
    enabled: !!landlordId,
  })

  // 7. Lease charges
  const { data: leaseChargesData, isLoading: loadingLeaseCharges } = useQuery({
    queryKey: ['landlord-lease-charges', landlordId],
    queryFn: () => reportsApi.leaseCharges({ landlord_id: landlordId }).then((r) => r.data),
    enabled: !!landlordId,
  })

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: (data: typeof editForm) => landlordApi.update(landlordId, data),
    onSuccess: () => {
      showToast.success('Landlord updated successfully')
      setShowEditModal(false)
      queryClient.invalidateQueries({ queryKey: ['landlord', landlordId] })
      queryClient.invalidateQueries({ queryKey: ['landlords'] })
    },
    onError: (error) => {
      showToast.error(parseApiError(error, 'Failed to update landlord'))
    },
  })

  // Create property mutation
  const createPropertyMutation = useMutation({
    mutationFn: (data: any) => propertyApi.create(data),
    onSuccess: () => {
      showToast.success('Property created successfully')
      setShowPropertyModal(false)
      queryClient.invalidateQueries({ queryKey: ['landlord-financial', landlordId] })
      queryClient.invalidateQueries({ queryKey: ['landlord-statement', landlordId] })
      queryClient.invalidateQueries({ queryKey: ['properties'] })
    },
    onError: (error) => {
      showToast.error(parseApiError(error, 'Failed to create property'))
    },
  })

  // Create lease mutation
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
      queryClient.invalidateQueries({ queryKey: ['landlord-lease-charges', landlordId] })
      queryClient.invalidateQueries({ queryKey: ['landlord-financial', landlordId] })
      queryClient.invalidateQueries({ queryKey: ['leases'] })
    },
    onError: (error) => {
      showToast.error(parseApiError(error, 'Failed to create lease'))
    },
  })

  const openEditModal = () => {
    if (!landlord) return
    setEditForm({
      name: landlord.name || '',
      landlord_type: landlord.landlord_type || 'individual',
      email: landlord.email || '',
      phone: landlord.phone || '',
      address: landlord.address || '',
      commission_rate: landlord.commission_rate || '10.00',
    })
    setShowEditModal(true)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    editMutation.mutate(editForm)
  }

  const typeConfig =
    landlordTypeConfig[(landlord?.landlord_type as keyof typeof landlordTypeConfig) || 'individual']
  const TypeIcon = typeConfig.icon

  // KPI derived values - statement data is nested under 'summary' key
  const stmtSummary = statement?.summary || statement || {}
  const totalProperties = stmtSummary?.total_properties ?? statement?.properties?.length ?? 0
  const totalUnits = stmtSummary?.total_units ?? 0
  const occupied = stmtSummary?.occupied_units ?? 0
  const vacant = stmtSummary?.vacant_units ?? totalUnits - occupied
  const occupancyRate = totalUnits > 0 ? (occupied / totalUnits) * 100 : 0

  const totalCollected = financialStatement?.total_collected ?? financialStatement?.collected ?? 0
  const totalInvoiced = financialStatement?.total_invoiced ?? financialStatement?.invoiced ?? 0
  const netPayable = financialStatement?.net_payable ?? 0
  const commissionRate = landlord?.commission_rate ?? 0

  // Occupancy donut data
  const occupancyPieData = [
    { name: 'Occupied', value: occupied, color: '#10b981' },
    { name: 'Vacant', value: vacant || 0, color: '#f43f5e' },
  ]

  // Income vs Expenditure chart data
  const incomeExpChartData = (() => {
    if (!incomeExpData) return []
    // Support both array and object response shapes
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
    // Fallback: if summary-level data
    if (items.length === 0 && (incomeExpData.total_income || incomeExpData.total_expenses)) {
      items.push({
        name: 'Total',
        income: incomeExpData.total_income || 0,
        expense: incomeExpData.total_expenses || 0,
      })
    }
    return items
  })()

  // Aged analysis chart data
  const agedChartData = (() => {
    if (!agedData) return []
    if (Array.isArray(agedData)) {
      // Each item might be a bucket
      return agedData.map((b: any) => ({
        name: b.bucket || b.period || b.label || b.name,
        amount: b.amount || b.total || b.balance || 0,
      }))
    }
    // Object with bucket keys
    const buckets = agedData.buckets || agedData.aging_buckets
    if (Array.isArray(buckets)) {
      return buckets.map((b: any) => ({
        name: b.bucket || b.period || b.label || b.name,
        amount: b.amount || b.total || b.balance || 0,
      }))
    }
    // Fallback: key-value buckets
    const fallbackKeys = ['current', '30_days', '60_days', '90_days', '120_plus']
    const labels: Record<string, string> = {
      current: 'Current',
      '30_days': '1-30 days',
      '60_days': '31-60 days',
      '90_days': '61-90 days',
      '120_plus': '90+ days',
    }
    return fallbackKeys
      .filter((k) => agedData[k] !== undefined)
      .map((k) => ({ name: labels[k] || k, amount: agedData[k] || 0 }))
  })()

  // Commission by property chart data
  const commissionChartData = (() => {
    if (!commissionData) return []
    const items = commissionData.properties || commissionData.items || commissionData
    if (!Array.isArray(items)) return []
    return items.map((p: any) => ({
      name: p.property_name || p.property || p.name,
      collected: p.collected || p.total_collected || 0,
      commission: p.commission || p.commission_amount || 0,
    }))
  })()

  // Properties table data
  const propertiesTable =
    financialStatement?.properties || statement?.properties || []

  // Lease charges table data
  const leaseChargesTable = leaseChargesData?.charges || leaseChargesData?.items || (Array.isArray(leaseChargesData) ? leaseChargesData : [])

  // --- Properties table filter state ---
  const [propsSearch, setPropsSearch] = useState('')
  const [propsOccupancy, setPropsOccupancy] = useState('')

  const filteredProperties = useMemo(() => {
    let result = propertiesTable || []
    if (propsSearch) {
      const q = propsSearch.toLowerCase()
      result = result.filter((p: any) =>
        (p.property_name || p.name || '').toLowerCase().includes(q)
      )
    }
    if (propsOccupancy) {
      result = result.filter((p: any) => {
        const occ = p.total_units > 0 ? ((p.occupied_units || 0) / p.total_units) * 100 : 0
        if (propsOccupancy === 'high') return occ >= 80
        if (propsOccupancy === 'medium') return occ >= 50 && occ < 80
        if (propsOccupancy === 'low') return occ < 50
        return true
      })
    }
    return result
  }, [propertiesTable, propsSearch, propsOccupancy])

  const { paginatedData: paginatedProperties, currentPage: propsPage, totalPages: propsTotalPages, setCurrentPage: setPropsPage, totalItems: propsTotal, startIndex: propsStart, endIndex: propsEnd } = usePagination(filteredProperties, { pageSize: 10 })

  useEffect(() => { setPropsPage(1) }, [propsSearch, propsOccupancy])

  // --- Lease charges table filter state ---
  const [chargesSearch, setChargesSearch] = useState('')

  const filteredLeaseCharges = useMemo(() => {
    let result = leaseChargesTable || []
    if (chargesSearch) {
      const q = chargesSearch.toLowerCase()
      result = result.filter((c: any) =>
        (c.tenant_name || c.tenant || '').toLowerCase().includes(q) ||
        (c.property_name || c.property || '').toLowerCase().includes(q) ||
        (c.unit_name || c.unit || '').toLowerCase().includes(q) ||
        (c.lease_number || c.lease_ref || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [leaseChargesTable, chargesSearch])

  const { paginatedData: paginatedCharges, currentPage: chargesPage, totalPages: chargesTotalPages, setCurrentPage: setChargesPage, totalItems: chargesTotal, startIndex: chargesStart, endIndex: chargesEnd } = usePagination(filteredLeaseCharges, { pageSize: 10 })

  useEffect(() => { setChargesPage(1) }, [chargesSearch])

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
            onClick={() => navigate('/dashboard/landlords')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-3">
            {loadingProfile ? (
              <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">
                  {landlord?.name}
                </h1>
                <span
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium',
                    typeConfig.bgColor,
                    typeConfig.color
                  )}
                >
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
            {/* Contact */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Contact</p>
              <div className="space-y-1.5">
                {landlord?.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                    <span className="truncate">{landlord.email}</span>
                  </div>
                )}
                {landlord?.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    <span>{landlord.phone}</span>
                  </div>
                )}
                {landlord?.address && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                    <span className="truncate">{landlord.address}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Financial */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Financial</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Percent className="w-3.5 h-3.5 text-gray-400" />
                  <span title="Management fee deducted from collected rent">{landlord?.commission_rate}% commission</span>
                </div>
                {landlord?.currency && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                    <span>{landlord.currency}</span>
                  </div>
                )}
                {landlord?.payment_frequency && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Receipt className="w-3.5 h-3.5 text-gray-400" />
                    <span className="capitalize">{landlord.payment_frequency}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Banking */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Banking</p>
              <div className="space-y-1.5">
                {landlord?.bank_name ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                      <span>{landlord.bank_name}</span>
                    </div>
                    {landlord?.account_number && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="text-gray-400 text-xs ml-5">
                          ****{landlord.account_number.slice(-4)}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400">Not provided</p>
                )}
              </div>
            </div>

            {/* Tax */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Tax</p>
              <div className="space-y-1.5">
                {landlord?.tax_id || landlord?.tax_number ? (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                    <span>{landlord.tax_id || landlord.tax_number}</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Not provided</p>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* KPI Cards */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        <StatCard
          title="Total Properties"
          value={totalProperties}
          subtitle={`${totalUnits} total units`}
          icon={Building2}
          color="blue"
          isLoading={loadingStatement}
          tooltip="Properties owned by this landlord"
        />
        <StatCard
          title="Occupancy Rate"
          value={formatPercent(occupancyRate)}
          subtitle={`${occupied} occupied · ${vacant} vacant`}
          icon={Home}
          color="green"
          isLoading={loadingStatement}
          tooltip="Percentage of landlord's units occupied"
        />
        <StatCard
          title="Total Collected"
          value={formatCurrency(totalCollected)}
          subtitle={`${formatCurrency(totalInvoiced)} invoiced`}
          icon={Wallet}
          color="purple"
          isLoading={loadingFinancial}
          tooltip="Total rent collected from tenants"
        />
        <StatCard
          title="Net Payable"
          value={formatCurrency(netPayable)}
          subtitle={`${commissionRate}% commission`}
          icon={DollarSign}
          color="orange"
          isLoading={loadingFinancial}
          tooltip="Amount payable to landlord after commission"
        />
      </motion.div>

      {/* Properties Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Properties</h3>
            <p className="text-sm text-gray-500">Portfolio overview by property</p>
          </div>
          <button
            onClick={() => setShowPropertyModal(true)}
            className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Property
          </button>
        </div>
        {!loadingFinancial && propertiesTable.length > 0 && (
          <TableFilter
            searchPlaceholder="Search properties..."
            searchValue={propsSearch}
            onSearchChange={setPropsSearch}
            showStatusFilter
            statusOptions={[
              { value: 'high', label: 'High (80%+)' },
              { value: 'medium', label: 'Medium (50-79%)' },
              { value: 'low', label: 'Low (<50%)' },
            ]}
            statusValue={propsOccupancy}
            onStatusChange={setPropsOccupancy}
            resultCount={filteredProperties.length}
          />
        )}
        <div className="overflow-x-auto">
          {loadingFinancial ? (
            <div className="p-6">
              <TableSkeleton />
            </div>
          ) : propertiesTable.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">
              No properties found for this landlord
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Property
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Units
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Occupancy
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Invoiced
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Collected
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedProperties.map((prop: any, idx: number) => {
                  const propOccupancy =
                    prop.total_units > 0
                      ? ((prop.occupied_units || 0) / prop.total_units) * 100
                      : 0
                  return (
                    <tr
                      key={prop.id || idx}
                      onMouseEnter={() => prop.id && prefetch(`/dashboard/properties/${prop.id}`)}
                      onClick={() =>
                        prop.id && navigate(`/dashboard/properties/${prop.id}`)
                      }
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 text-sm font-medium">
                        <span className="text-primary-600 hover:text-primary-700 hover:underline cursor-pointer">
                          {prop.property_name || prop.name}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">
                        {prop.total_units ?? prop.units ?? '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={cn(
                            'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                            propOccupancy >= 80
                              ? 'bg-emerald-50 text-emerald-700'
                              : propOccupancy >= 50
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-red-50 text-red-700'
                          )}
                        >
                          {formatPercent(propOccupancy)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">
                        {formatCurrency(prop.invoiced || prop.total_invoiced || 0)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">
                        {formatCurrency(prop.collected || prop.total_collected || 0)}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-right">
                        <span
                          className={
                            (prop.balance || prop.outstanding || 0) > 0
                              ? 'text-red-600'
                              : 'text-gray-900'
                          }
                        >
                          {formatCurrency(prop.balance || prop.outstanding || 0)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {propsTotalPages > 1 && (
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Showing {propsStart}-{propsEnd} of {propsTotal}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPropsPage(Math.max(1, propsPage - 1))}
                  disabled={propsPage === 1}
                  className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(propsTotalPages, 5) }, (_, i) => {
                  const page = propsTotalPages <= 5 ? i + 1 :
                    propsPage <= 3 ? i + 1 :
                    propsPage >= propsTotalPages - 2 ? propsTotalPages - 4 + i :
                    propsPage - 2 + i
                  return (
                    <button
                      key={page}
                      onClick={() => setPropsPage(page)}
                      className={`px-3 py-1 text-sm rounded-lg ${page === propsPage ? 'bg-primary-600 text-white' : 'border border-gray-200 hover:bg-gray-50'}`}
                    >
                      {page}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPropsPage(Math.min(propsTotalPages, propsPage + 1))}
                  disabled={propsPage === propsTotalPages}
                  className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
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
            <p className="text-sm text-gray-500">Tenant charges across all properties</p>
          </div>
          <button
            onClick={() => setShowLeaseModal(true)}
            className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Lease
          </button>
        </div>
        {!loadingLeaseCharges && leaseChargesTable.length > 0 && (
          <TableFilter
            searchPlaceholder="Search by tenant, property, or unit..."
            searchValue={chargesSearch}
            onSearchChange={setChargesSearch}
            resultCount={filteredLeaseCharges.length}
          />
        )}
        <div className="overflow-x-auto">
          {loadingLeaseCharges ? (
            <div className="p-6">
              <TableSkeleton rows={6} />
            </div>
          ) : leaseChargesTable.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">
              No lease charges found for this landlord
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Lease
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Tenant
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Property
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Unit
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Monthly Rent
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Total Charged
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Paid
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedCharges.map((charge: any, idx: number) => (
                  <tr key={charge.id || idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium">
                      {charge.lease_id ? (
                        <button
                          onMouseEnter={() => prefetch(`/dashboard/leases/${charge.lease_id}`)}
                          onClick={() => navigate(`/dashboard/leases/${charge.lease_id}`)}
                          className="text-primary-600 hover:text-primary-700 hover:underline"
                        >
                          {charge.lease_number || charge.lease_ref || `LSE-${charge.lease_id}`}
                        </button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">
                      {charge.tenant_id ? (
                        <button onMouseEnter={() => prefetch(`/dashboard/tenants/${charge.tenant_id}`)} onClick={() => navigate(`/dashboard/tenants/${charge.tenant_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                          {charge.tenant_name || charge.tenant}
                        </button>
                      ) : (
                        <span className="text-gray-900">{charge.tenant_name || charge.tenant}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {charge.property_id ? (
                        <button onMouseEnter={() => prefetch(`/dashboard/properties/${charge.property_id}`)} onClick={() => navigate(`/dashboard/properties/${charge.property_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                          {charge.property_name || charge.property}
                        </button>
                      ) : (
                        <span className="text-gray-600">{charge.property_name || charge.property}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {charge.unit_id ? (
                        <button onMouseEnter={() => prefetch(`/dashboard/units/${charge.unit_id}`)} onClick={() => navigate(`/dashboard/units/${charge.unit_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                          {charge.unit_name || charge.unit}
                        </button>
                      ) : (
                        <span className="text-gray-600">{charge.unit_name || charge.unit}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">
                      {formatCurrency(charge.monthly_rent || charge.rent || 0)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">
                      {formatCurrency(charge.total_charged || charge.charged || 0)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">
                      {formatCurrency(charge.total_paid || charge.paid || 0)}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-right">
                      <span
                        className={
                          (charge.balance || 0) > 0 ? 'text-red-600' : 'text-gray-900'
                        }
                      >
                        {formatCurrency(charge.balance || 0)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {chargesTotalPages > 1 && (
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Showing {chargesStart}-{chargesEnd} of {chargesTotal}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setChargesPage(Math.max(1, chargesPage - 1))}
                  disabled={chargesPage === 1}
                  className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(chargesTotalPages, 5) }, (_, i) => {
                  const page = chargesTotalPages <= 5 ? i + 1 :
                    chargesPage <= 3 ? i + 1 :
                    chargesPage >= chargesTotalPages - 2 ? chargesTotalPages - 4 + i :
                    chargesPage - 2 + i
                  return (
                    <button
                      key={page}
                      onClick={() => setChargesPage(page)}
                      className={`px-3 py-1 text-sm rounded-lg ${page === chargesPage ? 'bg-primary-600 text-white' : 'border border-gray-200 hover:bg-gray-50'}`}
                    >
                      {page}
                    </button>
                  )
                })}
                <button
                  onClick={() => setChargesPage(Math.min(chargesTotalPages, chargesPage + 1))}
                  disabled={chargesPage === chargesTotalPages}
                  className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Charts Row 1 - Income vs Expenditure (2/3) + Occupancy Donut (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Income vs Expenditure */}
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
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                No income/expenditure data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={incomeExpChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="name"
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
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
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
            {loadingStatement ? (
              <div className="h-full flex items-center justify-center">
                <div className="h-36 w-36 rounded-full border-8 border-gray-200 animate-pulse" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={occupancyPieData}
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {occupancyPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
            {!loadingStatement && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-3xl font-bold text-gray-900">
                    {formatPercent(occupancyRate)}
                  </p>
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
                {loadingStatement ? (
                  <div className="h-4 w-6 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <span className="text-sm font-semibold text-gray-900">{entry.value}</span>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Charts Row 2 - Aged Outstanding (1/3) + Commission by Property (2/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Aged Outstanding */}
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
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                No aged analysis data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agedChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={80}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar dataKey="amount" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Outstanding" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Commission by Property */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Commission by Property</h3>
              <p className="text-sm text-gray-500">Collected vs commission per property</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-gray-600">Collected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <span className="text-gray-600">Commission</span>
              </div>
            </div>
          </div>
          <div className="h-72">
            {loadingCommission ? (
              <ChartSkeleton />
            ) : commissionChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                No commission data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={commissionChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="name"
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
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar dataKey="collected" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Collected" />
                  <Bar
                    dataKey="commission"
                    fill="#8b5cf6"
                    radius={[4, 4, 0, 0]}
                    name="Commission"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>
      </div>

      {/* Edit Landlord Modal */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Landlord"
        icon={Edit2}
      >
        <form onSubmit={handleEditSubmit} className="space-y-5">
          <Input
            label="Full Name"
            placeholder="John Doe or Company Ltd"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type"
              value={editForm.landlord_type}
              onChange={(e) => setEditForm({ ...editForm, landlord_type: e.target.value })}
            >
              <option value="individual">Individual</option>
              <option value="company">Company</option>
              <option value="trust">Trust</option>
            </Select>

            <Input
              type="number"
              label="Commission Rate (%)"
              placeholder="10.00"
              step="0.01"
              min="0"
              max="100"
              value={editForm.commission_rate}
              onChange={(e) => setEditForm({ ...editForm, commission_rate: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              type="email"
              label="Email Address"
              placeholder="email@example.com"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              required
            />

            <Input
              label="Phone Number"
              placeholder="+263 77 123 4567"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              required
            />
          </div>

          <Textarea
            label="Address"
            placeholder="Physical address..."
            value={editForm.address}
            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
            rows={2}
          />

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={editMutation.isPending}>
              {editMutation.isPending ? 'Saving...' : 'Update Landlord'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Property Modal */}
      <Modal
        open={showPropertyModal}
        onClose={() => setShowPropertyModal(false)}
        title="Add Property"
        icon={Plus}
      >
        <PropertyForm
          initialValues={{ landlord: landlordId }}
          onSubmit={(data) => createPropertyMutation.mutate(data)}
          isSubmitting={createPropertyMutation.isPending}
          onCancel={() => setShowPropertyModal(false)}
        />
      </Modal>

      {/* Create Lease Modal */}
      <Modal
        open={showLeaseModal}
        onClose={() => setShowLeaseModal(false)}
        title="Add Lease"
        icon={Plus}
      >
        <LeaseForm
          initialValues={{}}
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
