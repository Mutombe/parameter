import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Edit2,
  Mail,
  Phone,
  CreditCard,
  DollarSign,
  Wallet,
  AlertTriangle,
  FileText,
  Home,
  Calendar,
  Briefcase,
  Eye,
  Plus,
  Shield,
  Wrench,
  Download,
  Layers,
  ChevronLeft,
  ChevronRight,
  Search,
  Printer,
  Loader2,
  ChevronDown,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import api from '../../services/api'
import { tenantApi, reportsApi, invoiceApi, receiptApi, unitApi, subsidiaryApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { Modal, Button, Input, Select, Textarea, TableFilter, Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui'
import { AsyncSelect } from '../../components/ui/AsyncSelect'
import { showToast, parseApiError } from '../../lib/toast'
import { useAuthStore } from '../../stores/authStore'
import { TbUserSquareRounded } from 'react-icons/tb'
import { usePagination } from '../../hooks/usePagination'
import { usePrefetch } from '../../hooks/usePrefetch'

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
        </div>
      ))}
    </div>
  )
}

function shiftISODate(value: string, days: number): string {
  if (!value) {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  }
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1)
  dt.setDate(dt.getDate() + days)
  const yyyy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function DateNav({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel?: string }) {
  return (
    <div className="inline-flex items-center">
      <button
        type="button"
        aria-label={`Previous day${ariaLabel ? ` for ${ariaLabel}` : ''}`}
        onClick={() => onChange(shiftISODate(value, -1))}
        className="h-[30px] w-7 flex items-center justify-center border border-gray-200 rounded-l-lg bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="h-[30px] px-2 text-sm border-y border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <button
        type="button"
        aria-label={`Next day${ariaLabel ? ` for ${ariaLabel}` : ''}`}
        onClick={() => onChange(shiftISODate(value, 1))}
        className="h-[30px] w-7 flex items-center justify-center border border-gray-200 rounded-r-lg bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { startImpersonation } = useAuthStore()
  const tenantId = Number(id)
  const prefetch = usePrefetch()
  const queryClient = useQueryClient()

  // Active tab tracking for lazy-loading queries
  const [activeTab, setActiveTab] = useState('statement')

  // Create Invoice modal
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({
    tenant: '',
    unit: '',
    invoice_type: 'rent',
    date: new Date().toISOString().split('T')[0],
    due_date: '',
    amount: '',
    description: '',
  })

  // Record Payment modal
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [receiptForm, setReceiptForm] = useState({
    tenant: '',
    invoice: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    payment_method: 'bank_transfer',
    reference: '',
    description: '',
  })

  // 1. Tenant profile
  const { data: tenant, isLoading: loadingProfile } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => tenantApi.get(tenantId).then((r) => r.data),
    enabled: !!tenantId,
    placeholderData: keepPreviousData,
  })

  // 2. Detail view (billing_summary, active_leases, recent_invoices, recent_receipts, lease_history)
  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['tenant-detail-view', tenantId],
    queryFn: () => tenantApi.detailView(tenantId).then((r) => r.data),
    enabled: !!tenantId,
    placeholderData: keepPreviousData,
  })

  // 3. Ledger (with server-side date filtering)
  const [ledgerPeriodStart, setLedgerPeriodStart] = useState('')
  const [ledgerPeriodEnd, setLedgerPeriodEnd] = useState('')
  const { data: ledgerData, isLoading: loadingLedger } = useQuery({
    queryKey: ['tenant-ledger', tenantId, ledgerPeriodStart, ledgerPeriodEnd],
    queryFn: () => tenantApi.ledger(tenantId, {
      ...(ledgerPeriodStart && { period_start: ledgerPeriodStart }),
      ...(ledgerPeriodEnd && { period_end: ledgerPeriodEnd }),
    }).then((r) => r.data),
    enabled: !!tenantId,
    placeholderData: keepPreviousData,
  })

  // 4. Account statement chart (statement tab)
  const { data: accountData, isLoading: loadingAccount } = useQuery({
    queryKey: ['tenant-account', tenantId],
    queryFn: () => reportsApi.tenantAccount({ tenant_id: tenantId }).then((r) => r.data),
    enabled: !!tenantId && activeTab === 'statement',
    placeholderData: keepPreviousData,
  })

  // 5. Aged analysis (details tab)
  const { data: agedData, isLoading: loadingAged } = useQuery({
    queryKey: ['tenant-aged', tenantId],
    queryFn: () => reportsApi.agedAnalysis({ tenant_id: tenantId }).then((r) => r.data),
    enabled: !!tenantId && activeTab === 'details',
    placeholderData: keepPreviousData,
  })

  // 6. Deposit summary (details tab)
  const { data: depositData, isLoading: loadingDeposit } = useQuery({
    queryKey: ['tenant-deposit', tenantId],
    queryFn: () => reportsApi.depositSummary({ tenant_id: tenantId }).then((r) => r.data),
    enabled: !!tenantId && activeTab === 'details',
    placeholderData: keepPreviousData,
  })

  // 7. Maintenance requests for this tenant's units (details tab)
  const { data: maintenanceData, isLoading: loadingMaintenance } = useQuery({
    queryKey: ['tenant-maintenance', tenantId],
    queryFn: async () => {
      // Get all leases for this tenant to find their units
      const leases = detail?.active_leases || []
      const unitIds = leases.map((l: any) => l.unit_id).filter(Boolean)
      if (unitIds.length === 0) return []
      // Fetch maintenance requests for each unit and merge
      const results = await Promise.all(
        unitIds.map((uid: number) =>
          api.get('/maintenance/requests/', { params: { unit: uid, page_size: 100 } })
            .then(r => r.data.results || r.data)
            .catch(() => [])
        )
      )
      // Flatten and dedupe by id
      const all = results.flat()
      const seen = new Set()
      return all.filter((m: any) => {
        if (seen.has(m.id)) return false
        seen.add(m.id)
        return true
      })
    },
    enabled: !!tenantId && !!detail && activeTab === 'details',
    placeholderData: keepPreviousData,
  })

  // --- Account Statement toggle ---
  const [statementSource, setStatementSource] = useState<'operational' | 'trust'>('operational')

  // --- Subsidiary Account Statement state ---
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

  // Fetch tenant's subsidiary account
  const { data: subAccountsData, isLoading: loadingSubAccounts } = useQuery({
    queryKey: ['tenant-sub-accounts', tenantId],
    queryFn: () => subsidiaryApi.list({ tenant: tenantId }).then((r) => r.data),
    enabled: !!tenantId,
    placeholderData: keepPreviousData,
  })

  const tenantSubAccount = normalizeList(subAccountsData)[0] || null

  // Fetch subsidiary account statement
  const { data: subAccountStatement, isLoading: loadingSubStatement } = useQuery({
    queryKey: ['tenant-sub-statement', tenantSubAccount?.id, subAccountDateRange, subAccountStatementView],
    queryFn: () => subsidiaryApi.statement(tenantSubAccount!.id, {
      period_start: subAccountDateRange.period_start,
      period_end: subAccountDateRange.period_end,
      view: subAccountStatementView,
    }).then((r) => r.data),
    enabled: !!tenantSubAccount?.id,
    placeholderData: keepPreviousData,
  })

  // Units for invoice form
  const { data: unitsForForm, isLoading: unitsFormLoading } = useQuery({
    queryKey: ['units-select'],
    queryFn: () => unitApi.list({ page_size: 500 }).then(r => r.data.results || r.data),
    staleTime: 30000,
    placeholderData: keepPreviousData,
  })

  // Invoices for receipt form (only those with balance)
  const { data: invoicesForReceipt, isLoading: invoicesFormLoading } = useQuery({
    queryKey: ['invoices-for-receipt', tenantId],
    queryFn: () => invoiceApi.list({ tenant: tenantId }).then(r => {
      const all = r.data.results || r.data
      return all.filter((inv: any) => ['sent', 'partial', 'overdue'].includes(inv.status) && Number(inv.balance) > 0)
    }),
    staleTime: 30000,
    placeholderData: keepPreviousData,
  })

  const createInvoiceMutation = useMutation({
    mutationFn: (data: any) => invoiceApi.create(data),
    onSuccess: () => {
      showToast.success('Invoice created successfully')
      setShowInvoiceModal(false)
      setInvoiceForm({ tenant: '', unit: '', invoice_type: 'rent', date: new Date().toISOString().split('T')[0], due_date: '', amount: '', description: '' })
      queryClient.invalidateQueries({ queryKey: ['tenant-detail', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to create invoice')),
  })

  const createReceiptMutation = useMutation({
    mutationFn: (data: any) => receiptApi.create(data),
    onSuccess: () => {
      showToast.success('Payment recorded successfully')
      setShowReceiptModal(false)
      setReceiptForm({ tenant: '', invoice: '', date: new Date().toISOString().split('T')[0], amount: '', payment_method: 'bank_transfer', reference: '', description: '' })
      queryClient.invalidateQueries({ queryKey: ['tenant-detail', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['receipts'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to record payment')),
  })

  const tenantInfo = detail?.tenant || tenant
  const billing = detail?.billing_summary || {}
  const activeLeases = detail?.active_leases || []
  const recentInvoices = detail?.recent_invoices || []
  const recentReceipts = detail?.recent_receipts || []
  const leaseHistory = detail?.lease_history || []
  const ledger = ledgerData?.entries || ledgerData?.items || (Array.isArray(ledgerData) ? ledgerData : [])
  const maintenanceRequests = Array.isArray(maintenanceData) ? maintenanceData : []

  const hasActiveLease = activeLeases.length > 0 || tenant?.has_active_lease

  // Deposit items
  const depositItems = (() => {
    if (!depositData) return []
    if (Array.isArray(depositData)) return depositData
    if (depositData.deposits && Array.isArray(depositData.deposits)) return depositData.deposits
    if (depositData.items && Array.isArray(depositData.items)) return depositData.items
    if (depositData.results && Array.isArray(depositData.results)) return depositData.results
    return []
  })()

  // Payment history chart
  const paymentChartData = (() => {
    if (!accountData) return []
    const items = accountData.monthly_summary || accountData.items || accountData.entries
    if (Array.isArray(items)) {
      return items.map((i: any) => ({
        name: i.month || i.period || i.name,
        invoiced: i.invoiced || i.charged || i.debit || 0,
        paid: i.paid || i.received || i.credit || 0,
      }))
    }
    return []
  })()

  // --- Active Leases filter state ---
  const [leasesSearch, setLeasesSearch] = useState('')

  const filteredActiveLeases = useMemo(() => {
    let result = activeLeases || []
    if (leasesSearch) {
      const q = leasesSearch.toLowerCase()
      result = result.filter((l: any) =>
        (l.lease_number || '').toLowerCase().includes(q) ||
        (l.unit || '').toLowerCase().includes(q) ||
        (l.property || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [activeLeases, leasesSearch])

  const { paginatedData: paginatedLeases, currentPage: leasesPage, totalPages: leasesTotalPages, setCurrentPage: setLeasesPage, totalItems: leasesTotal, startIndex: leasesStart, endIndex: leasesEnd } = usePagination(filteredActiveLeases, { pageSize: 10 })

  useEffect(() => { setLeasesPage(1) }, [leasesSearch])

  // --- Recent Invoices filter state ---
  const [invSearch, setInvSearch] = useState('')
  const [invDateFrom, setInvDateFrom] = useState('')
  const [invDateTo, setInvDateTo] = useState('')
  const [invStatus, setInvStatus] = useState('')

  const filteredInvoices = useMemo(() => {
    let result = recentInvoices || []
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
  }, [recentInvoices, invSearch, invDateFrom, invDateTo, invStatus])

  const { paginatedData: paginatedInvoices, currentPage: invPage, totalPages: invTotalPages, setCurrentPage: setInvPage, totalItems: invTotal, startIndex: invStart, endIndex: invEnd } = usePagination(filteredInvoices, { pageSize: 10 })

  useEffect(() => { setInvPage(1) }, [invSearch, invDateFrom, invDateTo, invStatus])

  // --- Receipts/Payments filter state ---
  const [rcptSearch, setRcptSearch] = useState('')
  const [rcptDateFrom, setRcptDateFrom] = useState('')
  const [rcptDateTo, setRcptDateTo] = useState('')

  const filteredReceipts = useMemo(() => {
    let result = recentReceipts || []
    if (rcptSearch) {
      const q = rcptSearch.toLowerCase()
      result = result.filter((r: any) =>
        (r.receipt_number || '').toLowerCase().includes(q) ||
        (r.reference || '').toLowerCase().includes(q) ||
        (r.payment_method || '').toLowerCase().includes(q)
      )
    }
    if (rcptDateFrom) {
      result = result.filter((r: any) => (r.date || '') >= rcptDateFrom)
    }
    if (rcptDateTo) {
      result = result.filter((r: any) => (r.date || '') <= rcptDateTo)
    }
    return result
  }, [recentReceipts, rcptSearch, rcptDateFrom, rcptDateTo])

  const { paginatedData: paginatedReceipts, currentPage: rcptPage, totalPages: rcptTotalPages, setCurrentPage: setRcptPage, totalItems: rcptTotal, startIndex: rcptStart, endIndex: rcptEnd } = usePagination(filteredReceipts, { pageSize: 10 })

  useEffect(() => { setRcptPage(1) }, [rcptSearch, rcptDateFrom, rcptDateTo])

  // --- Ledger filter state ---
  const [ledgerSearch, setLedgerSearch] = useState('')

  // --- Statement export state ---
  type ExportAction = 'csv' | 'pdf' | 'print'
  const [exportLoading, setExportLoading] = useState<ExportAction | null>(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!exportMenuOpen) return
    const onClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [exportMenuOpen])
  // Date filters now drive server-side API params (ledgerPeriodStart/End defined above)
  const ledgerDateFrom = ledgerPeriodStart
  const setLedgerDateFrom = setLedgerPeriodStart
  const ledgerDateTo = ledgerPeriodEnd
  const setLedgerDateTo = setLedgerPeriodEnd

  const filteredLedger = useMemo(() => {
    let result = ledger || []
    if (ledgerSearch) {
      const q = ledgerSearch.toLowerCase()
      result = result.filter((entry: any) =>
        (entry.reference || entry.ref || '').toLowerCase().includes(q) ||
        (entry.description || entry.narration || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [ledger, ledgerSearch])

  const { paginatedData: paginatedLedger, currentPage: ledgerPage, totalPages: ledgerTotalPages, setCurrentPage: setLedgerPage, totalItems: ledgerTotal, startIndex: ledgerStart, endIndex: ledgerEnd } = usePagination(filteredLedger, { pageSize: 10 })

  useEffect(() => { setLedgerPage(1) }, [ledgerSearch, ledgerDateFrom, ledgerDateTo])

  // --- Maintenance filter state ---
  const [maintSearch, setMaintSearch] = useState('')
  const [maintStatus, setMaintStatus] = useState('')

  const filteredMaintenance = useMemo(() => {
    let result = maintenanceRequests
    if (maintSearch) {
      const q = maintSearch.toLowerCase()
      result = result.filter((m: any) =>
        (m.title || '').toLowerCase().includes(q) ||
        (m.property_name || '').toLowerCase().includes(q) ||
        (m.unit_name || '').toLowerCase().includes(q)
      )
    }
    if (maintStatus) {
      result = result.filter((m: any) => m.status === maintStatus)
    }
    return result
  }, [maintenanceRequests, maintSearch, maintStatus])

  const { paginatedData: paginatedMaintenance, currentPage: maintPage, totalPages: maintTotalPages, setCurrentPage: setMaintPage, totalItems: maintTotal, startIndex: maintStart, endIndex: maintEnd } = usePagination(filteredMaintenance, { pageSize: 10 })

  useEffect(() => { setMaintPage(1) }, [maintSearch, maintStatus])

  // Aged chart
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

  // Helper: render pagination controls (reusable)
  const renderPagination = (
    currentPage: number,
    totalPages: number,
    setPage: (p: number) => void,
    startIdx: number,
    endIdx: number,
    totalItems: number,
  ) => {
    if (totalPages <= 1) return null
    return (
      <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          Showing {startIdx}-{endIdx} of {totalItems}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(Math.max(1, currentPage - 1))}
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
                onClick={() => setPage(page)}
                className={`px-3 py-1 text-sm rounded-lg ${page === currentPage ? 'bg-primary-600 text-white' : 'border border-gray-200 hover:bg-gray-50'}`}
              >
                {page}
              </button>
            )
          })}
          <button
            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    )
  }

  // Helper for priority badge colors
  const priorityColors: Record<string, string> = {
    low: 'bg-gray-50 text-gray-700',
    medium: 'bg-blue-50 text-blue-700',
    high: 'bg-orange-50 text-orange-700',
    emergency: 'bg-red-50 text-red-700',
  }

  // Helper for maintenance status badge colors
  const maintStatusColors: Record<string, string> = {
    open: 'bg-amber-50 text-amber-700',
    in_progress: 'bg-blue-50 text-blue-700',
    completed: 'bg-emerald-50 text-emerald-700',
    cancelled: 'bg-gray-50 text-gray-600',
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <button onClick={() => navigate('/dashboard')} className="hover:text-gray-900 transition-colors">Dashboard</button>
        <span>/</span>
        <button onClick={() => navigate('/dashboard/tenants')} className="hover:text-gray-900 transition-colors">Tenants</button>
        <span>/</span>
        <span className="text-gray-900 font-medium">{tenantInfo?.name || '...'}</span>
      </nav>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard/tenants')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-3">
            {loadingProfile && loadingDetail ? (
              <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">{tenantInfo?.name}</h1>
                <span className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium',
                  hasActiveLease ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-600'
                )}>
                  {hasActiveLease ? 'Active' : 'Inactive'}
                </span>
                {tenantInfo?.account_type && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
                    {tenantInfo.account_type === 'rental' ? 'Rental' : tenantInfo.account_type === 'levy' ? 'Levy' : tenantInfo.account_type}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigate('/dashboard/tenants?action=create')}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Tenant
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              startImpersonation(tenantId, tenantInfo?.name || `Tenant #${tenantId}`)
              navigate('/portal')
            }}
            className="gap-2"
          >
            <Eye className="w-4 h-4" />
            Portal
          </Button>
          <Button variant="outline" onClick={() => navigate('/dashboard/tenants')} className="gap-2">
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
        {loadingProfile && loadingDetail ? (
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
                {tenantInfo?.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                    <span className="truncate">{tenantInfo.email}</span>
                  </div>
                )}
                {tenantInfo?.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    <span>{tenantInfo.phone}</span>
                  </div>
                )}
                {(tenantInfo?.id_number || tenantInfo?.id_type) && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                    <span>{tenantInfo.id_number} ({tenantInfo.id_type})</span>
                  </div>
                )}
              </div>
            </div>

            {/* Active Lease */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Active Lease</p>
              <div className="space-y-1.5">
                {activeLeases.length > 0 ? (
                  <>
                    {activeLeases[0].unit_id ? (
                      <button
                        onClick={() => navigate(`/dashboard/units/${activeLeases[0].unit_id}`)}
                        onMouseEnter={() => prefetch(`/dashboard/units/${activeLeases[0].unit_id}`)}
                        className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
                      >
                        <Home className="w-3.5 h-3.5" />
                        <span>{activeLeases[0].unit}</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Home className="w-3.5 h-3.5 text-gray-400" />
                        <span>{activeLeases[0].unit}</span>
                      </div>
                    )}
                    {activeLeases[0].property_id ? (
                      <button
                        onClick={() => navigate(`/dashboard/properties/${activeLeases[0].property_id}`)}
                        onMouseEnter={() => prefetch(`/dashboard/properties/${activeLeases[0].property_id}`)}
                        className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{activeLeases[0].property}</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <FileText className="w-3.5 h-3.5 text-gray-400" />
                        <span>{activeLeases[0].property}</span>
                      </div>
                    )}
                    {activeLeases[0].landlord_id && (
                      <button
                        onClick={() => navigate(`/dashboard/landlords/${activeLeases[0].landlord_id}`)}
                        onMouseEnter={() => prefetch(`/dashboard/landlords/${activeLeases[0].landlord_id}`)}
                        className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
                      >
                        <Briefcase className="w-3.5 h-3.5" />
                        <span>{activeLeases[0].landlord}</span>
                      </button>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>{formatDate(activeLeases[0].start_date)} - {formatDate(activeLeases[0].end_date)}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">No active lease</p>
                )}
              </div>
            </div>

            {/* Billing */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Billing</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                  <span>{formatCurrency(billing.total_invoiced || 0)} invoiced</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Wallet className="w-3.5 h-3.5 text-gray-400" />
                  <span>{formatCurrency(billing.total_paid || 0)} paid</span>
                </div>
                {(billing.overdue_amount || 0) > 0 && (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{formatCurrency(billing.overdue_amount)} overdue</span>
                  </div>
                )}
              </div>
            </div>

            {/* Employment */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Employment</p>
              <div className="space-y-1.5">
                {tenantInfo?.employer_name ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                      <span className="truncate">{tenantInfo.employer_name}</span>
                    </div>
                    {tenantInfo?.occupation && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <TbUserSquareRounded className="w-3.5 h-3.5 text-gray-400" />
                        <span>{tenantInfo.occupation}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400">Not provided</p>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Invoiced" value={formatCurrency(billing.total_invoiced || 0)} icon={FileText} color="blue" isLoading={loadingDetail} />
        <StatCard title="Total Paid" value={formatCurrency(billing.total_paid || 0)} icon={Wallet} color="green" isLoading={loadingDetail} />
        <StatCard title="Balance Due" value={formatCurrency(billing.balance_due || 0)} icon={DollarSign} color="purple" isLoading={loadingDetail} />
        <StatCard title="Overdue Amount" value={formatCurrency(billing.overdue_amount || 0)} icon={AlertTriangle} color="orange" isLoading={loadingDetail} />
      </motion.div>

      {/* Tabs */}
      <Tabs defaultValue="statement" className="space-y-6" onChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="statement" icon={FileText}>Statement</TabsTrigger>
          <TabsTrigger value="invoices" icon={FileText}>Invoices</TabsTrigger>
          <TabsTrigger value="payments" icon={Wallet}>Payments</TabsTrigger>
          <TabsTrigger value="leases" icon={Home}>Leases</TabsTrigger>
          <TabsTrigger value="details" icon={Shield}>Details</TabsTrigger>
        </TabsList>

        {/* ===== STATEMENT TAB ===== */}
        <TabsContent value="statement" className="space-y-6">
      {/* Account Statement */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Account Statement</h3>
            <p className="text-sm text-gray-500">
              {statementSource === 'operational'
                ? 'Bank-statement style view with running balance. Select a date range to filter.'
                : tenantSubAccount
                  ? `${tenantSubAccount.account_code || tenantSubAccount.code || ''} - ${tenantSubAccount.category_name || tenantSubAccount.category || tenantSubAccount.name || 'Account'}`
                  : 'Trust accounting sub-ledger view'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setStatementSource('operational')}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                  statementSource === 'operational' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                Operational
              </button>
              <button
                onClick={() => setStatementSource('trust')}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                  statementSource === 'trust' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                Trust Accounting
              </button>
            </div>
            {statementSource === 'operational' && (
              <div ref={exportMenuRef} className="relative">
                <button
                  onClick={() => setExportMenuOpen((o) => !o)}
                  disabled={exportLoading !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {exportLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {exportLoading === 'print' ? 'Preparing print...' : `Generating ${exportLoading.toUpperCase()}...`}
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" /> Download
                      <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
                {exportMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[160px] py-1">
                    {([
                      { key: 'pdf', label: 'Download PDF', icon: FileText },
                      { key: 'csv', label: 'Download CSV', icon: Download },
                      { key: 'print', label: 'Print', icon: Printer },
                    ] as const).map(({ key, label, icon: Icon }) => {
                      const isLoading = exportLoading === key
                      const isDisabled = exportLoading !== null && !isLoading
                      return (
                        <button
                          key={key}
                          disabled={isDisabled}
                          onClick={async () => {
                            setExportLoading(key)
                            try {
                              if (key === 'print') {
                                const res = await tenantApi.exportStatement(tenantId, {
                                  period_start: ledgerDateFrom || undefined,
                                  period_end: ledgerDateTo || undefined,
                                  format: 'pdf',
                                })
                                const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
                                const w = window.open(url, '_blank')
                                if (w) {
                                  w.addEventListener('load', () => {
                                    try { w.print() } catch { /* ignore */ }
                                  })
                                } else {
                                  showToast.error('Pop-up blocked — allow pop-ups to print')
                                }
                                // Revoke later so the new tab can load it
                                setTimeout(() => URL.revokeObjectURL(url), 60000)
                              } else {
                                const res = await tenantApi.exportStatement(tenantId, {
                                  period_start: ledgerDateFrom || undefined,
                                  period_end: ledgerDateTo || undefined,
                                  format: key,
                                })
                                const url = URL.createObjectURL(new Blob([res.data]))
                                const a = document.createElement('a')
                                a.href = url
                                a.download = `${tenantInfo?.code || 'tenant'}_statement.${key}`
                                a.click()
                                URL.revokeObjectURL(url)
                              }
                            } catch (err) {
                              showToast.error(parseApiError(err, `Failed to ${key === 'print' ? 'prepare print' : 'download statement'}`))
                            } finally {
                              setExportLoading(null)
                              setExportMenuOpen(false)
                            }
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-left"
                        >
                          {isLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-600" />
                          ) : (
                            <Icon className="w-3.5 h-3.5 text-gray-400" />
                          )}
                          <span>{label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {statementSource === 'operational' && (
          <>
        {!loadingLedger && ledger.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-gray-50 border-b border-gray-100">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by reference or description..."
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <DateNav
                value={ledgerDateFrom}
                onChange={setLedgerDateFrom}
                ariaLabel="ledger start date"
              />
              <span className="text-gray-400 text-sm">to</span>
              <DateNav
                value={ledgerDateTo}
                onChange={setLedgerDateTo}
                ariaLabel="ledger end date"
              />
            </div>
            <span className="text-xs text-gray-500 ml-auto">
              {filteredLedger.length} result{filteredLedger.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        <div className="overflow-x-auto">
          {loadingLedger ? (
            <div className="p-6"><TableSkeleton rows={6} /></div>
          ) : ledger.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No ledger entries found</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Reference</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Description</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Debit</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Credit</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(ledgerPeriodStart || ledgerPeriodEnd) && ledgerData?.opening_balance !== undefined && (
                  <tr className="bg-gray-50">
                    <td className="px-6 py-3 text-sm text-gray-500" colSpan={3}>Balance brought forward</td>
                    <td className="px-6 py-3 text-sm text-right">-</td>
                    <td className="px-6 py-3 text-sm text-right">-</td>
                    <td className="px-6 py-3 text-sm font-semibold text-right">{formatCurrency(ledgerData.opening_balance)}</td>
                  </tr>
                )}
                {paginatedLedger.map((entry: any, idx: number) => (
                  <tr key={entry.id || idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(entry.date)}</td>
                    <td className="px-6 py-4 text-sm font-medium">
                      {entry.type === 'invoice' ? (
                        <button onClick={() => navigate(`/dashboard/invoices/${entry.id}`)} onMouseEnter={() => prefetch(`/dashboard/invoices/${entry.id}`)} className="text-blue-600 hover:text-blue-700 hover:underline">
                          {entry.reference || '-'}
                        </button>
                      ) : entry.type === 'receipt' ? (
                        <button onClick={() => navigate(`/dashboard/receipts/${entry.id}`)} onMouseEnter={() => prefetch(`/dashboard/receipts/${entry.id}`)} className="text-emerald-600 hover:text-emerald-700 hover:underline">
                          {entry.reference || '-'}
                        </button>
                      ) : (
                        <span className="text-gray-900">{entry.reference || entry.ref || '-'}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{entry.description || entry.narration || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{(entry.debit || 0) > 0 ? formatCurrency(entry.debit) : ''}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{(entry.credit || 0) > 0 ? formatCurrency(entry.credit) : ''}</td>
                    <td className="px-6 py-4 text-sm font-medium text-right">
                      <span className={(entry.balance || 0) > 0 ? 'text-red-600' : 'text-gray-900'}>
                        {formatCurrency(entry.balance || 0)}
                      </span>
                    </td>
                  </tr>
                ))}
                {ledgerData?.total_debits !== undefined && (
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-6 py-3 text-sm" colSpan={3}>Totals</td>
                    <td className="px-6 py-3 text-sm text-right">{formatCurrency(ledgerData.total_debits)}</td>
                    <td className="px-6 py-3 text-sm text-right">{formatCurrency(ledgerData.total_credits)}</td>
                    <td className="px-6 py-3 text-sm text-right">{formatCurrency(ledgerData.closing_balance)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          {renderPagination(ledgerPage, ledgerTotalPages, setLedgerPage, ledgerStart, ledgerEnd, ledgerTotal)}
        </div>
        </>
        )}

        {statementSource === 'trust' && (
          <>
            <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <DateNav
                  value={subAccountDateRange.period_start}
                  onChange={(v) => setSubAccountDateRange((p) => ({ ...p, period_start: v }))}
                  ariaLabel="statement start date"
                />
                <span className="text-gray-400">to</span>
                <DateNav
                  value={subAccountDateRange.period_end}
                  onChange={(v) => setSubAccountDateRange((p) => ({ ...p, period_end: v }))}
                  ariaLabel="statement end date"
                />
              </div>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                <button onClick={() => setSubAccountStatementView('consolidated')} className={cn('px-2.5 py-1 text-xs font-medium rounded-md transition-colors', subAccountStatementView === 'consolidated' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>Consolidated</button>
                <button onClick={() => setSubAccountStatementView('audit')} className={cn('px-2.5 py-1 text-xs font-medium rounded-md transition-colors', subAccountStatementView === 'audit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>Audit</button>
              </div>
              {tenantSubAccount && (
                <div className="relative group ml-auto">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Export
                  </button>
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg hidden group-hover:block z-10 min-w-[100px]">
                    {(['csv', 'pdf'] as const).map(fmt => (
                      <button key={fmt} onClick={async () => { try { const res = await subsidiaryApi.exportStatement(tenantSubAccount.id, { period_start: subAccountDateRange.period_start, period_end: subAccountDateRange.period_end, view: subAccountStatementView, format: fmt }); const url = URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url; a.download = `statement-${(tenantSubAccount.code || tenantSubAccount.account_code || tenantSubAccount.id).toString().replace(/\//g, '-')}.${fmt}`; a.click(); URL.revokeObjectURL(url) } catch { /* ignore */ } }} className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left first:rounded-t-lg last:rounded-b-lg">{fmt.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {loadingSubAccounts ? (
              <div className="p-6"><TableSkeleton rows={4} /></div>
            ) : !tenantSubAccount ? (
              <div className="p-12 text-center text-sm text-gray-400">
                <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No subsidiary account found for this tenant
              </div>
            ) : (
              <>
                {subAccountStatement && (
                  <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">Opening Balance</span>
                    <span className={cn('text-sm font-bold tabular-nums', (subAccountStatement.opening_balance ?? subAccountStatement.balance_bf ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600')}>{formatCurrency(subAccountStatement.opening_balance ?? subAccountStatement.balance_bf ?? 0)}</span>
                  </div>
                )}
                <div className="overflow-x-auto">
                  {loadingSubStatement ? (
                    <div className="p-6"><TableSkeleton rows={6} /></div>
                  ) : !subAccountStatement || (subAccountStatement.transactions || subAccountStatement.entries || []).length === 0 ? (
                    <div className="p-12 text-center text-sm text-gray-400">No transactions found for this period</div>
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
                            <td className="px-6 py-4 text-sm text-gray-900"><span className="flex items-center gap-1.5">{txn.description || txn.narration || '-'}{txn.is_consolidated && (<span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold" title="Consolidated entry">C</span>)}</span></td>
                            <td className="px-6 py-4 text-sm text-gray-600 text-right tabular-nums">{txn.debit ? formatCurrency(txn.debit) : ''}</td>
                            <td className="px-6 py-4 text-sm text-gray-600 text-right tabular-nums">{txn.credit ? formatCurrency(txn.credit) : ''}</td>
                            <td className="px-6 py-4 text-sm font-medium text-right tabular-nums"><span className={(txn.balance || txn.running_balance || 0) < 0 ? 'text-red-600' : 'text-gray-900'}>{formatCurrency(txn.balance || txn.running_balance || 0)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {subAccountStatement && (subAccountStatement.transactions || subAccountStatement.entries || []).length > 0 && (
                  <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">Closing Balance</span>
                    <span className={cn('text-sm font-bold tabular-nums', (subAccountStatement.closing_balance ?? subAccountStatement.balance_cf ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600')}>{formatCurrency(subAccountStatement.closing_balance ?? subAccountStatement.balance_cf ?? 0)}</span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </motion.div>
        </TabsContent>

        {/* ===== INVOICES TAB ===== */}
        <TabsContent value="invoices" className="space-y-6">
      {/* Invoices Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Invoices</h3>
            <p className="text-sm text-gray-500">{recentInvoices.length} invoice(s)</p>
          </div>
          <button
            onClick={() => { setInvoiceForm(f => ({ ...f, tenant: String(tenantId) })); setShowInvoiceModal(true) }}
            className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Create Invoice
          </button>
        </div>
        {!loadingDetail && recentInvoices.length > 0 && (
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
          {loadingDetail ? (
            <div className="p-6"><TableSkeleton /></div>
          ) : recentInvoices.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No invoices found</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Invoice #</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Due Date</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Balance</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedInvoices.map((inv: any) => (
                  <tr key={inv.id} onClick={() => navigate(`/dashboard/invoices/${inv.id}`)} onMouseEnter={() => prefetch(`/dashboard/invoices/${inv.id}`)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-6 py-4 text-sm font-medium">
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/invoices/${inv.id}`) }} className="text-primary-600 hover:text-primary-700 hover:underline">{inv.invoice_number}</button>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(inv.date)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">{formatCurrency(inv.amount || inv.total_amount || 0)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-right"><span className={(inv.balance || 0) > 0 ? 'text-red-600' : 'text-gray-900'}>{formatCurrency(inv.balance || 0)}</span></td>
                    <td className="px-6 py-4"><span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : inv.status === 'overdue' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700')}>{inv.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {renderPagination(invPage, invTotalPages, setInvPage, invStart, invEnd, invTotal)}
        </div>
      </motion.div>
        </TabsContent>

        {/* ===== PAYMENTS TAB ===== */}
        <TabsContent value="payments" className="space-y-6">
      {/* Receipts / Payments Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.42 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Receipts / Payments</h3>
            <p className="text-sm text-gray-500">{recentReceipts.length} payment(s) recorded</p>
          </div>
          <button
            onClick={() => { setReceiptForm(f => ({ ...f, tenant: String(tenantId) })); setShowReceiptModal(true) }}
            className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Record Payment
          </button>
        </div>
        {!loadingDetail && recentReceipts.length > 0 && (
          <TableFilter
            searchPlaceholder="Search by receipt number, reference, or method..."
            searchValue={rcptSearch}
            onSearchChange={setRcptSearch}
            showDateFilter
            dateFrom={rcptDateFrom}
            dateTo={rcptDateTo}
            onDateFromChange={setRcptDateFrom}
            onDateToChange={setRcptDateTo}
            resultCount={filteredReceipts.length}
          />
        )}
        <div className="overflow-x-auto">
          {loadingDetail ? (
            <div className="p-6"><TableSkeleton /></div>
          ) : recentReceipts.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No payments recorded</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Receipt #</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Invoice #</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Method</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedReceipts.map((rcpt: any) => (
                  <tr key={rcpt.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium"><button onClick={() => navigate(`/dashboard/receipts/${rcpt.id}`)} onMouseEnter={() => prefetch(`/dashboard/receipts/${rcpt.id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{rcpt.receipt_number}</button></td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(rcpt.date)}</td>
                    <td className="px-6 py-4 text-sm">{rcpt.invoice ? (<button onClick={() => navigate(`/dashboard/invoices/${rcpt.invoice}`)} onMouseEnter={() => prefetch(`/dashboard/invoices/${rcpt.invoice}`)} className="text-primary-600 hover:text-primary-700 hover:underline">{rcpt.invoice_number || `INV-${rcpt.invoice}`}</button>) : (<span className="text-gray-400">-</span>)}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">{formatCurrency(rcpt.amount || 0)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600"><span className="capitalize">{(rcpt.payment_method || '').replace(/_/g, ' ')}</span></td>
                    <td className="px-6 py-4 text-sm text-gray-600">{rcpt.reference || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {renderPagination(rcptPage, rcptTotalPages, setRcptPage, rcptStart, rcptEnd, rcptTotal)}
        </div>
      </motion.div>
        </TabsContent>

        {/* ===== LEASES TAB ===== */}
        <TabsContent value="leases" className="space-y-6">
      {/* Active Leases Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Active Leases</h3>
          <p className="text-sm text-gray-500">{activeLeases.length} active lease(s)</p>
        </div>
        {!loadingDetail && activeLeases.length > 0 && (
          <TableFilter
            searchPlaceholder="Search by lease number, unit, or property..."
            searchValue={leasesSearch}
            onSearchChange={setLeasesSearch}
            resultCount={filteredActiveLeases.length}
          />
        )}
        <div className="overflow-x-auto">
          {loadingDetail ? (
            <div className="p-6"><TableSkeleton rows={3} /></div>
          ) : activeLeases.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No active leases</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Lease #</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Property</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Unit</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Rent</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Period</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedLeases.map((lease: any) => (
                  <tr
                    key={lease.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium">
                      <button
                        onClick={() => navigate(`/dashboard/leases/${lease.id}`)}
                        onMouseEnter={() => prefetch(`/dashboard/leases/${lease.id}`)}
                        className="text-primary-600 hover:text-primary-700 hover:underline"
                      >
                        {lease.lease_number}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {lease.property_id ? (
                        <button
                          onClick={() => navigate(`/dashboard/properties/${lease.property_id}`)}
                          onMouseEnter={() => prefetch(`/dashboard/properties/${lease.property_id}`)}
                          className="text-primary-600 hover:text-primary-700 hover:underline"
                        >
                          {lease.property}
                        </button>
                      ) : (
                        <span className="text-gray-600">{lease.property}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {lease.unit_id ? (
                        <button
                          onClick={() => navigate(`/dashboard/units/${lease.unit_id}`)}
                          onMouseEnter={() => prefetch(`/dashboard/units/${lease.unit_id}`)}
                          className="text-primary-600 hover:text-primary-700 hover:underline"
                        >
                          {lease.unit}
                        </button>
                      ) : (
                        <span className="text-gray-600">{lease.unit}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">{lease.currency} {lease.monthly_rent}/mo</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(lease.start_date)} - {formatDate(lease.end_date)}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Active</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {renderPagination(leasesPage, leasesTotalPages, setLeasesPage, leasesStart, leasesEnd, leasesTotal)}
        </div>
      </motion.div>
        </TabsContent>

        {/* ===== DETAILS TAB ===== */}
        <TabsContent value="details" className="space-y-6">
      {/* Deposits */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Deposits</h3>
          <p className="text-sm text-gray-500">Security and other deposit tracking</p>
        </div>
        <div className="overflow-x-auto">
          {loadingDeposit ? (
            <div className="p-6"><TableSkeleton rows={3} /></div>
          ) : depositItems.length === 0 ? (
            <div className="p-12 text-center">
              <Shield className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No deposit records found</p>
              {activeLeases.some((l: any) => l.deposit_amount || l.deposit_paid !== undefined) && (
                <div className="mt-4 space-y-2">
                  {activeLeases.filter((l: any) => l.deposit_amount).map((l: any) => (
                    <div key={l.id} className="text-sm text-gray-600">
                      Lease {l.lease_number}: {formatCurrency(l.deposit_amount)} deposit {l.deposit_paid ? '(paid)' : '(unpaid)'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Property / Unit</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Type</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Paid</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Balance</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {depositItems.map((dep: any, idx: number) => (
                  <tr key={dep.id || idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div className="space-y-0.5">
                        {dep.property_id ? (<button onClick={() => navigate(`/dashboard/properties/${dep.property_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline block">{dep.property_name || dep.property || '-'}</button>) : (<span>{dep.property_name || dep.property || '-'}</span>)}
                        {dep.unit_id ? (<button onClick={() => navigate(`/dashboard/units/${dep.unit_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline block text-xs">{dep.unit_name || dep.unit || ''}</button>) : dep.unit_name || dep.unit ? (<span className="text-xs text-gray-400">{dep.unit_name || dep.unit}</span>) : null}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 capitalize">{dep.deposit_type || dep.type || 'Security'}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">{formatCurrency(dep.amount || dep.deposit_amount || 0)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(dep.paid || dep.amount_paid || 0)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-right"><span className={(dep.balance || 0) > 0 ? 'text-red-600' : 'text-gray-900'}>{formatCurrency(dep.balance || (dep.amount || 0) - (dep.paid || dep.amount_paid || 0))}</span></td>
                    <td className="px-6 py-4"><span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', dep.status === 'paid' || dep.is_paid ? 'bg-emerald-50 text-emerald-700' : dep.status === 'refunded' ? 'bg-blue-50 text-blue-700' : dep.status === 'partial' ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600')}>{dep.status || (dep.is_paid ? 'Paid' : 'Pending')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>

      {/* Maintenance Requests */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Maintenance Requests</h3>
          <p className="text-sm text-gray-500">{maintenanceRequests.length} request(s)</p>
        </div>
        {!loadingMaintenance && maintenanceRequests.length > 0 && (
          <TableFilter searchPlaceholder="Search by title, property, or unit..." searchValue={maintSearch} onSearchChange={setMaintSearch} showStatusFilter statusOptions={[{ value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In Progress' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }]} statusValue={maintStatus} onStatusChange={setMaintStatus} resultCount={filteredMaintenance.length} />
        )}
        <div className="overflow-x-auto">
          {loadingMaintenance ? (
            <div className="p-6"><TableSkeleton rows={3} /></div>
          ) : maintenanceRequests.length === 0 ? (
            <div className="p-12 text-center">
              <Wrench className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No maintenance requests</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">ID</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Title</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Priority</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedMaintenance.map((mr: any) => (
                  <tr key={mr.id} onClick={() => navigate(`/dashboard/maintenance/${mr.id}`)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-primary-600">MR-{mr.id}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{mr.title}</td>
                    <td className="px-6 py-4"><span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize', priorityColors[mr.priority] || 'bg-gray-50 text-gray-600')}>{mr.priority}</span></td>
                    <td className="px-6 py-4"><span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize', maintStatusColors[mr.status] || 'bg-gray-50 text-gray-600')}>{(mr.status || '').replace(/_/g, ' ')}</span></td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(mr.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {renderPagination(maintPage, maintTotalPages, setMaintPage, maintStart, maintEnd, maintTotal)}
        </div>
      </motion.div>
        </TabsContent>
      </Tabs>


      {/* Create Invoice Modal */}
      <Modal
        open={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        title="Create Invoice"
        icon={Plus}
      >
        <form onSubmit={(e) => { e.preventDefault(); createInvoiceMutation.mutate(invoiceForm); }} className="space-y-5">
          <AsyncSelect
            label="Unit (Optional)"
            placeholder="No specific unit"
            value={invoiceForm.unit}
            onChange={(val) => setInvoiceForm({ ...invoiceForm, unit: String(val) })}
            options={unitsForForm?.map((u: any) => ({ value: u.id, label: `Unit ${u.unit_number} - ${u.property_name || 'Unknown'}` })) || []}
            isLoading={unitsFormLoading}
            searchable
            clearable
          />
          <div className="grid grid-cols-2 gap-4">
            <Input type="date" label="Invoice Date" value={invoiceForm.date} onChange={(e) => setInvoiceForm({ ...invoiceForm, date: e.target.value })} required />
            <Input type="date" label="Due Date" value={invoiceForm.due_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Invoice Type" value={invoiceForm.invoice_type} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_type: e.target.value })} options={[{ value: 'rent', label: 'Rent' }, { value: 'utilities', label: 'Utilities' }, { value: 'deposit', label: 'Deposit' }, { value: 'other', label: 'Other' }]} />
            <Input type="number" label="Amount" placeholder="0.00" step="0.01" min="0" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} required />
          </div>
          <Textarea label="Description" placeholder="Invoice description..." value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} rows={2} />
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowInvoiceModal(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={createInvoiceMutation.isPending}>{createInvoiceMutation.isPending ? 'Creating...' : 'Create Invoice'}</Button>
          </div>
        </form>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        open={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        title="Record Payment"
        icon={Plus}
      >
        <form onSubmit={(e) => { e.preventDefault(); createReceiptMutation.mutate(receiptForm); }} className="space-y-5">
          <AsyncSelect
            label="Against Invoice (Optional)"
            placeholder="Select invoice"
            value={receiptForm.invoice}
            onChange={(val) => setReceiptForm({ ...receiptForm, invoice: String(val) })}
            options={invoicesForReceipt?.map((inv: any) => ({ value: inv.id, label: `${inv.invoice_number} - $${Number(inv.balance).toFixed(2)}` })) || []}
            isLoading={invoicesFormLoading}
            searchable
            clearable
          />
          <div className="grid grid-cols-2 gap-4">
            <Input type="date" label="Date" value={receiptForm.date} onChange={(e) => setReceiptForm({ ...receiptForm, date: e.target.value })} required />
            <Input type="number" label="Amount" placeholder="0.00" step="0.01" min="0" value={receiptForm.amount} onChange={(e) => setReceiptForm({ ...receiptForm, amount: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Payment Method" value={receiptForm.payment_method} onChange={(e) => setReceiptForm({ ...receiptForm, payment_method: e.target.value })} options={[{ value: 'cash', label: 'Cash' }, { value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'ecocash', label: 'EcoCash' }, { value: 'card', label: 'Card' }, { value: 'cheque', label: 'Cheque' }]} />
            <Input label="Reference" placeholder="Bank ref, EcoCash ref..." value={receiptForm.reference} onChange={(e) => setReceiptForm({ ...receiptForm, reference: e.target.value })} />
          </div>
          <Textarea label="Description" placeholder="Payment description..." value={receiptForm.description} onChange={(e) => setReceiptForm({ ...receiptForm, description: e.target.value })} rows={2} />
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowReceiptModal(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={createReceiptMutation.isPending}>{createReceiptMutation.isPending ? 'Recording...' : 'Record Payment'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
