import { useState } from 'react'
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
} from 'lucide-react'
import { leaseApi, invoiceApi } from '../../services/api'
import { formatCurrency, formatDate, cn, getMediaUrl } from '../../lib/utils'
import { Button, ConfirmDialog } from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'
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
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">Lease {lease?.lease_number}</h1>
                <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', config.bgColor, config.color)}>
                  <StatusIcon className="w-3 h-3" />
                  {config.label}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            {/* Tenant */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Tenant</p>
              <button
                onClick={() => lease?.tenant && navigate(`/dashboard/tenants/${lease.tenant}`)}
                className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
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
                  className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
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
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Invoices</h3>
          <p className="text-sm text-gray-500">Invoices generated for this lease</p>
        </div>
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
                {invoices.map((inv: any) => (
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
