import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Receipt,
  DollarSign,
  Calendar,
  FileText,
  CreditCard,
  Clock,
  CheckCircle2,
  Check,
  XCircle,
  Printer,
  User,
} from 'lucide-react'
import { expenseApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { Button, ConfirmDialog } from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'

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
  pending: { color: 'text-amber-600', bgColor: 'bg-amber-50', icon: Clock, label: 'Pending' },
  approved: { color: 'text-blue-600', bgColor: 'bg-blue-50', icon: CheckCircle2, label: 'Approved' },
  paid: { color: 'text-emerald-600', bgColor: 'bg-emerald-50', icon: Check, label: 'Paid' },
  cancelled: { color: 'text-gray-400', bgColor: 'bg-gray-50', icon: XCircle, label: 'Cancelled' },
}

const expenseTypeLabels: Record<string, string> = {
  landlord_payment: 'Landlord Payment',
  maintenance: 'Maintenance',
  utility: 'Utility',
  commission: 'Commission',
  other: 'Other',
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

export default function ExpenseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const expenseId = Number(id)

  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [showPayConfirm, setShowPayConfirm] = useState(false)

  const { data: expense, isLoading } = useQuery({
    queryKey: ['expense', expenseId],
    queryFn: () => expenseApi.get(expenseId).then((r) => r.data),
    enabled: !!expenseId,
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => expenseApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense', expenseId] })
      showToast.success('Expense approved successfully')
      setShowApproveConfirm(false)
    },
    onError: (err) => showToast.error(parseApiError(err)),
  })

  const payMutation = useMutation({
    mutationFn: (id: number) => expenseApi.pay(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense', expenseId] })
      showToast.success('Expense paid and posted to ledger')
      setShowPayConfirm(false)
    },
    onError: (err) => showToast.error(parseApiError(err)),
  })

  const config = statusConfig[expense?.status || 'pending'] || statusConfig.pending
  const StatusIcon = config.icon

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard/expenses')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-3">
            {isLoading ? (
              <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">Expense {expense?.expense_number}</h1>
                <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', config.bgColor, config.color)}>
                  <StatusIcon className="w-3 h-3" />
                  {config.label}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {expense?.status === 'pending' && (
            <Button onClick={() => setShowApproveConfirm(true)} className="gap-2">
              <Check className="w-4 h-4" />
              Approve
            </Button>
          )}
          {expense?.status === 'approved' && (
            <Button onClick={() => setShowPayConfirm(true)} className="gap-2">
              <CreditCard className="w-4 h-4" />
              Pay
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Payee */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Payee</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <span>{expense?.payee_name}</span>
                </div>
                <div className="text-xs text-gray-400 capitalize">{expense?.payee_type?.replace('_', ' ')}</div>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Details</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Receipt className="w-3.5 h-3.5 text-gray-400" />
                  <span>{expenseTypeLabels[expense?.expense_type] || expense?.expense_type}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                  <span>{formatCurrency(expense?.amount || 0, expense?.currency)} ({expense?.currency})</span>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Dates</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <span>{expense?.date ? formatDate(expense.date) : '-'}</span>
                </div>
                {expense?.approved_at && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircle2 className="w-3.5 h-3.5 text-gray-400" />
                    <span>Approved {formatDate(expense.approved_at)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Accounting */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Accounting</p>
              <div className="space-y-1.5">
                {expense?.journal_number ? (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                    <span>{expense.journal_number}</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Not posted</p>
                )}
                {expense?.reference && (
                  <div className="text-sm text-gray-600 font-mono">{expense.reference}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Amount" value={formatCurrency(expense?.amount || 0, expense?.currency)} subtitle={expense?.currency} icon={DollarSign} color="blue" isLoading={isLoading} />
        <StatCard title="Type" value={expenseTypeLabels[expense?.expense_type] || expense?.expense_type || '-'} icon={Receipt} color="green" isLoading={isLoading} />
        <StatCard title="Status" value={config.label} icon={StatusIcon} color="purple" isLoading={isLoading} />
        <StatCard title="Journal Entry" value={expense?.journal_number || 'N/A'} icon={FileText} color="orange" isLoading={isLoading} />
      </motion.div>

      {/* Expense Details Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-xl border border-gray-200 p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Expense Details</h3>

        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 w-3/4 bg-gray-200 rounded" />
            <div className="h-4 w-1/2 bg-gray-200 rounded" />
          </div>
        ) : (
          <div className="space-y-4">
            {expense?.description && (
              <div>
                <p className="text-sm text-gray-500 mb-1">Description</p>
                <p className="text-sm text-gray-700">{expense.description}</p>
              </div>
            )}

            {expense?.reference && (
              <div>
                <p className="text-sm text-gray-500 mb-1">Reference</p>
                <p className="text-sm text-gray-700 font-mono">{expense.reference}</p>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-500">Expense Number</p>
                <p className="text-sm font-medium text-gray-900">{expense?.expense_number}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Payee Name</p>
                <p className="text-sm font-medium text-gray-900">{expense?.payee_name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Payee Type</p>
                <p className="text-sm font-medium text-gray-900 capitalize">{expense?.payee_type?.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Amount</p>
                <p className="text-sm font-medium text-gray-900">{formatCurrency(expense?.amount || 0, expense?.currency)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Date</p>
                <p className="text-sm font-medium text-gray-900">{expense?.date ? formatDate(expense.date) : '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Created</p>
                <p className="text-sm font-medium text-gray-900">{expense?.created_at ? formatDate(expense.created_at) : '-'}</p>
              </div>
              {expense?.approved_at && (
                <div>
                  <p className="text-xs text-gray-500">Approved At</p>
                  <p className="text-sm font-medium text-gray-900">{formatDate(expense.approved_at)}</p>
                </div>
              )}
              {expense?.journal_number && (
                <div>
                  <p className="text-xs text-gray-500">Journal Number</p>
                  <p className="text-sm font-medium text-emerald-600">{expense.journal_number}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>

      {/* Approve Confirmation */}
      <ConfirmDialog
        open={showApproveConfirm}
        onClose={() => setShowApproveConfirm(false)}
        onConfirm={() => approveMutation.mutate(expenseId)}
        title="Approve Expense"
        description={`Are you sure you want to approve expense ${expense?.expense_number} for ${formatCurrency(expense?.amount || 0)}?`}
        confirmText="Approve"
        variant="default"
        loading={approveMutation.isPending}
      />

      {/* Pay Confirmation */}
      <ConfirmDialog
        open={showPayConfirm}
        onClose={() => setShowPayConfirm(false)}
        onConfirm={() => payMutation.mutate(expenseId)}
        title="Pay Expense"
        description={`Are you sure you want to pay expense ${expense?.expense_number} for ${formatCurrency(expense?.amount || 0)}? This will create a journal entry and post to the ledger.`}
        confirmText="Pay & Post"
        variant="default"
        loading={payMutation.isPending}
      />
    </div>
  )
}
