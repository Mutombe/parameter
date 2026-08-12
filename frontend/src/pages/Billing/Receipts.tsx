import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Search, CreditCard, Plus, Send, Loader2, Eye, X, User, Download, Printer, BookOpen } from 'lucide-react'
import { receiptApi, tenantApi, invoiceApi, leaseApi, bankAccountApi, landlordApi } from '../../services/api'
import { formatCurrency, formatDate, useDebounce, cn } from '../../lib/utils'
import { printTable } from '../../lib/printTemplate'
import { EmptyTableState, PageHeader, Modal, Button, Input, Select, Textarea, SelectionCheckbox, BulkActionsBar, Tooltip, Pagination, DatePicker } from '../../components/ui'
import { PayerSelect } from '../../components/PayerSelect'
import { PayerCell } from '../../components/PayerCell'
import { SubAccountBadge } from '../../components/SubAccountBadge'
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
  sub_account_category?: string
  currency?: string
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

// Landlord trust pockets an owner contribution can be injected into.
const SUB_POCKET_OPTIONS = [
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

function ContribRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 text-right">{value}</span>
    </div>
  )
}

export default function Receipts() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [currentPage, setCurrentPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  // Owner (landlord) contribution — funds injected into the trust account.
  const [showContribution, setShowContribution] = useState(false)
  const [contributionForm, setContributionForm] = useState({
    landlord: '', currency: '', sub_account_category: 'rent', amount: '', date: new Date().toISOString().split('T')[0], bank_account: '', description: '',
  })
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
    currency: '',
    invoice: '',
    sub_account_category: 'rent',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    payment_method: recentPaymentMethod.values[0] || 'bank_transfer',
    bank_account: '',
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
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts-for-receipts'],
    queryFn: () => bankAccountApi.list({ is_active: true, page_size: 200 }).then((r: any) => r.data.results || r.data),
    placeholderData: keepPreviousData,
  })

  // The cashier picks the payment CURRENCY first (right after the payer).
  // That choice narrows everything downstream to a single currency: the
  // invoices offered, the bank/cash accounts offered, and the tenant/
  // landlord sub-accounts the receipt posts to. High precision from the
  // start — no mixing USD and ZWG.
  const receiptCurrency = form.currency
  const bankOptions = ((bankAccounts as any[]) || [])
    .filter((b: any) => !form.currency || (b.currency || 'USD') === form.currency)

  const { data: contribLandlords = [] } = useQuery({
    queryKey: ['landlords-for-contribution'],
    queryFn: () => landlordApi.list({ page_size: 500 }).then((r: any) => r.data.results || r.data),
    enabled: showContribution,
  })
  const contributionMutation = useMutation({
    mutationFn: (payload: any) => receiptApi.ownerContribution(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] })
      showToast.success('Owner contribution recorded')
      setShowContribution(false)
      setContributionForm({ landlord: '', currency: '', sub_account_category: 'rent', amount: '', date: new Date().toISOString().split('T')[0], bank_account: '', description: '' })
    },
    onError: (err: any) => showToast.error(parseApiError(err, 'Failed to record contribution')),
  })
  const submitContribution = () => {
    // Trust-money controls: a contribution must name the currency and the
    // actual approved receiving bank/cash account it landed in.
    if (!contributionForm.landlord) { showToast.error('Pick the landlord.'); return }
    if (!contributionForm.currency) { showToast.error('Select the currency of the contribution.'); return }
    if (!contributionForm.sub_account_category) { showToast.error('Pick the sub-account pocket.'); return }
    if (!contributionForm.bank_account) { showToast.error('Select the receiving bank/cash account.'); return }
    const amt = Number(contributionForm.amount)
    if (!amt || amt <= 0) { showToast.error('Enter a valid amount.'); return }
    const bank = ((bankAccounts as any[]) || []).find((b: any) => String(b.id) === String(contributionForm.bank_account))
    if (bank && (bank.currency || 'USD') !== contributionForm.currency) {
      showToast.error(`Currency (${contributionForm.currency}) must match the receiving account (${bank.currency}).`); return
    }
    contributionMutation.mutate({
      landlord: Number(contributionForm.landlord),
      currency: contributionForm.currency,
      sub_account_category: contributionForm.sub_account_category,
      amount: amt,
      date: contributionForm.date,
      description: contributionForm.description || undefined,
      bank_account: Number(contributionForm.bank_account),
    })
  }

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

  // Invoices offered for this receipt are scoped to the chosen payer AND the
  // chosen currency, so the cashier is never shown invoices in the other
  // currency (or another payer's invoices).
  const invoices = allInvoices?.filter((inv: any) =>
    ['sent', 'partial', 'overdue'].includes(inv.status) && Number(inv.balance) > 0
    && (!form.tenant || String(inv.tenant) === String(form.tenant))
    && (!form.currency || (inv.currency || 'USD') === form.currency)
  )

  // Active leases for the selected payer — feeds the property-confirmation
  // field under the payer picker AND the quick-invoice modal. Loaded as soon
  // as a payer is picked so the cashier immediately sees which property
  // (and landlord) the payment belongs to.
  const { data: payerLeases } = useQuery({
    queryKey: ['payer-active-leases', form.tenant],
    queryFn: () => leaseApi.list({ tenant: form.tenant, status: 'active', page_size: 50 })
      .then(r => r.data.results || r.data),
    enabled: !!form.tenant,
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

  // Auto-fill amount AND sub_account_category when invoice is selected.
  // The invoice's invoice_type maps 1:1 onto the receipt's sub-account
  // (rent / levy / maintenance / etc.) so picking an invoice should
  // pre-categorize the receipt without the user typing twice.
  useEffect(() => {
    if (!form.invoice || !invoices) return
    const inv = invoices.find((i: any) => String(i.id) === form.invoice)
    if (!inv) return
    setForm(prev => ({
      ...prev,
      amount: prev.amount || String(Number(inv.balance).toFixed(2)),
      sub_account_category: inv.invoice_type || prev.sub_account_category,
    }))
  }, [form.invoice])

  // Optimistic create mutation
  const createMutation = useMutation({
    mutationFn: (data: typeof form) => receiptApi.create({
      ...data,
      bank_account: data.bank_account || null,
    }),
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
      currency: '',
      invoice: '',
      sub_account_category: 'rent',
      date: new Date().toISOString().split('T')[0],
      amount: '',
      payment_method: recentPaymentMethod.values[0] || 'bank_transfer',
      bank_account: '',
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => printTable(
                (receipts as any[]).map((x: any) => ({
                  txn: x.transaction_display || '—',
                  number: x.receipt_number || x.id,
                  date: x.date || '—',
                  payer: x.tenant_name || '—',
                  method: x.payment_method || '—',
                  amount: formatCurrency(Number(x.amount || 0), x.currency),
                })),
                [
                  { key: 'txn', label: 'Txn #' },
                  { key: 'number', label: 'Receipt #' },
                  { key: 'date', label: 'Date' },
                  { key: 'payer', label: 'Payer' },
                  { key: 'method', label: 'Method' },
                  { key: 'amount', label: 'Amount', align: 'right' },
                ],
                { title: 'Receipts Listing' },
              )}
            >
              <Printer className="w-4 h-4" />
              Print
            </Button>
            <Button variant="outline" onClick={() => setShowContribution(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Owner Contribution
            </Button>
            <Button onClick={() => setShowForm(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Record Receipt
            </Button>
          </div>
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
        <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-sm border-b-2 border-gray-100">
            <tr>
              <th className="px-4 py-2 w-10">
                <SelectionCheckbox
                  checked={selection.isAllPageSelected(pageIds)}
                  indeterminate={selection.isPartialPageSelected(pageIds)}
                  onChange={() => selection.selectPage(pageIds)}
                />
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Receipt</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Payer</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Sub-Account</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Method</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden xl:table-cell">Reference</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">GL Posted</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-2 w-10"><Skeleton className="h-4 w-4" /></td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md bg-emerald-100 flex items-center justify-center">
                        <CreditCard className="w-4 h-4 text-emerald-600" />
                      </div>
                      <Skeleton className="h-4 w-28" />
                    </div>
                  </td>
                  <td className="px-4 py-2"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-4 py-2"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-4 py-2"><Skeleton className="h-5 w-24 rounded-full" /></td>
                  <td className="px-4 py-2"><Skeleton className="h-4 w-28" /></td>
                  <td className="px-4 py-2 hidden xl:table-cell"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-2"><Skeleton className="h-8 w-16" /></td>
                  <td className="px-4 py-2 hidden lg:table-cell"><Skeleton className="h-8 w-8" /></td>
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
                  <td className="px-4 py-2 w-10" onClick={(e) => e.stopPropagation()}>
                    {!receipt._isOptimistic && (
                      <SelectionCheckbox
                        checked={selection.isSelected(receipt.id)}
                        onChange={() => selection.toggle(receipt.id)}
                      />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-7 h-7 rounded-md flex items-center justify-center',
                        receipt._isOptimistic ? 'bg-blue-100' : 'bg-emerald-100'
                      )}>
                        {receipt._isOptimistic ? (
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        ) : (
                          <CreditCard className="w-4 h-4 text-emerald-600" />
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
                  <td className="px-4 py-2">
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
                  <td className="px-4 py-2">
                    <SubAccountBadge
                      category={(receipt as any).sub_account_category}
                      currency={receipt.currency}
                    />
                  </td>
                  <td className="px-4 py-2 font-semibold tabular-nums text-emerald-600" title={String(receipt.amount)}>{formatCurrency(receipt.amount || 0)}</td>
                  <td className="px-4 py-2">
                    <Tooltip content={`${methodLabels[receipt.payment_method] || receipt.payment_method}${receipt.reference ? ' - Ref: ' + receipt.reference : ''}`}>
                      <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 bg-gray-100 rounded-full text-xs">
                        {methodLabels[receipt.payment_method] || receipt.payment_method}
                      </span>
                    </Tooltip>
                  </td>
                  <td className="px-4 py-2 text-gray-900 hidden xl:table-cell">{receipt.reference || '\u2014'}</td>
                  <td className="px-4 py-2 text-gray-900">{receipt.date ? formatDate(receipt.date) : '\u2014'}</td>
                  <td className="px-4 py-2 hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
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
                  <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
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
          {/* Payer Select — covers both Tenants and Account Holders. Changing
              the payer clears the invoice (it belonged to the old payer). */}
          <PayerSelect
            value={form.tenant}
            onChange={(val) => { const p = (tenants as any[])?.find((t: any) => String(t.id) === String(val)); setForm({ ...form, tenant: String(val), invoice: '', sub_account_category: p?.account_type === 'levy' ? 'levy' : (form.sub_account_category === 'levy' || form.sub_account_category === 'special_levy' ? 'rent' : form.sub_account_category) })} }
            required
          />

          {/* Payment currency — chosen FIRST (after the payer) so the whole
              receipt is scoped to one currency: it filters the invoices and
              bank accounts below and selects the matching sub-account. */}
          <Select
            label="Payment Currency"
            hint="Pick the currency the payer is paying in — this narrows the invoices and bank accounts to that currency"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value, invoice: '', bank_account: '' })}
            disabled={!form.tenant}
            required
            options={[
              { value: '', label: form.tenant ? '— Select payment currency —' : 'Select a payer first' },
              { value: 'USD', label: 'USD' },
              { value: 'ZWG', label: 'ZWG' },
            ]}
          />

          {/* Property confirmation — shows which property (and landlord) the
              payer occupies so the cashier verifies the payment is going to
              the right place BEFORE submitting. A payer can hold leases at
              different properties under different landlords, so every active
              lease is listed. */}
          {form.tenant && (
            <div className={cn(
              'rounded-xl border px-4 py-3 -mt-1',
              activePayerLeases.length === 0
                ? 'border-amber-200 bg-amber-50'
                : activePayerLeases.length > 1
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-emerald-200 bg-emerald-50/60'
            )}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Property (occupied by payer)
              </p>
              {activePayerLeases.length === 0 ? (
                <p className="text-sm text-amber-700">No active lease found for this payer — verify before receipting.</p>
              ) : (
                <div className="space-y-1">
                  {activePayerLeases.map((l: any) => (
                    <p key={l.id} className="text-sm text-gray-800">
                      <span className="font-semibold">{l.property_name || '—'}</span>
                      {l.unit_display ? <span className="text-gray-600"> · {l.unit_display}</span> : null}
                      {l.landlord_name ? <span className="text-gray-500"> · Landlord: {l.landlord_name}</span> : null}
                    </p>
                  ))}
                  {activePayerLeases.length > 1 && (
                    <p className="text-xs text-amber-700 pt-0.5">
                      This payer occupies {activePayerLeases.length} properties — confirm which one this payment is for.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

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

          {/* Sub-Account Category — explicit bucket this payment credits.
              Auto-fills from invoice.invoice_type when an invoice is picked. */}
          <Select
            label="Sub-Account Category"
            value={form.sub_account_category}
            onChange={(e) => setForm({ ...form, sub_account_category: e.target.value })}
            options={(() => {
              const payer = (tenants as any[])?.find((t: any) => String(t.id) === form.tenant)
              // Levy Payment Contract side: Levy, Special Levy, Maintenance,
              // Parking, Rates only (no Rent on the Levy Payers' side).
              if (payer?.account_type === 'levy') return [
                { value: 'levy', label: 'Levy' },
                { value: 'special_levy', label: 'Special Levy' },
                { value: 'maintenance', label: 'Maintenance' },
                { value: 'parking', label: 'Parking' },
                { value: 'rates', label: 'Rates' },
              ]
              // Rental Payment Contract side: Rent, Rates, Maintenance,
              // Parking, VAT, Deposit only (no Levy on the Rental side) — a
              // payer is Rental XOR Levy, never both.
              return [
                { value: 'rent', label: 'Rent' },
                { value: 'rates', label: 'Rates' },
                { value: 'maintenance', label: 'Maintenance' },
                { value: 'parking', label: 'Parking' },
                { value: 'vat', label: 'VAT' },
                { value: 'deposit', label: 'Deposit' },
                { value: 'general', label: 'General' },
              ]
            })()}
            hint="Category lock: this ONE pick credits the payer's pocket AND the landlord's pocket of the SAME category — the category also shows the payer's contract side (Rental vs Levy)"
          />

          <div className="grid grid-cols-2 gap-4">
            <DatePicker
              label="Date"
              value={form.date}
              onChange={(v) => setForm({ ...form, date: v })}
              required
            />
            <Input
              type="number"
              label={`Amount${receiptCurrency ? ` (${receiptCurrency})` : ''}`}
              hint={receiptCurrency
                ? `Recorded in ${receiptCurrency} — the selected bank account's currency`
                : 'Currency follows the bank account you select below'}
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
            <Select
              label="Bank Account"
              hint={form.currency
                ? `Only ${form.currency} accounts are shown — a receipt banks into an account of its own currency`
                : 'Select a payment currency first'}
              value={form.bank_account}
              onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
              required
              disabled={!form.currency}
              options={[
                { value: '', label: form.currency ? '— Select bank account (required) —' : 'Select a payment currency first' },
                ...(bankOptions.map((b: any) => ({
                  value: String(b.id),
                  label: `${b.name}${b.currency ? ` (${b.currency})` : ''}`,
                }))),
              ]}
            />
          </div>

          <AutocompleteInput
            label="Reference"
            placeholder="Bank ref, EcoCash ref..."
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
            recentKey="receipt_references"
          />

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
              // Currency is mandatory and chosen up front so the receipt is
              // scoped to one currency end to end.
              className="flex-1"
              disabled={createMutation.isPending || tenantsLoading || !form.currency}
            >
              {createMutation.isPending ? 'Recording...' : 'Record Receipt'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Owner Contribution Modal */}
      <Modal
        isOpen={showContribution}
        onClose={() => setShowContribution(false)}
        title="Record Owner Contribution"
        size="md"
      >
        <form onSubmit={(e) => { e.preventDefault(); submitContribution() }} className="space-y-4">
          <p className="text-sm text-gray-500">
            Records funds the owner injects into their trust account (Dr Bank,
            Cr Landlord Trust). It raises Funds Held in Trust on the Balance Sheet
            and shows as an owner contribution on the Cash Flow.
          </p>
          <AsyncSelect
            label="Landlord (contributing)"
            placeholder="Pick the landlord"
            value={contributionForm.landlord}
            onChange={(val) => setContributionForm({ ...contributionForm, landlord: String(val) })}
            options={(contribLandlords as any[]).map((l: any) => ({ value: l.id, label: l.name, description: l.code || '' }))}
            searchable
            required
          />
          {(() => {
            const banks = (bankAccounts as any[]) || []
            const contribCurrencies = Array.from(new Set(banks.map((b: any) => b.currency || 'USD')))
            const currencyOptions = (contribCurrencies.length ? contribCurrencies : ['USD', 'ZWG'])
              .map((c: string) => ({ value: c, label: c }))
            const currencyBanks = banks.filter((b: any) => (b.currency || 'USD') === contributionForm.currency)
            const cBank = banks.find((b: any) => String(b.id) === String(contributionForm.bank_account))
            const balance = cBank ? Number(cBank.computed_balance ?? cBank.book_balance ?? 0) : null
            const amt = Number(contributionForm.amount) || 0
            const cLandlord = (contribLandlords as any[]).find((l: any) => String(l.id) === String(contributionForm.landlord))
            const pocketLabel = SUB_POCKET_OPTIONS.find(o => o.value === contributionForm.sub_account_category)?.label || contributionForm.sub_account_category
            const summaryReady = contributionForm.landlord && contributionForm.currency &&
              contributionForm.bank_account && amt > 0
            return (
              <>
                <Select
                  label="Currency *"
                  value={contributionForm.currency}
                  onChange={(e) => setContributionForm({ ...contributionForm, currency: e.target.value, bank_account: '' })}
                  options={currencyOptions}
                  placeholder="Select currency"
                  hint="The currency the contribution was received in — it must match the receiving account"
                  required
                />
                <Select
                  label="Sub-account pocket (funds injected into) *"
                  value={contributionForm.sub_account_category}
                  onChange={(e) => setContributionForm({ ...contributionForm, sub_account_category: e.target.value })}
                  options={SUB_POCKET_OPTIONS}
                  required
                />
                <Select
                  label="Receiving Bank/Cash Account *"
                  value={contributionForm.bank_account}
                  onChange={(e) => setContributionForm({ ...contributionForm, bank_account: e.target.value })}
                  options={currencyBanks.map((b: any) => ({
                    value: String(b.id),
                    label: `${b.name} — ${b.currency} ${Number(b.computed_balance ?? b.book_balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                  }))}
                  placeholder={contributionForm.currency ? 'Select the account the funds were received into' : 'Select a currency first'}
                  disabled={!contributionForm.currency}
                  hint="Only approved accounts in the selected currency are shown. Accounts are configured in Bank Accounts — never created here."
                  required
                />
                <Input
                  label="Amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={contributionForm.amount}
                  onChange={(e) => setContributionForm({ ...contributionForm, amount: e.target.value })}
                  required
                />
                <DatePicker
                  label="Date"
                  value={contributionForm.date}
                  onChange={(v) => setContributionForm({ ...contributionForm, date: v })}
                  required
                />
                <Input
                  label="Description (optional)"
                  value={contributionForm.description}
                  onChange={(e) => setContributionForm({ ...contributionForm, description: e.target.value })}
                  placeholder="Owner contribution"
                />
                {summaryReady && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
                    <div className="font-medium text-gray-900 mb-1">Contribution Summary</div>
                    <ContribRow label="Landlord" value={cLandlord?.name || '—'} />
                    <ContribRow label="Pocket" value={pocketLabel} />
                    <ContribRow label="Currency" value={contributionForm.currency} />
                    <ContribRow label="Receiving Account" value={cBank?.name || '—'} />
                    <ContribRow label="Amount" value={`${contributionForm.currency} ${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                    {balance !== null && (
                      <>
                        <ContribRow label="Current Balance" value={`${contributionForm.currency} ${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                        <ContribRow label="Projected Balance" value={`${contributionForm.currency} ${(balance + amt).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                      </>
                    )}
                    <div className="pt-1 text-xs text-gray-500 font-mono">
                      Dr {cBank?.name} · Cr {cLandlord?.code || 'Landlord'}/{contributionForm.sub_account_category}
                    </div>
                  </div>
                )}
              </>
            )
          })()}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowContribution(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={contributionMutation.isPending}>
              {contributionMutation.isPending ? 'Recording…' : 'Record Contribution'}
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
              // Match the receipt's chosen currency so it appears in the
              // currency-filtered invoice list and posts consistently.
              ...(form.currency ? { currency: form.currency } : {}),
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
            <DatePicker
              label="Date"
              value={quickInvoice.date}
              onChange={(v) => setQuickInvoice({ ...quickInvoice, date: v })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DatePicker
              label="Due Date"
              value={quickInvoice.due_date}
              onChange={(v) => setQuickInvoice({ ...quickInvoice, due_date: v })}
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
