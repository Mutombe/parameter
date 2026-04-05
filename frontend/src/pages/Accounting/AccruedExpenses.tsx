import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileSpreadsheet,
  Search,
  Plus,
  Clock,
  CheckCircle2,
  Check,
  Calendar,
  DollarSign,
  Eye,
  Send,
  Loader2,
  Trash2,
  Download,
  XCircle,
} from 'lucide-react'
import { accruedExpenseApi, accountApi, landlordApi } from '../../services/api'
import { formatCurrency, formatDate, cn, useDebounce } from '../../lib/utils'
import {
  PageHeader, Modal, Button, Input, Select, Badge, EmptyState,
  Skeleton, Textarea, SelectionCheckbox, BulkActionsBar, Pagination,
  ConfirmDialog,
} from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'
import { exportTableData } from '../../lib/export'
import { useSelection } from '../../hooks/useSelection'
import toast from 'react-hot-toast'

const PAGE_SIZE = 25

interface AccruedExpense {
  id: number
  expense_number: string
  date: string
  expense_account: number
  expense_account_name: string
  expense_account_code: string
  expense_class: 'clearable' | 'non_clearable'
  payable_account: number
  payable_account_name: string
  payable_account_code: string
  funding_category: string
  accrual_sub_account: number | null
  accrual_sub_account_code: string | null
  landlord_sub_account: number | null
  landlord_sub_account_code: string | null
  landlord: number
  landlord_name: string
  description: string
  custom_description: string
  amount: number
  currency: string
  status: 'draft' | 'posted' | 'cleared'
  journal: number | null
  journal_number: string | null
  cleared_by_expense: number | null
  cleared_date: string | null
  created_by: number | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

const statusConfig = {
  draft: {
    icon: Clock,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    label: 'Draft',
  },
  posted: {
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    label: 'Posted',
  },
  cleared: {
    icon: Check,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    label: 'Cleared',
  },
}

const classOptions = [
  { value: 'clearable', label: 'Clearable' },
  { value: 'non_clearable', label: 'Non-Clearable' },
]

const categoryOptions = [
  { value: 'rent', label: 'Rent' },
  { value: 'levy', label: 'Levy' },
  { value: 'special_levy', label: 'Special Levy' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'other', label: 'Other' },
]

function SkeletonAccruedExpenses() {
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
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-4 border-b border-gray-100 flex items-center gap-4">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-32 flex-1" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AccruedExpenses() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, 300)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [classFilter, setClassFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetail, setShowDetail] = useState<AccruedExpense | null>(null)
  const [showClearModal, setShowClearModal] = useState<AccruedExpense | null>(null)
  const [clearExpenseId, setClearExpenseId] = useState('')

  const selection = useSelection<number>({ clearOnChange: [debouncedSearch, statusFilter, classFilter] })

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    expense_account: '',
    expense_class: '',
    payable_account: '',
    funding_category: '',
    landlord: '',
    landlord_sub_account: '',
    accrual_sub_account: '',
    description: '',
    custom_description: '',
    amount: '',
    currency: 'USD',
  })

  // Fetch accrued expenses
  const { data: expensesData, isLoading, error } = useQuery({
    queryKey: ['accrued-expenses', statusFilter, classFilter, debouncedSearch, currentPage],
    queryFn: async () => {
      const params: Record<string, string | number> = { page: currentPage, page_size: PAGE_SIZE }
      if (statusFilter) params.status = statusFilter
      if (classFilter) params.expense_class = classFilter
      if (debouncedSearch) params.search = debouncedSearch
      const response = await accruedExpenseApi.list(params)
      return response.data
    },
    placeholderData: keepPreviousData,
  })

  const expenses: AccruedExpense[] = expensesData?.results || expensesData || []
  const totalCount = expensesData?.count || expenses.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, statusFilter, classFilter])

  // Fetch accounts for form
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts-list'],
    queryFn: () => accountApi.list().then((r: any) => r.data.results || r.data),
    staleTime: 60000,
    placeholderData: keepPreviousData,
  })

  // Fetch landlords for form
  const { data: landlords = [] } = useQuery({
    queryKey: ['landlords'],
    queryFn: () => landlordApi.list().then((r: any) => r.data.results || r.data),
    staleTime: 60000,
    placeholderData: keepPreviousData,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => accruedExpenseApi.create(data),
    onSuccess: () => {
      showToast.success('Accrued expense created')
      queryClient.invalidateQueries({ queryKey: ['accrued-expenses'] })
      setShowCreateModal(false)
      resetForm()
    },
    onError: (err) => showToast.error(parseApiError(err)),
  })

  // Post to ledger mutation
  const postMutation = useMutation({
    mutationFn: (id: number) => accruedExpenseApi.postToLedger(id),
    onSuccess: () => {
      toast.success('Accrued expense posted to ledger')
      queryClient.invalidateQueries({ queryKey: ['accrued-expenses'] })
    },
    onError: () => toast.error('Failed to post to ledger'),
  })

  // Clear mutation
  const clearMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => accruedExpenseApi.clear(id, data),
    onSuccess: () => {
      toast.success('Accrued expense cleared')
      queryClient.invalidateQueries({ queryKey: ['accrued-expenses'] })
      setShowClearModal(null)
      setClearExpenseId('')
    },
    onError: () => toast.error('Failed to clear expense'),
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => accruedExpenseApi.delete(id),
    onSuccess: () => {
      showToast.success('Accrued expense deleted')
      queryClient.invalidateQueries({ queryKey: ['accrued-expenses'] })
    },
    onError: (err) => showToast.error(parseApiError(err)),
  })

  const resetForm = () => {
    setForm({
      date: new Date().toISOString().split('T')[0],
      expense_account: '',
      expense_class: '',
      payable_account: '',
      funding_category: '',
      landlord: '',
      landlord_sub_account: '',
      accrual_sub_account: '',
      description: '',
      custom_description: '',
      amount: '',
      currency: 'USD',
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data: Record<string, unknown> = {
      date: form.date,
      expense_account: parseInt(form.expense_account),
      expense_class: form.expense_class,
      payable_account: parseInt(form.payable_account),
      funding_category: form.funding_category,
      landlord: parseInt(form.landlord),
      description: form.description,
      custom_description: form.custom_description,
      amount: form.amount,
      currency: form.currency,
    }
    if (form.landlord_sub_account) data.landlord_sub_account = parseInt(form.landlord_sub_account)
    if (form.accrual_sub_account) data.accrual_sub_account = parseInt(form.accrual_sub_account)
    createMutation.mutate(data)
  }

  const stats = {
    total: totalCount,
    draft: expenses.filter(e => e.status === 'draft').length,
    posted: expenses.filter(e => e.status === 'posted').length,
    cleared: expenses.filter(e => e.status === 'cleared').length,
  }

  const selectableItems = expenses.filter((e: any) => !e._isOptimistic)
  const pageIds = selectableItems.map(e => e.id)

  const handleBulkExport = () => {
    const selected = selectableItems.filter(e => selection.isSelected(e.id))
    exportTableData(selected, [
      { key: 'expense_number', header: 'Number' },
      { key: 'date', header: 'Date' },
      { key: 'expense_account_name', header: 'Expense Account' },
      { key: 'expense_class', header: 'Class' },
      { key: 'landlord_name', header: 'Landlord' },
      { key: 'amount', header: 'Amount' },
      { key: 'status', header: 'Status' },
    ], 'accrued_expenses_export')
    showToast.success(`Exported ${selected.length} accrued expenses`)
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Accrued Expenses"
          subtitle="Non-cash expense postings"
          icon={FileSpreadsheet}
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Accrued Expenses' },
          ]}
        />
        <SkeletonAccruedExpenses />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Accrued Expenses"
          subtitle="Non-cash expense postings"
          icon={FileSpreadsheet}
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Accrued Expenses' },
          ]}
        />
        <EmptyState
          icon={XCircle}
          title="Failed to load accrued expenses"
          description="There was an error loading your accrued expenses."
          action={
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['accrued-expenses'] })}>
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
        title="Accrued Expenses"
        subtitle={`${totalCount} total accrued expenses`}
        icon={FileSpreadsheet}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Accrued Expenses' },
        ]}
        actions={
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Accrued Expense
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
              <FileSpreadsheet className="h-5 w-5 text-gray-600" />
            </div>
            <span className="text-sm text-gray-500">Total</span>
          </div>
          <p className="text-2xl font-bold">{stats.total}</p>
        </motion.div>

        {Object.entries(statusConfig).map(([status, config]) => {
          const StatusIcon = config.icon
          const count = stats[status as keyof typeof stats] || 0
          return (
            <motion.div
              key={status}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
              className={cn(
                'bg-white rounded-xl p-6 border cursor-pointer transition-all shadow-sm',
                statusFilter === status ? config.borderColor : 'border-gray-100 hover:border-gray-300'
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={cn('p-2 rounded-lg', config.bgColor)}>
                  <StatusIcon className={cn('h-5 w-5', config.color)} />
                </div>
                <span className="text-sm text-gray-500">{config.label}</span>
              </div>
              <p className={cn('text-2xl font-bold', config.color)}>{count}</p>
            </motion.div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search accrued expenses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          placeholder="All Statuses"
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'draft', label: 'Draft' },
            { value: 'posted', label: 'Posted' },
            { value: 'cleared', label: 'Cleared' },
          ]}
        />
        <Select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          placeholder="All Classes"
          options={[
            { value: '', label: 'All Classes' },
            { value: 'clearable', label: 'Clearable' },
            { value: 'non_clearable', label: 'Non-Clearable' },
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

      {/* Bulk Actions */}
      <AnimatePresence>
        {selection.selectedCount > 0 && (
          <BulkActionsBar
            selectedCount={selection.selectedCount}
            onClearSelection={() => selection.clearSelection()}
            actions={[
              { label: 'Export', icon: Download, onClick: handleBulkExport },
            ]}
          />
        )}
      </AnimatePresence>

      {/* Table */}
      {expenses.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No accrued expenses found"
          description="Create your first accrued expense to record non-cash expense postings."
          action={
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Accrued Expense
            </Button>
          }
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-left w-10">
                    <SelectionCheckbox
                      checked={selection.isAllPageSelected(pageIds)}
                      indeterminate={selection.isPartialPageSelected(pageIds)}
                      onChange={() => selection.selectPage(pageIds)}
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Number</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Expense Account</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Class</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Landlord</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Amount</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {expenses.map((expense, index) => {
                    const config = statusConfig[expense.status]
                    const StatusIcon = config.icon
                    return (
                      <motion.tr
                        key={expense.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ delay: index * 0.02 }}
                        onClick={() => setShowDetail(expense)}
                        className={cn(
                          'border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50/50',
                          selection.isSelected(expense.id) && 'bg-primary-50/30'
                        )}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <SelectionCheckbox
                            checked={selection.isSelected(expense.id)}
                            onChange={() => selection.toggle(expense.id)}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{expense.expense_number}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(expense.date)}</td>
                        <td className="px-4 py-3 text-gray-600">
                          <span className="text-xs text-gray-400 mr-1">{expense.expense_account_code}</span>
                          {expense.expense_account_name}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={expense.expense_class === 'clearable' ? 'info' : 'default'}
                          >
                            {expense.expense_class === 'clearable' ? 'Clearable' : 'Non-Clearable'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{expense.landlord_name}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatCurrency(expense.amount, expense.currency)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                            config.bgColor, config.color
                          )}>
                            <StatusIcon className="w-3 h-3" />
                            {config.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {expense.status === 'draft' && (
                              <>
                                <button
                                  onClick={() => postMutation.mutate(expense.id)}
                                  disabled={postMutation.isPending}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                  title="Post to ledger"
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => deleteMutation.mutate(expense.id)}
                                  disabled={deleteMutation.isPending}
                                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {expense.status === 'posted' && expense.expense_class === 'clearable' && (
                              <button
                                onClick={() => setShowClearModal(expense)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Clear expense"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => setShowDetail(expense)}
                              className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                              title="View details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    )
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="p-4 border-t border-gray-100">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalCount}
                pageSize={PAGE_SIZE}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); resetForm() }}
        title="New Accrued Expense"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Date"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
            <Select
              label="Currency"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              options={[
                { value: 'USD', label: 'USD' },
                { value: 'ZWG', label: 'ZWG' },
                { value: 'ZAR', label: 'ZAR' },
              ]}
            />
          </div>

          <Select
            label="Expense Account"
            value={form.expense_account}
            onChange={(e) => setForm({ ...form, expense_account: e.target.value })}
            placeholder="Select expense account..."
            options={accounts
              .filter((a: any) => a.account_type === 'expense')
              .map((a: any) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            required
          />

          <Select
            label="Expense Class"
            value={form.expense_class}
            onChange={(e) => setForm({ ...form, expense_class: e.target.value })}
            placeholder="Select class..."
            options={classOptions.map(o => ({ value: o.value, label: o.label }))}
            required
          />

          <Select
            label="Payable Account"
            value={form.payable_account}
            onChange={(e) => setForm({ ...form, payable_account: e.target.value })}
            placeholder="Select payable account..."
            options={accounts
              .filter((a: any) => a.account_type === 'liability')
              .map((a: any) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            required
          />

          <Select
            label="Funding Category"
            value={form.funding_category}
            onChange={(e) => setForm({ ...form, funding_category: e.target.value })}
            placeholder="Select category..."
            options={categoryOptions.map(o => ({ value: o.value, label: o.label }))}
            required
          />

          <Select
            label="Landlord"
            value={form.landlord}
            onChange={(e) => setForm({ ...form, landlord: e.target.value })}
            placeholder="Select landlord..."
            options={landlords.map((l: any) => ({ value: String(l.id), label: l.name }))}
            required
          />

          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Enter description..."
            required
          />

          <Input
            label="Amount"
            type="number"
            step="0.01"
            min="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="0.00"
            required
          />

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setShowCreateModal(false); resetForm() }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Accrued Expense
            </Button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={!!showDetail}
        onClose={() => setShowDetail(null)}
        title={showDetail ? `Accrued Expense ${showDetail.expense_number}` : ''}
        size="lg"
      >
        {showDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Date</p>
                <p className="font-medium">{formatDate(showDetail.date)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <span className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                  statusConfig[showDetail.status].bgColor,
                  statusConfig[showDetail.status].color,
                )}>
                  {statusConfig[showDetail.status].label}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Expense Account</p>
                <p className="font-medium">{showDetail.expense_account_code} - {showDetail.expense_account_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Class</p>
                <Badge variant={showDetail.expense_class === 'clearable' ? 'info' : 'default'}>
                  {showDetail.expense_class === 'clearable' ? 'Clearable' : 'Non-Clearable'}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-gray-500">Payable Account</p>
                <p className="font-medium">{showDetail.payable_account_code} - {showDetail.payable_account_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Funding Category</p>
                <p className="font-medium capitalize">{showDetail.funding_category}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Landlord</p>
                <p className="font-medium">{showDetail.landlord_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Amount</p>
                <p className="font-medium text-lg">{formatCurrency(showDetail.amount, showDetail.currency)}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Description</p>
              <p className="font-medium">{showDetail.description}</p>
              {showDetail.custom_description && (
                <p className="text-sm text-gray-600 mt-1">{showDetail.custom_description}</p>
              )}
            </div>
            {showDetail.journal_number && (
              <div>
                <p className="text-sm text-gray-500">Journal</p>
                <p className="font-medium">{showDetail.journal_number}</p>
              </div>
            )}
            {showDetail.cleared_date && (
              <div>
                <p className="text-sm text-gray-500">Cleared Date</p>
                <p className="font-medium">{formatDate(showDetail.cleared_date)}</p>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-4 border-t">
              {showDetail.status === 'draft' && (
                <Button
                  onClick={() => { postMutation.mutate(showDetail.id); setShowDetail(null) }}
                  disabled={postMutation.isPending}
                  className="gap-2"
                >
                  <Send className="w-4 h-4" />
                  Post to Ledger
                </Button>
              )}
              {showDetail.status === 'posted' && showDetail.expense_class === 'clearable' && (
                <Button
                  onClick={() => { setShowClearModal(showDetail); setShowDetail(null) }}
                  variant="secondary"
                  className="gap-2"
                >
                  <Check className="w-4 h-4" />
                  Clear
                </Button>
              )}
              <Button variant="ghost" onClick={() => setShowDetail(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Clear Modal */}
      <Modal
        isOpen={!!showClearModal}
        onClose={() => { setShowClearModal(null); setClearExpenseId('') }}
        title="Clear Accrued Expense"
      >
        {showClearModal && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Link this accrued expense ({showClearModal.expense_number}) to a cash expense payment
              to mark it as cleared.
            </p>
            <Input
              label="Cash Expense ID"
              type="number"
              value={clearExpenseId}
              onChange={(e) => setClearExpenseId(e.target.value)}
              placeholder="Enter expense ID..."
              required
            />
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="ghost" onClick={() => { setShowClearModal(null); setClearExpenseId('') }}>
                Cancel
              </Button>
              <Button
                onClick={() => clearMutation.mutate({
                  id: showClearModal.id,
                  data: { expense_id: parseInt(clearExpenseId) },
                })}
                disabled={!clearExpenseId || clearMutation.isPending}
                className="gap-2"
              >
                {clearMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Clear Expense
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
