import { useState } from 'react'
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
  Zap,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { bankReconciliationApi, bankTransactionApi, bankAccountApi } from '../../services/api'
import { cn, formatCurrency, formatDate } from '../../lib/utils'
import { showToast, parseApiError } from '../../lib/toast'
import { Modal, ModalFooter, Tooltip } from '../../components/ui'
import { AsyncSelect } from '../../components/ui/AsyncSelect'

interface BankReconciliation {
  id: number
  bank_account: number
  bank_account_name: string
  period_start: string
  period_end: string
  statement_balance: string
  book_balance: string
  difference: string
  outstanding_deposits: string
  outstanding_withdrawals: string
  status: 'draft' | 'completed'
  notes: string
  created_at: string
  completed_at: string | null
}

interface BankTransaction {
  id: number
  bank_account: number
  bank_account_name: string
  transaction_date: string
  value_date: string
  reference: string
  description: string
  transaction_type: string
  amount: string
  status: string
  ai_match_confidence: number | null
}

interface BankAccount {
  id: number
  name: string
  bank_name: string
  account_number: string
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

const emptyForm = {
  bank_account: '',
  period_start: '',
  period_end: '',
  statement_balance: '',
  book_balance: '',
  outstanding_deposits: '0.00',
  outstanding_withdrawals: '0.00',
  notes: '',
}

export default function BankReconciliation() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [bankFilter, setBankFilter] = useState<string>('')

  // Queries
  const { data: summaryData } = useQuery({
    queryKey: ['bank-reconciliation-summary'],
    queryFn: () => bankReconciliationApi.summary().then(r => r.data),
  })

  const { data: reconciliationsData, isLoading } = useQuery({
    queryKey: ['bank-reconciliations'],
    queryFn: () => bankReconciliationApi.list().then(r => r.data.results || r.data),
  })

  const { data: bankAccountsData } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountApi.list().then(r => r.data.results || r.data),
  })

  const { data: unreconciledData, isLoading: unreconciledLoading } = useQuery({
    queryKey: ['unreconciled-transactions', bankFilter],
    queryFn: () => bankTransactionApi.unreconciled(bankFilter ? { bank_account: Number(bankFilter) } : undefined).then(r => r.data.transactions || r.data.results || r.data),
  })

  const summaries: ReconciliationSummary[] = Array.isArray(summaryData) ? summaryData : []
  const reconciliations: BankReconciliation[] = Array.isArray(reconciliationsData) ? reconciliationsData : []
  const bankAccounts: BankAccount[] = Array.isArray(bankAccountsData) ? bankAccountsData : []
  const unreconciledTxns: BankTransaction[] = Array.isArray(unreconciledData) ? unreconciledData : []

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = {
        ...data,
        bank_account: Number(data.bank_account),
      }
      return bankReconciliationApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliations'] })
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliation-summary'] })
      showToast.success('Reconciliation created')
      setShowModal(false)
      setForm(emptyForm)
    },
    onError: (error) => {
      showToast.error(parseApiError(error))
    },
  })

  const completeMutation = useMutation({
    mutationFn: (id: number) => bankReconciliationApi.complete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliations'] })
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliation-summary'] })
      showToast.success('Reconciliation completed')
    },
    onError: (error) => {
      showToast.error(parseApiError(error))
    },
  })

  const autoMatchMutation = useMutation({
    mutationFn: (bankAccountId: number) => bankTransactionApi.autoMatch(bankAccountId),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['unreconciled-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliation-summary'] })
      const matched = response.data?.matched_count || 0
      showToast.success(`Auto-matched ${matched} transaction${matched !== 1 ? 's' : ''}`)
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
      link.setAttribute('download', `reconciliation-${id}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      showToast.success('Export downloaded')
    } catch (error) {
      showToast.error(parseApiError(error))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.bank_account || !form.period_start || !form.period_end) {
      showToast.error('Please fill in all required fields')
      return
    }
    createMutation.mutate(form)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bank Reconciliation</h1>
          <p className="text-gray-500 mt-1">Match bank statements with book records</p>
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
      {summaries.length > 0 && (
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
                <div className="flex items-center justify-between text-sm" title="Date of the most recent completed reconciliation">
                  <span className="text-gray-500">Last Reconciled</span>
                  <span className="text-gray-700 font-medium">
                    {summary.last_reconciled ? formatDate(summary.last_reconciled) : 'Never'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm" title="Transactions not yet matched to bank statement entries">
                  <span className="text-gray-500">Pending Transactions</span>
                  <span className={cn(
                    "font-medium",
                    summary.pending_transactions > 0 ? "text-amber-600" : "text-green-600"
                  )}>
                    {summary.pending_transactions}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm" title="Difference between statement balance and book balance">
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

      {/* Reconciliation List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Reconciliation History</h2>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
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
                  const diff = parseFloat(rec.difference || '0')
                  return (
                    <motion.tr
                      key={rec.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {rec.bank_account_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {formatDate(rec.period_start)} — {formatDate(rec.period_end)}
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
                        diff === 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {formatCurrency(diff)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Tooltip content={rec.status === 'completed' ? "Reconciliation has been finalized" : "Reconciliation is still in progress"}>
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
                          {rec.status === 'draft' && (
                            <button
                              onClick={() => completeMutation.mutate(rec.id)}
                              disabled={completeMutation.isPending}
                              className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-medium"
                            >
                              Complete
                            </button>
                          )}
                          <button
                            onClick={() => handleExport(rec.id)}
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

      {/* Unreconciled Transactions */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Unreconciled Transactions</h2>
          <div className="flex items-center gap-3">
            <AsyncSelect
              placeholder="All Bank Accounts"
              value={bankFilter}
              onChange={(val) => setBankFilter(String(val))}
              options={bankAccounts.map((acc) => ({ value: acc.id, label: acc.name }))}
              searchable
              clearable
              className="min-w-[200px]"
            />
            {bankFilter && (
              <button
                onClick={() => autoMatchMutation.mutate(Number(bankFilter))}
                disabled={autoMatchMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 disabled:opacity-50"
              >
                {autoMatchMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                Auto Match
              </button>
            )}
          </div>
        </div>

        {unreconciledLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : unreconciledTxns.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">All caught up</h3>
            <p className="text-gray-500">No unreconciled transactions found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reference</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">AI Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {unreconciledTxns.map((txn, index) => (
                  <motion.tr
                    key={txn.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-3 text-sm text-gray-600">{formatDate(txn.transaction_date)}</td>
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{txn.reference || '—'}</td>
                    <td className="px-6 py-3 text-sm text-gray-600 max-w-xs truncate">{txn.description}</td>
                    <td className="px-6 py-3 text-center">
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium",
                        txn.transaction_type === 'credit'
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      )}>
                        {txn.transaction_type === 'credit' ? (
                          <ArrowDownRight className="w-3 h-3" />
                        ) : (
                          <ArrowUpRight className="w-3 h-3" />
                        )}
                        {txn.transaction_type}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-right font-medium text-gray-900">
                      {formatCurrency(parseFloat(txn.amount))}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {txn.ai_match_confidence !== null && txn.ai_match_confidence !== undefined ? (
                        <span className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          txn.ai_match_confidence >= 0.8 ? "bg-green-100 text-green-700" :
                          txn.ai_match_confidence >= 0.5 ? "bg-amber-100 text-amber-700" :
                          "bg-gray-100 text-gray-600"
                        )}>
                          {Math.round(txn.ai_match_confidence * 100)}%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Reconciliation Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setForm(emptyForm) }}
        title="New Reconciliation"
        description="Create a new bank reconciliation"
        icon={Scale}
        size="lg"
      >
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <AsyncSelect
              label="Bank Account"
              placeholder="— Select Bank Account —"
              value={form.bank_account}
              onChange={(val) => setForm({ ...form, bank_account: String(val) })}
              options={bankAccounts.map((acc) => ({ value: acc.id, label: `${acc.name} (${acc.bank_name})` }))}
              required
              searchable
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period Start <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.period_start}
                  onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period End <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.period_end}
                  onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Statement Balance <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.statement_balance}
                  onChange={(e) => setForm({ ...form, statement_balance: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Book Balance <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.book_balance}
                  onChange={(e) => setForm({ ...form, book_balance: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Outstanding Deposits</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.outstanding_deposits}
                  onChange={(e) => setForm({ ...form, outstanding_deposits: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Outstanding Withdrawals</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.outstanding_withdrawals}
                  onChange={(e) => setForm({ ...form, outstanding_withdrawals: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes about this reconciliation"
                rows={2}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <ModalFooter>
            <button
              type="button"
              onClick={() => { setShowModal(false); setForm(emptyForm) }}
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
              Create Reconciliation
            </button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  )
}
