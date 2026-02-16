import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Receipt,
  Plus,
  Search,
  Send,
  DollarSign,
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Printer,
  MoreVertical,
  TrendingUp,
  TrendingDown,
  Filter,
  Download,
  RefreshCw,
  Zap,
  Loader2,
  X,
} from 'lucide-react'
import { invoiceApi, tenantApi, unitApi, leaseApi } from '../../services/api'
import { formatCurrency, formatDate, cn, useDebounce } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Textarea, Badge, EmptyState, Skeleton, ConfirmDialog } from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'
import { TbUserSquareRounded } from "react-icons/tb";

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

export default function Invoices() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [postingId, setPostingId] = useState<number | null>(null)
  const [generateForm, setGenerateForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
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

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices', debouncedSearch, statusFilter],
    queryFn: () => {
      const params: any = {}
      if (debouncedSearch) params.search = debouncedSearch
      if (statusFilter) params.status = statusFilter
      return invoiceApi.list(params).then(r => r.data.results || r.data)
    },
  })

  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants-select'],
    queryFn: () => tenantApi.list().then(r => r.data.results || r.data),
    enabled: showForm,
    staleTime: 30000,
  })

  const { data: units, isLoading: unitsLoading } = useQuery({
    queryKey: ['units-select'],
    queryFn: () => unitApi.list().then(r => r.data.results || r.data),
    enabled: showForm,
    staleTime: 30000,
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
      const previousInvoices = queryClient.getQueryData(['invoices', debouncedSearch, statusFilter])

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

      queryClient.setQueryData(['invoices', debouncedSearch, statusFilter], (old: any) => {
        const items = old || []
        return [optimisticInvoice, ...items]
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
        queryClient.setQueryData(['invoices', debouncedSearch, statusFilter], context.previousInvoices)
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
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      showToast.error('Unable to open print window')
      return
    }

    const statusLabel = statusConfig[invoice.status]?.label || invoice.status

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
          @page { size: A4; margin: 2cm; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; color: #1a1a1a; }
          .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
          .header h1 { font-size: 28px; margin: 0 0 5px 0; color: #111827; }
          .header p { color: #6b7280; margin: 5px 0; }
          .invoice-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .invoice-info div { }
          .invoice-info h3 { font-size: 14px; color: #6b7280; margin: 0 0 5px 0; text-transform: uppercase; }
          .invoice-info p { margin: 5px 0; font-size: 16px; }
          .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
          .details h3 { margin: 0 0 15px 0; font-size: 18px; }
          .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
          .row:last-child { border-bottom: none; }
          .row .label { color: #6b7280; }
          .row .value { font-weight: 600; }
          .total { background: #111827; color: white; padding: 20px; border-radius: 8px; text-align: center; }
          .total h3 { margin: 0 0 5px 0; font-size: 14px; text-transform: uppercase; opacity: 0.8; }
          .total p { font-size: 32px; font-weight: bold; margin: 0; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>INVOICE</h1>
          <p>${invoice.invoice_number}</p>
        </div>

        <div class="invoice-info">
          <div>
            <h3>Bill To</h3>
            <p><strong>${invoice.tenant_name}</strong></p>
            ${invoice.unit_name ? `<p>${invoice.unit_name}</p>` : ''}
          </div>
          <div style="text-align: right;">
            <h3>Invoice Details</h3>
            <p>Date: ${formatDate(invoice.date)}</p>
            <p>Due Date: ${formatDate(invoice.due_date)}</p>
            <p>Status: ${statusLabel}</p>
          </div>
        </div>

        <div class="details">
          <h3>Invoice Summary</h3>
          <div class="row">
            <span class="label">Type</span>
            <span class="value">${invoice.invoice_type.charAt(0).toUpperCase() + invoice.invoice_type.slice(1)}</span>
          </div>
          ${invoice.description ? `
          <div class="row">
            <span class="label">Description</span>
            <span class="value">${invoice.description}</span>
          </div>
          ` : ''}
          <div class="row">
            <span class="label">Total Amount</span>
            <span class="value">${formatCurrency(invoice.total_amount)}</span>
          </div>
          <div class="row">
            <span class="label">Amount Paid</span>
            <span class="value">${formatCurrency(Number(invoice.total_amount) - Number(invoice.balance))}</span>
          </div>
          <div class="row">
            <span class="label">Balance Due</span>
            <span class="value" style="color: ${Number(invoice.balance) > 0 ? '#dc2626' : '#059669'};">${formatCurrency(invoice.balance)}</span>
          </div>
        </div>

        <div class="total">
          <h3>Amount Due</h3>
          <p>${formatCurrency(invoice.balance)}</p>
        </div>

        <div class="footer">
          Generated by Parameter Real Estate Accounting System &bull; ${new Date().toLocaleDateString()}
        </div>
      </body>
      </html>
    `)

    printWindow.document.close()
    printWindow.onload = () => {
      printWindow.focus()
      printWindow.print()
      printWindow.close()
    }
  }

  const generateMutation = useMutation({
    mutationFn: (data: typeof generateForm) => invoiceApi.generateMonthly(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      const count = response.data?.created_count || response.data?.length || 0
      showToast.success(`Generated ${count} invoices successfully`)
      setShowGenerateModal(false)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to generate invoices')),
  })

  // Stats calculations
  const stats = {
    total: invoices?.length || 0,
    draft: invoices?.filter((i: Invoice) => i.status === 'draft').length || 0,
    sent: invoices?.filter((i: Invoice) => i.status === 'sent').length || 0,
    overdue: invoices?.filter((i: Invoice) => i.status === 'overdue').length || 0,
    paid: invoices?.filter((i: Invoice) => i.status === 'paid').length || 0,
  }

  const totalAmount = invoices?.reduce((sum: number, i: Invoice) => sum + Number(i.total_amount || 0), 0) || 0
  const totalCollected = invoices?.reduce((sum: number, i: Invoice) => sum + (Number(i.total_amount || 0) - Number(i.balance || 0)), 0) || 0
  const totalOutstanding = invoices?.reduce((sum: number, i: Invoice) => sum + Number(i.balance || 0), 0) || 0
  const collectionRate = totalAmount > 0 ? (totalCollected / totalAmount) * 100 : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        subtitle="Manage rent and utility invoices"
        icon={Receipt}
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

      {/* Status Filter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
        <motion.div
          whileHover={{ y: -2 }}
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
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.total}</p>
              )}
            </div>
          </div>
        </motion.div>

        {(['draft', 'sent', 'overdue', 'paid'] as const).map((status) => {
          const config = statusConfig[status]
          const StatusIcon = config.icon
          const count = stats[status]
          return (
            <motion.div
              key={status}
              whileHover={{ y: -2 }}
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
                    <p className={cn('text-xl sm:text-2xl font-bold', config.color)}>{count}</p>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-3 sm:p-5 text-white">
          <div className="flex items-center gap-2 sm:gap-3">
            <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-white/80" />
            <div>
              <p className="text-blue-100 text-xs sm:text-sm">Total Billed</p>
              {isLoading ? (
                <div className="h-6 sm:h-8 w-20 sm:w-24 bg-white/30 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-lg sm:text-2xl font-bold">{formatCurrency(totalAmount)}</p>
              )}
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-3 sm:p-5 text-white">
          <div className="flex items-center gap-2 sm:gap-3">
            <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-white/80" />
            <div>
              {isLoading ? (
                <>
                  <p className="text-emerald-100 text-xs sm:text-sm">Collected</p>
                  <div className="h-6 sm:h-8 w-20 sm:w-24 bg-white/30 rounded animate-pulse mt-1" />
                </>
              ) : (
                <>
                  <p className="text-emerald-100 text-xs sm:text-sm">Collected ({collectionRate.toFixed(0)}%)</p>
                  <p className="text-lg sm:text-2xl font-bold">{formatCurrency(totalCollected)}</p>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl p-3 sm:p-5 text-white">
          <div className="flex items-center gap-2 sm:gap-3">
            <TrendingDown className="w-6 h-6 sm:w-8 sm:h-8 text-white/80" />
            <div>
              <p className="text-rose-100 text-xs sm:text-sm">Outstanding</p>
              {isLoading ? (
                <div className="h-6 sm:h-8 w-20 sm:w-24 bg-white/30 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-lg sm:text-2xl font-bold">{formatCurrency(totalOutstanding)}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by invoice number or tenant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>

        <div className="ml-auto text-sm text-gray-500">
          {isLoading ? (
            <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
          ) : (
            <>{invoices?.length || 0} invoices</>
          )}
        </div>
      </div>

      {/* Invoice Table */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tenant</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Due Date</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4">
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
                    <td className="px-6 py-4"><div className="h-4 w-28 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <div className="h-4 w-20 bg-gray-200 rounded" />
                      </div>
                    </td>
                    <td className="px-6 py-4"><div className="h-6 w-16 bg-gray-200 rounded-full" /></td>
                    <td className="px-6 py-4">
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
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tenant</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Due Date</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
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
                          transition={{ delay: isOptimistic ? 0 : index * 0.02, duration: 0.3 }}
                          className={cn(
                            'transition-colors',
                            isOptimistic ? 'bg-blue-50' : 'hover:bg-gray-50'
                          )}
                        >
                          <td className="px-6 py-4">
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
                                  )}>
                                    {isOptimistic ? 'Creating...' : invoice.invoice_number}
                                  </p>
                                  {isOptimistic && (
                                    <span className="text-xs text-blue-500">Processing...</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">{formatDate(invoice.date)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-gray-900">{invoice.tenant_name}</p>
                            {invoice.unit_name && (
                              <p className="text-xs text-gray-500">{invoice.unit_name}</p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-semibold text-gray-900 tabular-nums">
                              {formatCurrency(invoice.total_amount)}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <p className={cn(
                              'font-semibold tabular-nums',
                              Number(invoice.balance) > 0 ? 'text-rose-600' : 'text-emerald-600'
                            )}>
                              {formatCurrency(invoice.balance)}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              <span className={cn(
                                'text-sm',
                                isOverdue ? 'text-rose-600 font-medium' : 'text-gray-600'
                              )}>
                                {formatDate(invoice.due_date)}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                              config.bgColor, config.color
                            )}>
                              <StatusIcon className="w-3 h-3" />
                              {config.label}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {isOptimistic ? (
                              <span className="text-sm text-blue-600">Processing...</span>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
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

      {/* Create Invoice Modal */}
      <Modal
        open={showForm}
        onClose={resetForm}
        title="Create Invoice"
        icon={Plus}
      >
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }} className="space-y-5">
          {/* Tenant Select with Loading */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tenant <span className="text-red-500">*</span>
            </label>
            {tenantsLoading ? (
              <div className="relative">
                <Skeleton className="h-11 w-full rounded-xl" />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                </div>
              </div>
            ) : (
              <select
                value={form.tenant}
                onChange={(e) => setForm({ ...form, tenant: e.target.value })}
                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                required
              >
                <option value="">Select tenant</option>
                {tenants?.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Unit Select with Loading */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Unit (Optional)
            </label>
            {unitsLoading ? (
              <div className="relative">
                <Skeleton className="h-11 w-full rounded-xl" />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                </div>
              </div>
            ) : (
              <select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              >
                <option value="">Select unit</option>
                {units?.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.property_name} - {u.unit_number}</option>
                ))}
              </select>
            )}
          </div>

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
            >
              <option value="rent">Rent</option>
              <option value="utilities">Utilities</option>
              <option value="deposit">Deposit</option>
              <option value="other">Other</option>
            </Select>

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

      {/* Generate Monthly Modal */}
      <Modal
        open={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        title="Generate Monthly Invoices"
        icon={Zap}
      >
        <form onSubmit={(e) => { e.preventDefault(); generateMutation.mutate(generateForm); }} className="space-y-5">
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-sm text-blue-700">
              This will automatically generate rent invoices for all active leases for the selected month.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Month"
              value={generateForm.month}
              onChange={(e) => setGenerateForm({ ...generateForm, month: Number(e.target.value) })}
            >
              {[
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
              ].map((month, i) => (
                <option key={i} value={i + 1}>{month}</option>
              ))}
            </Select>

            <Input
              type="number"
              label="Year"
              value={generateForm.year}
              onChange={(e) => setGenerateForm({ ...generateForm, year: Number(e.target.value) })}
              min="2020"
              max="2030"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowGenerateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={generateMutation.isPending}>
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Invoices'
              )}
            </Button>
          </div>
        </form>
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
    </div>
  )
}
