import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  Search,
  Plus,
  Clock,
  CheckCircle2,
  Eye,
  Send,
  Loader2,
  Trash2,
  Download,
  XCircle,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react'
import { openingBalanceApi, accountApi, landlordApi, subsidiaryApi, supplierApi } from '../../services/api'
import { formatCurrency, formatDate, cn, useDebounce } from '../../lib/utils'
import {
  PageHeader, Modal, Button, Input, Select, Badge, EmptyState,
  Skeleton, Textarea, SelectionCheckbox, BulkActionsBar, Pagination, DatePicker,
} from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'
import { exportTableData } from '../../lib/export'
import { useSelection } from '../../hooks/useSelection'
import toast from 'react-hot-toast'

const PAGE_SIZE = 25

interface OpeningBalance {
  id: number
  entry_number: string
  date: string
  target_account: number
  target_account_name: string
  target_account_code: string
  direction: 'debit' | 'credit'
  category: string
  landlord: number
  landlord_name: string
  description: string
  custom_description: string
  amount: number
  currency: string
  status: 'draft' | 'posted'
  journal: number | null
  journal_number: string | null
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
}

// Per the Opening Layer spec — the categories that lock the
// landlord-sub-account picker. Match the SubsidiaryAccount.AccountCategory
// choices on the backend.
const categoryOptions = [
  { value: 'rent', label: 'Rent' },
  { value: 'levy', label: 'Levy' },
  { value: 'special_levy', label: 'Special Levy' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'parking', label: 'Parking' },
  { value: 'rates', label: 'Rates' },
  { value: 'vat', label: 'VAT' },
]

/* Generate the default description shown in the locked field — based on
 * the spec examples in "Opening Layer .xlsx":
 *   - Dr Tenant, Cr Opening Balances           → "Opening balance — Rent Arrears"
 *   - Dr Opening Balances, Cr Tenant           → "Opening balance — Rent in Advance"
 *   - Dr Asset, Cr Opening Balances            → "Opening balance — {Account} at Net Book Value"
 *   - Dr Opening Balances, Cr {Liability}      → "Opening balance — {Account}"
 * The user can ENHANCE the description via custom_description; the
 * default itself is locked so the audit trail of where the amount
 * came from stays intact.
 */
function buildDefaultDescription(args: {
  direction: string
  targetAccount?: { name?: string; account_subtype?: string; account_type?: string }
}): string {
  const { direction, targetAccount } = args
  const tname = targetAccount?.name || 'account'
  const isTenantAccount = /tenant|receivable|debtor/i.test(tname)
  const isFixedAsset =
    targetAccount?.account_subtype === 'fixed_asset' ||
    /motor|vehicle|equipment|furniture|building/i.test(tname)

  if (direction === 'debit') {
    if (isTenantAccount) return 'Opening balance — Rent Arrears'
    if (isFixedAsset) return `Opening balance — ${tname} at Net Book Value`
    return `Opening balance — ${tname}`
  }
  // credit
  if (isTenantAccount) return 'Opening balance — Rent in Advance'
  return `Opening balance — ${tname}`
}

const directionOptions = [
  { value: 'debit', label: 'Debit - Introduce asset / receivable' },
  { value: 'credit', label: 'Credit - Introduce liability / prepayment' },
]

function SkeletonOpeningBalances() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
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

export default function OpeningBalances() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, 300)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetail, setShowDetail] = useState<OpeningBalance | null>(null)

  const selection = useSelection<number>({ clearOnChange: [debouncedSearch, statusFilter] })

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    target_account: '',
    direction: '',
    category: '',
    landlord: '',
    landlord_sub_account: '',
    tenant_sub_account: '',
    supplier: '',
    description: '',
    custom_description: '',
    amount: '',
    currency: 'USD',
  })
  // Two-step UX per the spec: form → confirmation dialog → submit.
  // showConfirm flips when the user clicks Continue on the form.
  const [showConfirm, setShowConfirm] = useState(false)

  // Fetch opening balances
  const { data: balancesData, isLoading, error } = useQuery({
    queryKey: ['opening-balances', statusFilter, debouncedSearch, currentPage],
    queryFn: async () => {
      const params: Record<string, string | number> = { page: currentPage, page_size: PAGE_SIZE }
      if (statusFilter) params.status = statusFilter
      if (debouncedSearch) params.search = debouncedSearch
      const response = await openingBalanceApi.list(params)
      return response.data
    },
    placeholderData: keepPreviousData,
  })

  const balances: OpeningBalance[] = balancesData?.results || balancesData || []
  const totalCount = balancesData?.count || balances.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, statusFilter])

  // Fetch accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts-list'],
    queryFn: () => accountApi.list().then((r: any) => r.data.results || r.data),
    staleTime: 60000,
    placeholderData: keepPreviousData,
  })

  // Fetch landlords
  const { data: landlords = [] } = useQuery({
    queryKey: ['landlords'],
    queryFn: () => landlordApi.list().then((r: any) => r.data.results || r.data),
    staleTime: 60000,
    placeholderData: keepPreviousData,
  })

  // Subsidiary accounts for the selected landlord. Used for both the
  // landlord-sub-account picker (filtered by category — the spec calls
  // this "category lock") and the optional tenant-sub-account picker.
  const { data: subsidiaryAccounts = [] } = useQuery({
    queryKey: ['subsidiary-accounts', form.landlord],
    queryFn: () =>
      subsidiaryApi
        .list({ landlord: form.landlord, page_size: 500 })
        .then((r: any) => r.data.results || r.data),
    enabled: !!form.landlord,
    staleTime: 30000,
  })

  // Suppliers — the list of creditor entities this landlord could owe
  // (Apex Finance, ZESA, City of Harare, etc.). Used to attach a
  // supplier dimension to liability-side opening balances so reports
  // can show "this landlord owes Apex Finance $X total".
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => supplierApi.list({ page_size: 500 }).then((r: any) => r.data.results || r.data),
    staleTime: 60000,
    placeholderData: keepPreviousData,
  })

  // Resolve the picked target account so the default description can
  // inspect its name + subtype.
  const selectedTargetAccount = (accounts as any[]).find(
    (a: any) => String(a.id) === String(form.target_account),
  )

  // Auto-default description: rebuild whenever the direction or target
  // account changes. The user's custom_description stays intact.
  useEffect(() => {
    if (!form.direction || !form.target_account) return
    const next = buildDefaultDescription({
      direction: form.direction,
      targetAccount: selectedTargetAccount,
    })
    setForm((prev) => (prev.description === next ? prev : { ...prev, description: next }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.direction, form.target_account, accounts])

  // Sub-accounts filtered by the selected category AND currency.
  // The spec calls this "category lock" — Landlord Rent sub-account
  // must match a Rent Lessor's Accrual Account. Currency lock applies
  // because each landlord has separate sub-accounts per currency
  // (e.g. Rent USD, Rent ZWG): selecting USD must hide ZWG ones.
  const filteredLandlordSubAccounts = (subsidiaryAccounts as any[]).filter((s: any) => {
    // Skip non-landlord sub-accounts (tenants, account holders).
    const kind = s.account_kind || s.entity_type
    if (kind && kind !== 'landlord') return false
    if (form.category && s.category !== form.category) return false
    if (form.currency && s.currency && s.currency !== form.currency) return false
    return true
  })

  // Tenant sub-accounts — for arrears / prepayment cases. Filter by
  // currency too so a USD opening balance doesn't show a ZWG tenant
  // account by accident.
  const filteredTenantSubAccounts = (subsidiaryAccounts as any[]).filter((s: any) => {
    const kind = s.account_kind || s.entity_type
    if (kind && kind !== 'tenant' && kind !== 'account_holder') return false
    if (form.currency && s.currency && s.currency !== form.currency) return false
    return true
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => openingBalanceApi.create(data),
    onSuccess: () => {
      showToast.success('Opening balance created')
      queryClient.invalidateQueries({ queryKey: ['opening-balances'] })
      setShowCreateModal(false)
      resetForm()
    },
    onError: (err) => showToast.error(parseApiError(err)),
  })

  // Post to ledger mutation
  const postMutation = useMutation({
    mutationFn: (id: number) => openingBalanceApi.postToLedger(id),
    onSuccess: () => {
      toast.success('Opening balance posted to ledger')
      queryClient.invalidateQueries({ queryKey: ['opening-balances'] })
    },
    onError: () => toast.error('Failed to post opening balance'),
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => openingBalanceApi.delete(id),
    onSuccess: () => {
      showToast.success('Opening balance deleted')
      queryClient.invalidateQueries({ queryKey: ['opening-balances'] })
    },
    onError: (err) => showToast.error(parseApiError(err)),
  })

  const resetForm = () => {
    setForm({
      date: new Date().toISOString().split('T')[0],
      target_account: '',
      direction: '',
      category: '',
      landlord: '',
      landlord_sub_account: '',
      tenant_sub_account: '',
      supplier: '',
      description: '',
      custom_description: '',
      amount: '',
      currency: 'USD',
    })
    setShowConfirm(false)
  }

  // Form Continue → opens the confirmation dialog. Final submit happens
  // from the confirmation step so the user can review the journal entry
  // before it posts.
  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault()
    setShowConfirm(true)
  }

  const handleConfirmSubmit = () => {
    const data: Record<string, unknown> = {
      date: form.date,
      target_account: parseInt(form.target_account),
      direction: form.direction,
      category: form.category,
      landlord: parseInt(form.landlord),
      description: form.description,
      custom_description: form.custom_description,
      amount: form.amount,
      currency: form.currency,
    }
    if (form.landlord_sub_account) {
      data.landlord_sub_account = parseInt(form.landlord_sub_account)
    }
    if (form.tenant_sub_account) {
      data.tenant_sub_account = parseInt(form.tenant_sub_account)
    }
    if (form.supplier) {
      data.supplier = parseInt(form.supplier)
    }
    createMutation.mutate(data)
  }

  const stats = {
    total: totalCount,
    draft: balances.filter(b => b.status === 'draft').length,
    posted: balances.filter(b => b.status === 'posted').length,
  }

  const selectableItems = balances.filter((b: any) => !b._isOptimistic)
  const pageIds = selectableItems.map(b => b.id)

  const handleBulkExport = () => {
    const selected = selectableItems.filter(b => selection.isSelected(b.id))
    exportTableData(selected, [
      { key: 'entry_number', header: 'Entry Number' },
      { key: 'date', header: 'Date' },
      { key: 'target_account_name', header: 'Target Account' },
      { key: 'direction', header: 'Direction' },
      { key: 'category', header: 'Category' },
      { key: 'landlord_name', header: 'Landlord' },
      { key: 'amount', header: 'Amount' },
      { key: 'status', header: 'Status' },
    ], 'opening_balances_export')
    showToast.success(`Exported ${selected.length} opening balances`)
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <PageHeader
          title="Opening Balances"
          subtitle="Takeover opening balance entries"
          icon={BookOpen}
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Opening Balances' },
          ]}
        />
        <SkeletonOpeningBalances />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <PageHeader
          title="Opening Balances"
          subtitle="Takeover opening balance entries"
          icon={BookOpen}
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Opening Balances' },
          ]}
        />
        <EmptyState
          icon={XCircle}
          title="Failed to load opening balances"
          description="There was an error loading opening balance entries."
          action={
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['opening-balances'] })}>
              Try Again
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Opening Balances"
        subtitle={`${totalCount} total entries`}
        icon={BookOpen}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Opening Balances' },
        ]}
        actions={
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Opening Balance
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gray-100 rounded-lg">
              <BookOpen className="h-5 w-5 text-gray-600" />
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
            placeholder="Search opening balances..."
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
      {balances.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No opening balances found"
          description="Create your first opening balance entry to introduce takeover balances."
          action={
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Opening Balance
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
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Entry Number</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Target Account</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Direction</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Landlord</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Amount</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {balances.map((balance, index) => {
                    const config = statusConfig[balance.status]
                    const StatusIcon = config.icon
                    return (
                      <motion.tr
                        key={balance.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ delay: index * 0.02 }}
                        onClick={() => setShowDetail(balance)}
                        className={cn(
                          'border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50/50',
                          selection.isSelected(balance.id) && 'bg-primary-50/30'
                        )}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <SelectionCheckbox
                            checked={selection.isSelected(balance.id)}
                            onChange={() => selection.toggle(balance.id)}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{balance.entry_number}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(balance.date)}</td>
                        <td className="px-4 py-3 text-gray-600">
                          <span className="text-xs text-gray-400 mr-1">{balance.target_account_code}</span>
                          {balance.target_account_name}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                            balance.direction === 'debit'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-purple-50 text-purple-700'
                          )}>
                            {balance.direction === 'debit' ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <ArrowDownLeft className="w-3 h-3" />
                            )}
                            {balance.direction === 'debit' ? 'Debit' : 'Credit'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 capitalize">{balance.category?.replace('_', ' ')}</td>
                        <td className="px-4 py-3 text-gray-600">{balance.landlord_name}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatCurrency(balance.amount, balance.currency)}
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
                            {balance.status === 'draft' && (
                              <>
                                <button
                                  onClick={() => postMutation.mutate(balance.id)}
                                  disabled={postMutation.isPending}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                  title="Post to ledger"
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => deleteMutation.mutate(balance.id)}
                                  disabled={deleteMutation.isPending}
                                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => setShowDetail(balance)}
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

      {/* Create Modal — two-step wizard:
            Step 1: form (PreContinue button)
            Step 2: confirmation dialog (Submit button)
          The confirmation dialog renders the implied journal entry
          (Dr X / Cr Y) so the user can verify the posting before it hits the GL. */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); resetForm() }}
        title={showConfirm ? 'Confirm Opening Balance' : 'New Opening Balance'}
        size="lg"
      >
        {showConfirm ? (
          <OpeningBalanceConfirm
            form={form}
            selectedTargetAccount={selectedTargetAccount}
            landlordName={(landlords as any[]).find((l: any) => String(l.id) === form.landlord)?.name || ''}
            isPending={createMutation.isPending}
            onBack={() => setShowConfirm(false)}
            onConfirm={handleConfirmSubmit}
          />
        ) : (
        <form onSubmit={handleContinue} className="space-y-4">
          {/* Step 1: Date + Currency */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DatePicker
              label="Date"
              value={form.date}
              onChange={(v) => setForm({ ...form, date: v })}
              required
            />
            <Select
              label="Currency"
              value={form.currency}
              onChange={(e) => setForm({
                ...form,
                currency: e.target.value,
                // Reset sub-account picks because they're currency-specific
                // (each landlord has separate sub-accounts per currency).
                landlord_sub_account: '',
                tenant_sub_account: '',
              })}
              options={[
                { value: 'USD', label: 'USD' },
                { value: 'ZWG', label: 'ZWG' },
                { value: 'ZAR', label: 'ZAR' },
              ]}
            />
          </div>

          {/* Step 2: Target Account — filtered to Assets + Liabilities only.
              Per spec, the only valid target sides are introducing an asset
              (Dr Asset, Cr Opening) or a liability (Cr Liability, Dr Opening).
              Suppliers are tagged via the Supplier picker below; the system
              still records a liability account for the OB. */}
          <Select
            label="Target Account"
            value={form.target_account}
            onChange={(e) => setForm({ ...form, target_account: e.target.value })}
            placeholder="Select an Asset or Liability account..."
            options={[
              ...accounts
                .filter((a: any) => a.account_type === 'asset')
                .map((a: any) => ({
                  value: String(a.id),
                  label: `Asset · ${a.code} - ${a.name}`,
                })),
              ...accounts
                .filter((a: any) => a.account_type === 'liability')
                .map((a: any) => ({
                  value: String(a.id),
                  label: `Liability · ${a.code} - ${a.name}`,
                })),
            ]}
            hint="The other side is always '9000 — Opening Balances'. Use the Supplier picker below to tag a creditor (Apex Finance etc.)."
            required
          />

          {/* Step 3: Direction */}
          <Select
            label="Direction"
            value={form.direction}
            onChange={(e) => setForm({ ...form, direction: e.target.value })}
            placeholder="Select direction..."
            options={directionOptions.map(o => ({ value: o.value, label: o.label }))}
            required
          />

          {/* Step 4: Category — locks the landlord-sub-account picker
              below to entries of the same category (Rent / Levy / etc.) */}
          <Select
            label="Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value, landlord_sub_account: '' })}
            placeholder="Select category..."
            options={categoryOptions.map(o => ({ value: o.value, label: o.label }))}
            hint="Locks the landlord sub-account to entries of this category"
            required
          />

          {/* Step 5: Landlord (the dimension that scopes reporting) */}
          <Select
            label="Landlord"
            value={form.landlord}
            onChange={(e) => setForm({ ...form, landlord: e.target.value, landlord_sub_account: '', tenant_sub_account: '' })}
            placeholder="Select landlord..."
            options={landlords.map((l: any) => ({ value: String(l.id), label: l.name }))}
            required
          />

          {/* Step 6: Landlord Sub-Account (filtered by category for
              category-lock; only shown once a landlord is picked) */}
          {form.landlord && (
            <Select
              label="Landlord Sub-Account"
              value={form.landlord_sub_account}
              onChange={(e) => setForm({ ...form, landlord_sub_account: e.target.value })}
              placeholder={
                filteredLandlordSubAccounts.length === 0
                  ? form.category
                    ? `No ${form.category} sub-accounts for this landlord`
                    : 'Select a category to filter sub-accounts'
                  : 'Select sub-account...'
              }
              options={filteredLandlordSubAccounts.map((s: any) => ({
                value: String(s.id),
                label: `${s.account_number || s.code || ''} ${s.name}`.trim(),
              }))}
              hint="The landlord sub-account that mirrors this entry (for per-landlord reporting)"
            />
          )}

          {/* Step 7: Tenant Sub-Account — optional, for tenant arrears
              or rent-in-advance scenarios */}
          {form.landlord && filteredTenantSubAccounts.length > 0 && (
            <Select
              label="Tenant Sub-Account (optional)"
              value={form.tenant_sub_account}
              onChange={(e) => setForm({ ...form, tenant_sub_account: e.target.value })}
              placeholder="None — skip"
              options={[
                { value: '', label: 'None — skip' },
                ...filteredTenantSubAccounts.map((s: any) => ({
                  value: String(s.id),
                  label: `${s.account_number || s.code || ''} ${s.name}`.trim(),
                })),
              ]}
              hint="Only set when introducing tenant rent arrears or prepayment"
            />
          )}

          {/* Step 7b: Supplier — optional. Tag the OB with the creditor
              entity (Apex Finance loan, ZESA arrears, etc.) so the
              landlord's reports can roll up "amount owed per supplier". */}
          {form.landlord && (suppliers as any[]).length > 0 && (
            <Select
              label="Supplier / Creditor (optional)"
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              placeholder="None — skip"
              options={[
                { value: '', label: 'None — skip' },
                ...(suppliers as any[]).map((s: any) => ({
                  value: String(s.id),
                  label: `${s.code || ''} ${s.name}`.trim(),
                })),
              ]}
              hint="Set for liability-side OBs (e.g. Apex Finance loan) so the landlord's reports show who they owe."
            />
          )}

          {/* Step 8: Default description (LOCKED — auto-generated from
              the account pair). Per spec: cannot be deleted; user can
              ENHANCE via the Custom Description field below. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Default Description
              <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-400 font-normal">
                Locked — auto-generated
              </span>
            </label>
            <div className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 font-medium">
              {form.description || (
                <span className="text-gray-400 italic">
                  Pick a target account and direction to generate the default description.
                </span>
              )}
            </div>
          </div>

          <Input
            label="Custom Description (optional)"
            value={form.custom_description}
            onChange={(e) => setForm({ ...form, custom_description: e.target.value })}
            placeholder="e.g. Apex Finance loan — Takeover balance"
            hint="Enhances the default description; both are kept on the journal entry"
          />

          {/* Step 9: Amount */}
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
            <Button type="submit" className="gap-2">
              Continue →
            </Button>
          </div>
        </form>
        )}
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={!!showDetail}
        onClose={() => setShowDetail(null)}
        title={showDetail ? `Opening Balance ${showDetail.entry_number}` : ''}
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
                <p className="text-sm text-gray-500">Target Account</p>
                <p className="font-medium">{showDetail.target_account_code} - {showDetail.target_account_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Direction</p>
                <span className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                  showDetail.direction === 'debit'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-purple-50 text-purple-700'
                )}>
                  {showDetail.direction === 'debit' ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownLeft className="w-3 h-3" />
                  )}
                  {showDetail.direction === 'debit' ? 'Debit' : 'Credit'}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Category</p>
                <p className="font-medium capitalize">{showDetail.category?.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Landlord</p>
                <p className="font-medium">{showDetail.landlord_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Amount</p>
                <p className="font-medium text-lg">{formatCurrency(showDetail.amount, showDetail.currency)}</p>
              </div>
              {showDetail.journal_number && (
                <div>
                  <p className="text-sm text-gray-500">Journal</p>
                  <p className="font-medium">{showDetail.journal_number}</p>
                </div>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500">Description</p>
              <p className="font-medium">{showDetail.description}</p>
              {showDetail.custom_description && (
                <p className="text-sm text-gray-600 mt-1">{showDetail.custom_description}</p>
              )}
            </div>
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
              <Button variant="ghost" onClick={() => setShowDetail(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}



/* OpeningBalanceConfirm — step 2 of the create wizard.
 * Renders the implied journal entry (Dr X / Cr Opening Balances or
 * the reverse) so the user can sanity-check the posting before it
 * hits the GL. The other side is always Opening Balances (9000),
 * resolved per the doc spec. */
function OpeningBalanceConfirm({
  form,
  selectedTargetAccount,
  landlordName,
  isPending,
  onBack,
  onConfirm,
}: {
  form: any
  selectedTargetAccount: any
  landlordName: string
  isPending: boolean
  onBack: () => void
  onConfirm: () => void
}) {
  const isDebit = form.direction === "debit"
  const targetLabel = selectedTargetAccount
    ? `${selectedTargetAccount.code} - ${selectedTargetAccount.name}`
    : "Target account"
  const openingLabel = "9000 - Opening Balances"

  const dr = isDebit ? targetLabel : openingLabel
  const cr = isDebit ? openingLabel : targetLabel
  const amount = Number(form.amount || 0).toFixed(2)
  const finalDescription = form.custom_description
    ? `${form.description} — ${form.custom_description}`
    : form.description

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">✓</span>
        <span>Form complete</span>
        <span className="text-gray-300">›</span>
        <span className="font-semibold text-gray-700">Review &amp; confirm</span>
      </div>

      <p className="text-sm text-gray-600 leading-relaxed">
        Review the journal entry below. Once posted to the ledger, this entry
        becomes part of the landlord&apos;s permanent balance-sheet record.
      </p>

      {/* Journal entry preview */}
      <div className="bg-gray-50/60 rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider font-bold text-gray-700">
            Journal Entry
          </span>
          <span className="text-xs text-gray-500 tabular-nums">{form.date}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-5 py-2 text-[10px] tracking-wider uppercase font-semibold text-gray-500">Account</th>
              <th className="text-right px-5 py-2 text-[10px] tracking-wider uppercase font-semibold text-gray-500 w-32">Debit</th>
              <th className="text-right px-5 py-2 text-[10px] tracking-wider uppercase font-semibold text-gray-500 w-32">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <tr>
              <td className="px-5 py-3 font-medium text-gray-900">{dr}</td>
              <td className="px-5 py-3 text-right tabular-nums font-bold text-gray-900">{amount}</td>
              <td className="px-5 py-3"></td>
            </tr>
            <tr>
              <td className="px-5 py-3 pl-9 text-gray-700">{cr}</td>
              <td className="px-5 py-3"></td>
              <td className="px-5 py-3 text-right tabular-nums font-bold text-gray-900">{amount}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Particulars */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Landlord</div>
          <div className="font-medium text-gray-900 mt-0.5">{landlordName || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Category</div>
          <div className="font-medium text-gray-900 mt-0.5 capitalize">{(form.category || "").replace("_", " ") || "—"}</div>
        </div>
        <div className="col-span-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Description</div>
          <div className="font-medium text-gray-700 mt-0.5">{finalDescription || "—"}</div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <Button type="button" variant="ghost" onClick={onBack} disabled={isPending}>
          ← Back
        </Button>
        <Button type="button" onClick={onConfirm} disabled={isPending} className="gap-2">
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Confirm &amp; Post to Ledger
        </Button>
      </div>
    </div>
  )
}
