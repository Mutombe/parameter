import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Receipt,
  Plus,
  Search,
  DollarSign,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  MoreVertical,
  Filter,
  Loader2,
  X,
  Building2,
  User,
  CreditCard,
  FileText,
  Check,
  Ban,
} from 'lucide-react'
import { expenseApi, landlordApi } from '../../services/api'
import { formatCurrency, formatDate, cn, useDebounce } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Textarea, Badge, EmptyState, Skeleton, ConfirmDialog } from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'

interface Expense {
  id: number | string
  expense_number: string
  expense_type: string
  status: 'pending' | 'approved' | 'paid' | 'cancelled'
  payee_name: string
  payee_type: string
  payee_id?: number
  date: string
  amount: number
  currency: string
  description: string
  reference?: string
  journal?: number
  journal_number?: string
  approved_by?: number
  approved_at?: string
  created_at: string
  _isOptimistic?: boolean
}

const statusConfig = {
  pending: {
    icon: Clock,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    label: 'Pending',
  },
  approved: {
    icon: CheckCircle2,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    label: 'Approved',
  },
  paid: {
    icon: Check,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
    label: 'Paid',
  },
  cancelled: {
    icon: XCircle,
    color: 'text-gray-400',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    label: 'Cancelled',
  },
}

const expenseTypes = [
  { value: 'landlord_payment', label: 'Landlord Payment' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'utility', label: 'Utility' },
  { value: 'commission', label: 'Commission' },
  { value: 'other', label: 'Other' },
]

const payeeTypes = [
  { value: 'landlord', label: 'Landlord' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'utility_company', label: 'Utility Company' },
  { value: 'other', label: 'Other' },
]

function SkeletonExpenses() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-6 border border-gray-100">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-8 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <div className="flex-1">
                <Skeleton className="h-5 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Expenses() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [showModal, setShowModal] = useState(false)
  const [showDetail, setShowDetail] = useState<Expense | null>(null)
  const [showApproveConfirm, setShowApproveConfirm] = useState<Expense | null>(null)
  const [showPayConfirm, setShowPayConfirm] = useState<Expense | null>(null)

  const debouncedSearch = useDebounce(searchQuery, 300)

  // Fetch expenses
  const { data: expenses = [], isLoading, error } = useQuery({
    queryKey: ['expenses', statusFilter, typeFilter, debouncedSearch],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (statusFilter) params.status = statusFilter
      if (typeFilter) params.expense_type = typeFilter
      if (debouncedSearch) params.search = debouncedSearch
      const response = await expenseApi.list(params)
      return response.data.results || response.data
    }
  })

  // Fetch landlords for payee selection
  const { data: landlords = [] } = useQuery({
    queryKey: ['landlords'],
    queryFn: async () => {
      const response = await landlordApi.list()
      return response.data.results || response.data
    }
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => expenseApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      setShowModal(false)
      showToast.success('Expense created successfully')
    },
    onError: (err) => showToast.error(parseApiError(err))
  })

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (id: number) => expenseApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      setShowApproveConfirm(null)
      showToast.success('Expense approved successfully')
    },
    onError: (err) => showToast.error(parseApiError(err))
  })

  // Pay mutation
  const payMutation = useMutation({
    mutationFn: (id: number) => expenseApi.pay(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      setShowPayConfirm(null)
      showToast.success('Expense paid and posted to ledger')
    },
    onError: (err) => showToast.error(parseApiError(err))
  })

  // Calculate summary stats
  const stats = {
    total: expenses.length,
    pending: expenses.filter((e: Expense) => e.status === 'pending').length,
    approved: expenses.filter((e: Expense) => e.status === 'approved').length,
    totalAmount: expenses
      .filter((e: Expense) => e.status !== 'cancelled')
      .reduce((sum: number, e: Expense) => sum + Number(e.amount), 0),
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)

    const data = {
      expense_type: formData.get('expense_type'),
      payee_name: formData.get('payee_name'),
      payee_type: formData.get('payee_type'),
      payee_id: formData.get('payee_id') || null,
      date: formData.get('date'),
      amount: formData.get('amount'),
      currency: formData.get('currency') || 'USD',
      description: formData.get('description'),
      reference: formData.get('reference'),
    }

    createMutation.mutate(data)
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Expenses"
          subtitle="Manage expenses and payouts"
          icon={<Receipt className="h-6 w-6" />}
        />
        <SkeletonExpenses />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Expenses"
          subtitle="Manage expenses and payouts"
          icon={<Receipt className="h-6 w-6" />}
        />
        <EmptyState
          icon={<XCircle className="h-12 w-12 text-rose-400" />}
          title="Failed to load expenses"
          description="There was an error loading your expenses."
          action={
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['expenses'] })}>
              Try Again
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Expenses"
        subtitle={`${stats.total} total expenses`}
        icon={<Receipt className="h-6 w-6" />}
        action={
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Expense
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Receipt className="h-5 w-5 text-gray-600" />
            </div>
            <span className="text-sm text-gray-500">Total</span>
          </div>
          <p className="text-2xl font-bold">{stats.total}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl p-6 border border-amber-100 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-50 rounded-lg">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <span className="text-sm text-gray-500">Pending</span>
          </div>
          <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl p-6 border border-blue-100 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Approved</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">{stats.approved}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl p-6 border border-emerald-100 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <span className="text-sm text-gray-500">Total Value</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(stats.totalAmount)}</p>
        </motion.div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search expenses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Types</option>
          {expenseTypes.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
      </div>

      {/* Expenses List */}
      {expenses.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-12 w-12 text-gray-400" />}
          title="No expenses found"
          description="Create your first expense to start tracking payouts."
          action={
            <Button onClick={() => setShowModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Expense
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {expenses.map((expense: Expense, index: number) => {
              const config = statusConfig[expense.status]
              const StatusIcon = config.icon

              return (
                <motion.div
                  key={expense.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.05 }}
                  className={cn(
                    "bg-white rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer",
                    config.borderColor,
                    expense._isOptimistic && "opacity-60"
                  )}
                  onClick={() => setShowDetail(expense)}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn("p-3 rounded-xl", config.bgColor)}>
                      <StatusIcon className={cn("h-6 w-6", config.color)} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{expense.expense_number}</h3>
                        <Badge variant={expense.status === 'paid' ? 'success' : expense.status === 'pending' ? 'warning' : 'default'}>
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 truncate">{expense.payee_name}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(expense.date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {expenseTypes.find(t => t.value === expense.expense_type)?.label || expense.expense_type}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-lg">{formatCurrency(expense.amount, expense.currency)}</p>
                      {expense.journal_number && (
                        <p className="text-xs text-gray-500">JRN: {expense.journal_number}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {expense.status === 'pending' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowApproveConfirm(expense)
                          }}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      {expense.status === 'approved' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowPayConfirm(expense)
                          }}
                        >
                          <CreditCard className="h-4 w-4 mr-1" />
                          Pay
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Create Expense Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Create New Expense"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Expense Type"
            name="expense_type"
            required
            options={expenseTypes}
          />

          <Select
            label="Payee Type"
            name="payee_type"
            required
            options={payeeTypes}
          />

          <Input
            label="Payee Name"
            name="payee_name"
            placeholder="Enter payee name"
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Date"
              name="date"
              type="date"
              required
              defaultValue={new Date().toISOString().split('T')[0]}
            />
            <Input
              label="Amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Currency"
              name="currency"
              options={[
                { value: 'USD', label: 'USD' },
                { value: 'ZWG', label: 'ZiG' },
              ]}
              defaultValue="USD"
            />
            <Input
              label="Reference"
              name="reference"
              placeholder="Payment reference"
            />
          </div>

          <Textarea
            label="Description"
            name="description"
            placeholder="Describe the expense..."
            required
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Expense
            </Button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={!!showDetail}
        onClose={() => setShowDetail(null)}
        title="Expense Details"
      >
        {showDetail && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className={cn("p-3 rounded-xl", statusConfig[showDetail.status].bgColor)}>
                {(() => {
                  const Icon = statusConfig[showDetail.status].icon
                  return <Icon className={cn("h-8 w-8", statusConfig[showDetail.status].color)} />
                })()}
              </div>
              <div>
                <h3 className="text-xl font-bold">{showDetail.expense_number}</h3>
                <Badge variant={showDetail.status === 'paid' ? 'success' : showDetail.status === 'pending' ? 'warning' : 'default'}>
                  {statusConfig[showDetail.status].label}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Payee</p>
                <p className="font-semibold">{showDetail.payee_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Type</p>
                <p className="font-semibold">{expenseTypes.find(t => t.value === showDetail.expense_type)?.label}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Date</p>
                <p className="font-semibold">{formatDate(showDetail.date)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Amount</p>
                <p className="font-semibold text-lg">{formatCurrency(showDetail.amount, showDetail.currency)}</p>
              </div>
            </div>

            {showDetail.description && (
              <div>
                <p className="text-sm text-gray-500">Description</p>
                <p className="text-gray-700">{showDetail.description}</p>
              </div>
            )}

            {showDetail.reference && (
              <div>
                <p className="text-sm text-gray-500">Reference</p>
                <p className="font-mono text-sm">{showDetail.reference}</p>
              </div>
            )}

            {showDetail.journal_number && (
              <div className="p-3 bg-emerald-50 rounded-lg">
                <p className="text-sm text-emerald-600">Posted to General Ledger</p>
                <p className="font-mono font-semibold text-emerald-700">{showDetail.journal_number}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowDetail(null)}>
                Close
              </Button>
              {showDetail.status === 'pending' && (
                <Button onClick={() => {
                  setShowDetail(null)
                  setShowApproveConfirm(showDetail)
                }}>
                  <Check className="h-4 w-4 mr-2" />
                  Approve
                </Button>
              )}
              {showDetail.status === 'approved' && (
                <Button onClick={() => {
                  setShowDetail(null)
                  setShowPayConfirm(showDetail)
                }}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pay
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Approve Confirmation */}
      <ConfirmDialog
        isOpen={!!showApproveConfirm}
        onClose={() => setShowApproveConfirm(null)}
        onConfirm={() => showApproveConfirm && approveMutation.mutate(Number(showApproveConfirm.id))}
        title="Approve Expense"
        message={`Are you sure you want to approve expense ${showApproveConfirm?.expense_number} for ${formatCurrency(showApproveConfirm?.amount || 0)}?`}
        confirmText="Approve"
        isLoading={approveMutation.isPending}
      />

      {/* Pay Confirmation */}
      <ConfirmDialog
        isOpen={!!showPayConfirm}
        onClose={() => setShowPayConfirm(null)}
        onConfirm={() => showPayConfirm && payMutation.mutate(Number(showPayConfirm.id))}
        title="Pay Expense"
        message={`Are you sure you want to pay expense ${showPayConfirm?.expense_number} for ${formatCurrency(showPayConfirm?.amount || 0)}? This will create a journal entry and post to the ledger.`}
        confirmText="Pay & Post"
        isLoading={payMutation.isPending}
      />
    </div>
  )
}
