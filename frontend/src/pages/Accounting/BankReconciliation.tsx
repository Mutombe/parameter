import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Plus,
  Scale,
  Landmark,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  ArrowLeft,
  CheckSquare,
  Square,
  X,
} from 'lucide-react'
import { bankReconciliationApi, bankAccountApi } from '../../services/api'
import { cn, formatCurrency, formatDate } from '../../lib/utils'
import { showToast, parseApiError } from '../../lib/toast'
import { Modal, ModalFooter, Tooltip } from '../../components/ui'
import { AsyncSelect } from '../../components/ui/AsyncSelect'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReconciliationItem {
  id: number
  item_type: 'receipt' | 'payment'
  receipt: number | null
  gl_entry: number | null
  date: string
  reference: string
  description: string
  amount: string
  is_reconciled: boolean
  reconciled_at: string | null
}

interface WorkspaceData {
  id: number
  bank_account: number
  bank_account_name: string
  bank_account_currency: string
  month: number
  year: number
  period_start: string
  period_end: string
  statement_balance: string
  book_balance: string
  status: 'draft' | 'completed'
  notes: string
  difference: string
  is_balanced: boolean
  reconciled_count: number
  unreconciled_count: number
  total_payments: string
  total_receipts: string
  items: ReconciliationItem[]
  created_at: string
  completed_at: string | null
}

interface BankReconciliation {
  id: number
  bank_account: number
  bank_account_name: string
  period_start: string
  period_end: string
  month: number | null
  year: number | null
  statement_balance: string
  book_balance: string
  difference: string
  status: 'draft' | 'completed'
  notes: string
  created_at: string
  completed_at: string | null
}

interface BankAccount {
  id: number
  name: string
  bank_name: string
  account_number: string
  currency: string
}

interface SummaryBankAccount {
  id: number
  name: string
  bank_name: string
}

interface ReconciliationSummary {
  bank_account: SummaryBankAccount
  last_reconciled: string | null
  last_reconciled_balance: string | null
  pending_transactions: number
  unreconciled_difference: number
}

// ─── Month helpers ───────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const currentYear = new Date().getFullYear()
const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

// ─── Component ───────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'workspace'

export default function BankReconciliation() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [activeReconciliationId, setActiveReconciliationId] = useState<number | null>(null)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    bank_account: '',
    month: String(new Date().getMonth() + 1),
    year: String(currentYear),
    statement_balance: '',
    notes: '',
  })

  // Workspace local state (for optimistic updates)
  const [localItems, setLocalItems] = useState<ReconciliationItem[]>([])
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)

  // ─── Queries ─────────────────────────────────────────────────────────

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['bank-reconciliation-summary'],
    queryFn: () => bankReconciliationApi.summary().then(r => r.data),
    enabled: viewMode === 'list',
  })

  const { data: reconciliationsData, isLoading: listLoading } = useQuery({
    queryKey: ['bank-reconciliations'],
    queryFn: () => bankReconciliationApi.list().then(r => r.data.results || r.data),
    enabled: viewMode === 'list',
  })

  const { data: bankAccountsData } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountApi.list().then(r => r.data.results || r.data),
  })

  const summaries: ReconciliationSummary[] = Array.isArray(summaryData) ? summaryData : []
  const reconciliations: BankReconciliation[] = Array.isArray(reconciliationsData) ? reconciliationsData : []
  const bankAccounts: BankAccount[] = Array.isArray(bankAccountsData) ? bankAccountsData : []
  const isLoading = summaryLoading || listLoading

  // ─── Workspace loading ──────────────────────────────────────────────

  const loadWorkspace = useCallback(async (id: number) => {
    setWorkspaceLoading(true)
    setViewMode('workspace')
    setActiveReconciliationId(id)
    try {
      const res = await bankReconciliationApi.workspace(id)
      const data: WorkspaceData = res.data
      setWorkspaceData(data)
      setLocalItems(data.items)
    } catch (error) {
      showToast.error(parseApiError(error))
      setViewMode('list')
      setActiveReconciliationId(null)
    } finally {
      setWorkspaceLoading(false)
    }
  }, [])

  // ─── Client-side diff calculation ──────────────────────────────────

  const diff = useMemo(() => {
    if (!workspaceData) return 0
    const statementBalance = parseFloat(workspaceData.statement_balance)
    const bookBalance = parseFloat(workspaceData.book_balance)
    const untickedPayments = localItems
      .filter(i => i.item_type === 'payment' && !i.is_reconciled)
      .reduce((s, i) => s + parseFloat(i.amount), 0)
    const untickedReceipts = localItems
      .filter(i => i.item_type === 'receipt' && !i.is_reconciled)
      .reduce((s, i) => s + parseFloat(i.amount), 0)
    return (statementBalance - bookBalance) + untickedPayments - untickedReceipts
  }, [localItems, workspaceData])

  const reconciledCount = useMemo(() => localItems.filter(i => i.is_reconciled).length, [localItems])
  const unreconciledCount = useMemo(() => localItems.filter(i => !i.is_reconciled).length, [localItems])

  // ─── Mutations ──────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: typeof createForm) =>
      bankReconciliationApi.create({
        bank_account: Number(data.bank_account),
        month: Number(data.month),
        year: Number(data.year),
        statement_balance: Number(data.statement_balance),
        notes: data.notes,
      }),
    onSuccess: (response) => {
      const data: WorkspaceData = response.data
      setWorkspaceData(data)
      setLocalItems(data.items)
      setActiveReconciliationId(data.id)
      setViewMode('workspace')
      setShowModal(false)
      setCreateForm({
        bank_account: '',
        month: String(new Date().getMonth() + 1),
        year: String(currentYear),
        statement_balance: '',
        notes: '',
      })
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliations'] })
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliation-summary'] })
      showToast.success(`Reconciliation created with ${data.items.length} items`)
    },
    onError: (error) => {
      showToast.error(parseApiError(error))
    },
  })

  const handleToggle = useCallback((itemId: number) => {
    if (!activeReconciliationId || workspaceData?.status !== 'draft') return

    // 1. Optimistic update
    setLocalItems(prev =>
      prev.map(i =>
        i.id === itemId ? { ...i, is_reconciled: !i.is_reconciled } : i
      )
    )

    // 2. Fire API in background
    bankReconciliationApi.toggleItem(activeReconciliationId, itemId).catch(() => {
      // Revert on failure
      setLocalItems(prev =>
        prev.map(i =>
          i.id === itemId ? { ...i, is_reconciled: !i.is_reconciled } : i
        )
      )
      showToast.error('Failed to toggle item')
    })
  }, [activeReconciliationId, workspaceData?.status])

  const selectAllMutation = useMutation({
    mutationFn: () => bankReconciliationApi.selectAll(activeReconciliationId!),
    onMutate: () => {
      setLocalItems(prev => prev.map(i => ({ ...i, is_reconciled: true })))
    },
    onError: () => {
      showToast.error('Failed to select all')
      if (activeReconciliationId) loadWorkspace(activeReconciliationId)
    },
  })

  const deselectAllMutation = useMutation({
    mutationFn: () => bankReconciliationApi.deselectAll(activeReconciliationId!),
    onMutate: () => {
      setLocalItems(prev => prev.map(i => ({ ...i, is_reconciled: false })))
    },
    onError: () => {
      showToast.error('Failed to deselect all')
      if (activeReconciliationId) loadWorkspace(activeReconciliationId)
    },
  })

  const completeMutation = useMutation({
    mutationFn: () => bankReconciliationApi.complete(activeReconciliationId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliations'] })
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliation-summary'] })
      showToast.success('Reconciliation completed')
      setViewMode('list')
      setActiveReconciliationId(null)
      setWorkspaceData(null)
      setLocalItems([])
    },
    onError: (error) => {
      showToast.error(parseApiError(error))
    },
  })

  const handleExport = async (id: number) => {
    try {
      const response = await bankReconciliationApi.exportExcel(id)
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `reconciliation-${id}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      showToast.success('Export downloaded')
    } catch (error) {
      showToast.error(parseApiError(error))
    }
  }

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!createForm.bank_account || !createForm.statement_balance) {
      showToast.error('Please fill in all required fields')
      return
    }
    createMutation.mutate(createForm)
  }

  const closeWorkspace = () => {
    setViewMode('list')
    setActiveReconciliationId(null)
    setWorkspaceData(null)
    setLocalItems([])
    queryClient.invalidateQueries({ queryKey: ['bank-reconciliations'] })
    queryClient.invalidateQueries({ queryKey: ['bank-reconciliation-summary'] })
  }

  const formatMonthYear = (month: number | null, year: number | null, periodStart: string, periodEnd: string) => {
    if (month && year) {
      return `${MONTH_NAMES[month - 1]} ${year}`
    }
    return `${formatDate(periodStart)} — ${formatDate(periodEnd)}`
  }

  // ─── Workspace View ─────────────────────────────────────────────────

  if (viewMode === 'workspace' && workspaceLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-200" />
            <div className="space-y-2">
              <div className="h-5 w-64 bg-gray-200 rounded" />
              <div className="h-3 w-32 bg-gray-200 rounded" />
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-gray-200" />
        </div>
        {/* Balance cards skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <div className="h-3 w-24 bg-gray-200 rounded" />
              <div className="h-6 w-28 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
        {/* Bulk actions skeleton */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-24 bg-gray-200 rounded-lg" />
          <div className="h-8 w-28 bg-gray-200 rounded-lg" />
          <div className="flex-1" />
          <div className="h-8 w-20 bg-gray-200 rounded-lg" />
          <div className="h-9 w-44 bg-gray-200 rounded-lg" />
        </div>
        {/* Table skeleton with checkbox column */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-12 px-4 py-3"><div className="h-3.5 w-3.5 bg-gray-200 rounded mx-auto" /></th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Payments</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Receipts</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...Array(10)].map((_, i) => (
                <tr key={i}>
                  <td className="w-12 px-4 py-3 text-center"><div className="h-4 w-4 border-2 border-gray-200 rounded mx-auto" /></td>
                  <td className="px-4 py-3"><div className={`h-4 ${i % 3 === 0 ? 'w-20' : 'w-0'} bg-gray-200 rounded ml-auto`} /></td>
                  <td className="px-4 py-3"><div className={`h-4 ${i % 3 !== 0 ? 'w-20' : 'w-0'} bg-gray-200 rounded ml-auto`} /></td>
                  <td className="px-4 py-3"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                  <td className="px-4 py-3"><div className={`h-4 bg-gray-200 rounded`} style={{ width: `${100 + (i % 4) * 40}px` }} /></td>
                  <td className="px-4 py-3"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Footer skeleton */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-6 py-4">
          <div className="flex items-center gap-6">
            <div className="h-4 w-28 bg-gray-200 rounded" />
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-4 w-24 bg-gray-200 rounded" />
          </div>
          <div className="h-5 w-28 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  if (viewMode === 'workspace' && workspaceData) {
    const isReadOnly = workspaceData.status === 'completed'

    return (
      <div className="space-y-4">
        {/* Workspace Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={closeWorkspace}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Bank Reconciliation — {workspaceData.bank_account_name}
              </h1>
              <p className="text-sm text-gray-500">
                {MONTH_NAMES[(workspaceData.month || 1) - 1]} {workspaceData.year}
                {isReadOnly && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-medium">
                    Completed
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={closeWorkspace}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Cash Book Balance</p>
            <p className="text-lg font-bold text-gray-900 mt-1">
              {formatCurrency(parseFloat(workspaceData.book_balance))}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Statement Balance</p>
            <p className="text-lg font-bold text-gray-900 mt-1">
              {formatCurrency(parseFloat(workspaceData.statement_balance))}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Unreconciled</p>
            <p className="text-lg font-bold text-amber-600 mt-1">{unreconciledCount}</p>
          </div>
          <div className={cn(
            "rounded-xl border p-4",
            Math.abs(diff) < 0.01
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
          )}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Difference</p>
            <p className={cn(
              "text-lg font-bold mt-1",
              Math.abs(diff) < 0.01 ? "text-green-700" : "text-red-700"
            )}>
              {formatCurrency(diff)}
            </p>
          </div>
        </div>

        {/* Bulk Actions */}
        {!isReadOnly && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => selectAllMutation.mutate()}
              disabled={selectAllMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Select All
            </button>
            <button
              onClick={() => deselectAllMutation.mutate()}
              disabled={deselectAllMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5" />
              Deselect All
            </button>
            <div className="flex-1" />
            <button
              onClick={() => handleExport(workspaceData.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
            >
              {completeMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <CheckCircle2 className="w-4 h-4" />
              Complete Reconciliation
            </button>
          </div>
        )}

        {/* Items Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-12 px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                    <CheckSquare className="w-3.5 h-3.5 mx-auto text-gray-400" />
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Payments</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Receipts</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {localItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      No items found for this period. This means no posted receipts or GL payments
                      were found for this bank account in {MONTH_NAMES[(workspaceData.month || 1) - 1]} {workspaceData.year}.
                    </td>
                  </tr>
                ) : (
                  localItems.map((item) => (
                    <tr
                      key={item.id}
                      className={cn(
                        "transition-colors",
                        item.is_reconciled ? "bg-green-50/50" : "hover:bg-gray-50",
                        !isReadOnly && "cursor-pointer"
                      )}
                      onClick={() => !isReadOnly && handleToggle(item.id)}
                    >
                      <td className="w-12 px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={item.is_reconciled}
                          onChange={() => !isReadOnly && handleToggle(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          disabled={isReadOnly}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer disabled:cursor-default"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                        {item.item_type === 'payment' ? formatCurrency(parseFloat(item.amount)) : ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                        {item.item_type === 'receipt' ? formatCurrency(parseFloat(item.amount)) : ''}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-700">{item.reference || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{item.description}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(item.date)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Summary */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-6 py-4">
          <div className="flex items-center gap-6 text-sm">
            <span className="text-gray-500">
              Reconciled: <span className="font-medium text-green-600">{reconciledCount}</span>
            </span>
            <span className="text-gray-500">
              Unreconciled: <span className="font-medium text-amber-600">{unreconciledCount}</span>
            </span>
            <span className="text-gray-500">
              Total items: <span className="font-medium text-gray-900">{localItems.length}</span>
            </span>
          </div>
          <div className={cn(
            "text-lg font-bold",
            Math.abs(diff) < 0.01 ? "text-green-700" : "text-red-700"
          )}>
            Diff = {formatCurrency(diff)}
          </div>
        </div>
      </div>
    )
  }

  // ─── List View ──────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <button onClick={() => navigate('/dashboard')} className="hover:text-gray-900 transition-colors">Dashboard</button>
        <span>/</span>
        <span className="text-gray-900 font-medium">Bank Reconciliation</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bank Reconciliation</h1>
          <p className="text-gray-500 mt-1">Sage-style bank reconciliation with checkbox matching</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          New Reconciliation
        </button>
      </div>

      {/* Summary Cards */}
      {!summaryData && isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gray-200" />
                <div className="h-4 w-32 bg-gray-200 rounded" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between"><div className="h-3 w-24 bg-gray-200 rounded" /><div className="h-3 w-16 bg-gray-200 rounded" /></div>
                <div className="flex justify-between"><div className="h-3 w-28 bg-gray-200 rounded" /><div className="h-3 w-8 bg-gray-200 rounded" /></div>
                <div className="flex justify-between"><div className="h-3 w-20 bg-gray-200 rounded" /><div className="h-3 w-16 bg-gray-200 rounded" /></div>
              </div>
            </div>
          ))}
        </div>
      ) : summaries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {summaries.map((summary, index) => (
            <motion.div
              key={summary.bank_account?.id ?? index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Landmark className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{summary.bank_account?.name}</h3>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Last Reconciled</span>
                  <span className="text-gray-700 font-medium">
                    {summary.last_reconciled ? formatDate(summary.last_reconciled) : 'Never'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Pending Transactions</span>
                  <span className={cn(
                    "font-medium",
                    summary.pending_transactions > 0 ? "text-amber-600" : "text-green-600"
                  )}>
                    {summary.pending_transactions}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Difference</span>
                  <span className={cn(
                    "font-medium",
                    Number(summary.unreconciled_difference) !== 0 ? "text-red-600" : "text-green-600"
                  )}>
                    {formatCurrency(Number(summary.unreconciled_difference) || 0)}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Reconciliation History */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Reconciliation History</h2>
        </div>

        {listLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Bank Account</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Period</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Statement Bal.</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Book Bal.</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Difference</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...Array(4)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 w-32 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-40 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded ml-auto" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded ml-auto" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded ml-auto" /></td>
                    <td className="px-6 py-4 text-center"><div className="h-5 w-20 bg-gray-200 rounded-full mx-auto" /></td>
                    <td className="px-6 py-4"><div className="h-7 w-16 bg-gray-200 rounded ml-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : reconciliations.length === 0 ? (
          <div className="p-12 text-center">
            <Scale className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No reconciliations yet</h3>
            <p className="text-gray-500">Create your first bank reconciliation to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Bank Account</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Period</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Statement Bal.</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Book Bal.</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Difference</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reconciliations.map((rec, index) => {
                  const recDiff = parseFloat(rec.difference || '0')
                  return (
                    <motion.tr
                      key={rec.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => loadWorkspace(rec.id)}
                    >
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {rec.bank_account_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {formatMonthYear(rec.month, rec.year, rec.period_start, rec.period_end)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                        {formatCurrency(parseFloat(rec.statement_balance))}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                        {formatCurrency(parseFloat(rec.book_balance))}
                      </td>
                      <td className={cn(
                        "px-6 py-4 text-sm text-right font-medium",
                        Math.abs(recDiff) < 0.01 ? "text-green-600" : "text-red-600"
                      )}>
                        {formatCurrency(recDiff)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Tooltip content={rec.status === 'completed' ? "Reconciliation has been finalized" : "Click to open workspace"}>
                          <span className={cn(
                            "px-2.5 py-1 text-xs rounded-full font-medium inline-flex items-center gap-1",
                            rec.status === 'completed'
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          )}>
                            {rec.status === 'completed' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <Clock className="w-3 h-3" />
                            )}
                            {rec.status === 'completed' ? 'Completed' : 'Draft'}
                          </span>
                        </Tooltip>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleExport(rec.id) }}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                            title="Export reconciliation"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Reconciliation Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false) }}
        title="New Reconciliation"
        description="Select a bank account and month to reconcile"
        icon={Scale}
        size="lg"
      >
        <form onSubmit={handleCreateSubmit}>
          <div className="space-y-4">
            <AsyncSelect
              label="Bank Account"
              placeholder="-- Select Bank Account --"
              value={createForm.bank_account}
              onChange={(val) => setCreateForm({ ...createForm, bank_account: String(val) })}
              options={bankAccounts.map((acc) => ({ value: acc.id, label: `${acc.name} (${acc.bank_name})` }))}
              required
              searchable
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Month <span className="text-red-500">*</span>
                </label>
                <select
                  value={createForm.month}
                  onChange={(e) => setCreateForm({ ...createForm, month: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx + 1} value={idx + 1}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Year <span className="text-red-500">*</span>
                </label>
                <select
                  value={createForm.year}
                  onChange={(e) => setCreateForm({ ...createForm, year: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Statement Balance <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={createForm.statement_balance}
                onChange={(e) => setCreateForm({ ...createForm, statement_balance: e.target.value })}
                placeholder="Enter the bank statement closing balance"
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                The book balance will be computed automatically from the General Ledger.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={createForm.notes}
                onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                placeholder="Optional notes about this reconciliation"
                rows={2}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <ModalFooter>
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create & Open Workspace
            </button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  )
}
