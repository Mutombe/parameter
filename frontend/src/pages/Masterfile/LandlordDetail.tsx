import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
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
  Clock,
  Wrench,
  ScrollText,
  BarChart3,
  TrendingUp,
  Layers,
  Download,
  ChevronRight,
  Eye,
  Calendar as CalendarIcon,
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
import { landlordApi, reportsApi, propertyApi, leaseApi, tenantApi, invoiceApi, receiptApi, subsidiaryApi } from '../../services/api'
import PropertyForm from '../../components/forms/PropertyForm'
import LeaseForm from '../../components/forms/LeaseForm'
import { formatCurrency, formatPercent, cn } from '../../lib/utils'
import { Modal, Button, Input, Select, Textarea, Tooltip as UiTooltip, TableFilter, Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui'
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

// Reusable pagination controls
function PaginationControls({ currentPage, totalPages, setCurrentPage, startIndex, endIndex, totalItems }: {
  currentPage: number
  totalPages: number
  setCurrentPage: (page: number) => void
  startIndex: number
  endIndex: number
  totalItems: number
}) {
  if (totalPages <= 1) return null
  return (
    <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
      <span className="text-sm text-gray-500">
        Showing {startIndex}-{endIndex} of {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          const page = totalPages <= 5 ? i + 1 :
            currentPage <= 3 ? i + 1 :
            currentPage >= totalPages - 2 ? totalPages - 4 + i :
            currentPage - 2 + i
          return (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`px-3 py-1 text-sm rounded-lg ${page === currentPage ? 'bg-primary-600 text-white' : 'border border-gray-200 hover:bg-gray-50'}`}
            >
              {page}
            </button>
          )
        })}
        <button
          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
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

  // I&E currency toggle
  const [ieCurrency, setIeCurrency] = useState<string>('USD')

  // Sub-accounts state
  const [selectedSubAccount, setSelectedSubAccount] = useState<number | null>(null)
  const [subAccountView, setSubAccountView] = useState<'individual' | 'consolidated'>('individual')
  const [subAccountDateRange, setSubAccountDateRange] = useState({
    period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    period_end: new Date().toISOString().split('T')[0],
  })
  const [subAccountStatementView, setSubAccountStatementView] = useState<'consolidated' | 'audit'>('consolidated')

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
    placeholderData: keepPreviousData,
  })

  // Normalize list data (handle paginated vs array responses) — defined early for use in queries
  const normalizeList = (data: any) => {
    if (!data) return []
    if (Array.isArray(data)) return data
    if (data.results && Array.isArray(data.results)) return data.results
    return []
  }

  // 2. Landlord statement (property/unit counts, occupancy)
  const { data: statement, isLoading: loadingStatement } = useQuery({
    queryKey: ['landlord-statement', landlordId],
    queryFn: () => landlordApi.statement(landlordId).then((r) => r.data),
    enabled: !!landlordId,
    placeholderData: keepPreviousData,
  })

  // 3. Landlord financial statement (invoiced, collected, commission, properties table)
  const { data: financialStatement, isLoading: loadingFinancial } = useQuery({
    queryKey: ['landlord-financial', landlordId],
    queryFn: () => reportsApi.landlordStatement({ landlord_id: landlordId }).then((r) => r.data),
    enabled: !!landlordId,
    placeholderData: keepPreviousData,
  })

  // 4. Commission by property
  const { data: commissionData, isLoading: loadingCommission } = useQuery({
    queryKey: ['landlord-commission', landlordId],
    queryFn: () => reportsApi.commission({ landlord_id: landlordId }).then((r) => r.data),
    enabled: !!landlordId,
    placeholderData: keepPreviousData,
  })

  // 5. Aged analysis
  const { data: agedData, isLoading: loadingAged } = useQuery({
    queryKey: ['landlord-aged', landlordId],
    queryFn: () => reportsApi.agedAnalysis({ landlord_id: landlordId }).then((r) => r.data),
    enabled: !!landlordId,
    placeholderData: keepPreviousData,
  })

  // 6. Income vs expenditure
  const { data: incomeExpData, isLoading: loadingIncomeExp } = useQuery({
    queryKey: ['landlord-income-exp', landlordId, ieCurrency],
    queryFn: () => reportsApi.incomeExpenditure({ landlord_id: landlordId, currency: ieCurrency }).then((r) => r.data),
    enabled: !!landlordId,
    placeholderData: keepPreviousData,
  })

  // 7. Lease charges
  const { data: leaseChargesData, isLoading: loadingLeaseCharges } = useQuery({
    queryKey: ['landlord-lease-charges', landlordId],
    queryFn: () => reportsApi.leaseCharges({ landlord_id: landlordId }).then((r) => r.data),
    enabled: !!landlordId,
    placeholderData: keepPreviousData,
  })

  // 8. Leases for this landlord's properties
  const { data: leasesData, isLoading: loadingLeases } = useQuery({
    queryKey: ['landlord-leases', landlordId],
    queryFn: () => leaseApi.list({ landlord: landlordId }).then((r) => r.data),
    enabled: !!landlordId,
    placeholderData: keepPreviousData,
  })

  // 9. Tenants for this landlord's properties
  const { data: tenantsData, isLoading: loadingTenants } = useQuery({
    queryKey: ['landlord-tenants', landlordId],
    queryFn: () => tenantApi.list({ landlord: landlordId }).then((r) => r.data),
    enabled: !!landlordId,
    placeholderData: keepPreviousData,
  })

  // 10. Invoices for this landlord's properties
  const { data: invoicesData, isLoading: loadingInvoices } = useQuery({
    queryKey: ['landlord-invoices', landlordId],
    queryFn: () => invoiceApi.list({ landlord: landlordId }).then((r) => r.data),
    enabled: !!landlordId,
    placeholderData: keepPreviousData,
  })

  // 11. Receipts for this landlord's properties
  const { data: receiptsData, isLoading: loadingReceipts } = useQuery({
    queryKey: ['landlord-receipts', landlordId],
    queryFn: () => receiptApi.list({ landlord: landlordId }).then((r) => r.data),
    enabled: !!landlordId,
    placeholderData: keepPreviousData,
  })

  // 12. Sub-accounts for this landlord
  const { data: subAccountsData, isLoading: loadingSubAccounts } = useQuery({
    queryKey: ['landlord-sub-accounts', landlordId],
    queryFn: () => subsidiaryApi.list({ landlord: landlordId }).then((r) => r.data),
    enabled: !!landlordId,
    placeholderData: keepPreviousData,
  })

  // 13. Sub-account statement (individual)
  const { data: subAccountStatement, isLoading: loadingSubStatement } = useQuery({
    queryKey: ['sub-account-statement', selectedSubAccount, subAccountDateRange, subAccountStatementView],
    queryFn: () => subsidiaryApi.statement(selectedSubAccount!, {
      period_start: subAccountDateRange.period_start,
      period_end: subAccountDateRange.period_end,
      view: subAccountStatementView,
    }).then((r) => r.data),
    enabled: !!selectedSubAccount,
    placeholderData: keepPreviousData,
  })

  // 14. Consolidated statement (all sub-accounts)
  const consolidatedStatements = useQuery({
    queryKey: ['landlord-consolidated-statements', landlordId, subAccountDateRange],
    queryFn: async () => {
      const accounts = normalizeList(subAccountsData)
      if (accounts.length === 0) return []
      const promises = accounts.map((acc: any) =>
        subsidiaryApi.statement(acc.id, {
          period_start: subAccountDateRange.period_start,
          period_end: subAccountDateRange.period_end,
          view: 'consolidated',
        }).then((r) => ({
          account: acc,
          statement: r.data,
        }))
      )
      return Promise.all(promises)
    },
    enabled: !!landlordId && subAccountView === 'consolidated' && normalizeList(subAccountsData).length > 0,
    placeholderData: keepPreviousData,
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
      queryClient.invalidateQueries({ queryKey: ['landlord-leases', landlordId] })
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

  // Aged analysis detail rows (tenant-level breakdown)
  const agedDetailRows = (() => {
    if (!agedData) return []
    const tenants = agedData.tenants || agedData.details || agedData.items
    if (Array.isArray(tenants)) return tenants
    return []
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

  // Commission detail rows
  const commissionDetailRows = (() => {
    if (!commissionData) return []
    const items = commissionData.properties || commissionData.items || commissionData
    if (!Array.isArray(items)) return []
    return items
  })()

  // Properties table data
  const propertiesTable =
    financialStatement?.properties || statement?.properties || []

  // Lease charges table data
  const leaseChargesTable = leaseChargesData?.charges || leaseChargesData?.items || (Array.isArray(leaseChargesData) ? leaseChargesData : [])

  const leasesList = normalizeList(leasesData)
  const tenantsList = normalizeList(tenantsData)
  const invoicesList = normalizeList(invoicesData)
  const receiptsList = normalizeList(receiptsData)

  // Financial statement line items
  const financialLineItems = (() => {
    if (!financialStatement) return []
    const items = financialStatement.line_items || financialStatement.transactions || financialStatement.entries
    if (Array.isArray(items)) return items
    return []
  })()

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

  // --- Tenants filter state ---
  const [tenantsSearch, setTenantsSearch] = useState('')
  const filteredTenants = useMemo(() => {
    if (!tenantsSearch) return tenantsList
    const q = tenantsSearch.toLowerCase()
    return tenantsList.filter((t: any) =>
      (t.name || t.first_name || '').toLowerCase().includes(q) ||
      (t.last_name || '').toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q) ||
      (t.property_name || '').toLowerCase().includes(q) ||
      (t.unit_name || '').toLowerCase().includes(q)
    )
  }, [tenantsList, tenantsSearch])
  const tenantsPagination = usePagination(filteredTenants, { pageSize: 10 })
  useEffect(() => { tenantsPagination.setCurrentPage(1) }, [tenantsSearch])

  // --- Leases filter state ---
  const [leasesSearch, setLeasesSearch] = useState('')
  const filteredLeases = useMemo(() => {
    if (!leasesSearch) return leasesList
    const q = leasesSearch.toLowerCase()
    return leasesList.filter((l: any) =>
      (l.lease_number || l.reference || '').toLowerCase().includes(q) ||
      (l.tenant_name || l.tenant || '').toLowerCase().includes(q) ||
      (l.property_name || l.property || '').toLowerCase().includes(q) ||
      (l.unit_name || l.unit || '').toLowerCase().includes(q) ||
      (l.status || '').toLowerCase().includes(q)
    )
  }, [leasesList, leasesSearch])
  const leasesPagination = usePagination(filteredLeases, { pageSize: 10 })
  useEffect(() => { leasesPagination.setCurrentPage(1) }, [leasesSearch])

  // --- Invoices filter state ---
  const [invoicesSearch, setInvoicesSearch] = useState('')
  const filteredInvoices = useMemo(() => {
    if (!invoicesSearch) return invoicesList
    const q = invoicesSearch.toLowerCase()
    return invoicesList.filter((inv: any) =>
      (inv.invoice_number || inv.reference || '').toLowerCase().includes(q) ||
      (inv.tenant_name || inv.tenant || '').toLowerCase().includes(q) ||
      (inv.property_name || inv.property || '').toLowerCase().includes(q) ||
      (inv.status || '').toLowerCase().includes(q)
    )
  }, [invoicesList, invoicesSearch])
  const invoicesPagination = usePagination(filteredInvoices, { pageSize: 10 })
  useEffect(() => { invoicesPagination.setCurrentPage(1) }, [invoicesSearch])

  // --- Receipts filter state ---
  const [receiptsSearch, setReceiptsSearch] = useState('')
  const filteredReceipts = useMemo(() => {
    if (!receiptsSearch) return receiptsList
    const q = receiptsSearch.toLowerCase()
    return receiptsList.filter((r: any) =>
      (r.receipt_number || r.reference || '').toLowerCase().includes(q) ||
      (r.tenant_name || r.tenant || '').toLowerCase().includes(q) ||
      (r.property_name || r.property || '').toLowerCase().includes(q)
    )
  }, [receiptsList, receiptsSearch])
  const receiptsPagination = usePagination(filteredReceipts, { pageSize: 10 })
  useEffect(() => { receiptsPagination.setCurrentPage(1) }, [receiptsSearch])

  // --- Commission filter state ---
  const [commissionSearch, setCommissionSearch] = useState('')
  const filteredCommission = useMemo(() => {
    if (!commissionSearch) return commissionDetailRows
    const q = commissionSearch.toLowerCase()
    return commissionDetailRows.filter((c: any) =>
      (c.property_name || c.property || c.name || '').toLowerCase().includes(q)
    )
  }, [commissionDetailRows, commissionSearch])
  const commissionPagination = usePagination(filteredCommission, { pageSize: 10 })
  useEffect(() => { commissionPagination.setCurrentPage(1) }, [commissionSearch])

  // --- Aged detail filter state ---
  const [agedSearch, setAgedSearch] = useState('')
  const filteredAged = useMemo(() => {
    if (!agedSearch) return agedDetailRows
    const q = agedSearch.toLowerCase()
    return agedDetailRows.filter((a: any) =>
      (a.tenant_name || a.tenant || a.name || '').toLowerCase().includes(q) ||
      (a.property_name || a.property || '').toLowerCase().includes(q)
    )
  }, [agedDetailRows, agedSearch])
  const agedPagination = usePagination(filteredAged, { pageSize: 10 })
  useEffect(() => { agedPagination.setCurrentPage(1) }, [agedSearch])

  // Status badge helper
  const statusBadge = (status: string) => {
    const s = (status || '').toLowerCase()
    const config: Record<string, string> = {
      active: 'bg-emerald-50 text-emerald-700',
      paid: 'bg-emerald-50 text-emerald-700',
      posted: 'bg-emerald-50 text-emerald-700',
      completed: 'bg-emerald-50 text-emerald-700',
      pending: 'bg-amber-50 text-amber-700',
      draft: 'bg-gray-100 text-gray-600',
      overdue: 'bg-red-50 text-red-700',
      expired: 'bg-red-50 text-red-700',
      terminated: 'bg-red-50 text-red-700',
      cancelled: 'bg-red-50 text-red-700',
      partial: 'bg-blue-50 text-blue-700',
    }
    return (
      <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize', config[s] || 'bg-gray-100 text-gray-600')}>
        {status || '-'}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <button onClick={() => navigate('/dashboard')} className="hover:text-gray-900 transition-colors">Dashboard</button>
        <span>/</span>
        <button onClick={() => navigate('/dashboard/landlords')} className="hover:text-gray-900 transition-colors">Landlords</button>
        <span>/</span>
        <span className="text-gray-900 font-medium">{landlord?.name || '...'}</span>
      </nav>

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

      {/* ===== TABBED SECTIONS ===== */}
      <Tabs defaultValue="properties" className="space-y-6">
        <div className="overflow-x-auto">
          <TabsList className="flex-wrap">
            <TabsTrigger value="properties" icon={Building2}>Properties</TabsTrigger>
            <TabsTrigger value="financial" icon={DollarSign}>Financial</TabsTrigger>
            <TabsTrigger value="commission" icon={TrendingUp}>Commission</TabsTrigger>
            <TabsTrigger value="income-exp" icon={BarChart3}>Income & Exp</TabsTrigger>
            <TabsTrigger value="tenants" icon={Users}>Tenants</TabsTrigger>
            <TabsTrigger value="leases" icon={ScrollText}>Leases</TabsTrigger>
            <TabsTrigger value="invoices" icon={FileText}>Invoices</TabsTrigger>
            <TabsTrigger value="receipts" icon={Receipt}>Receipts</TabsTrigger>
            <TabsTrigger value="sub-accounts" icon={Layers}>Sub Accounts</TabsTrigger>
            <TabsTrigger value="aged" icon={Clock}>Aged Analysis</TabsTrigger>
            <TabsTrigger value="maintenance" icon={Wrench}>Maintenance</TabsTrigger>
          </TabsList>
        </div>

        {/* ===== PROPERTIES TAB ===== */}
        <TabsContent value="properties" className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                <div className="p-6"><TableSkeleton /></div>
              ) : propertiesTable.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-400">
                  No properties found for this landlord
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Property</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Units</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Occupancy</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Invoiced</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Collected</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedProperties.map((prop: any, idx: number) => {
                      const propOccupancy = prop.total_units > 0 ? ((prop.occupied_units || 0) / prop.total_units) * 100 : 0
                      return (
                        <tr
                          key={prop.id || idx}
                          onMouseEnter={() => prop.id && prefetch(`/dashboard/properties/${prop.id}`)}
                          onClick={() => prop.id && navigate(`/dashboard/properties/${prop.id}`)}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <td className="px-6 py-4 text-sm font-medium">
                            <span className="text-primary-600 hover:text-primary-700 hover:underline cursor-pointer">
                              {prop.property_name || prop.name}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 text-right">{prop.total_units ?? prop.units ?? '-'}</td>
                          <td className="px-6 py-4 text-right">
                            <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', propOccupancy >= 80 ? 'bg-emerald-50 text-emerald-700' : propOccupancy >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700')}>
                              {formatPercent(propOccupancy)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(prop.invoiced || prop.total_invoiced || 0)}</td>
                          <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(prop.collected || prop.total_collected || 0)}</td>
                          <td className="px-6 py-4 text-sm font-medium text-right">
                            <span className={(prop.balance || prop.outstanding || 0) > 0 ? 'text-red-600' : 'text-gray-900'}>
                              {formatCurrency(prop.balance || prop.outstanding || 0)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              <PaginationControls currentPage={propsPage} totalPages={propsTotalPages} setCurrentPage={setPropsPage} startIndex={propsStart} endIndex={propsEnd} totalItems={propsTotal} />
            </div>
          </div>

          {/* Occupancy Donut */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
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
                    <Pie data={occupancyPieData} innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="value">
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
                  {loadingStatement ? (
                    <div className="h-4 w-6 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    <span className="text-sm font-semibold text-gray-900">{entry.value}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ===== FINANCIAL STATEMENT TAB ===== */}
        <TabsContent value="financial" className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Invoiced</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalInvoiced)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Collected</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(totalCollected)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Net Payable to Landlord</p>
              <p className="text-2xl font-bold text-primary-600 mt-1">{formatCurrency(netPayable)}</p>
              <p className="text-xs text-gray-400 mt-1">After {commissionRate}% commission</p>
            </div>
          </div>

          {/* Financial statement line items */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Financial Statement</h3>
              <p className="text-sm text-gray-500">Detailed transaction breakdown</p>
            </div>
            <div className="overflow-x-auto">
              {loadingFinancial ? (
                <div className="p-6"><TableSkeleton /></div>
              ) : financialLineItems.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-400">
                  Financial statement data is shown in the summary cards above. Detailed line items will appear here when available.
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Description</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Property</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Debit</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Credit</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {financialLineItems.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-600">{item.date || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{item.description || item.narration || '-'}</td>
                        <td className="px-6 py-4 text-sm">
                          {item.property_id ? (
                            <button onClick={() => navigate(`/dashboard/properties/${item.property_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {item.property_name || item.property}
                            </button>
                          ) : (
                            <span className="text-gray-600">{item.property_name || item.property || '-'}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">{item.debit ? formatCurrency(item.debit) : '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">{item.credit ? formatCurrency(item.credit) : '-'}</td>
                        <td className="px-6 py-4 text-sm font-medium text-right">{formatCurrency(item.balance || item.running_balance || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Lease Charges */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                <div className="p-6"><TableSkeleton rows={6} /></div>
              ) : leaseChargesTable.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-400">No lease charges found for this landlord</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Lease</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Tenant</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Property</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Unit</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Monthly Rent</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Total Charged</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Paid</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedCharges.map((charge: any, idx: number) => (
                      <tr key={charge.id || idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium">
                          {charge.lease_id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/leases/${charge.lease_id}`)} onClick={() => navigate(`/dashboard/leases/${charge.lease_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {charge.lease_number || charge.lease_ref || `LSE-${charge.lease_id}`}
                            </button>
                          ) : <span className="text-gray-400">-</span>}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium">
                          {charge.tenant_id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/tenants/${charge.tenant_id}`)} onClick={() => navigate(`/dashboard/tenants/${charge.tenant_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {charge.tenant_name || charge.tenant}
                            </button>
                          ) : <span className="text-gray-900">{charge.tenant_name || charge.tenant}</span>}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {charge.property_id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/properties/${charge.property_id}`)} onClick={() => navigate(`/dashboard/properties/${charge.property_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {charge.property_name || charge.property}
                            </button>
                          ) : <span className="text-gray-600">{charge.property_name || charge.property}</span>}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {charge.unit_id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/units/${charge.unit_id}`)} onClick={() => navigate(`/dashboard/units/${charge.unit_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {charge.unit_name || charge.unit}
                            </button>
                          ) : <span className="text-gray-600">{charge.unit_name || charge.unit}</span>}
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
              <PaginationControls currentPage={chargesPage} totalPages={chargesTotalPages} setCurrentPage={setChargesPage} startIndex={chargesStart} endIndex={chargesEnd} totalItems={chargesTotal} />
            </div>
          </div>
        </TabsContent>

        {/* ===== COMMISSION TAB ===== */}
        <TabsContent value="commission" className="space-y-6">
          {/* Commission summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Commission Rate</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{commissionRate}%</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Commission</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{formatCurrency(commissionData?.summary?.total_commission || commissionData?.total_commission || 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Properties with Commission</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{commissionDetailRows.length}</p>
            </div>
          </div>

          {/* Commission chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
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
              {loadingCommission ? <ChartSkeleton /> : commissionChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-400">No commission data available</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={commissionChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="collected" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Collected" />
                    <Bar dataKey="commission" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Commission" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Commission table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Commission Detail</h3>
              <p className="text-sm text-gray-500">Breakdown by property</p>
            </div>
            {commissionDetailRows.length > 0 && (
              <TableFilter searchPlaceholder="Search properties..." searchValue={commissionSearch} onSearchChange={setCommissionSearch} resultCount={filteredCommission.length} />
            )}
            <div className="overflow-x-auto">
              {loadingCommission ? (
                <div className="p-6"><TableSkeleton /></div>
              ) : commissionDetailRows.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-400">No commission data available</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Property</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Rate</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Collected</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Commission</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Net Payable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {commissionPagination.paginatedData.map((c: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium">
                          {c.property_id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/properties/${c.property_id}`)} onClick={() => navigate(`/dashboard/properties/${c.property_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {c.property_name || c.property || c.name}
                            </button>
                          ) : <span className="text-gray-900">{c.property_name || c.property || c.name}</span>}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">{c.commission_rate || commissionRate}%</td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(c.collected || c.total_collected || 0)}</td>
                        <td className="px-6 py-4 text-sm font-medium text-purple-600 text-right">{formatCurrency(c.commission || c.commission_amount || 0)}</td>
                        <td className="px-6 py-4 text-sm font-medium text-right">{formatCurrency((c.collected || c.total_collected || 0) - (c.commission || c.commission_amount || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <PaginationControls {...commissionPagination} />
            </div>
          </div>
        </TabsContent>

        {/* ===== INCOME & EXPENDITURE TAB ===== */}
        <TabsContent value="income-exp" className="space-y-6">
          {/* Currency toggle */}
          <div className="flex items-center justify-between">
            <div />
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setIeCurrency('USD')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  ieCurrency === 'USD' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                USD
              </button>
              <button
                onClick={() => setIeCurrency('ZWG')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  ieCurrency === 'ZWG' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                ZWG
              </button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Opening Balance</p>
              <p className={cn('text-2xl font-bold mt-1', (incomeExpData?.consolidated?.balance_bf || 0) < 0 ? 'text-red-600' : 'text-emerald-600')}>{formatCurrency(incomeExpData?.consolidated?.balance_bf || incomeExpData?.total_income || 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Income</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(incomeExpData?.consolidated?.levies || incomeExpData?.total_income || 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Expenditure</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(incomeExpData?.consolidated?.total_expenditure || incomeExpData?.total_expenses || 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Closing Balance</p>
              <p className={cn('text-2xl font-bold mt-1', (incomeExpData?.consolidated?.balance_cf || 0) < 0 ? 'text-red-600' : 'text-gray-900')}>{formatCurrency(incomeExpData?.consolidated?.balance_cf ?? ((incomeExpData?.total_income || 0) - (incomeExpData?.total_expenses || 0)))}</p>
            </div>
          </div>

          {/* Monthly I&E table (if months data available) */}
          {incomeExpData?.months && incomeExpData.months.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {(incomeExpData.properties || []).join(', ') || incomeExpData.entity?.name || 'Income & Expenditure'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {incomeExpData.period ? `For the period ${incomeExpData.period.start} to ${incomeExpData.period.end}` : 'Monthly breakdown'}
                  </p>
                </div>
                {incomeExpData.currency && (
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full uppercase">{incomeExpData.currency}</span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider sticky left-0 bg-gray-50 min-w-[200px]">Item</th>
                      {incomeExpData.months.map((m: any) => (
                        <th key={m.month} className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[120px]">{m.label}</th>
                      ))}
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-800 uppercase tracking-wider min-w-[130px] bg-gray-100">Consolidated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {/* INCOME HEADER */}
                    <tr className="bg-emerald-50/50">
                      <td colSpan={incomeExpData.months.length + 2} className="px-4 py-2 text-xs font-bold text-emerald-800 uppercase tracking-wider">Income</td>
                    </tr>
                    {/* Balance b/forward */}
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-700 sticky left-0 bg-white">Balance b/forward</td>
                      {incomeExpData.months.map((m: any) => (
                        <td key={m.month} className={cn('px-4 py-2.5 text-right tabular-nums', (m.balance_bf || 0) < 0 ? 'text-red-600 font-semibold' : 'text-emerald-700 font-semibold')}>{formatCurrency(m.balance_bf ?? 0)}</td>
                      ))}
                      <td className={cn('px-4 py-2.5 text-right tabular-nums bg-gray-50 font-bold', (incomeExpData.consolidated?.balance_bf || 0) < 0 ? 'text-red-600' : 'text-emerald-700')}>{formatCurrency(incomeExpData.consolidated?.balance_bf ?? 0)}</td>
                    </tr>
                    {/* Income category rows */}
                    {incomeExpData.income_category_labels && incomeExpData.income_category_labels.length > 0 ? (
                      incomeExpData.income_category_labels.map((cat: any) => (
                        <tr key={cat.key} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-700 sticky left-0 bg-white pl-8">{cat.label}</td>
                          {incomeExpData.months.map((m: any) => (
                            <td key={m.month} className="px-4 py-2.5 text-right tabular-nums text-gray-900">{formatCurrency(m.income_categories?.[cat.key] ?? 0)}</td>
                          ))}
                          <td className="px-4 py-2.5 text-right tabular-nums bg-gray-50 font-bold text-gray-900">{formatCurrency(incomeExpData.consolidated?.income_categories?.[cat.key] ?? 0)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-700 sticky left-0 bg-white pl-8">Levies</td>
                        {incomeExpData.months.map((m: any) => (
                          <td key={m.month} className="px-4 py-2.5 text-right tabular-nums text-gray-900">{formatCurrency(m.levies ?? 0)}</td>
                        ))}
                        <td className="px-4 py-2.5 text-right tabular-nums bg-gray-50 font-bold text-gray-900">{formatCurrency(incomeExpData.consolidated?.levies ?? 0)}</td>
                      </tr>
                    )}
                    {/* Amount before Expenditure */}
                    <tr className="bg-emerald-50/30 border-t border-emerald-200">
                      <td className="px-4 py-2.5 font-semibold text-emerald-800 sticky left-0 bg-emerald-50/30">Amount before Expenditure</td>
                      {incomeExpData.months.map((m: any) => (
                        <td key={m.month} className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-800">{formatCurrency(m.amount_before_expenditure ?? 0)}</td>
                      ))}
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-emerald-800 bg-emerald-50">{formatCurrency(incomeExpData.consolidated?.total_income ?? 0)}</td>
                    </tr>

                    {/* EXPENDITURE HEADER */}
                    <tr className="bg-red-50/50">
                      <td colSpan={incomeExpData.months.length + 2} className="px-4 py-2 text-xs font-bold text-red-800 uppercase tracking-wider">Expenditure</td>
                    </tr>
                    {/* Expense category rows */}
                    {(incomeExpData.expense_category_labels || []).map((cat: any) => (
                      <tr key={cat.key} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-700 sticky left-0 bg-white pl-8">{cat.label}</td>
                        {incomeExpData.months.map((m: any) => (
                          <td key={m.month} className="px-4 py-2.5 text-right tabular-nums text-gray-900">{formatCurrency(m.expenditure_categories?.[cat.key] ?? 0)}</td>
                        ))}
                        <td className="px-4 py-2.5 text-right tabular-nums bg-gray-50 font-bold text-gray-900">{formatCurrency(incomeExpData.consolidated?.expenditure_categories?.[cat.key] ?? 0)}</td>
                      </tr>
                    ))}
                    {/* Management Commission */}
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-700 sticky left-0 bg-white pl-8">Management Commission {incomeExpData.commission_rate}% (inc VAT)</td>
                      {incomeExpData.months.map((m: any) => (
                        <td key={m.month} className="px-4 py-2.5 text-right tabular-nums text-gray-900">{formatCurrency(m.management_commission ?? 0)}</td>
                      ))}
                      <td className="px-4 py-2.5 text-right tabular-nums bg-gray-50 font-bold text-gray-900">{formatCurrency(incomeExpData.consolidated?.management_commission ?? 0)}</td>
                    </tr>
                    {/* Total Expenditure */}
                    <tr className="bg-red-50/30 border-t border-red-200">
                      <td className="px-4 py-2.5 font-semibold text-red-800 sticky left-0 bg-red-50/30">Total Expenditure</td>
                      {incomeExpData.months.map((m: any) => (
                        <td key={m.month} className="px-4 py-2.5 text-right tabular-nums font-semibold text-red-800">{formatCurrency(m.total_expenditure ?? 0)}</td>
                      ))}
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-red-800 bg-red-50">{formatCurrency(incomeExpData.consolidated?.total_expenditure ?? 0)}</td>
                    </tr>

                    {/* BALANCE C/F */}
                    <tr className="bg-gray-100 border-t-2 border-gray-300">
                      <td className="px-4 py-3 font-bold text-gray-900 sticky left-0 bg-gray-100">Balance c/f</td>
                      {incomeExpData.months.map((m: any) => (
                        <td key={m.month} className={cn('px-4 py-3 text-right tabular-nums font-bold', (m.balance_cf || 0) < 0 ? 'text-red-600' : 'text-emerald-700')}>{formatCurrency(m.balance_cf ?? 0)}</td>
                      ))}
                      <td className={cn('px-4 py-3 text-right tabular-nums font-bold bg-gray-200', (incomeExpData.consolidated?.balance_cf || 0) < 0 ? 'text-red-600' : 'text-emerald-700')}>{formatCurrency(incomeExpData.consolidated?.balance_cf ?? 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Income Summary (per tenant/account holder) */}
          {incomeExpData?.income_summary?.tenants && incomeExpData.income_summary.tenants.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">Income Summary</h3>
                {incomeExpData.income_summary.as_of && <p className="text-sm text-gray-500">as at {incomeExpData.income_summary.as_of}</p>}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{incomeExpData.management_type === 'levy' ? 'Account Holder' : 'Tenant'}</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Balance B/F</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Charge</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount Due</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount Paid</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Penalty</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Carried Forward</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {incomeExpData.income_summary.tenants.map((t: any, i: number) => {
                      const displayName = incomeExpData.management_type === 'levy' ? (t.account_holder || t.name) : t.name
                      const linkId = t.account_holder_id || t.tenant_id || t.id
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-900 font-medium">
                            {linkId ? (
                              <button
                                onClick={() => navigate(`/dashboard/tenants/${linkId}`)}
                                className="text-primary-600 hover:text-primary-700 hover:underline text-left"
                              >
                                {displayName}
                              </button>
                            ) : displayName}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{formatCurrency(t.balance_bf ?? 0)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{formatCurrency(t.charge ?? 0)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 font-medium">{formatCurrency(t.amount_due ?? 0)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{formatCurrency(t.amount_paid ?? 0)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">{formatCurrency(t.penalty ?? 0)}</td>
                          <td className={cn('px-4 py-2.5 text-right tabular-nums font-semibold', (t.carried_forward || 0) > 0 ? 'text-red-600' : (t.carried_forward || 0) < 0 ? 'text-emerald-600' : 'text-gray-700')}>{formatCurrency(t.carried_forward ?? 0)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                      <td className="px-4 py-3 text-gray-900">Total</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatCurrency(incomeExpData.income_summary.totals?.balance_bf ?? 0)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatCurrency(incomeExpData.income_summary.totals?.charge ?? 0)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatCurrency(incomeExpData.income_summary.totals?.amount_due ?? 0)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{formatCurrency(incomeExpData.income_summary.totals?.amount_paid ?? 0)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-700">{formatCurrency(incomeExpData.income_summary.totals?.penalty ?? 0)}</td>
                      <td className={cn('px-4 py-3 text-right tabular-nums', (incomeExpData.income_summary.totals?.carried_forward || 0) > 0 ? 'text-red-600' : 'text-emerald-600')}>{formatCurrency(incomeExpData.income_summary.totals?.carried_forward ?? 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Working Capital */}
          {incomeExpData?.working_capital && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">Working Capital</h3>
                {incomeExpData.working_capital.as_of && <p className="text-sm text-gray-500">as at {incomeExpData.working_capital.as_of}</p>}
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Debtors */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Debtors and Cash Balances</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-gray-600">Cash balances</span>
                        <span className={cn('tabular-nums font-medium', (incomeExpData.working_capital.debtors?.cash_balances || 0) < 0 ? 'text-red-600' : 'text-emerald-700')}>{formatCurrency(incomeExpData.working_capital.debtors?.cash_balances ?? 0)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-gray-600">Levies in arrears</span>
                        <span className="tabular-nums font-medium text-red-600">{formatCurrency(incomeExpData.working_capital.debtors?.levies_in_arrears ?? incomeExpData.working_capital.debtors?.arrears ?? 0)}</span>
                      </div>
                      <div className="flex justify-between py-2 bg-blue-50 rounded px-2 -mx-2">
                        <span className="font-semibold text-gray-900">Total Debtors</span>
                        <span className="tabular-nums font-bold text-blue-700">{formatCurrency(incomeExpData.working_capital.debtors?.subtotal ?? ((incomeExpData.working_capital.debtors?.cash_balances || 0) + (incomeExpData.working_capital.debtors?.levies_in_arrears ?? incomeExpData.working_capital.debtors?.arrears ?? 0)))}</span>
                      </div>
                    </div>
                  </div>
                  {/* Creditors */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Creditors</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-gray-600">Overdraft</span>
                        <span className="tabular-nums font-medium text-red-600">{formatCurrency(incomeExpData.working_capital.creditors?.overdraft ?? 0)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-gray-600">Prepayments in levies</span>
                        <span className="tabular-nums font-medium text-gray-700">{formatCurrency(incomeExpData.working_capital.creditors?.prepayments ?? 0)}</span>
                      </div>
                      <div className="flex justify-between py-2 bg-orange-50 rounded px-2 -mx-2">
                        <span className="font-semibold text-gray-900">Total Creditors</span>
                        <span className="tabular-nums font-bold text-orange-700">{formatCurrency(incomeExpData.working_capital.creditors?.subtotal ?? ((incomeExpData.working_capital.creditors?.overdraft || 0) + (incomeExpData.working_capital.creditors?.prepayments || 0)))}</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Net Working Capital */}
                <div className="mt-6 pt-4 border-t-2 border-gray-300">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-900">Net Working Capital</span>
                    <span className={cn('text-2xl tabular-nums font-bold', (incomeExpData.working_capital.net_working_capital ?? ((incomeExpData.working_capital.debtors?.subtotal || 0) - (incomeExpData.working_capital.creditors?.subtotal || 0))) >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                      {formatCurrency(incomeExpData.working_capital.net_working_capital ?? ((incomeExpData.working_capital.debtors?.subtotal || 0) - (incomeExpData.working_capital.creditors?.subtotal || 0)))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Fallback: Chart + simple tables when no monthly data */}
          {(!incomeExpData?.months || incomeExpData.months.length === 0) && (
            <>
              {/* Chart */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
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
                  {loadingIncomeExp ? <ChartSkeleton /> : incomeExpChartData.length === 0 ? (
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
              </div>

              {/* Income items table */}
              {incomeExpData?.income_items && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-6 border-b border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900">Income Breakdown</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Category</th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {incomeExpData.income_items.map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-900">{item.name || item.category}</td>
                            <td className="px-6 py-4 text-sm font-medium text-emerald-600 text-right">{formatCurrency(item.amount || item.total || 0)}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-6 py-4 text-sm text-gray-900">Total Income</td>
                          <td className="px-6 py-4 text-sm text-emerald-700 text-right">{formatCurrency(incomeExpData.total_income || 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Expense items table */}
              {incomeExpData?.expense_items && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-6 border-b border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900">Expenditure Breakdown</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Category</th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {incomeExpData.expense_items.map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-900">{item.name || item.category}</td>
                            <td className="px-6 py-4 text-sm font-medium text-red-600 text-right">{formatCurrency(item.amount || item.total || 0)}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-6 py-4 text-sm text-gray-900">Total Expenses</td>
                          <td className="px-6 py-4 text-sm text-red-700 text-right">{formatCurrency(incomeExpData.total_expenses || 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ===== TENANTS TAB ===== */}
        <TabsContent value="tenants" className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Tenants</h3>
              <p className="text-sm text-gray-500">All tenants across this landlord's properties</p>
            </div>
            {tenantsList.length > 0 && (
              <TableFilter searchPlaceholder="Search tenants..." searchValue={tenantsSearch} onSearchChange={setTenantsSearch} resultCount={filteredTenants.length} />
            )}
            <div className="overflow-x-auto">
              {loadingTenants ? (
                <div className="p-6"><TableSkeleton /></div>
              ) : tenantsList.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-400">No tenants found for this landlord's properties</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Name</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Email</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Phone</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Property</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Unit</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tenantsPagination.paginatedData.map((t: any, idx: number) => (
                      <tr key={t.id || idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium">
                          <button
                            onMouseEnter={() => t.id && prefetch(`/dashboard/tenants/${t.id}`)}
                            onClick={() => t.id && navigate(`/dashboard/tenants/${t.id}`)}
                            className="text-primary-600 hover:text-primary-700 hover:underline"
                          >
                            {t.name || `${t.first_name || ''} ${t.last_name || ''}`.trim() || '-'}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{t.email || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{t.phone || '-'}</td>
                        <td className="px-6 py-4 text-sm">
                          {t.property_id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/properties/${t.property_id}`)} onClick={() => navigate(`/dashboard/properties/${t.property_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {t.property_name || t.property || '-'}
                            </button>
                          ) : <span className="text-gray-600">{t.property_name || t.property || '-'}</span>}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {t.unit_id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/units/${t.unit_id}`)} onClick={() => navigate(`/dashboard/units/${t.unit_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {t.unit_name || t.unit || '-'}
                            </button>
                          ) : <span className="text-gray-600">{t.unit_name || t.unit || '-'}</span>}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-right">
                          <span className={(t.balance || t.outstanding || 0) > 0 ? 'text-red-600' : 'text-gray-900'}>
                            {formatCurrency(t.balance || t.outstanding || 0)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <PaginationControls {...tenantsPagination} />
            </div>
          </div>
        </TabsContent>

        {/* ===== LEASES TAB ===== */}
        <TabsContent value="leases" className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Leases</h3>
                <p className="text-sm text-gray-500">All leases for this landlord's properties</p>
              </div>
              <button
                onClick={() => setShowLeaseModal(true)}
                className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add Lease
              </button>
            </div>
            {leasesList.length > 0 && (
              <TableFilter searchPlaceholder="Search leases..." searchValue={leasesSearch} onSearchChange={setLeasesSearch} resultCount={filteredLeases.length} />
            )}
            <div className="overflow-x-auto">
              {loadingLeases ? (
                <div className="p-6"><TableSkeleton /></div>
              ) : leasesList.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-400">No leases found for this landlord's properties</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Lease #</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Tenant</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Property</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Unit</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Start</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">End</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Rent</th>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {leasesPagination.paginatedData.map((l: any, idx: number) => (
                      <tr key={l.id || idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium">
                          <button
                            onMouseEnter={() => l.id && prefetch(`/dashboard/leases/${l.id}`)}
                            onClick={() => l.id && navigate(`/dashboard/leases/${l.id}`)}
                            className="text-primary-600 hover:text-primary-700 hover:underline"
                          >
                            {l.lease_number || l.reference || `LSE-${l.id}`}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {l.tenant_id || l.tenant?.id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/tenants/${l.tenant_id || l.tenant?.id}`)} onClick={() => navigate(`/dashboard/tenants/${l.tenant_id || l.tenant?.id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {l.tenant_name || l.tenant?.name || l.tenant}
                            </button>
                          ) : <span className="text-gray-600">{l.tenant_name || l.tenant?.name || l.tenant || '-'}</span>}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {l.property_id || l.property?.id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/properties/${l.property_id || l.property?.id}`)} onClick={() => navigate(`/dashboard/properties/${l.property_id || l.property?.id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {l.property_name || l.property?.name || l.property}
                            </button>
                          ) : <span className="text-gray-600">{l.property_name || l.property?.name || l.property || '-'}</span>}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {l.unit_id || l.unit?.id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/units/${l.unit_id || l.unit?.id}`)} onClick={() => navigate(`/dashboard/units/${l.unit_id || l.unit?.id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {l.unit_name || l.unit?.name || l.unit}
                            </button>
                          ) : <span className="text-gray-600">{l.unit_name || l.unit?.name || l.unit || '-'}</span>}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{l.start_date || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{l.end_date || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(l.monthly_rent || l.rent_amount || l.rent || 0)}</td>
                        <td className="px-6 py-4 text-center">{statusBadge(l.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <PaginationControls {...leasesPagination} />
            </div>
          </div>
        </TabsContent>

        {/* ===== INVOICES TAB ===== */}
        <TabsContent value="invoices" className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Invoices</h3>
              <p className="text-sm text-gray-500">All invoices for this landlord's properties</p>
            </div>
            {invoicesList.length > 0 && (
              <TableFilter searchPlaceholder="Search invoices..." searchValue={invoicesSearch} onSearchChange={setInvoicesSearch} resultCount={filteredInvoices.length} />
            )}
            <div className="overflow-x-auto">
              {loadingInvoices ? (
                <div className="p-6"><TableSkeleton /></div>
              ) : invoicesList.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-400">No invoices found for this landlord's properties</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Invoice #</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Tenant</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Property</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Type</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Balance</th>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoicesPagination.paginatedData.map((inv: any, idx: number) => (
                      <tr key={inv.id || idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium">
                          <button
                            onMouseEnter={() => inv.id && prefetch(`/dashboard/invoices/${inv.id}`)}
                            onClick={() => inv.id && navigate(`/dashboard/invoices/${inv.id}`)}
                            className="text-primary-600 hover:text-primary-700 hover:underline"
                          >
                            {inv.invoice_number || inv.reference || `INV-${inv.id}`}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{inv.date || inv.invoice_date || inv.created_at?.split('T')[0] || '-'}</td>
                        <td className="px-6 py-4 text-sm">
                          {inv.tenant_id || inv.tenant?.id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/tenants/${inv.tenant_id || inv.tenant?.id}`)} onClick={() => navigate(`/dashboard/tenants/${inv.tenant_id || inv.tenant?.id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {inv.tenant_name || inv.tenant?.name || inv.tenant}
                            </button>
                          ) : <span className="text-gray-600">{inv.tenant_name || inv.tenant?.name || inv.tenant || '-'}</span>}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {inv.property_id || inv.property?.id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/properties/${inv.property_id || inv.property?.id}`)} onClick={() => navigate(`/dashboard/properties/${inv.property_id || inv.property?.id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {inv.property_name || inv.property?.name || inv.property}
                            </button>
                          ) : <span className="text-gray-600">{inv.property_name || inv.property?.name || inv.property || '-'}</span>}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 capitalize">{inv.invoice_type || inv.type || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(inv.amount || inv.total || 0)}</td>
                        <td className="px-6 py-4 text-sm font-medium text-right">
                          <span className={(inv.balance || inv.amount_due || 0) > 0 ? 'text-red-600' : 'text-gray-900'}>
                            {formatCurrency(inv.balance || inv.amount_due || 0)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">{statusBadge(inv.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <PaginationControls {...invoicesPagination} />
            </div>
          </div>
        </TabsContent>

        {/* ===== RECEIPTS TAB ===== */}
        <TabsContent value="receipts" className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Receipts</h3>
              <p className="text-sm text-gray-500">All payments received for this landlord's properties</p>
            </div>
            {receiptsList.length > 0 && (
              <TableFilter searchPlaceholder="Search receipts..." searchValue={receiptsSearch} onSearchChange={setReceiptsSearch} resultCount={filteredReceipts.length} />
            )}
            <div className="overflow-x-auto">
              {loadingReceipts ? (
                <div className="p-6"><TableSkeleton /></div>
              ) : receiptsList.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-400">No receipts found for this landlord's properties</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Receipt #</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Tenant</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Property</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Method</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {receiptsPagination.paginatedData.map((r: any, idx: number) => (
                      <tr key={r.id || idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium">
                          <button
                            onMouseEnter={() => r.id && prefetch(`/dashboard/receipts/${r.id}`)}
                            onClick={() => r.id && navigate(`/dashboard/receipts/${r.id}`)}
                            className="text-primary-600 hover:text-primary-700 hover:underline"
                          >
                            {r.receipt_number || r.reference || `RCT-${r.id}`}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{r.date || r.receipt_date || r.payment_date || r.created_at?.split('T')[0] || '-'}</td>
                        <td className="px-6 py-4 text-sm">
                          {r.tenant_id || r.tenant?.id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/tenants/${r.tenant_id || r.tenant?.id}`)} onClick={() => navigate(`/dashboard/tenants/${r.tenant_id || r.tenant?.id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {r.tenant_name || r.tenant?.name || r.tenant}
                            </button>
                          ) : <span className="text-gray-600">{r.tenant_name || r.tenant?.name || r.tenant || '-'}</span>}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {r.property_id || r.property?.id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/properties/${r.property_id || r.property?.id}`)} onClick={() => navigate(`/dashboard/properties/${r.property_id || r.property?.id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {r.property_name || r.property?.name || r.property}
                            </button>
                          ) : <span className="text-gray-600">{r.property_name || r.property?.name || r.property || '-'}</span>}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 capitalize">{r.payment_method || r.method || '-'}</td>
                        <td className="px-6 py-4 text-sm font-medium text-emerald-600 text-right">{formatCurrency(r.amount || r.total || 0)}</td>
                        <td className="px-6 py-4 text-center">{statusBadge(r.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <PaginationControls {...receiptsPagination} />
            </div>
          </div>
        </TabsContent>

        {/* ===== SUB ACCOUNTS TAB ===== */}
        <TabsContent value="sub-accounts" className="space-y-6">
          {/* View toggle & date range */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => { setSubAccountView('individual'); setSelectedSubAccount(null) }}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  subAccountView === 'individual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                Individual
              </button>
              <button
                onClick={() => setSubAccountView('consolidated')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  subAccountView === 'consolidated' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                Consolidated
              </button>
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

          {/* Sub-Account Summary Cards */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Subsidiary Accounts</h3>
              <p className="text-sm text-gray-500">Category-specific accounts for this landlord</p>
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
                  No subsidiary accounts found for this landlord
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {normalizeList(subAccountsData).map((acc: any) => {
                    const balance = acc.balance ?? acc.current_balance ?? 0
                    const isSelected = selectedSubAccount === acc.id && subAccountView === 'individual'
                    return (
                      <button
                        key={acc.id}
                        onClick={() => {
                          setSubAccountView('individual')
                          setSelectedSubAccount(isSelected ? null : acc.id)
                        }}
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
          </div>

          {/* Individual Account Statement */}
          {subAccountView === 'individual' && selectedSubAccount && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Account Statement
                    {(() => {
                      const acc = normalizeList(subAccountsData).find((a: any) => a.id === selectedSubAccount)
                      return acc ? ` - ${acc.category_name || acc.category || acc.name}` : ''
                    })()}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {subAccountDateRange.period_start} to {subAccountDateRange.period_end}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* View toggle */}
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
                  <button
                    onClick={async () => {
                      try {
                        const res = await subsidiaryApi.exportStatement(selectedSubAccount!, {
                          period_start: subAccountDateRange.period_start,
                          period_end: subAccountDateRange.period_end,
                          view: subAccountStatementView,
                        })
                        const url = URL.createObjectURL(new Blob([res.data]))
                        const a = document.createElement('a')
                        a.href = url
                        const acc = normalizeList(subAccountsData).find((x: any) => x.id === selectedSubAccount)
                        a.download = `statement-${(acc?.code || acc?.account_code || selectedSubAccount).replace(/\//g, '-')}.csv`
                        a.click()
                        URL.revokeObjectURL(url)
                      } catch { /* ignore */ }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export
                  </button>
                </div>
              </div>

              {/* Opening balance */}
              {subAccountStatement && (
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600">Opening Balance</span>
                  <span className={cn('text-sm font-bold tabular-nums', (subAccountStatement.opening_balance || 0) >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                    {formatCurrency(subAccountStatement.opening_balance ?? subAccountStatement.balance_bf ?? 0)}
                  </span>
                </div>
              )}

              <div className="overflow-x-auto">
                {loadingSubStatement ? (
                  <div className="p-6"><TableSkeleton /></div>
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
              {subAccountStatement && (
                <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600">Closing Balance</span>
                  <span className={cn('text-sm font-bold tabular-nums', (subAccountStatement.closing_balance ?? subAccountStatement.balance_cf ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                    {formatCurrency(subAccountStatement.closing_balance ?? subAccountStatement.balance_cf ?? 0)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Consolidated View - All categories merged */}
          {subAccountView === 'consolidated' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Consolidated Landlord Statement</h3>
                  <p className="text-sm text-gray-500">
                    All categories merged &middot; {subAccountDateRange.period_start} to {subAccountDateRange.period_end}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const res = await subsidiaryApi.exportLandlordConsolidated({
                        landlord_id: Number(landlordId),
                        period_start: subAccountDateRange.period_start,
                        period_end: subAccountDateRange.period_end,
                        view: subAccountStatementView,
                      })
                      const url = URL.createObjectURL(new Blob([res.data]))
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `consolidated-statement-${landlord?.name || landlordId}.csv`
                      a.click()
                      URL.revokeObjectURL(url)
                    } catch { /* ignore */ }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                </button>
              </div>

              <div className="overflow-x-auto">
                {consolidatedStatements.isLoading ? (
                  <div className="p-6"><TableSkeleton rows={8} /></div>
                ) : (() => {
                  const allTxns = (consolidatedStatements.data || []).flatMap((cs: any) =>
                    (cs.statement?.transactions || cs.statement?.entries || []).map((t: any) => ({
                      ...t,
                      category: cs.account?.category_name || cs.account?.category || cs.account?.name || '',
                      account_code: cs.account?.account_code || cs.account?.code || '',
                    }))
                  ).sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''))

                  if (allTxns.length === 0) {
                    return (
                      <div className="p-12 text-center text-sm text-gray-400">
                        No transactions found for this period
                      </div>
                    )
                  }

                  // Compute running balance for consolidated view
                  let runningBal = (consolidatedStatements.data || []).reduce(
                    (sum: number, cs: any) => sum + (cs.statement?.opening_balance ?? cs.statement?.balance_bf ?? 0), 0
                  )

                  return (
                    <>
                      {/* Opening balance row */}
                      <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">Opening Balance (All Categories)</span>
                        <span className={cn('text-sm font-bold tabular-nums', runningBal >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                          {formatCurrency(runningBal)}
                        </span>
                      </div>
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Category</th>
                            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Ref</th>
                            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Description</th>
                            <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Debit</th>
                            <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Credit</th>
                            <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {allTxns.map((txn: any, idx: number) => {
                            runningBal = runningBal + (txn.credit || 0) - (txn.debit || 0)
                            return (
                              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 text-sm text-gray-600">{txn.date || '-'}</td>
                                <td className="px-6 py-4">
                                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                    {txn.category}
                                  </span>
                                </td>
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
                                  <span className={runningBal < 0 ? 'text-red-600' : 'text-gray-900'}>
                                    {formatCurrency(runningBal)}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      {/* Closing balance */}
                      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">Closing Balance (All Categories)</span>
                        <span className={cn('text-sm font-bold tabular-nums', runningBal >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                          {formatCurrency(runningBal)}
                        </span>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===== AGED ANALYSIS TAB ===== */}
        <TabsContent value="aged" className="space-y-6">
          {/* Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Aged Outstanding</h3>
              <p className="text-sm text-gray-500">Receivables aging analysis</p>
            </div>
            <div className="h-72">
              {loadingAged ? <ChartSkeleton /> : agedChartData.length === 0 ? (
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
          </div>

          {/* Aged summary buckets */}
          {agedChartData.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {agedChartData.map((bucket: any, idx: number) => (
                <div key={idx} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500">{bucket.name}</p>
                  <p className={cn('text-lg font-bold mt-1', bucket.amount > 0 ? 'text-amber-600' : 'text-gray-900')}>
                    {formatCurrency(bucket.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Aged detail table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Aged Detail by Tenant</h3>
              <p className="text-sm text-gray-500">Outstanding balances by aging period</p>
            </div>
            {agedDetailRows.length > 0 && (
              <TableFilter searchPlaceholder="Search tenants..." searchValue={agedSearch} onSearchChange={setAgedSearch} resultCount={filteredAged.length} />
            )}
            <div className="overflow-x-auto">
              {loadingAged ? (
                <div className="p-6"><TableSkeleton /></div>
              ) : agedDetailRows.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-400">
                  Aged analysis summary is shown in the chart above. Tenant-level detail will appear here when available.
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Tenant</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Property</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Current</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">1-30 days</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">31-60 days</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">61-90 days</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">90+ days</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {agedPagination.paginatedData.map((a: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium">
                          {a.tenant_id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/tenants/${a.tenant_id}`)} onClick={() => navigate(`/dashboard/tenants/${a.tenant_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {a.tenant_name || a.tenant || a.name}
                            </button>
                          ) : <span className="text-gray-900">{a.tenant_name || a.tenant || a.name}</span>}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {a.property_id ? (
                            <button onMouseEnter={() => prefetch(`/dashboard/properties/${a.property_id}`)} onClick={() => navigate(`/dashboard/properties/${a.property_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                              {a.property_name || a.property}
                            </button>
                          ) : <span className="text-gray-600">{a.property_name || a.property || '-'}</span>}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(a.current || 0)}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(a['30_days'] || a.days_30 || 0)}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(a['60_days'] || a.days_60 || 0)}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(a['90_days'] || a.days_90 || 0)}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(a['120_plus'] || a.days_120_plus || a.over_90 || 0)}</td>
                        <td className="px-6 py-4 text-sm font-medium text-right">
                          <span className={(a.total || a.balance || 0) > 0 ? 'text-red-600' : 'text-gray-900'}>
                            {formatCurrency(a.total || a.balance || 0)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <PaginationControls {...agedPagination} />
            </div>
          </div>
        </TabsContent>

        {/* ===== MAINTENANCE TAB ===== */}
        <TabsContent value="maintenance" className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Maintenance Requests</h3>
              <p className="text-sm text-gray-500">Work orders and maintenance for this landlord's properties</p>
            </div>
            <div className="p-12 text-center">
              <div className="mx-auto w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                <Wrench className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-600">Maintenance module coming soon</p>
              <p className="text-xs text-gray-400 mt-1">Track work orders, repair requests, and maintenance schedules for this landlord's properties</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

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
