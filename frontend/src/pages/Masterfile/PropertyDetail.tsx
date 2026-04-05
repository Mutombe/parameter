import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Edit2,
  MapPin,
  Building2,
  Home,
  DollarSign,
  Wallet,
  Shield,
  Plus,
  FileText,
  Receipt,
  Clock,
  Download,
  Layers,
  Eye,
  Calendar as CalendarIcon,
  BarChart3,
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
import api, { propertyApi, landlordApi, unitApi, reportsApi, leaseApi, invoiceApi, receiptApi, subsidiaryApi } from '../../services/api'
import { formatCurrency, formatPercent, formatDate, cn } from '../../lib/utils'
import { Modal, Button, Input, Select, TableFilter, Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'
import { PiBuildingApartmentLight } from 'react-icons/pi'
import { TbUserSquareRounded } from 'react-icons/tb'
import { usePagination } from '../../hooks/usePagination'
import { usePrefetch } from '../../hooks/usePrefetch'
import UnitForm from '../../components/forms/UnitForm'
import LeaseForm from '../../components/forms/LeaseForm'

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
  const prefetch = usePrefetch()

  // Active tab tracking for lazy-loading queries
  const [activeTab, setActiveTab] = useState('units')

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false)

  // Unit creation modal
  const [showUnitModal, setShowUnitModal] = useState(false)

  // Lease creation modal
  const [showLeaseModal, setShowLeaseModal] = useState(false)

  // Billing generation modal
  const [showBillingModal, setShowBillingModal] = useState(false)
  const [billingForm, setBillingForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  })
  const billingMutation = useMutation({
    mutationFn: () => invoiceApi.generateMonthly({
      month: billingForm.month,
      year: billingForm.year,
      property_id: Number(propertyId),
    }),
    onSuccess: (response) => {
      const count = response.data?.created || 0
      const errors = response.data?.errors || []
      if (count > 0) {
        showToast.success(`Generated ${count} invoice${count !== 1 ? 's' : ''} for this property`)
      } else if (errors.length > 0) {
        showToast.warning(`No new invoices. ${errors[0]}`)
      } else {
        showToast.info('All leases already billed for this period')
      }
      setShowBillingModal(false)
      queryClient.invalidateQueries({ queryKey: ['property-invoices'] })
    },
    onError: (error: any) => showToast.error(parseApiError(error, 'Failed to generate billing')),
  })
  const [editForm, setEditForm] = useState({
    landlord: '',
    name: '',
    property_type: 'residential',
    management_type: 'rental',
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
    placeholderData: keepPreviousData,
  })

  // 2. Units list
  const { data: unitsData, isLoading: loadingUnits } = useQuery({
    queryKey: ['property-units', propertyId],
    queryFn: () => unitApi.list({ property: propertyId }).then((r) => r.data),
    enabled: !!propertyId,
    placeholderData: keepPreviousData,
  })

  // 3. Lease charges (financials tab)
  const { data: leaseChargesData, isLoading: loadingLeaseCharges } = useQuery({
    queryKey: ['property-lease-charges', propertyId],
    queryFn: () => reportsApi.leaseCharges({ property_id: propertyId }).then((r) => r.data),
    enabled: !!propertyId && activeTab === 'financials',
    placeholderData: keepPreviousData,
  })

  // 4. Income vs expenditure (financials tab)
  const { data: incomeExpData, isLoading: loadingIncomeExp } = useQuery({
    queryKey: ['property-income-exp', propertyId],
    queryFn: () => reportsApi.incomeExpenditure({ property_id: propertyId }).then((r) => r.data),
    enabled: !!propertyId && activeTab === 'financials',
    placeholderData: keepPreviousData,
  })

  // 5. Aged analysis (financials tab)
  const { data: agedData, isLoading: loadingAged } = useQuery({
    queryKey: ['property-aged', propertyId],
    queryFn: () => reportsApi.agedAnalysis({ property_id: propertyId }).then((r) => r.data),
    enabled: !!propertyId && (activeTab === 'financials' || activeTab === 'reports'),
    placeholderData: keepPreviousData,
  })

  // 6. Deposit summary (always loaded for KPI)
  const { data: depositData, isLoading: loadingDeposit } = useQuery({
    queryKey: ['property-deposits', propertyId],
    queryFn: () => reportsApi.depositSummary({ property_id: propertyId }).then((r) => r.data),
    enabled: !!propertyId,
    placeholderData: keepPreviousData,
  })

  // 7. Leases for this property (leases tab)
  const { data: leasesData, isLoading: loadingLeases } = useQuery({
    queryKey: ['property-leases', propertyId],
    queryFn: () => leaseApi.list({ property: propertyId, page_size: 100 }).then((r) => r.data),
    enabled: !!propertyId && activeTab === 'leases',
    placeholderData: keepPreviousData,
  })

  // 8. Recent invoices for this property (billing tab)
  const { data: invoicesData, isLoading: loadingInvoices } = useQuery({
    queryKey: ['property-invoices', propertyId],
    queryFn: () => invoiceApi.list({ property: propertyId, page_size: 100, ordering: '-created_at' }).then((r) => r.data),
    enabled: !!propertyId && activeTab === 'billing',
    placeholderData: keepPreviousData,
  })

  // 9. Recent receipts for this property (billing tab)
  const { data: receiptsData, isLoading: loadingReceipts } = useQuery({
    queryKey: ['property-receipts', propertyId],
    queryFn: () => receiptApi.list({ property: propertyId, page_size: 100, ordering: '-created_at' }).then((r) => r.data),
    enabled: !!propertyId && activeTab === 'billing',
    placeholderData: keepPreviousData,
  })

  // Note: Maintenance data is no longer loaded here (maintenance has its own page)

  // Landlords list for edit modal dropdown
  const { data: landlords } = useQuery({
    queryKey: ['landlords-select'],
    queryFn: () => landlordApi.list().then(r => r.data.results || r.data),
    placeholderData: keepPreviousData,
  })

  // --- Subsidiary sub-ledger accounts state ---
  const [selectedSubAccount, setSelectedSubAccount] = useState<number | null>(null)
  const [subAccountDateRange, setSubAccountDateRange] = useState({
    period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    period_end: new Date().toISOString().split('T')[0],
  })
  const [subAccountStatementView, setSubAccountStatementView] = useState<'consolidated' | 'audit'>('consolidated')

  // Normalize list data (handle paginated vs array responses)
  const normalizeList = (data: any) => {
    if (!data) return []
    if (Array.isArray(data)) return data
    if (data.results && Array.isArray(data.results)) return data.results
    return []
  }

  // Sub-accounts for this property's landlord (sub-accounts tab)
  const { data: subAccountsData, isLoading: loadingSubAccounts } = useQuery({
    queryKey: ['property-sub-accounts', property?.landlord],
    queryFn: () => subsidiaryApi.list({ landlord: property!.landlord }).then((r) => r.data),
    enabled: !!property?.landlord && activeTab === 'sub-accounts',
    placeholderData: keepPreviousData,
  })

  // Sub-account statement (individual)
  const { data: subAccountStatement, isLoading: loadingSubStatement } = useQuery({
    queryKey: ['property-sub-statement', selectedSubAccount, subAccountDateRange, subAccountStatementView],
    queryFn: () => subsidiaryApi.statement(selectedSubAccount!, {
      period_start: subAccountDateRange.period_start,
      period_end: subAccountDateRange.period_end,
      view: subAccountStatementView,
    }).then((r) => r.data),
    enabled: !!selectedSubAccount,
    placeholderData: keepPreviousData,
  })

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: (data: { landlord: number; name: string; property_type: string; management_type: string; address: string; city: string; total_units: number; unit_definition: string }) =>
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

  // Create unit mutation
  const createUnitMutation = useMutation({
    mutationFn: (data: any) => unitApi.create(data),
    onSuccess: () => {
      showToast.success('Unit created successfully')
      setShowUnitModal(false)
      queryClient.invalidateQueries({ queryKey: ['property-units'] })
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] })
      queryClient.invalidateQueries({ queryKey: ['units'] })
    },
    onError: (error) => {
      showToast.error(parseApiError(error, 'Failed to create unit'))
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
      queryClient.invalidateQueries({ queryKey: ['property-lease-charges'] })
      queryClient.invalidateQueries({ queryKey: ['property-units'] })
      queryClient.invalidateQueries({ queryKey: ['leases'] })
    },
    onError: (error) => {
      showToast.error(parseApiError(error, 'Failed to create lease'))
    },
  })

  const openEditModal = () => {
    if (!property) return
    setEditForm({
      landlord: String(property.landlord),
      name: property.name,
      property_type: property.property_type,
      management_type: property.management_type || 'rental',
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

  // Leases
  const leases = leasesData?.results || leasesData || []

  // Invoices
  const invoices = invoicesData?.results || invoicesData || []

  // Receipts
  const receipts = receiptsData?.results || receiptsData || []

  // Aged analysis detail table
  const agedDetailRows = (() => {
    if (!agedData) return []
    const tenants = agedData.tenants || agedData.details || agedData.items
    if (Array.isArray(tenants)) return tenants
    return []
  })()

  // --- Units table filter state ---
  const [unitsSearch, setUnitsSearch] = useState('')
  const [unitsStatus, setUnitsStatus] = useState('')

  const filteredUnits = useMemo(() => {
    let result = units || []
    if (unitsSearch) {
      const q = unitsSearch.toLowerCase()
      result = result.filter((u: any) =>
        (u.unit_number || '').toLowerCase().includes(q) ||
        (u.current_tenant?.name || '').toLowerCase().includes(q)
      )
    }
    if (unitsStatus) {
      result = result.filter((u: any) => {
        const occupied = !!u.current_tenant
        if (unitsStatus === 'occupied') return occupied
        if (unitsStatus === 'vacant') return !occupied
        return true
      })
    }
    return result
  }, [units, unitsSearch, unitsStatus])

  const { paginatedData: paginatedUnits, currentPage: unitsPage, totalPages: unitsTotalPages, setCurrentPage: setUnitsPage, totalItems: unitsTotal, startIndex: unitsStart, endIndex: unitsEnd } = usePagination(filteredUnits, { pageSize: 10 })

  useEffect(() => { setUnitsPage(1) }, [unitsSearch, unitsStatus])

  // --- Lease charges table filter state ---
  const [chargesSearch, setChargesSearch] = useState('')

  const filteredLeaseCharges = useMemo(() => {
    let result = leaseChargesTable || []
    if (chargesSearch) {
      const q = chargesSearch.toLowerCase()
      result = result.filter((c: any) =>
        (c.tenant_name || c.tenant || '').toLowerCase().includes(q) ||
        (c.unit_name || c.unit || '').toLowerCase().includes(q) ||
        (c.lease_number || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [leaseChargesTable, chargesSearch])

  const { paginatedData: paginatedCharges, currentPage: chargesPage, totalPages: chargesTotalPages, setCurrentPage: setChargesPage, totalItems: chargesTotal, startIndex: chargesStart, endIndex: chargesEnd } = usePagination(filteredLeaseCharges, { pageSize: 10 })

  useEffect(() => { setChargesPage(1) }, [chargesSearch])

  // --- Leases table filter state ---
  const [leasesSearch, setLeasesSearch] = useState('')
  const [leasesStatus, setLeasesStatus] = useState('')

  const filteredLeases = useMemo(() => {
    let result = leases || []
    if (leasesSearch) {
      const q = leasesSearch.toLowerCase()
      result = result.filter((l: any) =>
        (l.tenant_name || l.tenant?.name || '').toLowerCase().includes(q) ||
        (l.unit_name || l.unit?.unit_number || '').toLowerCase().includes(q) ||
        (l.lease_number || '').toLowerCase().includes(q)
      )
    }
    if (leasesStatus) {
      result = result.filter((l: any) => l.status === leasesStatus)
    }
    return result
  }, [leases, leasesSearch, leasesStatus])

  const { paginatedData: paginatedLeases, currentPage: leasesPage, totalPages: leasesTotalPages, setCurrentPage: setLeasesPage, totalItems: leasesTotal, startIndex: leasesStart, endIndex: leasesEnd } = usePagination(filteredLeases, { pageSize: 10 })

  useEffect(() => { setLeasesPage(1) }, [leasesSearch, leasesStatus])

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <button onClick={() => navigate('/dashboard')} className="hover:text-gray-900 transition-colors">Dashboard</button>
        <span>/</span>
        <button onClick={() => navigate('/dashboard/properties')} className="hover:text-gray-900 transition-colors">Properties</button>
        <span>/</span>
        <span className="text-gray-900 font-medium">{property?.name || '...'}</span>
      </nav>

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
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowBillingModal(true)}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            Generate Billing
          </Button>
          <Button
            variant="outline"
            onClick={openEditModal}
            className="gap-2"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </Button>
        </div>
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
                  onMouseEnter={() => property?.landlord && prefetch(`/dashboard/landlords/${property.landlord}`)}
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
                <div className="flex items-center gap-2 text-sm">
                  <span className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium',
                    property?.management_type === 'levy'
                      ? 'bg-violet-50 text-violet-600'
                      : 'bg-sky-50 text-sky-600'
                  )}>
                    {property?.management_type === 'levy' ? 'Levy' : 'Rental'}
                  </span>
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

      {/* Tabs */}
      <Tabs defaultValue="units" className="space-y-6" onChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="units" icon={Home}>Units</TabsTrigger>
          <TabsTrigger value="billing" icon={Receipt}>Billing</TabsTrigger>
          <TabsTrigger value="leases" icon={FileText}>Leases</TabsTrigger>
          <TabsTrigger value="financials" icon={DollarSign}>Financials</TabsTrigger>
          <TabsTrigger value="sub-accounts" icon={Layers}>Sub Accounts</TabsTrigger>
          <TabsTrigger value="reports" icon={BarChart3}>Reports</TabsTrigger>
        </TabsList>

        {/* ===== UNITS TAB ===== */}
        <TabsContent value="units" className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Units</h3>
            <p className="text-sm text-gray-500">All units in this property</p>
          </div>
          <button
            onClick={() => setShowUnitModal(true)}
            className="flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Unit
          </button>
        </div>
        {!loadingUnits && units.length > 0 && (
          <TableFilter
            searchPlaceholder="Search by unit number or tenant..."
            searchValue={unitsSearch}
            onSearchChange={setUnitsSearch}
            showStatusFilter
            statusOptions={[
              { value: 'occupied', label: 'Occupied' },
              { value: 'vacant', label: 'Vacant' },
            ]}
            statusValue={unitsStatus}
            onStatusChange={setUnitsStatus}
            resultCount={filteredUnits.length}
          />
        )}
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
                {paginatedUnits.map((unit: any) => (
                  <tr key={unit.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium">
                      <button onClick={() => navigate(`/dashboard/units/${unit.id}`)} onMouseEnter={() => prefetch(`/dashboard/units/${unit.id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
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
                          onMouseEnter={() => unit.current_tenant?.id && prefetch(`/dashboard/tenants/${unit.current_tenant.id}`)}
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
          {unitsTotalPages > 1 && (
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Showing {unitsStart}-{unitsEnd} of {unitsTotal}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setUnitsPage(Math.max(1, unitsPage - 1))}
                  disabled={unitsPage === 1}
                  className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(unitsTotalPages, 5) }, (_, i) => {
                  const page = unitsTotalPages <= 5 ? i + 1 :
                    unitsPage <= 3 ? i + 1 :
                    unitsPage >= unitsTotalPages - 2 ? unitsTotalPages - 4 + i :
                    unitsPage - 2 + i
                  return (
                    <button
                      key={page}
                      onClick={() => setUnitsPage(page)}
                      className={`px-3 py-1 text-sm rounded-lg ${page === unitsPage ? 'bg-primary-600 text-white' : 'border border-gray-200 hover:bg-gray-50'}`}
                    >
                      {page}
                    </button>
                  )
                })}
                <button
                  onClick={() => setUnitsPage(Math.min(unitsTotalPages, unitsPage + 1))}
                  disabled={unitsPage === unitsTotalPages}
                  className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
        </TabsContent>

        {/* ===== LEASES TAB ===== */}
        <TabsContent value="leases" className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Leases</h3>
            <p className="text-sm text-gray-500">All leases for this property</p>
          </div>
          <button
            onClick={() => setShowLeaseModal(true)}
            className="flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Lease
          </button>
        </div>
        {!loadingLeases && leases.length > 0 && (
          <TableFilter
            searchPlaceholder="Search by tenant, unit or lease number..."
            searchValue={leasesSearch}
            onSearchChange={setLeasesSearch}
            showStatusFilter
            statusOptions={[
              { value: 'active', label: 'Active' },
              { value: 'draft', label: 'Draft' },
              { value: 'expired', label: 'Expired' },
              { value: 'terminated', label: 'Terminated' },
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
            <div className="p-12 text-center text-sm text-gray-400">No leases found for this property</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Lease #</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Tenant</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Unit</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Rent</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Start</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">End</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedLeases.map((lease: any) => {
                  const statusColors: Record<string, string> = {
                    active: 'bg-emerald-50 text-emerald-700',
                    draft: 'bg-gray-100 text-gray-600',
                    expired: 'bg-amber-50 text-amber-700',
                    terminated: 'bg-red-50 text-red-700',
                  }
                  return (
                    <tr key={lease.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium">
                        <button
                          onClick={() => navigate(`/dashboard/leases/${lease.id}`)}
                          onMouseEnter={() => prefetch(`/dashboard/leases/${lease.id}`)}
                          className="text-primary-600 hover:text-primary-700 hover:underline"
                        >
                          {lease.lease_number || `#${lease.id}`}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {(lease.tenant_id || lease.tenant?.id) ? (
                          <button
                            onClick={() => navigate(`/dashboard/tenants/${lease.tenant_id || lease.tenant?.id}`)}
                            onMouseEnter={() => prefetch(`/dashboard/tenants/${lease.tenant_id || lease.tenant?.id}`)}
                            className="text-primary-600 hover:text-primary-700 hover:underline"
                          >
                            {lease.tenant_name || lease.tenant?.name || '-'}
                          </button>
                        ) : (
                          <span className="text-gray-600">{lease.tenant_name || lease.tenant?.name || '-'}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {(lease.unit_id || lease.unit?.id) ? (
                          <button
                            onClick={() => navigate(`/dashboard/units/${lease.unit_id || lease.unit?.id}`)}
                            onMouseEnter={() => prefetch(`/dashboard/units/${lease.unit_id || lease.unit?.id}`)}
                            className="text-primary-600 hover:text-primary-700 hover:underline"
                          >
                            {lease.unit_name || lease.unit?.unit_number || '-'}
                          </button>
                        ) : (
                          <span className="text-gray-600">{lease.unit_name || lease.unit?.unit_number || '-'}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(lease.rent_amount || lease.monthly_rent || 0)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{lease.start_date ? formatDate(lease.start_date) : '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{lease.end_date ? formatDate(lease.end_date) : '-'}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                          statusColors[lease.status] || 'bg-gray-100 text-gray-600'
                        )}>
                          {lease.status || '-'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
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
      </div>
        </TabsContent>

        {/* ===== BILLING TAB ===== */}
        <TabsContent value="billing" className="space-y-6">
      {/* Invoices & Receipts merged */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Invoices</h3>
            <p className="text-sm text-gray-500">Invoices for this property</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          {loadingInvoices ? (
            <div className="p-6"><TableSkeleton rows={5} /></div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No invoices found</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Invoice #</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Tenant</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv: any) => {
                  const invStatusColors: Record<string, string> = {
                    paid: 'bg-emerald-50 text-emerald-700',
                    posted: 'bg-blue-50 text-blue-700',
                    draft: 'bg-gray-100 text-gray-600',
                    overdue: 'bg-red-50 text-red-700',
                    partially_paid: 'bg-amber-50 text-amber-700',
                  }
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/dashboard/invoices/${inv.id}`)}>
                      <td className="px-6 py-3 text-sm font-medium">
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/invoices/${inv.id}`) }} onMouseEnter={() => prefetch(`/dashboard/invoices/${inv.id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                          {inv.invoice_number || `#${inv.id}`}
                        </button>
                      </td>
                      <td className="px-6 py-3 text-sm">
                        {(inv.tenant_id || inv.tenant?.id) ? (
                          <button onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/tenants/${inv.tenant_id || inv.tenant?.id}`) }} onMouseEnter={() => prefetch(`/dashboard/tenants/${inv.tenant_id || inv.tenant?.id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                            {inv.tenant_name || inv.tenant?.name || '-'}
                          </button>
                        ) : (
                          <span className="text-gray-600">{inv.tenant_name || inv.tenant?.name || '-'}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">{inv.invoice_date || inv.date ? formatDate(inv.invoice_date || inv.date) : '-'}</td>
                      <td className="px-6 py-3 text-sm text-gray-600 text-right">{formatCurrency(inv.total_amount || inv.amount || 0)}</td>
                      <td className="px-6 py-3">
                        <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize', invStatusColors[inv.status] || 'bg-gray-100 text-gray-600')}>
                          {(inv.status || '-').replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-500" />
            <h3 className="text-lg font-semibold text-gray-900">Receipts</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">Payments received for this property</p>
        </div>
        <div className="overflow-x-auto">
          {loadingReceipts ? (
            <div className="p-6"><TableSkeleton rows={4} /></div>
          ) : receipts.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No receipts found</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Receipt #</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Tenant</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {receipts.map((rec: any) => (
                  <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{rec.receipt_number || `#${rec.id}`}</td>
                    <td className="px-6 py-3 text-sm">
                      {(rec.tenant_id || rec.tenant?.id) ? (
                        <button onClick={() => navigate(`/dashboard/tenants/${rec.tenant_id || rec.tenant?.id}`)} onMouseEnter={() => prefetch(`/dashboard/tenants/${rec.tenant_id || rec.tenant?.id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                          {rec.tenant_name || rec.tenant?.name || '-'}
                        </button>
                      ) : (
                        <span className="text-gray-600">{rec.tenant_name || rec.tenant?.name || '-'}</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600 text-right">{formatCurrency(rec.amount || 0)}</td>
                    <td className="px-6 py-3 text-sm text-gray-600">{rec.payment_date || rec.date ? formatDate(rec.payment_date || rec.date) : rec.created_at ? formatDate(rec.created_at) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
        </TabsContent>

        {/* ===== FINANCIALS TAB ===== */}
        <TabsContent value="financials" className="space-y-6">

      {/* Lease Charges Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Lease Charges</h3>
            <p className="text-sm text-gray-500">Tenant charges for this property</p>
          </div>
          <button
            onClick={() => setShowLeaseModal(true)}
            className="flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Lease
          </button>
        </div>
        {!loadingLeaseCharges && leaseChargesTable.length > 0 && (
          <TableFilter
            searchPlaceholder="Search by tenant or unit..."
            searchValue={chargesSearch}
            onSearchChange={setChargesSearch}
            resultCount={filteredLeaseCharges.length}
          />
        )}
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
                {paginatedCharges.map((charge: any, idx: number) => (
                  <tr key={charge.lease_id || charge.id || idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium">
                      {charge.lease_id ? (
                        <button
                          onClick={() => navigate(`/dashboard/leases/${charge.lease_id}`)}
                          onMouseEnter={() => prefetch(`/dashboard/leases/${charge.lease_id}`)}
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
                        <button onClick={() => navigate(`/dashboard/tenants/${charge.tenant_id}`)} onMouseEnter={() => prefetch(`/dashboard/tenants/${charge.tenant_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline cursor-pointer">
                          {charge.tenant_name || charge.tenant}
                        </button>
                      ) : (
                        <span className="text-gray-900">{charge.tenant_name || charge.tenant}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {charge.unit_id ? (
                        <button onClick={() => navigate(`/dashboard/units/${charge.unit_id}`)} onMouseEnter={() => prefetch(`/dashboard/units/${charge.unit_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline cursor-pointer">
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
      </div>

      {/* Charts - Income vs Expenditure (2/3) + Occupancy Donut (1/3) */}
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

      {/* Aged Analysis detail (same tab) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="bg-white rounded-xl border border-gray-200 overflow-hidden"
        >
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900">Recent Invoices</h3>
            </div>
            <p className="text-sm text-gray-500 mt-1">Latest invoices for this property</p>
          </div>
          <div className="overflow-x-auto">
            {loadingInvoices ? (
              <div className="p-6"><TableSkeleton rows={4} /></div>
            ) : invoices.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-400">No invoices found</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Invoice #</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Tenant</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.slice(0, 8).map((inv: any) => {
                    const invStatusColors: Record<string, string> = {
                      paid: 'bg-emerald-50 text-emerald-700',
                      posted: 'bg-blue-50 text-blue-700',
                      draft: 'bg-gray-100 text-gray-600',
                      overdue: 'bg-red-50 text-red-700',
                      partially_paid: 'bg-amber-50 text-amber-700',
                    }
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 text-sm font-medium">
                          <button
                            onClick={() => navigate(`/dashboard/invoices/${inv.id}`)}
                            onMouseEnter={() => prefetch(`/dashboard/invoices/${inv.id}`)}
                            className="text-primary-600 hover:text-primary-700 hover:underline"
                          >
                            {inv.invoice_number || `#${inv.id}`}
                          </button>
                        </td>
                        <td className="px-6 py-3 text-sm">
                          {(inv.tenant_id || inv.tenant?.id) ? (
                            <button
                              onClick={() => navigate(`/dashboard/tenants/${inv.tenant_id || inv.tenant?.id}`)}
                              onMouseEnter={() => prefetch(`/dashboard/tenants/${inv.tenant_id || inv.tenant?.id}`)}
                              className="text-primary-600 hover:text-primary-700 hover:underline"
                            >
                              {inv.tenant_name || inv.tenant?.name || '-'}
                            </button>
                          ) : (
                            <span className="text-gray-600">{inv.tenant_name || inv.tenant?.name || '-'}</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-600 text-right">{formatCurrency(inv.total_amount || inv.amount || 0)}</td>
                        <td className="px-6 py-3">
                          <span className={cn(
                            'inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                            invStatusColors[inv.status] || 'bg-gray-100 text-gray-600'
                          )}>
                            {(inv.status || '-').replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>

        {/* Recent Receipts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-xl border border-gray-200 overflow-hidden"
        >
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-500" />
              <h3 className="text-lg font-semibold text-gray-900">Recent Receipts</h3>
            </div>
            <p className="text-sm text-gray-500 mt-1">Latest payments received</p>
          </div>
          <div className="overflow-x-auto">
            {loadingReceipts ? (
              <div className="p-6"><TableSkeleton rows={4} /></div>
            ) : receipts.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-400">No receipts found</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Receipt #</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Tenant</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {receipts.slice(0, 8).map((rec: any) => (
                    <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">
                        {rec.receipt_number || `#${rec.id}`}
                      </td>
                      <td className="px-6 py-3 text-sm">
                        {(rec.tenant_id || rec.tenant?.id) ? (
                          <button
                            onClick={() => navigate(`/dashboard/tenants/${rec.tenant_id || rec.tenant?.id}`)}
                            onMouseEnter={() => prefetch(`/dashboard/tenants/${rec.tenant_id || rec.tenant?.id}`)}
                            className="text-primary-600 hover:text-primary-700 hover:underline"
                          >
                            {rec.tenant_name || rec.tenant?.name || '-'}
                          </button>
                        ) : (
                          <span className="text-gray-600">{rec.tenant_name || rec.tenant?.name || '-'}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600 text-right">{formatCurrency(rec.amount || 0)}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{rec.payment_date || rec.date ? formatDate(rec.payment_date || rec.date) : rec.created_at ? formatDate(rec.created_at) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>
      </div>

      {/* Aged Analysis Detail Table */}
      {agedDetailRows.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="bg-white rounded-xl border border-gray-200 overflow-hidden"
        >
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              <h3 className="text-lg font-semibold text-gray-900">Aged Analysis by Tenant</h3>
            </div>
            <p className="text-sm text-gray-500 mt-1">Outstanding balances broken down by aging period</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Tenant</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Current</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">1-30 Days</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">31-60 Days</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">61-90 Days</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">90+ Days</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {agedDetailRows.map((row: any, idx: number) => (
                  <tr key={row.tenant_id || idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium">
                      {row.tenant_id ? (
                        <button
                          onClick={() => navigate(`/dashboard/tenants/${row.tenant_id}`)}
                          onMouseEnter={() => prefetch(`/dashboard/tenants/${row.tenant_id}`)}
                          className="text-primary-600 hover:text-primary-700 hover:underline"
                        >
                          {row.tenant_name || row.tenant || '-'}
                        </button>
                      ) : (
                        <span className="text-gray-900">{row.tenant_name || row.tenant || row.name || '-'}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(row.current || 0)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(row['30_days'] || row.days_30 || 0)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(row['60_days'] || row.days_60 || 0)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(row['90_days'] || row.days_90 || 0)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(row['120_plus'] || row.days_120_plus || row.over_90 || 0)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-right">
                      <span className={(row.total || 0) > 0 ? 'text-red-600' : 'text-gray-900'}>
                        {formatCurrency(row.total || row.total_outstanding || row.balance || 0)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

        </TabsContent>

        {/* ===== SUB ACCOUNTS TAB ===== */}
        <TabsContent value="sub-accounts" className="space-y-6">
      {/* Sub-Ledger Accounts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Sub-Ledger Accounts</h3>
            <p className="text-sm text-gray-500">Subsidiary accounts linked to this property's landlord</p>
          </div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={subAccountDateRange.period_start}
              onChange={(e) => setSubAccountDateRange((p) => ({ ...p, period_start: e.target.value }))}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={subAccountDateRange.period_end}
              onChange={(e) => setSubAccountDateRange((p) => ({ ...p, period_end: e.target.value }))}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="p-6">
          {loadingSubAccounts ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 border border-gray-200 rounded-xl animate-pulse">
                  <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-32 bg-gray-200 rounded mb-3" />
                  <div className="h-7 w-20 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          ) : normalizeList(subAccountsData).length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">
              <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No subsidiary accounts found for this property's landlord
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {normalizeList(subAccountsData).map((acc: any) => {
                const balance = acc.balance ?? acc.current_balance ?? 0
                const isSelected = selectedSubAccount === acc.id
                return (
                  <button
                    key={acc.id}
                    onClick={() => setSelectedSubAccount(isSelected ? null : acc.id)}
                    className={cn(
                      'p-4 border rounded-xl text-left transition-all hover:shadow-md',
                      isSelected
                        ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-gray-500">{acc.account_code || acc.code || '-'}</span>
                      <span className="text-xs font-medium text-gray-400 uppercase">{acc.currency || 'USD'}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 mb-2">
                      {acc.category_name || acc.category || acc.name || 'Account'}
                    </p>
                    <p className={cn(
                      'text-xl font-bold tabular-nums',
                      balance > 0 ? 'text-emerald-600' : balance < 0 ? 'text-red-600' : 'text-gray-900'
                    )}>
                      {formatCurrency(Math.abs(balance))}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {balance > 0 ? 'Credit balance' : balance < 0 ? 'Debit balance' : 'Zero balance'}
                    </p>
                    {isSelected && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-primary-600">
                        <Eye className="w-3 h-3" />
                        Viewing statement
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Statement view for selected sub-account */}
        {selectedSubAccount && (
          <div className="border-t border-gray-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h4 className="text-base font-semibold text-gray-900">
                  Account Statement
                  {(() => {
                    const acc = normalizeList(subAccountsData).find((a: any) => a.id === selectedSubAccount)
                    return acc ? ` - ${acc.category_name || acc.category || acc.name}` : ''
                  })()}
                </h4>
                <p className="text-sm text-gray-500">
                  {subAccountDateRange.period_start} to {subAccountDateRange.period_end}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Consolidated / Audit toggle */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setSubAccountStatementView('consolidated')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                      subAccountStatementView === 'consolidated' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    )}
                  >
                    Consolidated
                  </button>
                  <button
                    onClick={() => setSubAccountStatementView('audit')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                      subAccountStatementView === 'audit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    )}
                  >
                    Audit
                  </button>
                </div>
                {/* Export dropdown */}
                <div className="relative group">
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export
                  </button>
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg hidden group-hover:block z-10 min-w-[100px]">
                    {(['csv', 'pdf'] as const).map(fmt => (
                      <button
                        key={fmt}
                        onClick={async () => {
                          try {
                            const res = await subsidiaryApi.exportStatement(selectedSubAccount, {
                              period_start: subAccountDateRange.period_start,
                              period_end: subAccountDateRange.period_end,
                              view: subAccountStatementView,
                              format: fmt,
                            })
                            const url = URL.createObjectURL(new Blob([res.data]))
                            const a = document.createElement('a')
                            a.href = url
                            const acc = normalizeList(subAccountsData).find((x: any) => x.id === selectedSubAccount)
                            a.download = `statement-${(acc?.code || acc?.account_code || selectedSubAccount).toString().replace(/\//g, '-')}.${fmt}`
                            a.click()
                            URL.revokeObjectURL(url)
                          } catch { /* ignore */ }
                        }}
                        className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left first:rounded-t-lg last:rounded-b-lg"
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Opening balance */}
            {subAccountStatement && (
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">Opening Balance</span>
                <span className={cn('text-sm font-bold tabular-nums', (subAccountStatement.opening_balance ?? subAccountStatement.balance_bf ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {formatCurrency(subAccountStatement.opening_balance ?? subAccountStatement.balance_bf ?? 0)}
                </span>
              </div>
            )}

            <div className="overflow-x-auto">
              {loadingSubStatement ? (
                <div className="p-6"><TableSkeleton rows={6} /></div>
              ) : !subAccountStatement || (subAccountStatement.transactions || subAccountStatement.entries || []).length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-400">
                  No transactions found for this period
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Ref</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Description</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Debit</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Credit</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(subAccountStatement.transactions || subAccountStatement.entries || []).map((txn: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-600">{txn.date || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 font-mono text-xs">{txn.reference || txn.ref || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          <span className="flex items-center gap-1.5">
                            {txn.description || txn.narration || '-'}
                            {txn.is_consolidated && (
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold" title="Consolidated entry">C</span>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right tabular-nums">{txn.debit ? formatCurrency(txn.debit) : '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right tabular-nums">{txn.credit ? formatCurrency(txn.credit) : '-'}</td>
                        <td className="px-6 py-4 text-sm font-medium text-right tabular-nums">
                          <span className={(txn.balance || txn.running_balance || 0) < 0 ? 'text-red-600' : 'text-gray-900'}>
                            {formatCurrency(txn.balance || txn.running_balance || 0)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Closing balance */}
            {subAccountStatement && (subAccountStatement.transactions || subAccountStatement.entries || []).length > 0 && (
              <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">Closing Balance</span>
                <span className={cn('text-sm font-bold tabular-nums', (subAccountStatement.closing_balance ?? subAccountStatement.balance_cf ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {formatCurrency(subAccountStatement.closing_balance ?? subAccountStatement.balance_cf ?? 0)}
                </span>
              </div>
            )}
          </div>
        )}
      </motion.div>
        </TabsContent>

        {/* ===== REPORTS TAB ===== */}
        <TabsContent value="reports" className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Reports</h3>
            <p className="text-sm text-gray-500 mb-6">Quick access to reports filtered for this property</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                onClick={() => navigate(`/dashboard/reports/income-expenditure?property_id=${propertyId}`)}
                className="p-4 border border-gray-200 rounded-xl text-left hover:border-gray-300 hover:shadow-md transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center mb-3">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                </div>
                <h4 className="font-semibold text-gray-900">Income & Expenditure</h4>
                <p className="text-sm text-gray-500 mt-1">Revenue vs expenses breakdown</p>
              </button>
              <button
                onClick={() => navigate(`/dashboard/reports/aged-analysis?property_id=${propertyId}`)}
                className="p-4 border border-gray-200 rounded-xl text-left hover:border-gray-300 hover:shadow-md transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center mb-3">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <h4 className="font-semibold text-gray-900">Aged Analysis</h4>
                <p className="text-sm text-gray-500 mt-1">Outstanding balance aging report</p>
              </button>
              <button
                onClick={() => navigate(`/dashboard/reports/deposit-summary?property_id=${propertyId}`)}
                className="p-4 border border-gray-200 rounded-xl text-left hover:border-gray-300 hover:shadow-md transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center mb-3">
                  <Wallet className="w-5 h-5 text-purple-600" />
                </div>
                <h4 className="font-semibold text-gray-900">Deposit Summary</h4>
                <p className="text-sm text-gray-500 mt-1">Tenant deposits overview</p>
              </button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

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

            <Select
              label="Management Type"
              value={editForm.management_type}
              onChange={(e) => setEditForm({ ...editForm, management_type: e.target.value })}
              options={[
                { value: 'rental', label: 'Rental' },
                { value: 'levy', label: 'Levy' },
              ]}
            />
          </div>

          <Input
            type="number"
            label="Total Units"
            placeholder="1"
            min="1"
            value={editForm.total_units}
            onChange={(e) => setEditForm({ ...editForm, total_units: parseInt(e.target.value) || 1 })}
          />

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

      {/* Create Unit Modal */}
      <Modal
        open={showUnitModal}
        onClose={() => setShowUnitModal(false)}
        title="Add Unit"
        icon={Plus}
      >
        <UnitForm
          initialValues={{ property: propertyId }}
          onSubmit={(data) => createUnitMutation.mutate(data)}
          isSubmitting={createUnitMutation.isPending}
          onCancel={() => setShowUnitModal(false)}
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
          initialValues={{ property: propertyId }}
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

      {/* Generate Billing Modal */}
      <Modal
        open={showBillingModal}
        onClose={() => setShowBillingModal(false)}
        title={`Generate Billing — ${property?.name || ''}`}
        icon={FileText}
      >
        <form onSubmit={(e) => { e.preventDefault(); billingMutation.mutate(); }} className="space-y-5">
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-sm text-blue-700">
              Generate invoices for all active leases under this property. Already-billed leases will be skipped.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Month"
              value={billingForm.month}
              onChange={(e) => setBillingForm({ ...billingForm, month: Number(e.target.value) })}
              options={[
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
              ].map((m, i) => ({ value: String(i + 1), label: m }))}
            />
            <Input
              type="number"
              label="Year"
              value={billingForm.year}
              onChange={(e) => setBillingForm({ ...billingForm, year: Number(e.target.value) })}
              min="2020"
              max="2030"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowBillingModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={billingMutation.isPending}>
              {billingMutation.isPending ? 'Generating...' : 'Generate Invoices'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
