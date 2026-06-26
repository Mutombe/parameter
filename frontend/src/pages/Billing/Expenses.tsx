import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { expenseApi, landlordApi, supplierApi, incomeTypeApi, expenseCategoryApi, bankAccountApi, accountApi } from '../../services/api'
import { AsyncSelect } from '../../components/ui/AsyncSelect'
import { SubAccountBadge } from '../../components/SubAccountBadge'
import { formatCurrency, formatDate, cn, useDebounce } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Textarea, Badge, EmptyState, Skeleton, ConfirmDialog, Tooltip, Pagination, DatePicker } from '../../components/ui'
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
  expense_kind?: 'cash' | 'non_cash'
  expense_kind_display?: string
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
  expense_category_funding?: string
  income_type?: number
  income_type_name?: string
  bank_account?: number
  bank_account_name?: string
  bank_account_currency?: string
  landlord?: number
  landlord_name?: string
  landlord_code?: string
  supplier?: number
  supplier_name?: string
  supplier_code?: string
  sub_account_category?: string
  sub_account_category_display?: string
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [kindFilter, setKindFilter] = useState<string>('')
  // Category scope — deep-linked from a click on a category label (here or
  // on the expense detail page). Drives ?expense_category=<id> on the list.
  const categoryFilter = searchParams.get('category') || ''
  const categoryFilterName = searchParams.get('category_name') || ''
  const clearCategoryFilter = () => {
    searchParams.delete('category'); searchParams.delete('category_name')
    setSearchParams(searchParams, { replace: true })
    setCurrentPage(1)
  }
  const [showModal, setShowModal] = useState(false)
  const [showDetail, setShowDetail] = useState<Expense | null>(null)
  const [showApproveConfirm, setShowApproveConfirm] = useState<Expense | null>(null)
  const [showPayConfirm, setShowPayConfirm] = useState<Expense | null>(null)

  const debouncedSearch = useDebounce(searchQuery, 300)
  const [currentPage, setCurrentPage] = useState(1)

  const selection = useSelection<number | string>({ clearOnChange: [debouncedSearch, statusFilter, typeFilter, kindFilter] })
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
    // Step 2: bank account (drives currency) — empty for non-cash mode
    bank_account: '',
    currency: 'USD',
    // Step 3: expense category (drives GL account + funding category)
    expense_category: '',
    // Step 5: landlord (drives sub-account via category's funding_category)
    landlord: '',
    // Step 5b: explicit sub-account override. When blank, post_to_ledger
    // falls back to the category's funding_category. Auto-populates from
    // category when the user picks one, but can be changed.
    sub_account_category: '',
    // Step 5c: supplier — third-party payee like City of Harare or ZESA.
    // When set, auto-fills payee_name / category from the supplier record.
    supplier: '',
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

  // Mode toggle: 'single' uses expenseForm above; 'batch' uses batchLines
  // and shares the date + bank_account from expenseForm with all lines.
  const [expenseMode, setExpenseMode] = useState<'single' | 'batch'>('single')
  // Cash vs Non-Cash. Non-cash skips the bank-account picker, hits an
  // accruals GL on post, and doesn't touch the landlord trust sub-account.
  const [expenseKind, setExpenseKind] = useState<'cash' | 'non_cash'>('cash')
  // When checked, the create flow goes pending → approved → paid in one
  // go (calls post_to_ledger on the backend right after save). Defaults
  // ON for cash because that's the typical "I just paid this, record it"
  // case; defaults OFF for non-cash where users may want a separate
  // approval cycle on accruals.
  const [autoPost, setAutoPost] = useState(true)

  type BatchLine = {
    expense_category: string
    landlord: string
    description: string
    amount: string
    reference: string
  }
  const newBatchLine = (): BatchLine => ({
    expense_category: '',
    landlord: '',
    description: '',
    amount: '',
    reference: '',
  })
  const [batchLines, setBatchLines] = useState<BatchLine[]>([newBatchLine(), newBatchLine()])

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
    queryKey: ['expenses', statusFilter, typeFilter, kindFilter, debouncedSearch, currentPage, categoryFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page: currentPage, page_size: PAGE_SIZE }
      if (statusFilter) params.status = statusFilter
      if (typeFilter) params.expense_type = typeFilter
      if (kindFilter) params.expense_kind = kindFilter
      if (debouncedSearch) params.search = debouncedSearch
      if (categoryFilter) params.expense_category = categoryFilter
      try {
        const response = await expenseApi.list(params)
        return response.data
      } catch (err: any) {
        // Log the underlying cause so the "Failed to load" screen has a
        // diagnosable trail. Common culprits: tenant schema race (CONN_MAX_AGE),
        // missing migration, or backend 500 on a serializer field.
        console.error('[EXPENSES] list failed', {
          status: err?.response?.status,
          data: err?.response?.data,
          message: err?.message,
          url: err?.config?.url,
          params: err?.config?.params,
        })
        throw err
      }
    },
    placeholderData: keepPreviousData,
    // Retry once on transient backend hiccups (schema race, connection drop)
    // before showing the error screen. Network errors get up to 2 retries.
    retry: (failureCount, err: any) => {
      const status = err?.response?.status
      if (status && status >= 400 && status < 500) return false
      return failureCount < 2
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  })

  const expenses = expensesData?.results || expensesData || []
  const totalCount = expensesData?.count || expenses.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, statusFilter, typeFilter, kindFilter, categoryFilter])

  // Fetch landlords for payee selection
  const { data: landlords = [] } = useQuery({
    queryKey: ['landlords'],
    queryFn: async () => {
      const response = await landlordApi.list()
      return response.data.results || response.data
    },
    placeholderData: keepPreviousData,
  })

  // Fetch suppliers (active only). Used by the inline picker on the
  // Expense modal so users can pick a structured payee instead of typing
  // payee_name freeform.
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-for-expenses'],
    queryFn: () => supplierApi.list({ is_active: true, page_size: 200 }).then((r: any) => r.data.results || r.data),
    staleTime: 60000,
    placeholderData: keepPreviousData,
  })
  const suppliers: any[] = Array.isArray(suppliersData) ? suppliersData : (suppliersData?.results || [])

  // Just-in-time supplier creation. Same pattern as the bank-account JIT
  // below — pop a small modal, save, refresh the list, auto-pick the new
  // record so the user doesn't lose their place mid-flow.
  const [showQuickSupplier, setShowQuickSupplier] = useState(false)
  const [quickSupplier, setQuickSupplier] = useState({
    name: '',
    email: '',
    phone: '',
    tax_id: '',
    address: '',
    default_expense_category: '',
  })
  const createSupplierMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => supplierApi.create(data),
    onSuccess: (resp) => {
      const created = resp.data
      queryClient.invalidateQueries({ queryKey: ['suppliers-for-expenses'] })
      setShowQuickSupplier(false)
      setQuickSupplier({ name: '', email: '', phone: '', tax_id: '', address: '', default_expense_category: '' })
      // Auto-pick the new supplier so the parent expense form reflects it.
      setExpenseForm(f => ({ ...f, supplier: String(created.id) }))
      showToast.success(`Supplier ${created.code || ''} created`)
    },
    onError: (err: any) => showToast.error(parseApiError(err)),
  })

  // Fetch active bank accounts for the source-of-funds picker.
  const { data: bankAccountsData } = useQuery({
    queryKey: ['bank-accounts-for-expenses'],
    queryFn: () => bankAccountApi.list({ is_active: true }).then((r: any) => r.data.results || r.data),
    staleTime: 60000,
    placeholderData: keepPreviousData,
  })
  const bankAccounts: any[] = Array.isArray(bankAccountsData) ? bankAccountsData : (bankAccountsData?.results || [])

  // Just-in-time bank account creation from inside the Expenses modal.
  // Mirrors the JIT-invoice pattern in Receipts so users don't have to
  // bounce out to Accounting → Bank Accounts mid-flow.
  const [showQuickBank, setShowQuickBank] = useState(false)
  // 'single' | 'batch' tells us which form's bank_account to auto-select
  // after the new account lands (the batch form shares the same bank field).
  const [quickBankFor, setQuickBankFor] = useState<'single' | 'batch'>('single')
  const [quickBank, setQuickBank] = useState({
    name: '',
    account_type: 'bank',
    bank_name: '',
    account_number: '',
    currency: 'USD',
    gl_account: '',
  })
  const { data: glAccountsForBank } = useQuery({
    queryKey: ['gl-accounts-for-bank-jit'],
    queryFn: () => accountApi.list({ account_type: 'asset', page_size: 200 }).then((r: any) => r.data.results || r.data),
    staleTime: 60000,
    enabled: showQuickBank,
  })
  const glAccountsList: any[] = Array.isArray(glAccountsForBank) ? glAccountsForBank : (glAccountsForBank?.results || [])

  const createBankMutation = useMutation({
    mutationFn: (data: any) => bankAccountApi.create({
      ...data,
      gl_account: data.gl_account ? Number(data.gl_account) : null,
    }).then(r => r.data),
    onSuccess: (newBank: any) => {
      showToast.success('Bank account created — selected for this expense')
      queryClient.invalidateQueries({ queryKey: ['bank-accounts-for-expenses'] })
      // Auto-select on whichever form opened the JIT modal.
      setExpenseForm(f => ({
        ...f,
        bank_account: String(newBank.id),
        currency: newBank.currency || f.currency,
      }))
      setShowQuickBank(false)
      setQuickBank({ name: '', account_type: 'bank', bank_name: '', account_number: '', currency: 'USD', gl_account: '' })
    },
    onError: (err) => showToast.error(parseApiError(err, 'Failed to create bank account')),
  })

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
  const selectedSupplier = suppliers.find((s: any) => String(s.id) === String(expenseForm.supplier))
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
  // Full set of trust pockets a landlord can fund an expense from. Mirrors
  // SubsidiaryAccount.AccountCategory on the backend.
  const subAccountCategoryOptions: { value: string; label: string }[] = [
    { value: 'rent', label: 'Rent' },
    { value: 'levy', label: 'Levy' },
    { value: 'special_levy', label: 'Special Levy' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'parking', label: 'Parking' },
    { value: 'rates', label: 'Rates' },
    { value: 'vat', label: 'VAT' },
    { value: 'deposit', label: 'Deposit' },
    { value: 'general', label: 'General' },
  ]
  const subAccountCategoryLabel: Record<string, string> = Object.fromEntries(
    subAccountCategoryOptions.map(o => [o.value, o.label])
  )
  // The pocket that'll actually get debited — explicit pick wins over the
  // category default. Drives the posting preview and badge.
  const effectiveSubAccount = (
    expenseForm.sub_account_category
    || (selectedCategory?.funding_category ?? '')
  )

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

  // Step 3 → Step 5b effect: when category changes, default the trust
  // pocket to that category's funding_category. Only auto-fills when the
  // user hasn't manually picked one yet (or set it from a prior category).
  const lastAutoSubAccountRef = useRef('')
  useEffect(() => {
    if (!selectedCategory) return
    const defaultSub = selectedCategory.funding_category || ''
    if (!defaultSub) return
    if (expenseForm.sub_account_category === '' || expenseForm.sub_account_category === lastAutoSubAccountRef.current) {
      lastAutoSubAccountRef.current = defaultSub
      setExpenseForm(f => ({ ...f, sub_account_category: defaultSub }))
    }
  }, [selectedCategory?.id])

  // Supplier → category effect. Each supplier can carry a default
  // expense_category (e.g. City of Harare → Rates) so picking the supplier
  // pre-fills the category and saves a click. Only fires when category
  // is empty or was previously auto-set, so a user override sticks.
  const lastAutoCategoryRef = useRef('')
  useEffect(() => {
    if (!selectedSupplier) return
    const cat = selectedSupplier.default_expense_category
    if (!cat) return
    const catStr = String(cat)
    if (expenseForm.expense_category === '' || expenseForm.expense_category === lastAutoCategoryRef.current) {
      lastAutoCategoryRef.current = catStr
      setExpenseForm(f => ({ ...f, expense_category: catStr }))
    }
  }, [selectedSupplier?.id])

  // Create mutation - optimistic
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => expenseApi.create(data),
    onMutate: async (newData) => {
      setShowModal(false)
      await queryClient.cancelQueries({ queryKey: ['expenses'] })
      const previousData = queryClient.getQueryData(['expenses', statusFilter, typeFilter, kindFilter, debouncedSearch, currentPage])

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
      queryClient.setQueryData(['expenses', statusFilter, typeFilter, kindFilter, debouncedSearch, currentPage], (old: any) => {
        // The cached response is the paginated shape {count, results, ...},
        // not a flat array. Spreading it into an array would throw
        // (object not iterable) and the mutation would error out before
        // the POST is even sent. Branch on shape.
        if (old && typeof old === 'object' && Array.isArray(old.results)) {
          return { ...old, results: [optimistic, ...old.results], count: (old.count ?? old.results.length) + 1 }
        }
        if (Array.isArray(old)) return [optimistic, ...old]
        return { results: [optimistic], count: 1 }
      })
      return { previousData }
    },
    onSuccess: () => {
      showToast.success('Expense created successfully')
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
    onError: (err: any, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['expenses', statusFilter, typeFilter, kindFilter, debouncedSearch, currentPage], context.previousData)
      }
      // Surface the underlying error so future failures don't show the
      // useless "An error occurred" fallback. parseApiError handles axios
      // shapes; for plain JS errors we fall back to err.message.
      const detail = err?.message || err?.toString?.() || ''
      const parsed = parseApiError(err)
      showToast.error(parsed === 'An error occurred' && detail ? `Failed: ${detail}` : parsed)
      // eslint-disable-next-line no-console
      console.error('[Expense create error]', err)
    }
  })

  // Batch create — posts N expense rows sharing date + bank account.
  const bulkCreateMutation = useMutation({
    mutationFn: (payload: any) => expenseApi.bulkCreate(payload).then(r => r.data),
    onSuccess: (data: any) => {
      const ok = data.created_count || 0
      const failed = data.error_count || 0
      if (ok > 0) {
        showToast.success(
          failed > 0
            ? `Recorded ${ok} expense${ok === 1 ? '' : 's'} (${failed} failed)`
            : `Recorded ${ok} expense${ok === 1 ? '' : 's'}`
        )
      }
      if (failed > 0 && (data.errors || []).length) {
        const first = data.errors[0]
        showToast.error(`Line ${first.line}: ${first.error}`)
      }
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      // Only close + reset the modal if at least one line landed.
      if (ok > 0) {
        setShowModal(false)
        setBatchLines([newBatchLine(), newBatchLine()])
      }
    },
    onError: (err) => {
      showToast.error(parseApiError(err, 'Failed to record batch'))
    },
  })

  // Approve mutation - optimistic
  const approveMutation = useMutation({
    mutationFn: (id: number) => expenseApi.approve(id),
    onMutate: async (id) => {
      setShowApproveConfirm(null)
      await queryClient.cancelQueries({ queryKey: ['expenses'] })
      const previousData = queryClient.getQueryData(['expenses', statusFilter, typeFilter, kindFilter, debouncedSearch, currentPage])
      queryClient.setQueryData(['expenses', statusFilter, typeFilter, kindFilter, debouncedSearch, currentPage], (old: any) => {
        const updateRow = (item: any) =>
          item.id === id ? { ...item, status: 'approved', _isOptimistic: true } : item
        if (old && typeof old === 'object' && Array.isArray(old.results)) {
          return { ...old, results: old.results.map(updateRow) }
        }
        if (Array.isArray(old)) return old.map(updateRow)
        return old
      })
      return { previousData }
    },
    onSuccess: () => {
      showToast.success('Expense approved successfully')
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['expenses', statusFilter, typeFilter, kindFilter, debouncedSearch, currentPage], context.previousData)
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
      const previousData = queryClient.getQueryData(['expenses', statusFilter, typeFilter, kindFilter, debouncedSearch, currentPage])
      queryClient.setQueryData(['expenses', statusFilter, typeFilter, kindFilter, debouncedSearch, currentPage], (old: any) => {
        const updateRow = (item: any) =>
          item.id === id ? { ...item, status: 'paid', _isOptimistic: true } : item
        if (old && typeof old === 'object' && Array.isArray(old.results)) {
          return { ...old, results: old.results.map(updateRow) }
        }
        if (Array.isArray(old)) return old.map(updateRow)
        return old
      })
      return { previousData }
    },
    onSuccess: () => {
      showToast.success('Expense paid and posted to ledger')
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['expenses', statusFilter, typeFilter, kindFilter, debouncedSearch, currentPage], context.previousData)
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

  // Batch totals + handler
  const batchValidLines = batchLines.filter(l => l.expense_category && l.amount && l.description)
  const batchTotal = batchValidLines.reduce((s, l) => s + (Number(l.amount) || 0), 0)

  const handleBatchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (expenseKind === 'cash' && !expenseForm.bank_account) {
      showToast.error('Pick a bank account first.'); return
    }
    if (batchValidLines.length === 0) { showToast.error('Add at least one complete expense line.'); return }
    bulkCreateMutation.mutate({
      date: expenseForm.date,
      // Backend treats bank_account as required for cash and optional for
      // non-cash. We always send the user's choice for cash; null otherwise.
      bank_account: expenseKind === 'cash' && expenseForm.bank_account
        ? Number(expenseForm.bank_account)
        : null,
      currency: expenseForm.currency,
      expense_kind: expenseKind,
      lines: batchValidLines.map(l => ({
        expense_category: Number(l.expense_category),
        landlord: l.landlord ? Number(l.landlord) : null,
        amount: l.amount,
        description: l.description,
        reference: l.reference || '',
      })),
    })
  }

  const updateBatchLine = (idx: number, field: keyof BatchLine, value: string) => {
    setBatchLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }
  const removeBatchLine = (idx: number) => {
    setBatchLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
  }
  const addBatchLine = () => setBatchLines(prev => [...prev, newBatchLine()])

  // When a category is picked on a batch line, auto-prefill the description
  // (only if the line's description is still empty).
  const onBatchCategoryChange = (idx: number, categoryId: string) => {
    setBatchLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const cat = expenseCategories.find((c: any) => String(c.id) === categoryId)
      const defaultDesc = cat?.default_description || cat?.name || ''
      return {
        ...l,
        expense_category: categoryId,
        description: l.description || defaultDesc,
      }
    }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // Cash needs a bank account to source funds from. Non-cash doesn't.
    if (expenseKind === 'cash' && !expenseForm.bank_account) {
      showToast.error('Pick a bank account first.'); return
    }
    if (!expenseForm.expense_category) { showToast.error('Pick an expense category.'); return }
    if (!expenseForm.amount) { showToast.error('Enter an amount.'); return }

    recentExpenseType.add(expenseForm.expense_type)
    recentPayeeType.add(expenseForm.payee_type)

    // Default the payee name to the supplier (preferred), then the
    // landlord, then a generic Vendor placeholder.
    const payeeName = expenseForm.payee_name
      || selectedSupplier?.name
      || selectedLandlord?.name
      || 'Vendor'
    // Pick the right payee_type: supplier picks set 'vendor'; otherwise
    // fall back to landlord, then the existing recent value.
    const payeeType = expenseForm.supplier
      ? 'vendor'
      : expenseForm.landlord
        ? 'landlord'
        : (expenseForm.payee_type || 'vendor')
    const payeeId = expenseForm.supplier
      ? Number(expenseForm.supplier)
      : expenseForm.landlord
        ? Number(expenseForm.landlord)
        : null

    const data: Record<string, unknown> = {
      expense_type: expenseForm.expense_type,
      expense_kind: expenseKind,
      payee_name: payeeName,
      payee_type: payeeType,
      payee_id: payeeId,
      supplier: expenseForm.supplier ? Number(expenseForm.supplier) : null,
      date: expenseForm.date,
      amount: expenseForm.amount,
      currency: expenseForm.currency,
      description: expenseForm.description,
      reference: expenseForm.reference,
      // Bank account only sent for cash expenses — non-cash routes through
      // the accruals GL on the backend.
      bank_account: expenseKind === 'cash' && expenseForm.bank_account
        ? Number(expenseForm.bank_account)
        : null,
      expense_category: Number(expenseForm.expense_category),
      landlord: expenseForm.landlord ? Number(expenseForm.landlord) : null,
      // Empty string = "no override; use category's funding_category".
      // Sent verbatim so the backend can clear an existing override too.
      sub_account_category: expenseForm.sub_account_category,
      // Tells the backend's perform_create to approve + post immediately.
      auto_post: autoPost,
    }

    createMutation.mutate(data)

    // Reset form
    setExpenseForm({
      date: new Date().toISOString().split('T')[0],
      bank_account: '',
      currency: 'USD',
      expense_category: '',
      landlord: '',
      sub_account_category: '',
      supplier: '',
      description: '',
      amount: '',
      reference: '',
      payee_name: '',
      payee_type: recentPayeeType.values[0] || 'landlord',
      expense_type: recentExpenseType.values[0] || 'other',
      income_type: '',
    })
    lastAutoDescriptionRef.current = ''
    lastAutoSubAccountRef.current = ''
    lastAutoCategoryRef.current = ''
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
      <div className="space-y-6">
        <PageHeader
          title="Expenditure"
          subtitle="Manage expenses and payouts"
          icon={Receipt}
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Expenditure' },
          ]}
        />
        <SkeletonExpenses />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Expenditure"
          subtitle="Manage expenses and payouts"
          icon={Receipt}
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Expenditure' },
          ]}
        />
        <EmptyState
          icon={XCircle}
          title="Failed to load expenses"
          description={(() => {
            const err = error as any
            const status = err?.response?.status
            const data = err?.response?.data
            // Backend can surface the error in any of these fields, plus a
            // `debug` block when DEBUG_API_ERRORS is on (development).
            const detail = data?.detail
              || data?.error
              || (typeof data?.debug?.error === 'string' ? data.debug.error.split('\n')[0] : null)
              || data?.message
              || err?.message
            if (status) return `${status} from backend${detail ? ` — ${detail}` : ''}`
            return detail || 'There was an error loading your expenses. Check your connection and try again.'
          })()}
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
    <div>
      <PageHeader
        title="Expenditure"
        subtitle={`${totalCount} total expenses`}
        icon={Receipt}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Expenditure' },
        ]}
        actions={
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Expenditure
          </Button>
        }
      />

      {categoryFilter && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 mb-6">
          <div className="flex items-center gap-2 text-sm text-primary-900">
            <Receipt className="w-4 h-4 text-primary-600" />
            <span>
              Showing only <span className="font-semibold">{categoryFilterName || 'selected category'}</span> expenses
            </span>
          </div>
          <button
            onClick={clearCategoryFilter}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-900"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      )}

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
        <Select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          placeholder="Cash & Non-Cash"
          options={[
            { value: '', label: 'Cash & Non-Cash' },
            { value: 'cash', label: 'Cash only' },
            { value: 'non_cash', label: 'Non-Cash only' },
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
              New Expenditure
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
                    "bg-white rounded-lg border p-2.5 pl-9 hover:shadow-sm transition-all cursor-pointer relative",
                    config.borderColor,
                    expense._isOptimistic && "opacity-60",
                    selection.isSelected(expense.id) && "ring-2 ring-blue-500 border-blue-300"
                  )}
                  onMouseEnter={() => prefetch(`/dashboard/expenses/${expense.id}`)}
                  onClick={() => navigate(`/dashboard/expenses/${expense.id}`)}
                >
                  {!expense._isOptimistic && (
                    <div className="absolute top-3 left-2.5" onClick={(e) => e.stopPropagation()}>
                      <SelectionCheckbox
                        checked={selection.isSelected(expense.id)}
                        onChange={() => selection.toggle(expense.id)}
                      />
                    </div>
                  )}
                  {/* Single-line layout with fixed column widths so chips/IDs align top-to-bottom. */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn("p-1 rounded flex-shrink-0", config.bgColor)}>
                      <StatusIcon className={cn("h-3.5 w-3.5", config.color)} />
                    </div>

                    <span className="font-semibold text-gray-900 text-sm whitespace-nowrap w-[110px] flex-shrink-0">{expense.expense_number}</span>

                    <div className="w-[88px] flex-shrink-0">
                      <Tooltip content={{ pending: 'Awaiting approval', approved: 'Approved, ready for payment', paid: 'Payment completed', cancelled: 'Expense cancelled' }[expense.status]}>
                        <span><Badge variant={expense.status === 'paid' ? 'success' : expense.status === 'pending' ? 'warning' : 'default'}>{config.label}</Badge></span>
                      </Tooltip>
                    </div>

                    <div className="w-[78px] flex-shrink-0">
                      <span className={cn(
                        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ring-1',
                        expense.expense_kind === 'non_cash'
                          ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                          : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                      )}>
                        {expense.expense_kind === 'non_cash' ? 'Non-Cash' : 'Cash'}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0 flex items-center">
                      {expense.landlord ? (
                        <button
                          onMouseEnter={() => prefetch(`/dashboard/landlords/${expense.landlord}`)}
                          onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/landlords/${expense.landlord}`) }}
                          className="text-sm text-primary-600 hover:underline truncate text-left"
                          title={expense.payee_name}
                        >
                          {expense.payee_name}
                        </button>
                      ) : (
                        <span className="text-sm text-gray-700 truncate" title={expense.payee_name}>{expense.payee_name}</span>
                      )}
                    </div>

                    <span className="text-xs text-gray-500 whitespace-nowrap hidden md:inline w-[90px] flex-shrink-0">
                      {expense.date ? formatDate(expense.date) : '-'}
                    </span>

                    <span className="text-xs truncate hidden lg:inline w-[140px] flex-shrink-0" title={expense.expense_category_name ? `View all ${expense.expense_category_name} expenses` : ''}>
                      {expense.expense_category && expense.expense_category_name ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/dashboard/expenses?category=${expense.expense_category}&category_name=${encodeURIComponent(expense.expense_category_name!)}`)
                          }}
                          className="text-primary-600 hover:text-primary-700 hover:underline truncate max-w-full"
                        >
                          {expense.expense_category_name}
                        </button>
                      ) : (
                        <span className="text-gray-500">{expense.expense_category_name || '—'}</span>
                      )}
                    </span>

                    <div className="hidden xl:block w-[150px] flex-shrink-0 truncate">
                      {expense.bank_account_name ? (
                        <Tooltip content="Bank account funds came from">
                          <span className="text-xs text-gray-500" title={expense.bank_account_name}>
                            <Building2 className="h-3 w-3 inline mr-1 -mt-0.5" />{expense.bank_account_name}
                          </span>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>

                    <div className="w-[130px] flex-shrink-0">
                      <SubAccountBadge
                        category={expense.sub_account_category || expense.expense_category_funding}
                        currency={expense.currency}
                      />
                    </div>

                    <span className="font-semibold tabular-nums text-sm whitespace-nowrap w-[110px] flex-shrink-0">
                      {formatCurrency(expense.amount || 0, expense.currency)}
                    </span>

                    <div className="flex items-center gap-1 w-[80px] flex-shrink-0 justify-end">
                      {expense.status === 'pending' && (
                        <Button variant="outline" size="sm" title="Approve" onClick={(e) => { e.stopPropagation(); setShowApproveConfirm(expense) }}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {expense.status === 'approved' && (
                        <Button variant="primary" size="sm" title="Mark as paid" onClick={(e) => { e.stopPropagation(); setShowPayConfirm(expense) }}>
                          <CreditCard className="h-3.5 w-3.5 mr-1" />Pay
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

      {/* Pagination — fixed at the bottom of the list. */}
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

      {/* Create Expense Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={expenseMode === 'batch' ? 'Record Expense Batch' : 'Record Expense'}
      >
        {/* Two toggles side-by-side: Single vs Batch and Cash vs Non-Cash. */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
            <button
              type="button"
              onClick={() => setExpenseMode('single')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                expenseMode === 'single' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Single
            </button>
            <button
              type="button"
              onClick={() => setExpenseMode('batch')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                expenseMode === 'batch' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Batch
            </button>
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
            <button
              type="button"
              onClick={() => setExpenseKind('cash')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                expenseKind === 'cash' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Cash
            </button>
            <button
              type="button"
              onClick={() => setExpenseKind('non_cash')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                expenseKind === 'non_cash' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Non-Cash
            </button>
          </div>
          {expenseKind === 'non_cash' && (
            <span className="text-[11px] text-indigo-700 bg-indigo-50 ring-1 ring-indigo-200 px-2 py-0.5 rounded-md">
              Accrual / depreciation — credits Accrued Liabilities, no cash movement
            </span>
          )}
        </div>

        {expenseMode === 'batch' ? (
          <form onSubmit={handleBatchSubmit} className="space-y-4">
            {/* Shared header — date + bank account (cash) or currency (non-cash) */}
            <div className="grid grid-cols-2 gap-4">
              <DatePicker
                label="Date"
                value={expenseForm.date}
                onChange={(v) => setExpenseForm({ ...expenseForm, date: v })}
                required
              />
              {expenseKind === 'cash' ? (
                <AsyncSelect
                  label="Bank Account"
                  placeholder="Source of funds for the whole batch"
                  value={expenseForm.bank_account}
                  onChange={(val) => setExpenseForm({ ...expenseForm, bank_account: String(val) })}
                  options={bankAccounts.map((b: any) => ({
                    value: b.id,
                    label: `${b.name}${b.currency ? ` (${b.currency})` : ''}`,
                    description: b.bank_name || b.account_number || '',
                  }))}
                  required
                  searchable
                  onCreateNew={() => { setQuickBankFor('batch'); setShowQuickBank(true) }}
                  createNewLabel="+ Create new bank account"
                />
              ) : (
                <Select
                  label="Currency"
                  value={expenseForm.currency}
                  onChange={(e) => setExpenseForm({ ...expenseForm, currency: e.target.value })}
                  options={[
                    { value: 'USD', label: 'USD' },
                    { value: 'ZWG', label: 'ZWG' },
                  ]}
                />
              )}
            </div>
            {expenseKind === 'cash' && selectedBank && (
              <p className="-mt-2 text-xs text-gray-500">
                Currency for all lines: <span className="font-medium text-gray-700">{selectedBank.currency}</span>
              </p>
            )}
            {expenseKind === 'non_cash' && (
              <p className="-mt-2 text-xs text-indigo-700">
                Non-cash batch — every line credits Accrued Liabilities (2400). No bank involvement.
              </p>
            )}

            {/* Line rows */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Expense lines</div>
              {batchLines.map((line, idx) => {
                const cat = expenseCategories.find((c: any) => String(c.id) === line.expense_category)
                return (
                  <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500">Line {idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeBatchLine(idx)}
                        disabled={batchLines.length === 1}
                        className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Remove line"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <AsyncSelect
                        label="Category"
                        placeholder="What is this for?"
                        value={line.expense_category}
                        onChange={(val) => onBatchCategoryChange(idx, String(val))}
                        options={expenseCategories.map((c: any) => ({
                          value: c.id,
                          label: c.name,
                          description: `${c.gl_account_code} · ${fundingCategoryLabel[c.funding_category] || c.funding_category}`,
                        }))}
                        searchable
                        required
                      />
                      <AsyncSelect
                        label="Landlord (optional)"
                        placeholder="Agency overhead if blank"
                        value={line.landlord}
                        onChange={(val) => updateBatchLine(idx, 'landlord', String(val))}
                        options={landlords.map((l: any) => ({
                          value: l.id,
                          label: l.name,
                          description: l.code || '',
                        }))}
                        searchable
                        clearable
                      />
                    </div>
                    <Input
                      label="Description"
                      placeholder="What is this expense for?"
                      value={line.description}
                      onChange={(e) => updateBatchLine(idx, 'description', e.target.value)}
                      required
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        label={`Amount (${selectedBank?.currency || expenseForm.currency})`}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={line.amount}
                        onChange={(e) => updateBatchLine(idx, 'amount', e.target.value)}
                        required
                      />
                      <Input
                        label="Reference (optional)"
                        placeholder="Per-line ref"
                        value={line.reference}
                        onChange={(e) => updateBatchLine(idx, 'reference', e.target.value)}
                      />
                    </div>
                    {cat && (
                      <p className="text-[11px] text-gray-500">
                        Will post to <span className="font-mono">{selectedBank?.currency === 'ZWG' && cat.gl_account_zwg_code ? cat.gl_account_zwg_code : cat.gl_account_code}</span>
                        {line.landlord && (
                          <> · Trust: {fundingCategoryLabel[cat.funding_category] || cat.funding_category}</>
                        )}
                      </p>
                    )}
                  </div>
                )
              })}
              <button
                type="button"
                onClick={addBatchLine}
                className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-primary-400 hover:bg-primary-50/30 hover:text-primary-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add expense line
              </button>
            </div>

            {/* Batch summary */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between">
              <div className="text-xs text-gray-500">
                {batchValidLines.length} of {batchLines.length} line{batchLines.length === 1 ? '' : 's'} ready
              </div>
              <div className="text-sm">
                <span className="text-gray-500">Batch total:</span>{' '}
                <span className="font-bold text-gray-900 tabular-nums">
                  {selectedBank?.currency || expenseForm.currency} {batchTotal.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={bulkCreateMutation.isPending || batchValidLines.length === 0}>
                {bulkCreateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Record {batchValidLines.length} Expense{batchValidLines.length === 1 ? '' : 's'}
              </Button>
            </div>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Step 1 — Date */}
          <DatePicker
            label="Date"
            value={expenseForm.date}
            onChange={(v) => setExpenseForm({ ...expenseForm, date: v })}
            required
          />

          {/* Step 2 — Bank account (cash) or Currency (non-cash) */}
          {expenseKind === 'cash' ? (
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
              onCreateNew={() => { setQuickBankFor('single'); setShowQuickBank(true) }}
              createNewLabel="+ Create new bank account"
              emptyMessage="No active bank accounts. Click + Create new bank account above."
            />
          ) : (
            <Select
              label="Currency"
              value={expenseForm.currency}
              onChange={(e) => setExpenseForm({ ...expenseForm, currency: e.target.value })}
              options={[
                { value: 'USD', label: 'USD' },
                { value: 'ZWG', label: 'ZWG' },
              ]}
              hint="Non-cash expenses don't pull from a bank account"
            />
          )}
          {expenseKind === 'cash' && selectedBank && (
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

          {/* Step 5a — Supplier (third-party payee). Optional. When set,
              auto-fills the expense category from the supplier's default
              and stamps the payee_name on submit. The "+ New" button opens
              a small JIT modal so users can add e.g. "City of Harare"
              without leaving the expense flow. */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">Supplier (optional)</label>
              <button
                type="button"
                onClick={() => setShowQuickSupplier(true)}
                className="text-xs font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                New supplier
              </button>
            </div>
            <AsyncSelect
              label=""
              placeholder="e.g. City of Harare, ZESA — leave blank if N/A"
              value={expenseForm.supplier}
              onChange={(val) => setExpenseForm({ ...expenseForm, supplier: String(val) })}
              options={suppliers.map((s: any) => ({
                value: s.id,
                label: s.name,
                description: s.code || '',
              }))}
              searchable
              clearable
              emptyMessage="No suppliers yet — click 'New supplier' to add one."
            />
          </div>

          {/* Step 5b — Trust pocket the expense is deducted from. Always visible
              (even before a landlord is picked) so users discover the override.
              Disabled until a landlord exists, since there's nothing to deduct
              from otherwise. Non-cash kind also disables it because non-cash
              never touches the trust ledger. */}
          <Select
            label="Sub-account (landlord's pocket the expense comes out of)"
            value={expenseForm.sub_account_category}
            onChange={(e) => {
              // Manual edit — break the auto-sync from category changes.
              lastAutoSubAccountRef.current = ''
              setExpenseForm({ ...expenseForm, sub_account_category: e.target.value })
            }}
            options={[
              { value: '', label: 'Use category default' },
              ...subAccountCategoryOptions,
            ]}
            disabled={!expenseForm.landlord || expenseKind !== 'cash'}
            hint={
              !expenseForm.landlord
                ? 'Pick a landlord above to enable this.'
                : expenseKind !== 'cash'
                  ? 'Non-cash expenses skip the trust ledger — no pocket to deduct from.'
                  : selectedCategory?.funding_category && !expenseForm.sub_account_category
                    ? `Defaulting to ${fundingCategoryLabel[selectedCategory.funding_category] || selectedCategory.funding_category} from the category. Override here if it should come out of a different pocket.`
                    : "Which of the landlord's trust pockets to deduct from."
            }
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

          {/* Posting preview — shows what the GL entries will look like.
              Cash: Cr the bank's GL + Dr the landlord trust sub-account.
              Non-cash: Cr Accrued Liabilities (2400) + no trust entry. */}
          {selectedCategory && (expenseKind === 'non_cash' || selectedBank) && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs space-y-1.5">
              <p className="font-semibold text-gray-700 text-[11px] uppercase tracking-wider">Posting preview</p>
              <div className="flex items-center justify-between text-gray-700">
                <span>Dr</span>
                <span className="font-mono text-[11px]">{expenseGlCode}</span>
                <span className="text-gray-500 truncate ml-2 max-w-[160px]" title={selectedCategory.name}>{selectedCategory.name}</span>
              </div>
              {expenseKind === 'cash' ? (
                <div className="flex items-center justify-between text-gray-700">
                  <span>Cr</span>
                  <span className="font-mono text-[11px]">{selectedBank?.gl_account_code || '—'}</span>
                  <span className="text-gray-500 truncate ml-2 max-w-[160px]" title={selectedBank?.name}>{selectedBank?.name}</span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-indigo-700">
                  <span>Cr</span>
                  <span className="font-mono text-[11px]">2400</span>
                  <span className="text-indigo-500 truncate ml-2 max-w-[160px]">Accrued Liabilities</span>
                </div>
              )}
              {selectedLandlord && expenseKind === 'cash' && effectiveSubAccount && (
                <div className="pt-1.5 border-t border-gray-200 text-[11px] text-violet-700">
                  <span className="font-semibold">Trust ledger:</span>{' '}
                  Dr {selectedLandlord.name}'s {subAccountCategoryLabel[effectiveSubAccount] || fundingCategoryLabel[effectiveSubAccount] || effectiveSubAccount} sub-account
                  {expenseForm.sub_account_category && selectedCategory?.funding_category && expenseForm.sub_account_category !== selectedCategory.funding_category && (
                    <span className="ml-1 text-gray-500">(overrides category default)</span>
                  )}
                </div>
              )}
              {expenseKind === 'non_cash' && (
                <div className="pt-1.5 border-t border-gray-200 text-[11px] text-gray-500 italic">
                  Trust ledger untouched — non-cash entries don't move funds out of the landlord's sub-accounts.
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoPost}
                onChange={(e) => setAutoPost(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span>Approve and post immediately</span>
              <span className="text-xs text-gray-400">(else stays pending)</span>
            </label>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {autoPost ? 'Record & Post' : 'Save Pending'}
              </Button>
            </div>
          </div>
        </form>
        )}
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

      {/* Just-in-time Create Bank Account modal — opens from the bank-account
          dropdown so users don't have to leave the expense flow. */}
      <Modal
        isOpen={showQuickBank}
        onClose={() => setShowQuickBank(false)}
        title="Create Bank Account"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!quickBank.name) { showToast.error('Account name is required.'); return }
            if (!quickBank.gl_account) { showToast.error('Pick a GL account.'); return }
            // Suppress the unused-var warning — quickBankFor is read inside the
            // onSuccess effect of createBankMutation when invalidating queries.
            void quickBankFor
            createBankMutation.mutate(quickBank)
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Account Name"
              placeholder="e.g. Stanbic USD Operating"
              value={quickBank.name}
              onChange={(e) => setQuickBank({ ...quickBank, name: e.target.value })}
              required
            />
            <Select
              label="Type"
              value={quickBank.account_type}
              onChange={(e) => setQuickBank({ ...quickBank, account_type: e.target.value })}
              options={[
                { value: 'bank', label: 'Bank Account' },
                { value: 'mobile_money', label: 'Mobile Money' },
                { value: 'cash', label: 'Cash' },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Bank Name"
              placeholder="Stanbic Bank"
              value={quickBank.bank_name}
              onChange={(e) => setQuickBank({ ...quickBank, bank_name: e.target.value })}
            />
            <Select
              label="Currency"
              value={quickBank.currency}
              onChange={(e) => setQuickBank({ ...quickBank, currency: e.target.value })}
              options={[
                { value: 'USD', label: 'USD' },
                { value: 'ZWG', label: 'ZWG' },
              ]}
            />
          </div>
          <Input
            label="Account Number"
            placeholder="Optional"
            value={quickBank.account_number}
            onChange={(e) => setQuickBank({ ...quickBank, account_number: e.target.value })}
          />
          <AsyncSelect
            label="GL Account"
            placeholder="Map to chart-of-accounts entry"
            value={quickBank.gl_account}
            onChange={(val) => setQuickBank({ ...quickBank, gl_account: String(val) })}
            options={glAccountsList.map((a: any) => ({
              value: a.id,
              label: `${a.code} — ${a.name}`,
              description: a.account_subtype || '',
            }))}
            searchable
            required
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowQuickBank(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createBankMutation.isPending}>
              {createBankMutation.isPending ? 'Creating…' : 'Create & Use'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Just-in-time Create Supplier modal — opens from the Supplier
          dropdown so users can add e.g. City of Harare without leaving
          the expense flow. Saves, refreshes the list, auto-picks. */}
      <Modal
        isOpen={showQuickSupplier}
        onClose={() => setShowQuickSupplier(false)}
        title="New Supplier"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!quickSupplier.name.trim()) { showToast.error('Supplier name is required.'); return }
            createSupplierMutation.mutate({
              ...quickSupplier,
              default_expense_category: quickSupplier.default_expense_category
                ? Number(quickSupplier.default_expense_category)
                : null,
            })
          }}
          className="space-y-4"
        >
          <Input
            label="Supplier Name"
            placeholder="e.g. City of Harare"
            value={quickSupplier.name}
            onChange={(e) => setQuickSupplier({ ...quickSupplier, name: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Email (optional)"
              type="email"
              placeholder="billing@example.com"
              value={quickSupplier.email}
              onChange={(e) => setQuickSupplier({ ...quickSupplier, email: e.target.value })}
            />
            <Input
              label="Phone (optional)"
              placeholder="+263 …"
              value={quickSupplier.phone}
              onChange={(e) => setQuickSupplier({ ...quickSupplier, phone: e.target.value })}
            />
          </div>
          <Input
            label="Tax ID / VAT # (optional)"
            placeholder="VAT registration or business tax number"
            value={quickSupplier.tax_id}
            onChange={(e) => setQuickSupplier({ ...quickSupplier, tax_id: e.target.value })}
          />
          <Textarea
            label="Address (optional)"
            placeholder="Postal or physical address"
            value={quickSupplier.address}
            onChange={(e) => setQuickSupplier({ ...quickSupplier, address: e.target.value })}
            rows={2}
          />
          <AsyncSelect
            label="Default Expense Category (optional)"
            placeholder="Auto-fills the category when this supplier is picked"
            value={quickSupplier.default_expense_category}
            onChange={(val) => setQuickSupplier({ ...quickSupplier, default_expense_category: String(val) })}
            options={expenseCategories.map((c: any) => ({
              value: c.id,
              label: c.name,
              description: c.gl_account_code || '',
            }))}
            searchable
            clearable
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowQuickSupplier(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createSupplierMutation.isPending}>
              {createSupplierMutation.isPending ? 'Creating…' : 'Create & Use'}
            </Button>
          </div>
        </form>
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
