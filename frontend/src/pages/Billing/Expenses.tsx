import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
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
import { expenseApi, landlordApi, incomeTypeApi, expenseCategoryApi, bankAccountApi } from '../../services/api'
import { AsyncSelect } from '../../components/ui/AsyncSelect'
import { formatCurrency, formatDate, cn, useDebounce } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Textarea, Badge, EmptyState, Skeleton, ConfirmDialog, Tooltip, Pagination } from '../../components/ui'
import { AutocompleteInput } from '../../components/ui/AutocompleteInput'
import { showToast, parseApiError } from '../../lib/toast'
import { undoToast } from '../../lib/undoToast'
import { SelectionCheckbox, BulkActionsBar } from '../../components/ui'
import { exportTableData } from '../../lib/export'
import { useSelection } from '../../hooks/useSelection'
import { useBulkLoading } from '../../hooks/useBulkLoading'
import { useHotkeys } from '../../hooks/useHotkeys'
import { usePrefetch } from '../../hooks/usePrefetch'
import { useRecentValues } from '../../hooks/useRecentValues'

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
  expense_category?: number
  expense_category_name?: string
  income_type?: number
  income_type_name?: string
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

const PAGE_SIZE = 25

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
  const [currentPage, setCurrentPage] = useState(1)

  const selection = useSelection<number | string>({ clearOnChange: [debouncedSearch, statusFilter, typeFilter] })
  const bulkLoading = useBulkLoading()

  const searchInputRef = useRef<HTMLInputElement>(null)
  useHotkeys([
    { key: 'c', handler: () => setShowModal(true) },
    { key: '/', handler: (e) => { e.preventDefault(); searchInputRef.current?.focus() } },
  ])

  const recentExpenseType = useRecentValues('expense_type', 1)
  const recentPayeeType = useRecentValues('expense_payee_type', 1)

  const [expenseForm, setExpenseForm] = useState({
    // Step 1: date
    date: new Date().toISOString().split('T')[0],
    // Step 2: bank account (drives currency)
    bank_account: '',
    currency: 'USD',
    // Step 3: expense category (drives GL account + funding category)
    expense_category: '',
    // Step 5: landlord (drives sub-account via category's funding_category)
    landlord: '',
    // Step 6: description (auto-prefilled from category, editable)
    description: '',
    // Step 7: amount
    amount: '',
    // Misc / legacy
    reference: '',
    payee_name: '',
    payee_type: recentPayeeType.values[0] || 'landlord',
    expense_type: recentExpenseType.values[0] || 'other',
    income_type: '',
  })

  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} })

  // Fetch income types for expense form
  const { data: incomeTypesData } = useQuery({
    queryKey: ['income-types-for-expenses'],
    queryFn: () => incomeTypeApi.list({ is_active: true }).then((r: any) => r.data.results || r.data),
    staleTime: 60000,
    placeholderData: keepPreviousData,
  })

  // Fetch expenses
  const { data: expensesData, isLoading, error } = useQuery({
    queryKey: ['expenses', statusFilter, typeFilter, debouncedSearch, currentPage],
    queryFn: async () => {
      const params: Record<string, string | number> = { page: currentPage, page_size: PAGE_SIZE }
      if (statusFilter) params.status = statusFilter
      if (typeFilter) params.expense_type = typeFilter
      if (debouncedSearch) params.search = debouncedSearch
      const response = await expenseApi.list(params)
      return response.data
    },
    placeholderData: keepPreviousData,
  })

  const expenses = expensesData?.results || expensesData || []
  const totalCount = expensesData?.count || expenses.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, statusFilter, typeFilter])

  // Fetch landlords for payee selection
  const { data: landlords = [] } = useQuery({
    queryKey: ['landlords'],
    queryFn: async () => {
      const response = await landlordApi.list()
      return response.data.results || response.data
    },
    placeholderData: keepPreviousData,
  })

  // Fetch active bank accounts for the source-of-funds picker.
  const { data: bankAccountsData } = useQuery({
    queryKey: ['bank-accounts-for-expenses'],
    queryFn: () => bankAccountApi.list({ is_active: true }).then((r: any) => r.data.results || r.data),
    staleTime: 60000,
    placeholderData: keepPreviousData,
  })
  const bankAccounts: any[] = Array.isArray(bankAccountsData) ? bankAccountsData : (bankAccountsData?.results || [])

  // Fetch expense categories — these encode GL routing + funding category.
  const { data: expenseCategoriesData } = useQuery({
    queryKey: ['expense-categories-for-form'],
    queryFn: () => expenseCategoryApi.list({ is_active: true, page_size: 200 }).then((r: any) => r.data.results || r.data),
    staleTime: 60000,
    placeholderData: keepPreviousData,
  })
  const expenseCategories: any[] = Array.isArray(expenseCategoriesData) ? expenseCategoriesData : (expenseCategoriesData?.results || [])

  // Derived selections used by the modal preview.
  const selectedBank = bankAccounts.find((b: any) => String(b.id) === String(expenseForm.bank_account))
  const selectedCategory = expenseCategories.find((c: any) => String(c.id) === String(expenseForm.expense_category))
  const selectedLandlord = landlords.find((l: any) => String(l.id) === String(expenseForm.landlord))
  // Whichever GL code matches the chosen currency.
  const expenseGlCode = selectedCategory
    ? (expenseForm.currency === 'ZWG' && selectedCategory.gl_account_zwg_code
        ? selectedCategory.gl_account_zwg_code
        : selectedCategory.gl_account_code)
    : null
  // Sub-account label that'll be debited on the landlord's trust ledger.
  const fundingCategoryLabel: Record<string, string> = {
    rent: 'Rent', maintenance: 'Maintenance', rates: 'Rates',
    parking: 'Parking', vat: 'VAT',
  }

  // Step 2 → Step 3 effect: when bank account changes, sync currency + clear stale expense category if its USD/ZWG variant doesn't exist.
  useEffect(() => {
    if (!selectedBank) return
    if (selectedBank.currency && selectedBank.currency !== expenseForm.currency) {
      setExpenseForm(f => ({ ...f, currency: selectedBank.currency }))
    }
  }, [selectedBank?.id])

  // Step 3 → Step 6 effect: when expense category changes, prefill the
  // description from the category's default_description (only if the user
  // hasn't typed something custom).
  const lastAutoDescriptionRef = useRef('')
  useEffect(() => {
    if (!selectedCategory) return
    const defaultDesc = selectedCategory.default_description || selectedCategory.name || ''
    if (!defaultDesc) return
    if (expenseForm.description === '' || expenseForm.description === lastAutoDescriptionRef.current) {
      lastAutoDescriptionRef.current = defaultDesc
      setExpenseForm(f => ({ ...f, description: defaultDesc }))
    }
  }, [selectedCategory?.id])

  // Create mutation - optimistic
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => expenseApi.create(data),
    onMutate: async (newData) => {
      setShowModal(false)
      await queryClient.cancelQueries({ queryKey: ['expenses'] })
      const previousData = queryClient.getQueryData(['expenses', statusFilter, typeFilter, debouncedSearch, currentPage])

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
      queryClient.setQueryData(['expenses', statusFilter, typeFilter, debouncedSearch, currentPage], (old: any) => {
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
        queryClient.setQueryData(['expenses', statusFilter, typeFilter, debouncedSearch, currentPage], context.previousData)
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
      const previousData = queryClient.getQueryData(['expenses', statusFilter, typeFilter, debouncedSearch, currentPage])
      queryClient.setQueryData(['expenses', statusFilter, typeFilter, debouncedSearch, currentPage], (old: any) => {
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
        queryClient.setQueryData(['expenses', statusFilter, typeFilter, debouncedSearch, currentPage], context.previousData)
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
      const previousData = queryClient.getQueryData(['expenses', statusFilter, typeFilter, debouncedSearch, currentPage])
      queryClient.setQueryData(['expenses', statusFilter, typeFilter, debouncedSearch, currentPage], (old: any) => {
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
        queryClient.setQueryData(['expenses', statusFilter, typeFilter, debouncedSearch, currentPage], context.previousData)
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

    if (!expenseForm.bank_account) { showToast.error('Pick a bank account first.'); return }
    if (!expenseForm.expense_category) { showToast.error('Pick an expense category.'); return }
    if (!expenseForm.amount) { showToast.error('Enter an amount.'); return }

    recentExpenseType.add(expenseForm.expense_type)
    recentPayeeType.add(expenseForm.payee_type)

    // Default the payee name to the landlord's name if no custom one was given.
    const payeeName = expenseForm.payee_name || selectedLandlord?.name || 'Vendor'

    const data: Record<string, unknown> = {
      expense_type: expenseForm.expense_type,
      payee_name: payeeName,
      payee_type: expenseForm.landlord ? 'landlord' : (expenseForm.payee_type || 'vendor'),
      payee_id: expenseForm.landlord ? Number(expenseForm.landlord) : null,
      date: expenseForm.date,
      amount: expenseForm.amount,
      currency: expenseForm.currency,
      description: expenseForm.description,
      reference: expenseForm.reference,
      bank_account: Number(expenseForm.bank_account),
      expense_category: Number(expenseForm.expense_category),
      landlord: expenseForm.landlord ? Number(expenseForm.landlord) : null,
    }

    createMutation.mutate(data)

    // Reset form
    setExpenseForm({
      date: new Date().toISOString().split('T')[0],
      bank_account: '',
      currency: 'USD',
      expense_category: '',
      landlord: '',
      description: '',
      amount: '',
      reference: '',
      payee_name: '',
      payee_type: recentPayeeType.values[0] || 'landlord',
      expense_type: recentExpenseType.values[0] || 'other',
      income_type: '',
    })
    lastAutoDescriptionRef.current = ''
  }

  // Get description suggestions based on expense type
  const getExpenseDescriptionSuggestions = () => {
    const map: Record<string, string[]> = {
      landlord_payment: ['Landlord payout', 'Monthly landlord remittance', 'Rental income distribution'],
      maintenance: ['Plumbing repair', 'Electrical repair', 'Painting', 'General maintenance', 'Lock replacement'],
      utility: ['Electricity bill', 'Water bill', 'Internet bill', 'Rates and taxes'],
      commission: ['Management commission', 'Letting commission'],
      other: ['Office supplies', 'Legal fees', 'Insurance premium', 'Cleaning services'],
    }
    return map[expenseForm.expense_type] || []
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

  const handleBulkApprove = () => {
    const ids = Array.from(selection.selectedIds)
    bulkLoading.run('approve', async () => {
      let approved = 0
      for (const id of ids) {
        try { await expenseApi.approve(id as number); approved++ } catch {}
      }
      selection.clearSelection()
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      showToast.success(`Approved ${approved} expenses`)
    })
  }

  const handleBulkDelete = () => {
    const count = selection.selectedCount
    const ids = Array.from(selection.selectedIds)
    selection.clearSelection()
    undoToast({
      message: `Deleting ${count} expenses...`,
      onConfirm: async () => {
        for (const id of ids) { try { await expenseApi.delete(id as number) } catch {} }
        queryClient.invalidateQueries({ queryKey: ['expenses'] })
        showToast.success(`Deleted ${count} expenses`)
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
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Expenses' },
          ]}
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
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Expenses' },
          ]}
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
        subtitle={`${totalCount} total expenses`}
        icon={Receipt}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Expenses' },
        ]}
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
                        <p className="text-sm text-gray-900 truncate">{expense.payee_name}</p>
                      )}
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {expense.date ? formatDate(expense.date) : '\u2014'}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {expenseTypes.find(t => t.value === expense.expense_type)?.label || expense.expense_type}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <Tooltip content={expenseTypes.find(t => t.value === expense.expense_type)?.label || expense.expense_type}>
                        <span className="font-bold text-lg">{formatCurrency(expense.amount || 0, expense.currency)}</span>
                      </Tooltip>
                      {expense.journal_number ? (
                        <Tooltip content="Posted to general ledger">
                          <p className="text-xs text-gray-500">JRN: {expense.journal_number}</p>
                        </Tooltip>
                      ) : null}
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
        title="Record Expense"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Step 1 — Date */}
          <Input
            label="Date"
            type="date"
            value={expenseForm.date}
            onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
            required
          />

          {/* Step 2 — Bank account (drives currency for the rest of the form) */}
          <AsyncSelect
            label="Bank Account (source of funds)"
            placeholder="Pick the bank account funds will come from"
            value={expenseForm.bank_account}
            onChange={(val) => setExpenseForm({ ...expenseForm, bank_account: String(val) })}
            options={bankAccounts.map((b: any) => ({
              value: b.id,
              label: `${b.name}${b.currency ? ` (${b.currency})` : ''}`,
              description: b.bank_name || b.account_number || '',
            }))}
            required
            searchable
            emptyMessage="No active bank accounts. Add one in Accounting → Bank Accounts."
          />
          {selectedBank && (
            <p className="-mt-2 text-xs text-gray-500">
              Currency locked to <span className="font-medium text-gray-700">{selectedBank.currency}</span> by the chosen bank account.
            </p>
          )}

          {/* Step 3 — Expense category */}
          <AsyncSelect
            label="Expense Category"
            placeholder="What is this expense for?"
            value={expenseForm.expense_category}
            onChange={(val) => setExpenseForm({ ...expenseForm, expense_category: String(val) })}
            options={expenseCategories.map((c: any) => ({
              value: c.id,
              label: c.name,
              description: `${c.gl_account_code}${c.gl_account_zwg_code ? ` / ${c.gl_account_zwg_code}` : ''} · ${fundingCategoryLabel[c.funding_category] || c.funding_category}`,
            }))}
            required
            searchable
            emptyMessage="No expense categories yet. Run seed_expense_categories to populate the standard set."
          />

          {/* Step 5 — Landlord (skipping step 4 funding source per spec) */}
          <AsyncSelect
            label="Landlord (whose trust funds this expense)"
            placeholder="Pick a landlord (or leave blank for agency overhead)"
            value={expenseForm.landlord}
            onChange={(val) => setExpenseForm({ ...expenseForm, landlord: String(val) })}
            options={landlords.map((l: any) => ({
              value: l.id,
              label: l.name,
              description: l.code || '',
            }))}
            searchable
            clearable
            emptyMessage="No landlords found."
          />

          {/* Step 6 — Description (auto-prefilled) */}
          <AutocompleteInput
            label="Description"
            placeholder="Describe the expense..."
            value={expenseForm.description}
            onChange={(e) => {
              // Once the user types over the auto-fill, stop syncing future
              // category changes into the description field.
              lastAutoDescriptionRef.current = ''
              setExpenseForm({ ...expenseForm, description: e.target.value })
            }}
            recentKey="expense_descriptions"
            required
          />

          {/* Step 7 — Amount */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={`Amount (${expenseForm.currency})`}
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={expenseForm.amount}
              onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
              required
            />
            <AutocompleteInput
              label="Reference (optional)"
              placeholder="Bank ref, cheque #, EcoCash ref..."
              value={expenseForm.reference}
              onChange={(e) => setExpenseForm({ ...expenseForm, reference: e.target.value })}
              recentKey="expense_references"
            />
          </div>

          {/* Posting preview — shows what the GL entries will look like */}
          {selectedBank && selectedCategory && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs space-y-1.5">
              <p className="font-semibold text-gray-700 text-[11px] uppercase tracking-wider">Posting preview</p>
              <div className="flex items-center justify-between text-gray-700">
                <span>Dr</span>
                <span className="font-mono text-[11px]">{expenseGlCode}</span>
                <span className="text-gray-500 truncate ml-2 max-w-[160px]" title={selectedCategory.name}>{selectedCategory.name}</span>
              </div>
              <div className="flex items-center justify-between text-gray-700">
                <span>Cr</span>
                <span className="font-mono text-[11px]">{selectedBank.gl_account_code || '—'}</span>
                <span className="text-gray-500 truncate ml-2 max-w-[160px]" title={selectedBank.name}>{selectedBank.name}</span>
              </div>
              {selectedLandlord && (
                <div className="pt-1.5 border-t border-gray-200 text-[11px] text-violet-700">
                  <span className="font-semibold">Trust ledger:</span>{' '}
                  Dr {selectedLandlord.name}'s {fundingCategoryLabel[selectedCategory.funding_category] || selectedCategory.funding_category} sub-account
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record Expense
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

      <BulkActionsBar
        selectedCount={selection.selectedCount}
        onClearSelection={selection.clearSelection}
        entityName="expenses"
        actions={[
          { label: 'Export', icon: Download, onClick: handleBulkExport, variant: 'outline', disabled: bulkLoading.busy },
          { label: 'Approve', icon: Check, onClick: handleBulkApprove, variant: 'primary', loading: bulkLoading.is('approve'), disabled: bulkLoading.busy && !bulkLoading.is('approve') },
          { label: 'Delete', icon: Trash2, onClick: handleBulkDelete, variant: 'danger', disabled: bulkLoading.busy },
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
