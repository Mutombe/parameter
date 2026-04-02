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
import { openingBalanceApi, accountApi, landlordApi } from '../../services/api'
import { formatCurrency, formatDate, cn, useDebounce } from '../../lib/utils'
import {
  PageHeader, Modal, Button, Input, Select, Badge, EmptyState,
  Skeleton, Textarea, SelectionCheckbox, BulkActionsBar, Pagination,
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

const categoryOptions = [
  { value: 'rent', label: 'Rent' },
  { value: 'levy', label: 'Levy' },
  { value: 'special_levy', label: 'Special Levy' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'parking', label: 'Parking' },
  { value: 'rates', label: 'Rates' },
]

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
    description: '',
    custom_description: '',
    amount: '',
    currency: 'USD',
  })

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
  })

  // Fetch landlords
  const { data: landlords = [] } = useQuery({
    queryKey: ['landlords'],
    queryFn: () => landlordApi.list().then((r: any) => r.data.results || r.data),
    staleTime: 60000,
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
      target_account: parseInt(form.target_account),
      direction: form.direction,
      category: form.category,
      landlord: parseInt(form.landlord),
      description: form.description,
      custom_description: form.custom_description,
      amount: form.amount,
      currency: form.currency,
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
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
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
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
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
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
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

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); resetForm() }}
        title="New Opening Balance"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Step 1: Date */}
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

          {/* Step 2: Target Account */}
          <Select
            label="Target Account"
            value={form.target_account}
            onChange={(e) => setForm({ ...form, target_account: e.target.value })}
            placeholder="Select target account..."
            options={accounts.map((a: any) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
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

          {/* Step 4: Category */}
          <Select
            label="Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="Select category..."
            options={categoryOptions.map(o => ({ value: o.value, label: o.label }))}
            required
          />

          {/* Step 5: Landlord */}
          <Select
            label="Landlord"
            value={form.landlord}
            onChange={(e) => setForm({ ...form, landlord: e.target.value })}
            placeholder="Select landlord..."
            options={landlords.map((l: any) => ({ value: String(l.id), label: l.name }))}
            required
          />

          {/* Step 6: Description + Custom Description */}
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Enter description..."
            required
          />

          <Input
            label="Custom Description"
            value={form.custom_description}
            onChange={(e) => setForm({ ...form, custom_description: e.target.value })}
            placeholder="Optional custom description..."
          />

          {/* Step 7: Amount */}
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
              Create Opening Balance
            </Button>
          </div>
        </form>
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
