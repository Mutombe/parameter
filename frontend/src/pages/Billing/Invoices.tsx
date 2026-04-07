import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Receipt,
  Plus,
  Search,
  Send,
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Printer,
  MoreVertical,
  TrendingUp,
  Download,
  RefreshCw,
  Zap,
  Loader2,
  X,
  Trash2,
  BookOpen,
} from 'lucide-react'
import { invoiceApi, tenantApi, unitApi, leaseApi, propertyApi } from '../../services/api'
import { formatCurrency, formatDate, cn, useDebounce } from '../../lib/utils'
import { printInvoice } from '../../lib/printTemplate'
import { PageHeader, Modal, Button, Input, Select, Textarea, Badge, EmptyState, Skeleton, ConfirmDialog, SelectionCheckbox, BulkActionsBar, Tooltip, Pagination } from '../../components/ui'
import { AsyncSelect } from '../../components/ui/AsyncSelect'
import { showToast, parseApiError } from '../../lib/toast'
import { exportTableData } from '../../lib/export'
import { useSelection } from '../../hooks/useSelection'
import { useHotkeys } from '../../hooks/useHotkeys'
import { usePrefetch } from '../../hooks/usePrefetch'
import { TbUserSquareRounded } from "react-icons/tb";

const PAGE_SIZE = 25

interface Invoice {
  id: number | string
  invoice_number: string
  tenant: number
  tenant_name: string
  unit_name?: string
  invoice_type: string
  date: string
  due_date: string
  total_amount: number
  balance: number
  status: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled'
  description?: string
  created_at: string
  _isOptimistic?: boolean
}

const statusConfig = {
  draft: {
    icon: Clock,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-300',
    label: 'Draft',
  },
  sent: {
    icon: Send,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    label: 'Sent',
  },
  partial: {
    icon: TrendingUp,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    label: 'Partial',
  },
  paid: {
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
    label: 'Paid',
  },
  overdue: {
    icon: AlertTriangle,
    color: 'text-rose-600',
    bgColor: 'bg-rose-50',
    borderColor: 'border-rose-300',
    label: 'Overdue',
  },
  cancelled: {
    icon: XCircle,
    color: 'text-gray-400',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    label: 'Cancelled',
  },
}

const statusTooltips: Record<string, string> = {
  draft: 'Awaiting review and posting',
  sent: 'Sent to tenant, awaiting payment',
  partial: 'Partial payment received',
  overdue: 'Payment past due date',
  paid: 'Fully paid',
  cancelled: 'Invoice cancelled',
}

function SkeletonInvoices() {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <Skeleton className="h-10 w-80" />
        </div>
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-6 py-4 flex items-center gap-4">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20 ml-auto" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BillingStatusTable({ month, year, onBillProperty, onBillAll, isBilling }: {
  month: number; year: number;
  onBillProperty: (propertyId: number) => void;
  onBillAll: () => void;
  isBilling: boolean;
}) {
  const navigate = useNavigate()
  const { data: statusData, isLoading } = useQuery({
    queryKey: ['billing-status', month, year],
    queryFn: () => invoiceApi.billingStatus({ month, year }).then(r => r.data),
    placeholderData: keepPreviousData,
    staleTime: 10000, // Refresh after 10s — billing status changes frequently
  })

  const summary = statusData?.summary || {}
  const properties = statusData?.properties || []
  const monthName = ['January','February','March','April','May','June','July','August','September','October','November','December'][month - 1]

  const statusColors: Record<string, string> = {
    complete: 'bg-emerald-50 text-emerald-700',
    partial: 'bg-amber-50 text-amber-700',
    pending: 'bg-red-50 text-red-700',
  }

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-gray-400">Loading billing status...</div>
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{summary.total_properties || 0}</p>
          <p className="text-xs text-gray-500">Properties</p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-emerald-700">{summary.complete || 0}</p>
          <p className="text-xs text-emerald-600">Fully Billed</p>
        </div>
        <div className="bg-amber-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{summary.partial || 0}</p>
          <p className="text-xs text-amber-600">Partial</p>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-red-700">{summary.pending || 0}</p>
          <p className="text-xs text-red-600">Not Billed</p>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{summary.total_billed || 0} of {summary.total_leases || 0} leases billed</span>
          <span>{summary.total_leases ? Math.round(((summary.total_billed || 0) / summary.total_leases) * 100) : 0}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-emerald-500 h-2 rounded-full transition-all"
            style={{ width: `${summary.total_leases ? ((summary.total_billed || 0) / summary.total_leases) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Bill All button */}
      {(summary.pending > 0 || summary.partial > 0) && (
        <Button
          onClick={onBillAll}
          disabled={isBilling}
          className="w-full"
        >
          {isBilling ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
          ) : (
            `Bill All Unbilled Properties for ${monthName} ${year}`
          )}
        </Button>
      )}

      {/* Per-property table */}
      <div className="max-h-[400px] overflow-y-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-gray-500">Property</th>
              <th className="text-center px-4 py-2 font-semibold text-gray-500">Leases</th>
              <th className="text-center px-4 py-2 font-semibold text-gray-500">Billed</th>
              <th className="text-center px-4 py-2 font-semibold text-gray-500">Status</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {properties.map((p: any) => (
              <tr key={p.property_id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => navigate(`/dashboard/properties/${p.property_id}`)}
                    className="text-primary-600 hover:underline font-medium text-left"
                  >
                    {p.property_name}
                  </button>
                  {p.landlord_name && (
                    <p className="text-xs text-gray-400">{p.landlord_name}</p>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">{p.active_leases}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className="font-medium">{p.billed}</span>
                  {p.unbilled > 0 && (
                    <span className="text-red-500 text-xs ml-1">({p.unbilled} left)</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusColors[p.status])}>
                    {p.status === 'complete' ? 'Done' : p.status === 'partial' ? 'Partial' : 'Pending'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {p.status !== 'complete' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onBillProperty(p.property_id)}
                      disabled={isBilling}
                    >
                      Bill
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {properties.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No properties with active leases found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Invoices() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const prefetch = usePrefetch()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [postingId, setPostingId] = useState<number | null>(null)
  const [generateForm, setGenerateForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    month_to: new Date().getMonth() + 1,
    year_to: new Date().getFullYear(),
    property_id: '' as string | number,
    invoice_date: '',
    due_date: '',
    batchMode: false,
  })
  const [form, setForm] = useState({
    tenant: '',
    unit: '',
    invoice_type: 'rent',
    date: new Date().toISOString().split('T')[0],
    due_date: '',
    amount: '',
    description: '',
  })

  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} })

  const selection = useSelection<number | string>({ clearOnChange: [debouncedSearch, statusFilter] })

  const searchInputRef = useRef<HTMLInputElement>(null)
  useHotkeys([
    { key: 'c', handler: () => setShowForm(true) },
    { key: '/', handler: (e) => { e.preventDefault(); searchInputRef.current?.focus() } },
  ])

  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ['invoices', debouncedSearch, statusFilter, dateFrom, dateTo, currentPage],
    queryFn: () => {
      const params: any = { page: currentPage, page_size: PAGE_SIZE }
      if (debouncedSearch) params.search = debouncedSearch
      if (statusFilter) params.status = statusFilter
      if (dateFrom) params.date__gte = dateFrom
      if (dateTo) params.date__lte = dateTo
      return invoiceApi.list(params).then(r => r.data)
    },
    placeholderData: keepPreviousData,
  })

  const invoices = invoicesData?.results || invoicesData || []
  const totalCount = invoicesData?.count || invoices.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, statusFilter, dateFrom, dateTo])

  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants-select'],
    queryFn: () => tenantApi.list({ page_size: 500 }).then(r => r.data.results || r.data),
    staleTime: 30000,
    placeholderData: keepPreviousData,
  })

  // Fetch units filtered by selected tenant's active lease, or all units
  const { data: units, isLoading: unitsLoading } = useQuery({
    queryKey: ['units-select', form.tenant],
    queryFn: () => unitApi.list({ page_size: 500 }).then(r => r.data.results || r.data),
    staleTime: 30000,
    placeholderData: keepPreviousData,
  })

  const resetForm = () => {
    setShowForm(false)
    setForm({
      tenant: '',
      unit: '',
      invoice_type: 'rent',
      date: new Date().toISOString().split('T')[0],
      due_date: '',
      amount: '',
      description: '',
    })
  }

  // Optimistic create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => invoiceApi.create(data),
    onMutate: async (newData) => {
      // Close modal immediately (optimistic)
      resetForm()

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['invoices'] })

      // Snapshot previous data
      const previousInvoices = queryClient.getQueryData(['invoices', debouncedSearch, statusFilter, currentPage])

      // Optimistically add new invoice with loading state
      const optimisticInvoice: Invoice = {
        id: `temp-${Date.now()}`,
        invoice_number: 'Creating...',
        tenant: Number(newData.tenant),
        tenant_name: tenants?.find((t: any) => t.id === Number(newData.tenant))?.name || 'Loading...',
        unit_name: units?.find((u: any) => u.id === Number(newData.unit))?.unit_number,
        invoice_type: newData.invoice_type,
        date: newData.date,
        due_date: newData.due_date,
        total_amount: Number(newData.amount),
        balance: Number(newData.amount),
        status: 'draft',
        description: newData.description,
        created_at: new Date().toISOString(),
        _isOptimistic: true,
      }

      queryClient.setQueryData(['invoices', debouncedSearch, statusFilter, currentPage], (old: any) => {
        const items = old?.results || old || []
        return { ...old, results: [optimisticInvoice, ...items] }
      })

      return { previousInvoices }
    },
    onSuccess: () => {
      showToast.success('Invoice created successfully')
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error, _, context) => {
      // Rollback on error
      if (context?.previousInvoices) {
        queryClient.setQueryData(['invoices', debouncedSearch, statusFilter, currentPage], context.previousInvoices)
      }
      showToast.error(parseApiError(error, 'Failed to create invoice'))
    },
  })

  const postMutation = useMutation({
    mutationFn: (id: number) => invoiceApi.postToLedger(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      showToast.success('Invoice posted to ledger')
      setPostingId(null)
    },
    onError: (error) => {
      showToast.error(parseApiError(error, 'Failed to post invoice'))
      setPostingId(null)
    },
  })

  const handlePost = (id: number) => {
    setPostingId(id)
    postMutation.mutate(id)
  }

  const handleViewDetails = (invoice: Invoice) => {
    navigate(`/dashboard/invoices/${invoice.id}`)
  }

  const handlePrint = (invoice: Invoice) => {
    printInvoice({
      invoice_number: invoice.invoice_number,
      tenant_name: invoice.tenant_name,
      unit_name: invoice.unit_name,
      date: invoice.date,
      due_date: invoice.due_date,
      status: invoice.status,
      invoice_type: invoice.invoice_type,
      description: invoice.description,
      total_amount: Number(invoice.total_amount),
      balance: Number(invoice.balance),
    })
  }

  const { data: properties } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () => propertyApi.list().then(r => r.data.results || r.data),
    staleTime: 30000,
    placeholderData: keepPreviousData,
  })

  const generateMutation = useMutation({
    mutationFn: async (data: typeof generateForm) => {
      // Build list of months to bill
      const months: { month: number; year: number }[] = []
      if (data.batchMode) {
        let m = data.month, y = data.year
        const endM = data.month_to, endY = data.year_to
        while (y < endY || (y === endY && m <= endM)) {
          months.push({ month: m, year: y })
          m++
          if (m > 12) { m = 1; y++ }
        }
      } else {
        months.push({ month: data.month, year: data.year })
      }

      let totalCreated = 0
      const allErrors: string[] = []
      for (const period of months) {
        const payload: any = { month: period.month, year: period.year }
        if (data.property_id) payload.property_id = Number(data.property_id)
        if (data.invoice_date) payload.invoice_date = data.invoice_date
        if (data.due_date) payload.due_date = data.due_date
        const res = await invoiceApi.generateMonthly(payload)
        totalCreated += res.data?.created || 0
        if (res.data?.errors?.length) allErrors.push(...res.data.errors)
      }
      return { data: { created: totalCreated, errors: allErrors, months: months.length } }
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['billing-status'] })
      const count = response.data?.created || 0
      const months = response.data?.months || 1
      const errors = response.data?.errors || []
      if (count > 0) {
        showToast.success(`Generated ${count} invoice${count !== 1 ? 's' : ''} across ${months} month${months !== 1 ? 's' : ''}`)
      } else if (errors.length > 0) {
        showToast.warning(`No new invoices. ${errors[0]}`)
      } else {
        showToast.info('All leases already billed for this period')
      }
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to generate invoices')),
  })

  // Stats calculations
  const stats = {
    total: totalCount,
    draft: invoices?.filter((i: Invoice) => i.status === 'draft').length || 0,
    sent: invoices?.filter((i: Invoice) => i.status === 'sent').length || 0,
    overdue: invoices?.filter((i: Invoice) => i.status === 'overdue').length || 0,
    paid: invoices?.filter((i: Invoice) => i.status === 'paid').length || 0,
  }

  const totalAmount = invoices?.reduce((sum: number, i: Invoice) => sum + Number(i.total_amount || 0), 0) || 0
  const totalCollected = invoices?.reduce((sum: number, i: Invoice) => sum + (Number(i.total_amount || 0) - Number(i.balance || 0)), 0) || 0
  const totalOutstanding = invoices?.reduce((sum: number, i: Invoice) => sum + Number(i.balance || 0), 0) || 0
  const collectionRate = totalAmount > 0 ? (totalCollected / totalAmount) * 100 : 0

  // Selectable IDs (exclude optimistic items)
  const selectableInvoices = (invoices || []).filter((i: Invoice) => !i._isOptimistic)
  const pageIds = selectableInvoices.map((i: Invoice) => i.id)

  const handleBulkExport = () => {
    const selected = selectableInvoices.filter((i: Invoice) => selection.isSelected(i.id))
    exportTableData(selected, [
      { key: 'invoice_number', header: 'Invoice Number' },
      { key: 'tenant_name', header: 'Tenant' },
      { key: 'unit_name', header: 'Unit' },
      { key: 'invoice_type', header: 'Type' },
      { key: 'date', header: 'Date' },
      { key: 'due_date', header: 'Due Date' },
      { key: 'total_amount', header: 'Amount' },
      { key: 'balance', header: 'Balance' },
      { key: 'status', header: 'Status' },
    ], 'invoices_export')
    showToast.success(`Exported ${selected.length} invoices`)
  }

  const handleBulkPrint = () => {
    const selected = selectableInvoices.filter((i: Invoice) => selection.isSelected(i.id))
    selected.forEach((invoice: Invoice) => {
      printInvoice({
        invoice_number: invoice.invoice_number,
        tenant_name: invoice.tenant_name,
        unit_name: invoice.unit_name,
        date: invoice.date,
        due_date: invoice.due_date,
        status: invoice.status,
        invoice_type: invoice.invoice_type,
        description: invoice.description,
        total_amount: Number(invoice.total_amount),
        balance: Number(invoice.balance),
      })
    })
    showToast.success(`Printing ${selected.length} invoices`)
  }

  const handleBulkPost = () => {
    setConfirmDialog({
      open: true,
      title: `Post ${selection.selectedCount} invoices to ledger?`,
      message: 'This will post selected draft invoices to the general ledger.',
      onConfirm: async () => {
        const ids = Array.from(selection.selectedIds).filter(id => {
          const inv = selectableInvoices.find((i: Invoice) => i.id === id)
          return inv?.status === 'draft'
        })
        for (const id of ids) { await invoiceApi.postToLedger(id as number) }
        selection.clearSelection()
        queryClient.invalidateQueries({ queryKey: ['invoices'] })
        showToast.success(`Posted ${ids.length} invoices to ledger`)
        setConfirmDialog(d => ({ ...d, open: false }))
      },
    })
  }

  const handleBulkSend = () => {
    const ids = Array.from(selection.selectedIds) as number[]
    invoiceApi.sendInvoices({ invoice_ids: ids }).then(() => {
      selection.clearSelection()
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      showToast.success(`Sent ${ids.length} invoices`)
    }).catch((err) => showToast.error(parseApiError(err, 'Failed to send invoices')))
  }

  const handleBulkDelete = () => {
    setConfirmDialog({
      open: true,
      title: `Delete ${selection.selectedCount} invoices?`,
      message: 'This action cannot be undone. Only draft invoices will be deleted.',
      onConfirm: async () => {
        const ids = Array.from(selection.selectedIds)
        let deleted = 0
        for (const id of ids) {
          try {
            const inv = selectableInvoices.find((i: Invoice) => i.id === id)
            if (inv?.status === 'draft') {
              await invoiceApi.update(id as number, { status: 'cancelled' })
              deleted++
            }
          } catch { /* skip */ }
        }
        selection.clearSelection()
        queryClient.invalidateQueries({ queryKey: ['invoices'] })
        showToast.success(`Deleted ${deleted} invoices`)
        setConfirmDialog(d => ({ ...d, open: false }))
      },
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        subtitle="Manage rent and utility invoices"
        icon={Receipt}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Invoices' },
        ]}
        actions={
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="outline" onClick={() => setShowGenerateModal(true)} className="gap-1.5 sm:gap-2 px-2.5 sm:px-4">
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">Generate Monthly</span>
            </Button>
            <Button onClick={() => setShowForm(true)} className="gap-1.5 sm:gap-2 px-2.5 sm:px-4">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create Invoice</span>
            </Button>
          </div>
        }
      />

      {/* Status Filter Cards with financial subtitles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
        <motion.div
          whileHover={{ y: -1 }}
          className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5"
        >
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary-50 flex items-center justify-center">
              <Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-500">Total</p>
              {isLoading ? (
                <div className="h-6 sm:h-8 w-10 sm:w-12 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                <>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.total}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(totalAmount)} billed</p>
                </>
              )}
            </div>
          </div>
        </motion.div>

        {(['draft', 'sent', 'overdue', 'paid'] as const).map((status) => {
          const config = statusConfig[status]
          const StatusIcon = config.icon
          const count = stats[status]
          const statusSubtitle = (() => {
            if (isLoading) return null
            const statusInvoices = invoices?.filter((i: Invoice) => i.status === status) || []
            if (status === 'sent') {
              const billed = statusInvoices.reduce((sum: number, i: Invoice) => sum + Number(i.total_amount || 0), 0)
              return `${formatCurrency(billed)} billed`
            }
            if (status === 'paid') {
              const collected = statusInvoices.reduce((sum: number, i: Invoice) => sum + (Number(i.total_amount || 0) - Number(i.balance || 0)), 0)
              return `${formatCurrency(collected)} collected`
            }
            if (status === 'overdue') {
              const outstanding = statusInvoices.reduce((sum: number, i: Invoice) => sum + Number(i.balance || 0), 0)
              return `${formatCurrency(outstanding)} outstanding`
            }
            return null
          })()
          return (
            <motion.div
              key={status}
              whileHover={{ y: -1 }}
              onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
              className={cn(
                'bg-white rounded-xl border p-3 sm:p-5 cursor-pointer transition-all',
                statusFilter === status ? config.borderColor : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <div className="flex items-center gap-2 sm:gap-4">
                <div className={cn('w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center', config.bgColor)}>
                  <StatusIcon className={cn('w-5 h-5 sm:w-6 sm:h-6', config.color)} />
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-gray-500">{config.label}</p>
                  {isLoading ? (
                    <div className="h-6 sm:h-8 w-10 sm:w-12 bg-gray-200 rounded animate-pulse mt-1" />
                  ) : (
                    <>
                      <p className={cn('text-xl sm:text-2xl font-bold', config.color)}>{count}</p>
                      {statusSubtitle && <p className="text-xs text-gray-400 mt-0.5">{statusSubtitle}</p>}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Search & Date Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white"
          />
          <span className="text-xs text-gray-400">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
            >
              Clear
            </button>
          )}
        </div>
        <div className="ml-auto text-sm text-gray-500">
          {isLoading ? (
            <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
          ) : (
            <>{totalCount} invoice{totalCount !== 1 ? 's' : ''}</>
          )}
        </div>
      </div>

      {/* Invoice Table */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-sm border-b-2 border-gray-100">
                <tr>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tenant</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Due Date</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
                          <Receipt className="w-5 h-5 text-primary-600" />
                        </div>
                        <div className="space-y-1">
                          <div className="h-4 w-24 bg-gray-200 rounded" />
                          <div className="h-3 w-16 bg-gray-200 rounded" />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><div className="h-4 w-28 bg-gray-200 rounded" /></td>
                    <td className="px-5 py-3.5"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="px-5 py-3.5"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <div className="h-4 w-20 bg-gray-200 rounded" />
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><div className="h-6 w-16 bg-gray-200 rounded-full" /></td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-2 text-gray-300 rounded-lg"><Eye className="w-4 h-4" /></button>
                        <button className="p-2 text-gray-300 rounded-lg"><Printer className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !invoices?.length ? (
            <EmptyState
              icon={Receipt}
              title="No invoices found"
              description="Create your first invoice or generate monthly invoices for active leases."
              action={
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setShowGenerateModal(true)}>
                    <Zap className="w-4 h-4 mr-2" />
                    Generate Monthly
                  </Button>
                  <Button onClick={() => setShowForm(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Invoice
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-sm border-b-2 border-gray-100">
                    <tr>
                      <th className="px-4 py-3.5 w-10">
                        <SelectionCheckbox
                          checked={selection.isAllPageSelected(pageIds)}
                          indeterminate={selection.isPartialPageSelected(pageIds)}
                          onChange={() => selection.selectPage(pageIds)}
                        />
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice</th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tenant</th>
                      <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance</th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Due Date</th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoices?.map((invoice: Invoice, index: number) => {
                      const config = statusConfig[invoice.status] || statusConfig.draft
                      const StatusIcon = config.icon
                      const isOverdue = invoice.status === 'overdue' || (
                        invoice.status !== 'paid' &&
                        invoice.status !== 'cancelled' &&
                        new Date(invoice.due_date) < new Date()
                      )
                      const isOptimistic = invoice._isOptimistic

                      return (
                        <motion.tr
                          key={invoice.id}
                          initial={isOptimistic ? { opacity: 0.5, backgroundColor: 'rgb(239 246 255)' } : { opacity: 0 }}
                          animate={{ opacity: 1, backgroundColor: 'transparent' }}
                          transition={{ duration: 0.3 }}
                          onClick={() => !isOptimistic && navigate(`/dashboard/invoices/${invoice.id}`)}
                          onMouseEnter={() => !isOptimistic && prefetch(`/dashboard/invoices/${invoice.id}`)}
                          className={cn(
                            'transition-colors group',
                            isOptimistic ? 'bg-blue-50' : selection.isSelected(invoice.id) ? 'bg-primary-50' : 'hover:bg-gray-50',
                            !isOptimistic && 'cursor-pointer'
                          )}
                        >
                          <td className="px-4 py-3.5 w-10" onClick={(e) => e.stopPropagation()}>
                            {!isOptimistic && (
                              <SelectionCheckbox
                                checked={selection.isSelected(invoice.id)}
                                onChange={() => selection.toggle(invoice.id)}
                              />
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                'w-10 h-10 rounded-lg flex items-center justify-center',
                                isOptimistic ? 'bg-blue-100' : isOverdue ? 'bg-rose-100' : 'bg-primary-50'
                              )}>
                                {isOptimistic ? (
                                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                                ) : isOverdue ? (
                                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                                ) : (
                                  <Receipt className="w-5 h-5 text-primary-600" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className={cn(
                                    'font-semibold',
                                    isOptimistic ? 'text-blue-600' : 'text-gray-900'
                                  )} title={!isOptimistic ? `Invoice ${invoice.invoice_number}` : undefined}>
                                    {isOptimistic ? 'Creating...' : invoice.invoice_number}
                                  </p>
                                  {isOptimistic && (
                                    <span className="text-xs text-blue-500">Processing...</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">{invoice.date ? formatDate(invoice.date) : '\u2014'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            {invoice.tenant ? (
                              <button
                                onMouseEnter={() => prefetch(`/dashboard/tenants/${invoice.tenant}`)}
                                onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/tenants/${invoice.tenant}`) }}
                                className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
                              >
                                {invoice.tenant_name || 'Unknown Tenant'}
                              </button>
                            ) : (
                              <p className="text-gray-900">{invoice.tenant_name || 'Unknown Tenant'}</p>
                            )}
                            {invoice.unit_name && (
                              <p className="text-xs text-gray-500">{invoice.unit_name}</p>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <p className="font-semibold text-gray-900 tabular-nums">
                              {formatCurrency(invoice.total_amount || 0)}
                            </p>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <p className={cn(
                              'font-semibold tabular-nums',
                              Number(invoice.balance) > 0 ? 'text-rose-600' : 'text-emerald-600'
                            )}>
                              {formatCurrency(invoice.balance ?? 0)}
                            </p>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              <span className={cn(
                                'text-sm',
                                isOverdue ? 'text-rose-600 font-medium' : 'text-gray-600'
                              )} title={invoice.due_date ? `Due: ${formatDate(invoice.due_date)}` : undefined}>
                                {invoice.due_date ? formatDate(invoice.due_date) : '\u2014'}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <Tooltip content={statusTooltips[invoice.status] || invoice.status}>
                              <span className={cn(
                                'inline-flex items-center whitespace-nowrap gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
                                config.bgColor, config.color
                              )}>
                                <StatusIcon className="w-3 h-3" />
                                {config.label}
                              </span>
                            </Tooltip>
                          </td>
                          <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                            {isOptimistic ? (
                              <span className="text-sm text-blue-600">Processing...</span>
                            ) : (
                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {invoice.status === 'draft' && (
                                  <Button
                                    size="sm"
                                    onClick={() => handlePost(invoice.id as number)}
                                    disabled={postingId === invoice.id}
                                    className="gap-1"
                                  >
                                    {postingId === invoice.id ? (
                                      <>
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Posting...
                                      </>
                                    ) : (
                                      <>
                                        <Send className="w-3 h-3" />
                                        Post
                                      </>
                                    )}
                                  </Button>
                                )}
                                <button
                                  onMouseEnter={() => prefetch(`/dashboard/invoices/${invoice.id}`)}
                                  onClick={() => handleViewDetails(invoice)}
                                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                  title="View Details"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handlePrint(invoice)}
                                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                  title="Print Invoice"
                                >
                                  <Printer className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </motion.tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
      )}

      {totalPages > 1 && (
        <div className="card overflow-hidden">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            showPageSize={false}
          />
        </div>
      )}

      {/* Create Invoice Modal */}
      <Modal
        open={showForm}
        onClose={resetForm}
        title="Create Invoice"
        icon={Plus}
      >
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }} className="space-y-5">
          {/* Tenant Select */}
          <AsyncSelect
            label="Tenant"
            placeholder="Select tenant"
            value={form.tenant}
            onChange={(val) => setForm({ ...form, tenant: String(val) })}
            options={tenants?.map((t: any) => ({ value: t.id, label: `${t.name} (${t.code})${t.unit_name ? ` - ${t.unit_name}` : ''}` })) || []}
            isLoading={tenantsLoading}
            required
            searchable
            emptyMessage="No tenants found. Create a tenant first in Masterfile."
          />

          {/* Unit Select */}
          <AsyncSelect
            label="Unit (Optional)"
            placeholder="No specific unit"
            value={form.unit}
            onChange={(val) => setForm({ ...form, unit: String(val) })}
            options={units?.map((u: any) => ({ value: u.id, label: `Unit ${u.unit_number} - ${u.property_name || 'Unknown Property'}` })) || []}
            isLoading={unitsLoading}
            searchable
            clearable
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              type="date"
              label="Invoice Date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
            <Input
              type="date"
              label="Due Date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Invoice Type"
              value={form.invoice_type}
              onChange={(e) => setForm({ ...form, invoice_type: e.target.value })}
              options={[
                { value: 'rent', label: 'Rent' },
                { value: 'utilities', label: 'Utilities' },
                { value: 'deposit', label: 'Deposit' },
                { value: 'other', label: 'Other' },
              ]}
            />

            <Input
              type="number"
              label="Amount"
              placeholder="0.00"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </div>

          <Textarea
            label="Description"
            placeholder="Invoice description..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
          />

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={resetForm}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={createMutation.isPending || tenantsLoading}>
              {createMutation.isPending ? 'Creating...' : 'Create Invoice'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Billing Dashboard Modal */}
      <Modal
        open={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        title="Monthly Billing"
        icon={Zap}
        size="lg"
      >
        <div className="space-y-5">
          {/* Single / Batch toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setGenerateForm({ ...generateForm, batchMode: false })}
              className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                !generateForm.batchMode ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              Single Month
            </button>
            <button
              onClick={() => setGenerateForm({ ...generateForm, batchMode: true, month_to: generateForm.month, year_to: generateForm.year })}
              className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                generateForm.batchMode ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              Multiple Months
            </button>
          </div>

          {/* Month/Year selector */}
          <div className="grid grid-cols-2 gap-4">
            <Select
              label={generateForm.batchMode ? 'From Month' : 'Month'}
              value={generateForm.month}
              onChange={(e) => setGenerateForm({ ...generateForm, month: Number(e.target.value) })}
              options={[
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
              ].map((month, i) => ({ value: String(i + 1), label: month }))}
            />
            <Input
              type="number"
              label={generateForm.batchMode ? 'From Year' : 'Year'}
              value={generateForm.year}
              onChange={(e) => setGenerateForm({ ...generateForm, year: Number(e.target.value) })}
              min="2020"
              max="2030"
            />
          </div>

          {generateForm.batchMode && (
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="To Month"
                value={generateForm.month_to}
                onChange={(e) => setGenerateForm({ ...generateForm, month_to: Number(e.target.value) })}
                options={[
                  'January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'
                ].map((month, i) => ({ value: String(i + 1), label: month }))}
              />
              <Input
                type="number"
                label="To Year"
                value={generateForm.year_to}
                onChange={(e) => setGenerateForm({ ...generateForm, year_to: Number(e.target.value) })}
                min="2020"
                max="2030"
              />
            </div>
          )}

          {/* Optional: custom invoice date and due date */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              type="date"
              label={`Invoice Date (optional — defaults to 1st of ${generateForm.batchMode ? 'each' : 'the'} month)`}
              value={generateForm.invoice_date}
              onChange={(e) => setGenerateForm({ ...generateForm, invoice_date: e.target.value })}
            />
            <Input
              type="date"
              label={`Due Date (optional — defaults to 15th of ${generateForm.batchMode ? 'each' : 'the'} month)`}
              value={generateForm.due_date}
              onChange={(e) => setGenerateForm({ ...generateForm, due_date: e.target.value })}
            />
          </div>

          {/* Billing status per property */}
          <BillingStatusTable
            month={generateForm.month}
            year={generateForm.year}
            onBillProperty={(propertyId) => {
              generateMutation.mutate({ ...generateForm, property_id: propertyId })
            }}
            onBillAll={() => {
              generateMutation.mutate({ ...generateForm, property_id: '' })
            }}
            isBilling={generateMutation.isPending}
          />
        </div>
      </Modal>

      {/* Invoice Detail Modal */}
      <AnimatePresence>
        {showDetailModal && selectedInvoice && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                    <Receipt className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{selectedInvoice.invoice_number}</h3>
                    <p className="text-sm text-gray-500">Invoice Details</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Tenant</p>
                    <p className="font-medium text-gray-900">{selectedInvoice.tenant_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Unit</p>
                    <p className="font-medium text-gray-900">{selectedInvoice.unit_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Invoice Date</p>
                    <p className="font-medium text-gray-900">{formatDate(selectedInvoice.date)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Due Date</p>
                    <p className="font-medium text-gray-900">{formatDate(selectedInvoice.due_date)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Type</p>
                    <p className="font-medium text-gray-900 capitalize">{selectedInvoice.invoice_type}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <span className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                      statusConfig[selectedInvoice.status]?.bgColor,
                      statusConfig[selectedInvoice.status]?.color
                    )}>
                      {statusConfig[selectedInvoice.status]?.label || selectedInvoice.status}
                    </span>
                  </div>
                </div>

                {selectedInvoice.description && (
                  <div>
                    <p className="text-sm text-gray-500">Description</p>
                    <p className="font-medium text-gray-900">{selectedInvoice.description}</p>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-100 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Amount</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(selectedInvoice.total_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Amount Paid</span>
                    <span className="font-semibold text-emerald-600">
                      {formatCurrency(Number(selectedInvoice.total_amount) - Number(selectedInvoice.balance))}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg">
                    <span className="font-medium text-gray-900">Balance Due</span>
                    <span className={cn(
                      'font-bold',
                      Number(selectedInvoice.balance) > 0 ? 'text-rose-600' : 'text-emerald-600'
                    )}>
                      {formatCurrency(selectedInvoice.balance)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowDetailModal(false)}
                >
                  Close
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    handlePrint(selectedInvoice)
                    setShowDetailModal(false)
                  }}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print Invoice
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selection.selectedCount}
        onClearSelection={selection.clearSelection}
        entityName="invoices"
        actions={[
          { label: 'Export', icon: Download, onClick: handleBulkExport, variant: 'outline' },
          { label: 'Print', icon: Printer, onClick: handleBulkPrint, variant: 'outline' },
          { label: 'Post to Ledger', icon: BookOpen, onClick: handleBulkPost, variant: 'primary' },
          { label: 'Send', icon: Send, onClick: handleBulkSend, variant: 'primary' },
          { label: 'Delete', icon: Trash2, onClick: handleBulkDelete, variant: 'danger' },
        ]}
      />

      {/* Bulk Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog(d => ({ ...d, open: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type="danger"
        confirmText="Confirm"
      />
    </div>
  )
}
