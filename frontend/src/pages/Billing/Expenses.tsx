import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Download,
  Trash2,
} from 'lucide-react'
import { expenseApi, landlordApi } from '../../services/api'
import { formatCurrency, formatDate, cn, useDebounce } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Textarea, Badge, EmptyState, Skeleton, ConfirmDialog, Tooltip } from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'
import { SelectionCheckbox, BulkActionsBar } from '../../components/ui'
import { exportTableData } from '../../lib/export'
import { useSelection } from '../../hooks/useSelection'
import { useHotkeys } from '../../hooks/useHotkeys'
import { usePrefetch } from '../../hooks/usePrefetch'

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
  const navigate = useNavigate()
  const prefetch = usePrefetch()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [showModal, setShowModal] = useState(false)
  const [showDetail, setShowDetail] = useState<Expense | null>(null)
  const [showApproveConfirm, setShowApproveConfirm] = useState<Expense | null>(null)
  const [showPayConfirm, setShowPayConfirm] = useState<Expense | null>(null)

  const debouncedSearch = useDebounce(searchQuery, 300)

  const selection = useSelection<number | string>({ clearOnChange: [debouncedSearch, statusFilter, typeFilter] })

  const searchInputRef = useRef<HTMLInputElement>(null)
  useHotkeys([
    { key: 'c', handler: () => setShowModal(true) },
    { key: '/', handler: (e) => { e.preventDefault(); searchInputRef.current?.focus() } },
  ])

  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} })

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

  // Create mutation - optimistic
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => expenseApi.create(data),
    onMutate: async (newData) => {
      setShowModal(false)
      await queryClient.cancelQueries({ queryKey: ['expenses'] })
      const previousData = queryClient.getQueryData(['expenses', statusFilter, typeFilter, debouncedSearch])

      const optimistic: Expense = {
        id: `temp-${Date.now()}`,
        expense_number: 'Creating...',
        expense_type: String(newData.expense_type || ''),
        status: 'pending',
        payee_name: String(newData.payee_name || ''),
        payee_type: String(newData.payee_type || ''),
        date: String(newData.date || ''),
        amount: Number(newData.amount || 0),
        currency: String(newData.currency || 'USD'),
        description: String(newData.description || ''),
        reference: String(newData.reference || ''),
        created_at: new Date().toISOString(),
        _isOptimistic: true,
      }
      queryClient.setQueryData(['expenses', statusFilter, typeFilter, debouncedSearch], (old: any) => {
        const items = old || []
        return [optimistic, ...items]
      })
      return { previousData }
    },
    onSuccess: () => {
      showToast.success('Expense created successfully')
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['expenses', statusFilter, typeFilter, debouncedSearch], context.previousData)
      }
      showToast.error(parseApiError(err))
    }
  })

  // Approve mutation - optimistic
  const approveMutation = useMutation({
    mutationFn: (id: number) => expenseApi.approve(id),
    onMutate: async (id) => {
      setShowApproveConfirm(null)
      await queryClient.cancelQueries({ queryKey: ['expenses'] })
      const previousData = queryClient.getQueryData(['expenses', statusFilter, typeFilter, debouncedSearch])
      queryClient.setQueryData(['expenses', statusFilter, typeFilter, debouncedSearch], (old: any) => {
        const items = old || []
        return items.map((item: any) =>
          item.id === id ? { ...item, status: 'approved', _isOptimistic: true } : item
        )
      })
      return { previousData }
    },
    onSuccess: () => {
      showToast.success('Expense approved successfully')
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['expenses', statusFilter, typeFilter, debouncedSearch], context.previousData)
      }
      showToast.error(parseApiError(err))
    }
  })

  // Pay mutation - optimistic
  const payMutation = useMutation({
    mutationFn: (id: number) => expenseApi.pay(id),
    onMutate: async (id) => {
      setShowPayConfirm(null)
      await queryClient.cancelQueries({ queryKey: ['expenses'] })
      const previousData = queryClient.getQueryData(['expenses', statusFilter, typeFilter, debouncedSearch])
      queryClient.setQueryData(['expenses', statusFilter, typeFilter, debouncedSearch], (old: any) => {
        const items = old || []
        return items.map((item: any) =>
          item.id === id ? { ...item, status: 'paid', _isOptimistic: true } : item
        )
      })
      return { previousData }
    },
    onSuccess: () => {
      showToast.success('Expense paid and posted to ledger')
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['expenses', statusFilter, typeFilter, debouncedSearch], context.previousData)
      }
      showToast.error(parseApiError(err))
    }
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

  const selectableItems = (expenses || []).filter((e: any) => !e._isOptimistic)
  const pageIds = selectableItems.map((e: any) => e.id)

  const handleBulkExport = () => {
    const selected = selectableItems.filter((e: any) => selection.isSelected(e.id))
    exportTableData(selected, [
      { key: 'description', header: 'Description' },
      { key: 'amount', header: 'Amount' },
      { key: 'category_name', header: 'Category' },
      { key: 'date', header: 'Date' },
      { key: 'status', header: 'Status' },
      { key: 'vendor', header: 'Vendor' },
    ], 'expenses_export')
    showToast.success(`Exported ${selected.length} expenses`)
  }

  const handleBulkApprove = async () => {
    const ids = Array.from(selection.selectedIds)
    let approved = 0
    for (const id of ids) {
      try { await expenseApi.approve(id as number); approved++ } catch {}
    }
    selection.clearSelection()
    queryClient.invalidateQueries({ queryKey: ['expenses'] })
    showToast.success(`Approved ${approved} expenses`)
  }

  const handleBulkDelete = () => {
    setConfirmDialog({
      open: true,
      title: `Delete ${selection.selectedCount} expenses?`,
      message: 'This action cannot be undone.',
      onConfirm: async () => {
        const ids = Array.from(selection.selectedIds)
        for (const id of ids) { try { await expenseApi.delete(id as number) } catch {} }
        selection.clearSelection()
        queryClient.invalidateQueries({ queryKey: ['expenses'] })
        showToast.success(`Deleted ${ids.length} expenses`)
        setConfirmDialog(d => ({ ...d, open: false }))
      },
    })
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Expenses"
          subtitle="Manage expenses and payouts"
          icon={Receipt}
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
          icon={Receipt}
        />
        <EmptyState
          icon={XCircle}
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
        icon={Receipt}
        actions={
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
            ref={searchInputRef}
            type="text"
            placeholder="Search expenses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          placeholder="All Status"
          options={[
            { value: '', label: 'All Status' },
            { value: 'pending', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'paid', label: 'Paid' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          placeholder="All Types"
          options={[
            { value: '', label: 'All Types' },
            ...expenseTypes,
          ]}
        />
        <div className="flex items-center gap-3 ml-auto">
          {selectableItems.length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-500">
              <SelectionCheckbox
                checked={selection.isAllPageSelected(pageIds)}
                indeterminate={selection.isPartialPageSelected(pageIds)}
                onChange={() => selection.selectPage(pageIds)}
              />
              Select all
            </label>
          )}
        </div>
      </div>

      {/* Expenses List */}
      {expenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
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
                    "bg-white rounded-xl border p-4 pl-12 hover:shadow-md transition-all cursor-pointer relative",
                    config.borderColor,
                    expense._isOptimistic && "opacity-60",
                    selection.isSelected(expense.id) && "ring-2 ring-blue-500 border-blue-300"
                  )}
                  onMouseEnter={() => prefetch(`/dashboard/expenses/${expense.id}`)}
                  onClick={() => navigate(`/dashboard/expenses/${expense.id}`)}
                >
                  {!expense._isOptimistic && (
                    <div className="absolute top-4 left-3" onClick={(e) => e.stopPropagation()}>
                      <SelectionCheckbox
                        checked={selection.isSelected(expense.id)}
                        onChange={() => selection.toggle(expense.id)}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-4">
                    <div className={cn("p-3 rounded-xl", config.bgColor)}>
                      <StatusIcon className={cn("h-6 w-6", config.color)} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{expense.expense_number}</h3>
                        <Tooltip content={{ pending: 'Awaiting approval', approved: 'Approved, ready for payment', paid: 'Payment completed', cancelled: 'Expense cancelled' }[expense.status]}>
                          <span>
                            <Badge variant={expense.status === 'paid' ? 'success' : expense.status === 'pending' ? 'warning' : 'default'}>
                              {config.label}
                            </Badge>
                          </span>
                        </Tooltip>
                      </div>
                      {expense.payee_id && expense.payee_type === 'landlord' ? (
                        <button
                          onMouseEnter={() => prefetch(`/dashboard/landlords/${expense.payee_id}`)}
                          onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/landlords/${expense.payee_id}`) }}
                          className="text-sm text-primary-600 hover:text-primary-700 hover:underline truncate"
                        >
                          {expense.payee_name}
                        </button>
                      ) : (
                        <p className="text-sm text-gray-600 truncate">{expense.payee_name}</p>
                      )}
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
                      <Tooltip content={expenseTypes.find(t => t.value === expense.expense_type)?.label || expense.expense_type}>
                        <span className="font-bold text-lg">{formatCurrency(expense.amount, expense.currency)}</span>
                      </Tooltip>
                      {expense.journal_number && (
                        <Tooltip content="Posted to general ledger">
                          <p className="text-xs text-gray-500">JRN: {expense.journal_number}</p>
                        </Tooltip>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {expense.status === 'pending' && (
                        <Button
                          variant="outline"
                          size="sm"
                          title="Approve"
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
                          title="Mark as paid"
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

      <BulkActionsBar
        selectedCount={selection.selectedCount}
        onClearSelection={selection.clearSelection}
        entityName="expenses"
        actions={[
          { label: 'Export', icon: Download, onClick: handleBulkExport, variant: 'outline' },
          { label: 'Approve', icon: Check, onClick: handleBulkApprove, variant: 'primary' },
          { label: 'Delete', icon: Trash2, onClick: handleBulkDelete, variant: 'danger' },
        ]}
      />

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
