import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Search, CreditCard, Plus, Send, Loader2, Eye, X, User, FileText, Download, Printer, BookOpen } from 'lucide-react'
import { receiptApi, tenantApi, invoiceApi } from '../../services/api'
import { formatCurrency, formatDate, useDebounce, cn } from '../../lib/utils'
import { EmptyTableState, PageHeader, Modal, Button, Input, Select, Textarea, SelectionCheckbox, BulkActionsBar } from '../../components/ui'
import { exportTableData } from '../../lib/export'
import { useSelection } from '../../hooks/useSelection'
import { useHotkeys } from '../../hooks/useHotkeys'
import { AsyncSelect } from '../../components/ui/AsyncSelect'
import { Skeleton, OptimisticItemSkeleton } from '../../components/ui/Skeleton'
import { showToast, parseApiError } from '../../lib/toast'

interface Receipt {
  id: number | string
  receipt_number: string
  tenant: number
  tenant_name: string
  invoice?: number
  invoice_number?: string
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
  const [showForm, setShowForm] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null)
  const [postingId, setPostingId] = useState<number | null>(null)
  const selection = useSelection<number | string>({ clearOnChange: [debouncedSearch] })

  const searchInputRef = useRef<HTMLInputElement>(null)
  useHotkeys([
    { key: 'c', handler: () => setShowForm(true) },
    { key: '/', handler: (e) => { e.preventDefault(); searchInputRef.current?.focus() } },
  ])

  const [form, setForm] = useState({
    tenant: '',
    invoice: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    payment_method: 'bank_transfer',
    reference: '',
    description: '',
  })

  const { data: receiptsData, isLoading } = useQuery({
    queryKey: ['receipts', debouncedSearch],
    queryFn: () => receiptApi.list({ search: debouncedSearch }).then(r => r.data.results || r.data),
  })

  // Tenants dropdown - loads when form opens
  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants-select'],
    queryFn: () => tenantApi.list().then(r => r.data.results || r.data),
    enabled: showForm,
    staleTime: 30000, // Cache for 30 seconds
  })

  // Invoices dropdown - loads when form opens
  // Fetch all invoices and filter for those with outstanding balance
  const { data: allInvoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices-for-receipt'],
    queryFn: () => invoiceApi.list().then(r => r.data.results || r.data),
    enabled: showForm,
    staleTime: 30000,
  })

  // Filter invoices with outstanding balance (sent, partial, or overdue with balance > 0)
  const invoices = allInvoices?.filter((inv: any) =>
    ['sent', 'partial', 'overdue'].includes(inv.status) && Number(inv.balance) > 0
  )

  const receipts = receiptsData || []

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
      const previousReceipts = queryClient.getQueryData(['receipts', debouncedSearch])

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

      queryClient.setQueryData(['receipts', debouncedSearch], (old: any) => {
        const items = old || []
        return [optimisticReceipt, ...items]
      })

      return { previousReceipts }
    },
    onSuccess: () => {
      showToast.success('Receipt recorded successfully')
      queryClient.invalidateQueries({ queryKey: ['receipts'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error, _, context) => {
      // Rollback on error
      if (context?.previousReceipts) {
        queryClient.setQueryData(['receipts', debouncedSearch], context.previousReceipts)
      }
      showToast.error(parseApiError(error, 'Failed to record receipt'))
    },
  })

  const postMutation = useMutation({
    mutationFn: (id: number) => receiptApi.postToLedger(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] })
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
      payment_method: 'bank_transfer',
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
    total: receipts.length,
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
      { key: 'tenant_name', header: 'Tenant' },
      { key: 'amount', header: 'Amount' },
      { key: 'payment_method', header: 'Payment Method' },
      { key: 'date', header: 'Date' },
      { key: 'reference', header: 'Reference' },
    ], 'receipts_export')
    showToast.success(`Exported ${selected.length} receipts`)
  }

  const handleBulkPost = async () => {
    const ids = Array.from(selection.selectedIds)
    let posted = 0
    for (const id of ids) {
      try { await receiptApi.postToLedger(id as number); posted++ } catch {}
    }
    selection.clearSelection()
    queryClient.invalidateQueries({ queryKey: ['receipts'] })
    showToast.success(`Posted ${posted} receipts to ledger`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipts"
        subtitle="Record and manage payment receipts"
        icon={CreditCard}
        actions={
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Record Receipt
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Send className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Posted to GL</p>
              {isLoading ? (
                <Skeleton className="h-7 w-12 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-blue-600">{stats.posted}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <FileText className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Post</p>
              {isLoading ? (
                <Skeleton className="h-7 w-12 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-amber-600">{stats.unposted}</p>
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
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-4 w-10">
                <SelectionCheckbox
                  checked={selection.isAllPageSelected(pageIds)}
                  indeterminate={selection.isPartialPageSelected(pageIds)}
                  onChange={() => selection.selectPage(pageIds)}
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Receipt</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tenant</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Method</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reference</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">GL Posted</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-4 w-10"><Skeleton className="h-4 w-4" /></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-emerald-600" />
                      </div>
                      <Skeleton className="h-4 w-28" />
                    </div>
                  </td>
                  <td className="px-6 py-4"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-6 py-4"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-6 py-4"><Skeleton className="h-5 w-24 rounded-full" /></td>
                  <td className="px-6 py-4"><Skeleton className="h-4 w-28" /></td>
                  <td className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-6 py-4"><Skeleton className="h-8 w-16" /></td>
                  <td className="px-6 py-4"><Skeleton className="h-8 w-8" /></td>
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
                  transition={{ duration: 0.3, delay: receipt._isOptimistic ? 0 : index * 0.02 }}
                  className={cn(
                    'hover:bg-gray-50 transition-colors',
                    receipt._isOptimistic && 'bg-blue-50',
                    selection.isSelected(receipt.id) && 'bg-primary-50'
                  )}
                >
                  <td className="px-4 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                    {!receipt._isOptimistic && (
                      <SelectionCheckbox
                        checked={selection.isSelected(receipt.id)}
                        onChange={() => selection.toggle(receipt.id)}
                      />
                    )}
                  </td>
                  <td className="px-6 py-4">
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
                  <td className="px-6 py-4 text-gray-600">{receipt.tenant_name}</td>
                  <td className="px-6 py-4 font-medium text-green-600">{formatCurrency(receipt.amount)}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-gray-100 rounded-full text-xs">
                      {methodLabels[receipt.payment_method] || receipt.payment_method}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{receipt.reference || '-'}</td>
                  <td className="px-6 py-4 text-gray-600">{formatDate(receipt.date)}</td>
                  <td className="px-6 py-4">
                    {receipt._isOptimistic ? (
                      <span className="text-blue-600 text-sm">Processing...</span>
                    ) : receipt.journal ? (
                      <span className="text-green-600 text-sm">{receipt.journal_number}</span>
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
                  <td className="px-6 py-4 text-right">
                    {!receipt._isOptimistic && (
                      <button
                        onClick={() => handleViewDetails(receipt)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Receipt Modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); resetForm(); }}
        title="Record Receipt"
        icon={Plus}
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Tenant Select */}
          <AsyncSelect
            label="Tenant"
            placeholder="Select tenant"
            value={form.tenant}
            onChange={(val) => setForm({ ...form, tenant: String(val) })}
            options={tenants?.map((t: any) => ({ value: t.id, label: t.name })) || []}
            isLoading={tenantsLoading}
            required
            searchable
          />

          {/* Invoice Select */}
          <AsyncSelect
            label="Against Invoice (Optional)"
            placeholder="Select invoice"
            value={form.invoice}
            onChange={(val) => setForm({ ...form, invoice: String(val) })}
            options={invoices?.map((inv: any) => ({ value: inv.id, label: `${inv.invoice_number} - ${formatCurrency(inv.balance)} (${inv.tenant_name})` })) || []}
            isLoading={invoicesLoading}
            searchable
            clearable
          />

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
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              options={[
                { value: 'cash', label: 'Cash' },
                { value: 'bank_transfer', label: 'Bank Transfer' },
                { value: 'ecocash', label: 'EcoCash' },
                { value: 'card', label: 'Card' },
                { value: 'cheque', label: 'Cheque' },
              ]}
            />
            <Input
              label="Reference"
              placeholder="Bank ref, EcoCash ref..."
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </div>

          <Textarea
            label="Description"
            placeholder="Payment description..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
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
          { label: 'Export', icon: Download, onClick: handleBulkExport, variant: 'outline' },
          { label: 'Post to Ledger', icon: BookOpen, onClick: handleBulkPost, variant: 'primary' },
        ]}
      />
    </div>
  )
}
