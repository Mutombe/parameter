import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Search, CreditCard, Plus, Send, Loader2, Eye, X, User, Download, Printer, BookOpen } from 'lucide-react'
import { receiptApi, tenantApi, invoiceApi, leaseApi } from '../../services/api'
import { formatCurrency, formatDate, useDebounce, cn } from '../../lib/utils'
import { EmptyTableState, PageHeader, Modal, Button, Input, Select, Textarea, SelectionCheckbox, BulkActionsBar, Tooltip, Pagination } from '../../components/ui'
import { PayerSelect } from '../../components/PayerSelect'
import { PayerCell } from '../../components/PayerCell'
import { AutocompleteInput } from '../../components/ui/AutocompleteInput'
import { exportTableData } from '../../lib/export'
import { useSelection } from '../../hooks/useSelection'
import { useBulkLoading } from '../../hooks/useBulkLoading'
import { useHotkeys } from '../../hooks/useHotkeys'
import { usePrefetch } from '../../hooks/usePrefetch'
import { useRecentValues } from '../../hooks/useRecentValues'
import { AsyncSelect } from '../../components/ui/AsyncSelect'
import { Skeleton, OptimisticItemSkeleton } from '../../components/ui/Skeleton'
import { showToast, parseApiError } from '../../lib/toast'

const PAGE_SIZE = 25

interface Receipt {
  id: number | string
  receipt_number: string
  tenant: number
  tenant_name: string
  invoice?: number
  invoice_number?: string
  income_type_name?: string
  date: string
  amount: number
  payment_method: string
  reference: string
  description: string
  journal?: number
  journal_number?: string
  _isOptimistic?: boolean
}

const methodLabels: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  ecocash: 'EcoCash',
  card: 'Card',
  cheque: 'Cheque',
}

export default function Receipts() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [currentPage, setCurrentPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null)
  const [postingId, setPostingId] = useState<number | null>(null)
  const selection = useSelection<number | string>({ clearOnChange: [debouncedSearch] })
  const bulkLoading = useBulkLoading()
  const prefetch = usePrefetch()

  const searchInputRef = useRef<HTMLInputElement>(null)
  useHotkeys([
    { key: 'c', handler: () => setShowForm(true) },
    { key: '/', handler: (e) => { e.preventDefault(); searchInputRef.current?.focus() } },
  ])

  const recentPaymentMethod = useRecentValues('receipt_payment_method', 1)

  const [form, setForm] = useState({
    tenant: '',
    invoice: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    payment_method: recentPaymentMethod.values[0] || 'bank_transfer',
    reference: '',
    description: '',
  })

  // Just-in-time invoice creation from inside the receipt modal — opens a
  // small inline form pre-filled with the selected payer.
  const [showQuickInvoice, setShowQuickInvoice] = useState(false)
  const [quickInvoice, setQuickInvoice] = useState({
    lease: '',
    invoice_type: 'rent',
    date: new Date().toISOString().split('T')[0],
    due_date: '',
    amount: '',
    description: '',
  })

  const { data: receiptsData, isLoading } = useQuery({
    queryKey: ['receipts', debouncedSearch, currentPage],
    queryFn: () => receiptApi.list({ search: debouncedSearch, page: currentPage, page_size: PAGE_SIZE }).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  const receipts = receiptsData?.results || receiptsData || []
  const totalCount = receiptsData?.count || receipts.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch])

  // Tenants dropdown - loads when form opens
  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants-select'],
    queryFn: () => tenantApi.list().then(r => r.data.results || r.data),
    staleTime: 30000,
    placeholderData: keepPreviousData,
  })

  // Invoices dropdown - loads when form opens
  // Fetch all invoices and filter for those with outstanding balance
  const { data: allInvoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices-for-receipt'],
    queryFn: () => invoiceApi.list().then(r => r.data.results || r.data),
    staleTime: 30000,
    placeholderData: keepPreviousData,
  })

  // Filter invoices with outstanding balance (sent, partial, or overdue with balance > 0)
  const invoices = allInvoices?.filter((inv: any) =>
    ['sent', 'partial', 'overdue'].includes(inv.status) && Number(inv.balance) > 0
  )

  // Active leases for the selected payer — feeds the quick-invoice modal.
  const { data: payerLeases } = useQuery({
    queryKey: ['payer-active-leases', form.tenant],
    queryFn: () => leaseApi.list({ tenant: form.tenant, status: 'active', page_size: 50 })
      .then(r => r.data.results || r.data),
    enabled: !!form.tenant && showQuickInvoice,
    staleTime: 30000,
  })
  const activePayerLeases: any[] = Array.isArray(payerLeases) ? payerLeases : (payerLeases?.results || [])

  // Auto-select the only active lease when the quick-invoice modal opens.
  useEffect(() => {
    if (!showQuickInvoice) return
    if (activePayerLeases.length === 1 && !quickInvoice.lease) {
      setQuickInvoice(prev => ({ ...prev, lease: String(activePayerLeases[0].id) }))
    }
  }, [showQuickInvoice, activePayerLeases])

  const createInvoiceMutation = useMutation({
    mutationFn: (data: any) => invoiceApi.create(data),
    onSuccess: (response) => {
      const newInv = response?.data
      showToast.success('Invoice created — selected for this payment')
      // Auto-pick the new invoice on the receipt form so the user resumes.
      if (newInv?.id) {
        setForm(prev => ({
          ...prev,
          invoice: String(newInv.id),
          amount: prev.amount || String(Number(newInv.balance ?? newInv.total_amount ?? 0).toFixed(2)),
        }))
      }
      queryClient.invalidateQueries({ queryKey: ['invoices-for-receipt'] })
      queryClient.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey[0] as string
        return key === 'invoices' || key.startsWith('invoice')
      }})
      setShowQuickInvoice(false)
      setQuickInvoice({
        lease: '',
        invoice_type: 'rent',
        date: new Date().toISOString().split('T')[0],
        due_date: '',
        amount: '',
        description: '',
      })
    },
    onError: (err) => showToast.error(parseApiError(err, 'Failed to create invoice')),
  })

  // Auto-fill amount when invoice is selected
  useEffect(() => {
    if (form.invoice && invoices) {
      const inv = invoices.find((i: any) => String(i.id) === form.invoice)
      if (inv && !form.amount) {
        setForm(prev => ({ ...prev, amount: String(Number(inv.balance).toFixed(2)) }))
      }
    }
  }, [form.invoice])

  // Optimistic create mutation
  const createMutation = useMutation({
    mutationFn: (data: typeof form) => receiptApi.create(data),
    onMutate: async (newData) => {
      // Close modal immediately (optimistic)
      setShowForm(false)
      resetForm()

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['receipts'] })

      // Snapshot previous data
      const previousReceipts = queryClient.getQueryData(['receipts', debouncedSearch, currentPage])

      // Optimistically add new receipt with loading state
      const optimisticReceipt: Receipt = {
        id: `temp-${Date.now()}`,
        receipt_number: 'Creating...',
        tenant: Number(newData.tenant),
        tenant_name: tenants?.find((t: any) => t.id === Number(newData.tenant))?.name || 'Loading...',
        invoice: newData.invoice ? Number(newData.invoice) : undefined,
        date: newData.date,
        amount: Number(newData.amount),
        payment_method: newData.payment_method,
        reference: newData.reference,
        description: newData.description,
        _isOptimistic: true,
      }

      queryClient.setQueryData(['receipts', debouncedSearch, currentPage], (old: any) => {
        if (!old) return old
        if (old.results) {
          return { ...old, results: [optimisticReceipt, ...old.results] }
        }
        return Array.isArray(old) ? [optimisticReceipt, ...old] : old
      })

      return { previousReceipts }
    },
    onSuccess: () => {
      showToast.success('Receipt recorded successfully')
      queryClient.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey[0] as string
        return key === 'receipts' || key.startsWith('receipt')
      }})
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error: any, newData, context) => {
      // Rollback on error
      if (context?.previousReceipts) {
        queryClient.setQueryData(['receipts', debouncedSearch, currentPage], context.previousReceipts)
      }
      console.error('[RECEIPT CREATE] Error:', error)
      console.error('[RECEIPT CREATE] Response:', error?.response?.status, error?.response?.data)
      console.error('[RECEIPT CREATE] Submitted data:', newData)
      const msg = parseApiError(error, 'Failed to record receipt')
      showToast.error(msg)
    },
  })

  const postMutation = useMutation({
    mutationFn: (id: number) => receiptApi.postToLedger(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey[0] as string
        return key === 'receipts' || key.startsWith('receipt')
      }})
      showToast.success('Receipt posted to ledger')
      setPostingId(null)
    },
    onError: (error) => {
      showToast.error(parseApiError(error, 'Failed to post receipt'))
      setPostingId(null)
    },
  })

  const resetForm = () => {
    setForm({
      tenant: '',
      invoice: '',
      date: new Date().toISOString().split('T')[0],
      amount: '',
      payment_method: recentPaymentMethod.values[0] || 'bank_transfer',
      reference: '',
      description: '',
    })
  }

  const handlePost = (id: number) => {
    setPostingId(id)
    postMutation.mutate(id)
  }

  const handleViewDetails = (receipt: Receipt) => {
    navigate(`/dashboard/receipts/${receipt.id}`)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(form)
  }

  // Stats
  const stats = {
    total: totalCount,
    totalAmount: receipts.reduce((sum: number, r: Receipt) => sum + Number(r.amount || 0), 0),
    posted: receipts.filter((r: Receipt) => r.journal).length,
    unposted: receipts.filter((r: Receipt) => !r.journal).length,
  }

  const selectableItems = (receipts || []).filter((r: any) => !r._isOptimistic)
  const pageIds = selectableItems.map((r: any) => r.id)

  const handleBulkExport = () => {
    const selected = selectableItems.filter((r: any) => selection.isSelected(r.id))
    exportTableData(selected, [
      { key: 'receipt_number', header: 'Receipt Number' },
      { key: 'tenant_name', header: 'Payer' },
      { key: 'amount', header: 'Amount' },
      { key: 'payment_method', header: 'Payment Method' },
      { key: 'date', header: 'Date' },
      { key: 'reference', header: 'Reference' },
    ], 'receipts_export')
    showToast.success(`Exported ${selected.length} receipts`)
  }

  const handleBulkPost = () => {
    const ids = Array.from(selection.selectedIds)
    bulkLoading.run('post', async () => {
      let posted = 0
      for (const id of ids) {
        try { await receiptApi.postToLedger(id as number); posted++ } catch {}
      }
      selection.clearSelection()
      queryClient.invalidateQueries({ queryKey: ['receipts'] })
      showToast.success(`Posted ${posted} receipts to ledger`)
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipts"
        subtitle="Record and manage payment receipts"
        icon={CreditCard}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Receipts' },
        ]}
        actions={
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Record Receipt
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Receipts</p>
              {isLoading ? (
                <Skeleton className="h-7 w-12 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-5 text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-emerald-100 text-sm">Total Collected</p>
              {isLoading ? (
                <Skeleton className="h-7 w-24 mt-1 bg-white/30" />
              ) : (
                <p className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search receipts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Receipts Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-sm border-b-2 border-gray-100">
            <tr>
              <th className="px-4 py-3.5 w-10">
                <SelectionCheckbox
                  checked={selection.isAllPageSelected(pageIds)}
                  indeterminate={selection.isPartialPageSelected(pageIds)}
                  onChange={() => selection.selectPage(pageIds)}
                />
              </th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Receipt</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Payer</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Paid For</th>
              <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Method</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden xl:table-cell">Reference</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">GL Posted</th>
              <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-3.5 w-10"><Skeleton className="h-4 w-4" /></td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-emerald-600" />
                      </div>
                      <Skeleton className="h-4 w-28" />
                    </div>
                  </td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-5 w-24 rounded-full" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-28" /></td>
                  <td className="px-5 py-3.5 hidden xl:table-cell"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-8 w-16" /></td>
                  <td className="px-5 py-3.5 hidden lg:table-cell"><Skeleton className="h-8 w-8" /></td>
                </tr>
              ))
            ) : !receipts.length ? (
              <EmptyTableState
                title="No receipts yet"
                description="Record your first payment receipt to track tenant payments."
                action={{
                  label: 'Record Receipt',
                  onClick: () => setShowForm(true)
                }}
              />
            ) : (
              receipts.map((receipt: Receipt, index: number) => (
                <motion.tr
                  key={receipt.id}
                  initial={receipt._isOptimistic ? { opacity: 0.5, backgroundColor: 'rgb(239 246 255)' } : { opacity: 0 }}
                  animate={{ opacity: 1, backgroundColor: 'transparent' }}
                  transition={{ duration: 0.3 }}
                  onClick={() => !receipt._isOptimistic && navigate(`/dashboard/receipts/${receipt.id}`)}
                  onMouseEnter={() => !receipt._isOptimistic && prefetch(`/dashboard/receipts/${receipt.id}`)}
                  className={cn(
                    'hover:bg-gray-50 transition-colors group',
                    !receipt._isOptimistic && 'cursor-pointer',
                    receipt._isOptimistic && 'bg-blue-50',
                    selection.isSelected(receipt.id) && 'bg-primary-50'
                  )}
                >
                  <td className="px-4 py-3.5 w-10" onClick={(e) => e.stopPropagation()}>
                    {!receipt._isOptimistic && (
                      <SelectionCheckbox
                        checked={selection.isSelected(receipt.id)}
                        onChange={() => selection.toggle(receipt.id)}
                      />
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        receipt._isOptimistic ? 'bg-blue-100' : 'bg-emerald-100'
                      )}>
                        {receipt._isOptimistic ? (
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        ) : (
                          <CreditCard className="w-5 h-5 text-emerald-600" />
                        )}
                      </div>
                      <span className={cn(
                        'font-medium',
                        receipt._isOptimistic ? 'text-blue-600' : 'text-gray-900'
                      )}>
                        {receipt._isOptimistic ? 'Creating...' : receipt.receipt_number}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {(() => {
                      const isLevy = (receipt as any).payer_type === 'levy'
                      const route = isLevy
                        ? `/dashboard/account-holders/${receipt.tenant}`
                        : `/dashboard/tenants/${receipt.tenant}`
                      return (
                        <PayerCell
                          name={receipt.tenant_name}
                          code={(receipt as any).tenant_code}
                          payerType={(receipt as any).payer_type}
                          onClick={receipt.tenant ? () => navigate(route) : undefined}
                          onMouseEnter={receipt.tenant ? () => prefetch(route) : undefined}
                        />
                      )
                    })()}
                  </td>
                  <td className="px-5 py-3.5">
                    {receipt.income_type_name ? (
                      <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                        {receipt.income_type_name}
                      </span>
                    ) : (
                      <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">General</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-emerald-600" title={String(receipt.amount)}>{formatCurrency(receipt.amount || 0)}</td>
                  <td className="px-5 py-3.5">
                    <Tooltip content={`${methodLabels[receipt.payment_method] || receipt.payment_method}${receipt.reference ? ' - Ref: ' + receipt.reference : ''}`}>
                      <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 bg-gray-100 rounded-full text-xs">
                        {methodLabels[receipt.payment_method] || receipt.payment_method}
                      </span>
                    </Tooltip>
                  </td>
                  <td className="px-5 py-3.5 text-gray-900 hidden xl:table-cell">{receipt.reference || '\u2014'}</td>
                  <td className="px-5 py-3.5 text-gray-900">{receipt.date ? formatDate(receipt.date) : '\u2014'}</td>
                  <td className="px-5 py-3.5 hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                    {receipt._isOptimistic ? (
                      <span className="text-blue-600 text-sm">Processing...</span>
                    ) : receipt.journal ? (
                      <Tooltip content="Posted to general ledger">
                        <button
                          onClick={() => navigate(`/dashboard/journals/${receipt.journal}`)}
                          onMouseEnter={() => prefetch(`/dashboard/journals/${receipt.journal}`)}
                          className="text-green-600 hover:text-green-700 hover:underline text-sm"
                        >
                          {receipt.journal_number || ''}
                        </button>
                      </Tooltip>
                    ) : (
                      <button
                        onClick={() => handlePost(receipt.id as number)}
                        disabled={postingId === receipt.id}
                        className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
                      >
                        {postingId === receipt.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Posting...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" /> Post
                          </>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                    {!receipt._isOptimistic && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleViewDetails(receipt)}
                          onMouseEnter={() => prefetch(`/dashboard/receipts/${receipt.id}`)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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

      {/* Create Receipt Modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); resetForm(); }}
        title="Record Receipt"
        icon={Plus}
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Payer Select — covers both Tenants and Account Holders */}
          <PayerSelect
            value={form.tenant}
            onChange={(val) => setForm({ ...form, tenant: String(val) })}
            required
          />

          {/* Invoice Select */}
          <AsyncSelect
            label="Apply to Invoice (optional)"
            placeholder="Select invoice"
            value={form.invoice}
            onChange={(val) => setForm({ ...form, invoice: String(val) })}
            options={invoices?.map((inv: any) => ({ value: inv.id, label: `${inv.invoice_number} - ${formatCurrency(inv.balance)} (${inv.tenant_name})` })) || []}
            isLoading={invoicesLoading}
            searchable
            clearable
            onCreateNew={form.tenant ? () => setShowQuickInvoice(true) : undefined}
            createNewLabel="+ Create new invoice"
          />
          {!form.tenant && (
            <p className="text-xs text-gray-400 -mt-3">Pick a payer first to create a new invoice in-place.</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              type="date"
              label="Date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
            <Input
              type="number"
              label="Amount"
              placeholder="0.00"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Payment Method"
              value={form.payment_method}
              onChange={(e) => {
                setForm({ ...form, payment_method: e.target.value })
                recentPaymentMethod.add(e.target.value)
              }}
              options={[
                { value: 'cash', label: 'Cash' },
                { value: 'bank_transfer', label: 'Bank Transfer' },
                { value: 'ecocash', label: 'EcoCash' },
                { value: 'card', label: 'Card' },
                { value: 'cheque', label: 'Cheque' },
              ]}
            />
            <AutocompleteInput
              label="Reference"
              placeholder="Bank ref, EcoCash ref..."
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              recentKey="receipt_references"
            />
          </div>

          <AutocompleteInput
            label="Description"
            placeholder="Payment description..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            suggestions={['Rent payment', 'Deposit payment', 'Arrears payment', 'Advance payment', 'Levy payment', 'Penalty payment']}
            recentKey="receipt_descriptions"
          />

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => { setShowForm(false); resetForm(); }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={createMutation.isPending || tenantsLoading}
            >
              {createMutation.isPending ? 'Recording...' : 'Record Receipt'}
            </Button>
          </div>
        </form>
      </Modal>

      <BulkActionsBar
        selectedCount={selection.selectedCount}
        onClearSelection={selection.clearSelection}
        entityName="receipts"
        actions={[
          { label: 'Export', icon: Download, onClick: handleBulkExport, variant: 'outline', disabled: bulkLoading.busy },
          { label: 'Post to Ledger', icon: BookOpen, onClick: handleBulkPost, variant: 'primary', loading: bulkLoading.is('post'), disabled: bulkLoading.busy && !bulkLoading.is('post') },
        ]}
      />

      {/* Just-in-time Create Invoice modal */}
      <Modal
        open={showQuickInvoice}
        onClose={() => setShowQuickInvoice(false)}
        title="Create Invoice"
        icon={Plus}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!quickInvoice.lease) {
              showToast.error('Pick a lease for this invoice.')
              return
            }
            createInvoiceMutation.mutate({
              tenant: Number(form.tenant),
              lease: Number(quickInvoice.lease),
              invoice_type: quickInvoice.invoice_type,
              date: quickInvoice.date,
              due_date: quickInvoice.due_date || quickInvoice.date,
              amount: parseFloat(quickInvoice.amount),
              description: quickInvoice.description,
            })
          }}
          className="space-y-5"
        >
          {activePayerLeases.length === 0 ? (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              This payer has no active lease — invoices must be tied to a lease. Create one from the lease module first.
            </div>
          ) : activePayerLeases.length === 1 ? (
            <div className="text-sm text-gray-700 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
              <span className="text-gray-500">Lease:</span>{' '}
              <span className="font-medium">{activePayerLeases[0].lease_number}</span>
              {activePayerLeases[0].unit_display && (
                <span className="text-gray-500"> · {activePayerLeases[0].unit_display}</span>
              )}
            </div>
          ) : (
            <Select
              label="Lease"
              value={quickInvoice.lease}
              onChange={(e) => setQuickInvoice({ ...quickInvoice, lease: e.target.value })}
              options={[
                { value: '', label: 'Select lease' },
                ...activePayerLeases.map((l: any) => ({
                  value: String(l.id),
                  label: `${l.lease_number}${l.unit_display ? ` — ${l.unit_display}` : ''}`,
                })),
              ]}
              required
            />
          )}
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Invoice Type"
              value={quickInvoice.invoice_type}
              onChange={(e) => setQuickInvoice({ ...quickInvoice, invoice_type: e.target.value })}
              options={[
                { value: 'rent', label: 'Rent' },
                { value: 'levy', label: 'Levy' },
                { value: 'utilities', label: 'Utilities' },
                { value: 'rates', label: 'Rates' },
                { value: 'maintenance', label: 'Maintenance' },
                { value: 'parking', label: 'Parking' },
                { value: 'deposit', label: 'Deposit' },
                { value: 'other', label: 'Other' },
              ]}
            />
            <Input
              type="date"
              label="Date"
              value={quickInvoice.date}
              onChange={(e) => setQuickInvoice({ ...quickInvoice, date: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              type="date"
              label="Due Date"
              value={quickInvoice.due_date}
              onChange={(e) => setQuickInvoice({ ...quickInvoice, due_date: e.target.value })}
            />
            <Input
              type="number"
              label="Amount"
              placeholder="0.00"
              step="0.01"
              min="0"
              value={quickInvoice.amount}
              onChange={(e) => setQuickInvoice({ ...quickInvoice, amount: e.target.value })}
              required
            />
          </div>
          <Textarea
            label="Description"
            placeholder="Invoice description..."
            value={quickInvoice.description}
            onChange={(e) => setQuickInvoice({ ...quickInvoice, description: e.target.value })}
            rows={2}
          />
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowQuickInvoice(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={createInvoiceMutation.isPending || activePayerLeases.length === 0}>
              {createInvoiceMutation.isPending ? 'Creating...' : 'Create & Use'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
