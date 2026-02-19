import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Receipt,
  DollarSign,
  Calendar,
  FileText,
  Wallet,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Send,
  XCircle,
  Printer,
  CreditCard,
  Home,
  TrendingUp,
  Plus,
  Building2,
} from 'lucide-react'
import { invoiceApi, receiptApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { printInvoice } from '../../lib/printTemplate'
import { Button } from '../../components/ui'
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
  sent: { color: 'text-blue-600', bgColor: 'bg-blue-50', icon: Send, label: 'Sent' },
  partial: { color: 'text-amber-600', bgColor: 'bg-amber-50', icon: TrendingUp, label: 'Partial' },
  paid: { color: 'text-emerald-600', bgColor: 'bg-emerald-50', icon: CheckCircle2, label: 'Paid' },
  overdue: { color: 'text-rose-600', bgColor: 'bg-rose-50', icon: AlertTriangle, label: 'Overdue' },
  cancelled: { color: 'text-gray-400', bgColor: 'bg-gray-50', icon: XCircle, label: 'Cancelled' },
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
        </div>
      ))}
    </div>
  )
}

const methodLabels: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  ecocash: 'EcoCash',
  card: 'Card',
  cheque: 'Cheque',
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const invoiceId = Number(id)

  // 1. Invoice data
  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => invoiceApi.get(invoiceId).then((r) => r.data),
    enabled: !!invoiceId,
  })

  // 2. Payment history (receipts for this invoice)
  const { data: receiptsData, isLoading: loadingReceipts } = useQuery({
    queryKey: ['invoice-receipts', invoiceId],
    queryFn: () => receiptApi.list({ invoice: invoiceId }).then((r) => r.data),
    enabled: !!invoiceId,
  })

  const receipts = receiptsData?.results || receiptsData || []
  const config = statusConfig[invoice?.status || 'draft'] || statusConfig.draft
  const StatusIcon = config.icon

  const totalAmount = Number(invoice?.total_amount || 0)
  const balance = Number(invoice?.balance || 0)
  const amountPaid = totalAmount - balance

  // Days outstanding
  const daysOutstanding = (() => {
    if (!invoice?.date) return 0
    const issued = new Date(invoice.date)
    const now = new Date()
    return Math.max(0, Math.ceil((now.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24)))
  })()

  const isOverdue = invoice?.status === 'overdue' || (
    invoice?.status !== 'paid' && invoice?.status !== 'cancelled' && invoice?.due_date && new Date(invoice.due_date) < new Date()
  )

  // Line items from invoice
  const lineItems = invoice?.line_items || invoice?.items || []

  const handlePrint = () => {
    if (!invoice) return
    printInvoice({
      invoice_number: invoice.invoice_number,
      tenant_name: invoice.tenant_name,
      unit_name: invoice.unit_name,
      date: invoice.date,
      due_date: invoice.due_date,
      status: invoice.status || 'draft',
      invoice_type: invoice.invoice_type,
      description: invoice.description,
      total_amount: totalAmount,
      balance: balance,
      line_items: lineItems,
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard/invoices')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-3">
            {isLoading ? (
              <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">Invoice {invoice?.invoice_number}</h1>
                <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', config.bgColor, config.color)}>
                  <StatusIcon className="w-3 h-3" />
                  {config.label}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard/receipts')}
            className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Record Payment
          </button>
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <Printer className="w-4 h-4" />
            Print
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
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2 animate-pulse">
                <div className="h-3 w-16 bg-gray-200 rounded" />
                <div className="h-4 w-32 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {/* Tenant */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Tenant</p>
              <button
                onClick={() => invoice?.tenant && navigate(`/dashboard/tenants/${invoice.tenant}`)}
                className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 hover:underline cursor-pointer transition-colors"
              >
                <TbUserSquareRounded className="w-3.5 h-3.5" />
                <span>{invoice?.tenant_name}</span>
              </button>
            </div>

            {/* Unit */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Unit</p>
              {invoice?.unit ? (
                <button
                  onClick={() => navigate(`/dashboard/units/${invoice.unit}`)}
                  className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 hover:underline cursor-pointer transition-colors"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>{invoice?.unit_name || '-'}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Home className="w-3.5 h-3.5 text-gray-400" />
                  <span>{invoice?.unit_name || '-'}</span>
                </div>
              )}
            </div>

            {/* Property */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Property</p>
              {invoice?.property ? (
                <button
                  onClick={() => navigate(`/dashboard/properties/${invoice.property}`)}
                  className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 hover:underline cursor-pointer transition-colors"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{invoice?.property_name || 'View Property'}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Building2 className="w-3.5 h-3.5 text-gray-400" />
                  <span>{invoice?.property_name || '-'}</span>
                </div>
              )}
            </div>

            {/* Dates */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Dates</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <span>Issued: {invoice?.date ? formatDate(invoice.date) : '-'}</span>
                </div>
                <div className={cn("flex items-center gap-2 text-sm", isOverdue ? 'text-red-600' : 'text-gray-600')}>
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Due: {invoice?.due_date ? formatDate(invoice.due_date) : '-'}</span>
                </div>
              </div>
            </div>

            {/* Amounts */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Amounts</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                  <span>{formatCurrency(totalAmount)} total</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                  <span>{formatCurrency(balance)} balance</span>
                </div>
                <div className="text-xs text-gray-400 capitalize">{invoice?.invoice_type}</div>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Amount" value={formatCurrency(totalAmount)} icon={DollarSign} color="blue" isLoading={isLoading} />
        <StatCard title="Amount Paid" value={formatCurrency(amountPaid)} icon={Wallet} color="green" isLoading={isLoading} />
        <StatCard title="Balance Due" value={formatCurrency(balance)} icon={Receipt} color="purple" isLoading={isLoading} valueClassName={balance > 0 ? 'text-red-600' : undefined} />
        <StatCard title="Days Outstanding" value={daysOutstanding} icon={Clock} color="orange" isLoading={isLoading} valueClassName={isOverdue ? 'text-red-600' : undefined} />
      </motion.div>

      {/* Line Items Table */}
      {lineItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl border border-gray-200 overflow-hidden"
        >
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">Line Items</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Description</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Qty</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Unit Price</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lineItems.map((li: any, idx: number) => (
                  <tr key={li.id || idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-900">{li.description || li.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{li.quantity || 1}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(li.unit_price || li.price || 0)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">{formatCurrency(li.amount || li.total || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Payment History Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Payment History</h3>
          <p className="text-sm text-gray-500">Receipts allocated to this invoice</p>
        </div>
        <div className="overflow-x-auto">
          {loadingReceipts ? (
            <div className="p-6"><TableSkeleton rows={3} /></div>
          ) : receipts.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No payments recorded for this invoice</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Receipt #</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Method</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {receipts.map((r: any) => (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/dashboard/receipts/${r.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{r.receipt_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(r.date)}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-emerald-600 text-right">{formatCurrency(r.amount)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">{methodLabels[r.payment_method] || r.payment_method}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{r.reference || '-'}</td>
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
