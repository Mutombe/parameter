import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Edit2,
  FileText,
  Home,
  DollarSign,
  Calendar,
  Play,
  XCircle,
  Printer,
  Clock,
  CheckCircle,
  AlertTriangle,
  Upload,
  Download,
  Loader2,
  Plus,
  Receipt,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { leaseApi, invoiceApi } from '../../services/api'
import { formatCurrency, formatDate, cn, getMediaUrl } from '../../lib/utils'
import { Button, ConfirmDialog, TableFilter } from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'
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

const statusConfig: Record<string, { color: string; bgColor: string; icon: any; label: string }> = {
  draft: { color: 'text-gray-600', bgColor: 'bg-gray-100', icon: Clock, label: 'Draft' },
  active: { color: 'text-emerald-600', bgColor: 'bg-emerald-50', icon: CheckCircle, label: 'Active' },
  expired: { color: 'text-amber-600', bgColor: 'bg-amber-50', icon: AlertTriangle, label: 'Expired' },
  terminated: { color: 'text-rose-600', bgColor: 'bg-rose-50', icon: XCircle, label: 'Terminated' },
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

export default function LeaseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const leaseId = Number(id)

  const [showActivateDialog, setShowActivateDialog] = useState(false)
  const [showTerminateDialog, setShowTerminateDialog] = useState(false)
  const [terminateReason, setTerminateReason] = useState('')

  // 1. Lease data
  const { data: lease, isLoading: loadingLease } = useQuery({
    queryKey: ['lease', leaseId],
    queryFn: () => leaseApi.get(leaseId).then((r) => r.data),
    enabled: !!leaseId,
  })

  // 2. Related invoices
  const { data: invoicesData, isLoading: loadingInvoices } = useQuery({
    queryKey: ['lease-invoices', leaseId],
    queryFn: () => invoiceApi.list({ lease: leaseId }).then((r) => r.data),
    enabled: !!leaseId,
  })

  const activateMutation = useMutation({
    mutationFn: (id: number) => leaseApi.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lease', leaseId] })
      showToast.success('Lease activated successfully')
      setShowActivateDialog(false)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to activate lease')),
  })

  const terminateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => leaseApi.terminate(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lease', leaseId] })
      showToast.success('Lease terminated')
      setShowTerminateDialog(false)
      setTerminateReason('')
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to terminate lease')),
  })

  const uploadDocMutation = useMutation({
    mutationFn: (file: File) => leaseApi.uploadDocument(leaseId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lease', leaseId] })
      showToast.success('Document uploaded successfully')
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to upload document')),
  })

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadDocMutation.mutate(file)
  }

  const config = statusConfig[lease?.status || 'draft'] || statusConfig.draft
  const StatusIcon = config.icon

  const invoices = invoicesData?.results || invoicesData || []

  // Calculate lease term and days remaining
  const leaseTerm = (() => {
    if (!lease?.start_date || !lease?.end_date) return 0
    const start = new Date(lease.start_date)
    const end = new Date(lease.end_date)
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30))
  })()

  const daysRemaining = (() => {
    if (!lease?.end_date || lease?.status !== 'active') return 0
    const end = new Date(lease.end_date)
    const now = new Date()
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
  })()

  const daysColor = daysRemaining > 90 ? 'text-emerald-600' : daysRemaining > 30 ? 'text-amber-600' : 'text-red-600'

  // Payment progress
  const paymentProgress = useMemo(() => {
    if (!invoices?.length) return { invoiced: 0, paid: 0, percentage: 0 }
    const invoiced = invoices.reduce((sum: number, inv: any) => sum + Number(inv.total_amount || 0), 0)
    const paid = invoices.reduce((sum: number, inv: any) => sum + (Number(inv.total_amount || 0) - Number(inv.balance || 0)), 0)
    return { invoiced, paid, percentage: invoiced > 0 ? (paid / invoiced) * 100 : 0 }
  }, [invoices])

  // Monthly invoice timeline data
  const monthlyInvoiceData = useMemo(() => {
    if (!invoices?.length) return []
    const monthMap: Record<string, { invoiced: number; paid: number }> = {}
    invoices.forEach((inv: any) => {
      const date = new Date(inv.date || inv.created_at)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      if (!monthMap[key]) monthMap[key] = { invoiced: 0, paid: 0 }
      monthMap[key].invoiced += Number(inv.total_amount || 0)
      monthMap[key].paid += Number(inv.total_amount || 0) - Number(inv.balance || 0)
    })
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => {
        const [y, m] = month.split('-')
        const label = new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        return { name: label, invoiced: data.invoiced, paid: data.paid }
      })
  }, [invoices])

  // Invoice status breakdown for pie chart
  const invoiceStatusData = useMemo(() => {
    if (!invoices?.length) return []
    const statusMap: Record<string, number> = {}
    invoices.forEach((inv: any) => {
      const status = inv.status || 'unknown'
      statusMap[status] = (statusMap[status] || 0) + 1
    })
    const colorMap: Record<string, string> = {
      paid: '#10b981',
      overdue: '#ef4444',
      draft: '#9ca3af',
      sent: '#f59e0b',
      partially_paid: '#3b82f6',
      cancelled: '#6b7280',
      pending: '#f59e0b',
    }
    return Object.entries(statusMap).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' '),
      value: count,
      color: colorMap[status] || '#8b5cf6',
    }))
  }, [invoices])

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard/leases')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-3">
            {loadingLease ? (
              <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">
                  Lease{' '}
                  <span className="text-primary-600 font-mono tracking-tight">{lease?.lease_number}</span>
                </h1>
                <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', config.bgColor, config.color)}>
                  <StatusIcon className="w-3 h-3" />
                  {config.label}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/dashboard/receipts')} className="gap-2">
            <Plus className="w-4 h-4" />
            Record Payment
          </Button>
          <Button variant="outline" onClick={() => navigate('/dashboard/invoices')} className="gap-2">
            <Receipt className="w-4 h-4" />
            View Invoices
          </Button>
          {lease?.status === 'draft' && (
            <>
              <Button variant="outline" onClick={() => setShowActivateDialog(true)} className="gap-2">
                <Play className="w-4 h-4" />
                Activate
              </Button>
              <Button variant="outline" onClick={() => navigate('/dashboard/leases', { state: { edit: leaseId } })} className="gap-2">
                <Edit2 className="w-4 h-4" />
                Edit
              </Button>
            </>
          )}
          {lease?.status === 'active' && (
            <Button variant="outline" onClick={() => setShowTerminateDialog(true)} className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50">
              <XCircle className="w-4 h-4" />
              Terminate
            </Button>
          )}
        </div>
      </motion.div>

      {/* Profile Info Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-white rounded-xl border border-gray-200 p-4 md:p-6"
      >
        {loadingLease ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-2 animate-pulse">
                <div className="h-3 w-16 bg-gray-200 rounded" />
                <div className="h-4 w-32 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {/* Tenant */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Tenant</p>
              <button
                onClick={() => lease?.tenant && navigate(`/dashboard/tenants/${lease.tenant}`)}
                className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 hover:underline cursor-pointer transition-colors"
              >
                <TbUserSquareRounded className="w-3.5 h-3.5" />
                <span>{lease?.tenant_name}</span>
              </button>
            </div>

            {/* Unit */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Unit</p>
              {lease?.unit ? (
                <button
                  onClick={() => navigate(`/dashboard/units/${lease.unit}`)}
                  className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 hover:underline cursor-pointer transition-colors"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>{lease?.unit_display}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Home className="w-3.5 h-3.5 text-gray-400" />
                  <span>{lease?.unit_display}</span>
                </div>
              )}
            </div>

            {/* Property */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Property</p>
              {lease?.property_id ? (
                <button
                  onClick={() => navigate(`/dashboard/properties/${lease.property_id}`)}
                  className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 hover:underline cursor-pointer transition-colors"
                >
                  <PiBuildingApartmentLight className="w-3.5 h-3.5" />
                  <span>{lease?.property_name}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <PiBuildingApartmentLight className="w-3.5 h-3.5 text-gray-400" />
                  <span>{lease?.property_name || '-'}</span>
                </div>
              )}
            </div>

            {/* Landlord */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Landlord</p>
              {lease?.landlord_id ? (
                <button
                  onClick={() => navigate(`/dashboard/landlords/${lease.landlord_id}`)}
                  className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 hover:underline cursor-pointer transition-colors"
                >
                  <TbUserSquareRounded className="w-3.5 h-3.5" />
                  <span>{lease?.landlord_name}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <TbUserSquareRounded className="w-3.5 h-3.5 text-gray-400" />
                  <span>{lease?.landlord_name || '-'}</span>
                </div>
              )}
            </div>

            {/* Financial */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Financial</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                  <span>{formatCurrency(lease?.monthly_rent || 0)} /month</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                  <span>{formatCurrency(lease?.deposit_amount || 0)} deposit</span>
                </div>
                <div className="text-xs text-gray-400">{lease?.currency}</div>
              </div>
            </div>

            {/* Terms */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Terms</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <span>{lease?.start_date ? formatDate(lease.start_date) : '-'} - {lease?.end_date ? formatDate(lease.end_date) : '-'}</span>
                </div>
                <div className="text-sm text-gray-600">Payment day: {lease?.payment_day || 1}</div>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Monthly Rent" value={formatCurrency(lease?.monthly_rent || 0)} subtitle={lease?.currency} icon={DollarSign} color="blue" isLoading={loadingLease} />
        <StatCard title="Deposit" value={formatCurrency(lease?.deposit_amount || 0)} icon={DollarSign} color="green" isLoading={loadingLease} />
        <StatCard title="Lease Term" value={`${leaseTerm} months`} icon={Calendar} color="purple" isLoading={loadingLease} />
        <StatCard title="Days Remaining" value={lease?.status === 'active' ? daysRemaining : '-'} icon={Clock} color="orange" isLoading={loadingLease} valueClassName={lease?.status === 'active' ? daysColor : undefined} />
      </motion.div>

      {/* Lease Document */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white rounded-xl border border-gray-200 p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Lease Document</h3>
        {loadingLease ? (
          <div className="h-20 bg-gray-100 rounded-lg animate-pulse" />
        ) : lease?.document ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Lease Agreement</p>
                  <p className="text-xs text-gray-500">PDF Document</p>
                </div>
              </div>
              <a
                href={getMediaUrl(lease.document) || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
              </a>
            </div>
            {lease.document.endsWith('.pdf') && (
              <iframe
                src={getMediaUrl(lease.document) || ''}
                className="w-full h-96 rounded-lg border border-gray-200"
                title="Lease Document Preview"
              />
            )}
            <label className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
              <Upload className="w-4 h-4" />
              Replace Document
              <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleDocumentUpload} />
            </label>
          </div>
        ) : (
          <label className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-colors">
            {uploadDocMutation.isPending ? (
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            ) : (
              <Upload className="w-8 h-8 text-gray-400" />
            )}
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">
                {uploadDocMutation.isPending ? 'Uploading...' : 'Upload Lease Document'}
              </p>
              <p className="text-xs text-gray-500 mt-1">PDF, DOC, DOCX up to 10MB</p>
            </div>
            <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleDocumentUpload} disabled={uploadDocMutation.isPending} />
          </label>
        )}
      </motion.div>

      {/* Notes */}
      {lease?.notes && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Notes</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{lease.notes}</p>
        </motion.div>
      )}

      {/* Invoices Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Invoices</h3>
            <p className="text-sm text-gray-500">Invoices generated for this lease</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard/invoices')}
              className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Create Invoice
            </button>
            <button
              onClick={() => navigate('/dashboard/receipts')}
              className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Record Payment
            </button>
          </div>
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
            <div className="p-12 text-center text-sm text-gray-400">No invoices found for this lease</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Invoice #</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Due Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Type</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Balance</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredInvoices.map((inv: any) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/dashboard/invoices/${inv.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{inv.invoice_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(inv.date)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(inv.due_date)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 capitalize">{inv.invoice_type}</td>
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

      {/* Analytics Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="space-y-6"
      >
        <h2 className="text-lg font-semibold text-gray-900">Analytics</h2>

        {/* Payment Progress Bar - Full Width */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Payment Collection</h3>
          {loadingInvoices ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-10 w-24 bg-gray-200 rounded" />
              <div className="h-4 w-full bg-gray-200 rounded-full" />
              <div className="h-4 w-48 bg-gray-200 rounded" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No invoice data available</div>
          ) : (
            <div>
              <div className="text-4xl font-bold text-gray-900 mb-1">
                {paymentProgress.percentage.toFixed(1)}%
              </div>
              <p className="text-sm text-gray-500 mb-4">of total invoiced amount collected</p>
              <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-emerald-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(paymentProgress.percentage, 100)}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </div>
              <div className="flex items-center justify-between mt-3 text-sm">
                <span className="text-gray-500">
                  Paid: <span className="font-semibold text-emerald-600">{formatCurrency(paymentProgress.paid)}</span>
                </span>
                <span className="text-gray-500">
                  Invoiced: <span className="font-semibold text-gray-900">{formatCurrency(paymentProgress.invoiced)}</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Invoice Timeline - 2/3 width */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Invoice Timeline</h3>
                <p className="text-sm text-gray-500">Monthly invoiced vs paid amounts</p>
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
                <div className="h-full flex items-end gap-2 px-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex-1 flex gap-1">
                      <div className="flex-1 bg-gray-200 rounded-t animate-pulse" style={{ height: `${30 + Math.random() * 60}%` }} />
                      <div className="flex-1 bg-gray-200 rounded-t animate-pulse" style={{ height: `${20 + Math.random() * 50}%` }} />
                    </div>
                  ))}
                </div>
              ) : monthlyInvoiceData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-400">No invoice timeline data available</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyInvoiceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                    <RechartsTooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="invoiced" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Invoiced" />
                    <Bar dataKey="paid" fill="#10b981" radius={[4, 4, 0, 0]} name="Paid" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Invoice Status Breakdown - 1/3 width */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="mb-6">
              <h3 className="text-base font-semibold text-gray-900">Invoice Status</h3>
              <p className="text-sm text-gray-500">Breakdown by status</p>
            </div>
            <div className="h-52">
              {loadingInvoices ? (
                <div className="h-full flex items-center justify-center">
                  <div className="h-36 w-36 rounded-full border-8 border-gray-200 animate-pulse" />
                </div>
              ) : invoiceStatusData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-400">No status data available</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={invoiceStatusData} innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                      {invoiceStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(value: number, name: string) => [`${value} invoice${value !== 1 ? 's' : ''}`, name]}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            {!loadingInvoices && invoiceStatusData.length > 0 && (
              <div className="mt-4 space-y-2">
                {invoiceStatusData.map((entry, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="text-gray-600">{entry.name}</span>
                    </div>
                    <span className="font-medium text-gray-900">{entry.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Activate Confirmation */}
      <ConfirmDialog
        open={showActivateDialog}
        onClose={() => setShowActivateDialog(false)}
        onConfirm={() => activateMutation.mutate(leaseId)}
        title="Activate Lease"
        description={`Are you sure you want to activate lease "${lease?.lease_number}"? This will mark the unit as occupied and start the billing cycle.`}
        confirmText="Activate"
        variant="default"
        loading={activateMutation.isPending}
      />

      {/* Terminate Confirmation */}
      <ConfirmDialog
        open={showTerminateDialog}
        onClose={() => { setShowTerminateDialog(false); setTerminateReason('') }}
        onConfirm={() => terminateMutation.mutate({ id: leaseId, reason: terminateReason || 'Terminated by user' })}
        title="Terminate Lease"
        description={`Are you sure you want to terminate lease "${lease?.lease_number}"? This will end the tenancy and mark the unit as vacant.`}
        confirmText="Terminate"
        variant="danger"
        loading={terminateMutation.isPending}
      />
    </div>
  )
}
