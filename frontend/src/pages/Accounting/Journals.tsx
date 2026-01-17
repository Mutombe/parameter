import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileSpreadsheet,
  Search,
  Filter,
  Plus,
  Check,
  RotateCcw,
  AlertCircle,
  Calendar,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Eye,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
} from 'lucide-react'
import { journalApi, accountApi } from '../../services/api'
import { formatCurrency, formatDate, cn, useDebounce } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Badge, EmptyState, Skeleton, Textarea } from '../../components/ui'
import toast from 'react-hot-toast'

interface JournalEntry {
  id?: number
  account: number
  account_code?: string
  account_name?: string
  description: string
  debit_amount: number
  credit_amount: number
}

interface Journal {
  id: number
  journal_number: string
  date: string
  description: string
  status: 'draft' | 'posted' | 'reversed'
  entries: JournalEntry[]
  total_debit: number
  total_credit: number
  created_at: string
  posted_at?: string
  reversed_at?: string
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
  reversed: {
    icon: RotateCcw,
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-300',
    label: 'Reversed',
  },
}

function SkeletonJournals() {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Journal Cards */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center gap-4">
            <Skeleton className="w-12 h-12 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
          <div className="p-4">
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Journals() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [expandedJournals, setExpandedJournals] = useState<Set<number>>(new Set())
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [postingId, setPostingId] = useState<number | null>(null)
  const [newJournal, setNewJournal] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    entries: [
      { account: 0, description: '', debit_amount: 0, credit_amount: 0 },
      { account: 0, description: '', debit_amount: 0, credit_amount: 0 },
    ] as JournalEntry[],
  })

  const { data: journals, isLoading } = useQuery({
    queryKey: ['journals', debouncedSearch, statusFilter],
    queryFn: () => {
      const params: any = {}
      if (debouncedSearch) params.search = debouncedSearch
      if (statusFilter) params.status = statusFilter
      return journalApi.list(params).then(r => r.data.results || r.data)
    },
  })

  const { data: accounts } = useQuery({
    queryKey: ['accounts-list'],
    queryFn: () => accountApi.list().then(r => r.data.results || r.data),
  })

  const postMutation = useMutation({
    mutationFn: (id: number) => journalApi.post(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journals'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Journal posted to ledger')
      setPostingId(null)
    },
    onError: () => {
      toast.error('Failed to post journal')
      setPostingId(null)
    },
  })

  const handlePost = (id: number) => {
    setPostingId(id)
    postMutation.mutate(id)
  }

  const reverseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => journalApi.reverse(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journals'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Journal reversed')
    },
    onError: () => {
      toast.error('Failed to reverse journal')
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof newJournal) => journalApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journals'] })
      toast.success('Journal entry created')
      setShowCreateModal(false)
      setNewJournal({
        date: new Date().toISOString().split('T')[0],
        description: '',
        entries: [
          { account: 0, description: '', debit_amount: 0, credit_amount: 0 },
          { account: 0, description: '', debit_amount: 0, credit_amount: 0 },
        ],
      })
    },
    onError: () => {
      toast.error('Failed to create journal')
    },
  })

  const toggleExpand = (id: number) => {
    const newExpanded = new Set(expandedJournals)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedJournals(newExpanded)
  }

  const addEntry = () => {
    setNewJournal({
      ...newJournal,
      entries: [...newJournal.entries, { account: 0, description: '', debit_amount: 0, credit_amount: 0 }],
    })
  }

  const removeEntry = (index: number) => {
    if (newJournal.entries.length > 2) {
      setNewJournal({
        ...newJournal,
        entries: newJournal.entries.filter((_, i) => i !== index),
      })
    }
  }

  const updateEntry = (index: number, field: string, value: any) => {
    const newEntries = [...newJournal.entries]
    newEntries[index] = { ...newEntries[index], [field]: value }
    setNewJournal({ ...newJournal, entries: newEntries })
  }

  const totalDebit = newJournal.entries.reduce((sum, e) => sum + (Number(e.debit_amount) || 0), 0)
  const totalCredit = newJournal.entries.reduce((sum, e) => sum + (Number(e.credit_amount) || 0), 0)
  const isBalanced = totalDebit > 0 && totalDebit === totalCredit

  // Stats
  const stats = {
    total: journals?.length || 0,
    draft: journals?.filter((j: Journal) => j.status === 'draft').length || 0,
    posted: journals?.filter((j: Journal) => j.status === 'posted').length || 0,
    reversed: journals?.filter((j: Journal) => j.status === 'reversed').length || 0,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal Entries"
        subtitle="Double-entry accounting transactions"
        icon={FileSpreadsheet}
        actions={
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Journal Entry
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          whileHover={{ y: -2 }}
          className="bg-white rounded-xl border border-gray-200 p-5"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Journals</p>
              {isLoading ? (
                <div className="h-8 w-12 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              )}
            </div>
          </div>
        </motion.div>

        {Object.entries(statusConfig).map(([status, config]) => {
          const StatusIcon = config.icon
          const count = stats[status as keyof typeof stats] || 0
          return (
            <motion.div
              key={status}
              whileHover={{ y: -2 }}
              onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
              className={cn(
                'bg-white rounded-xl border p-5 cursor-pointer transition-all',
                statusFilter === status ? config.borderColor : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <div className="flex items-center gap-4">
                <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', config.bgColor)}>
                  <StatusIcon className={cn('w-6 h-6', config.color)} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{config.label}</p>
                  {isLoading ? (
                    <div className="h-8 w-12 bg-gray-200 rounded animate-pulse mt-1" />
                  ) : (
                    <p className={cn('text-2xl font-bold', config.color)}>{count}</p>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by journal number or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
          <option value="reversed">Reversed</option>
        </select>

        <div className="ml-auto text-sm text-gray-500">
          {isLoading ? (
            <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
          ) : (
            <>{journals?.length || 0} entries</>
          )}
        </div>
      </div>

      {/* Journal List */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-24 bg-gray-200 rounded animate-pulse" />
                    <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
                  </div>
                  <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="text-right mr-4 space-y-1">
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                  <div className="h-5 w-24 bg-gray-200 rounded animate-pulse" />
                </div>
                <ChevronDown className="w-5 h-5 text-gray-400" />
              </div>
            </div>
          ))}
        </div>
      ) : !journals?.length ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="No journal entries"
              description="Create your first journal entry to record accounting transactions."
              action={
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Journal Entry
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              {journals.map((journal: Journal, index: number) => {
                const config = statusConfig[journal.status]
                const StatusIcon = config.icon
                const isExpanded = expandedJournals.has(journal.id)

                return (
                  <motion.div
                    key={journal.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                  >
                    {/* Journal Header */}
                    <div
                      className="p-5 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleExpand(journal.id)}
                    >
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white">
                        <FileSpreadsheet className="w-6 h-6" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-gray-900">{journal.journal_number}</h3>
                          <span className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                            config.bgColor, config.color
                          )}>
                            <StatusIcon className="w-3 h-3" />
                            {config.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 truncate mt-1">{journal.description}</p>
                      </div>

                      <div className="text-right mr-4">
                        <p className="text-sm text-gray-500">
                          <Calendar className="w-3.5 h-3.5 inline mr-1" />
                          {formatDate(journal.date)}
                        </p>
                        <p className="font-semibold text-gray-900 mt-1">
                          {formatCurrency(journal.total_debit)}
                        </p>
                      </div>

                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      </motion.div>
                    </div>

                    {/* Expanded Content */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="border-t border-gray-100"
                        >
                          {/* Entries Table */}
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Account</th>
                                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    <span className="inline-flex items-center gap-1">
                                      <ArrowUpRight className="w-3 h-3" />
                                      Debit
                                    </span>
                                  </th>
                                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    <span className="inline-flex items-center gap-1">
                                      <ArrowDownLeft className="w-3 h-3" />
                                      Credit
                                    </span>
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {journal.entries?.map((entry: JournalEntry, idx: number) => (
                                  <motion.tr
                                    key={entry.id || idx}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="hover:bg-gray-50"
                                  >
                                    <td className="px-6 py-4">
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-sm text-primary-600 font-medium">{entry.account_code}</span>
                                        <ArrowRight className="w-3 h-3 text-gray-300" />
                                        <span className="text-gray-700">{entry.account_name}</span>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{entry.description}</td>
                                    <td className="px-6 py-4 text-right">
                                      {entry.debit_amount > 0 ? (
                                        <span className="font-semibold text-blue-600 tabular-nums">
                                          {formatCurrency(entry.debit_amount)}
                                        </span>
                                      ) : (
                                        <span className="text-gray-300">-</span>
                                      )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                      {entry.credit_amount > 0 ? (
                                        <span className="font-semibold text-rose-600 tabular-nums">
                                          {formatCurrency(entry.credit_amount)}
                                        </span>
                                      ) : (
                                        <span className="text-gray-300">-</span>
                                      )}
                                    </td>
                                  </motion.tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-gray-50 font-semibold">
                                <tr>
                                  <td colSpan={2} className="px-6 py-3 text-right text-gray-700">Total</td>
                                  <td className="px-6 py-3 text-right text-blue-600 tabular-nums">{formatCurrency(journal.total_debit || 0)}</td>
                                  <td className="px-6 py-3 text-right text-rose-600 tabular-nums">{formatCurrency(journal.total_credit || 0)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>

                          {/* Actions */}
                          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                            <p className="text-sm text-gray-500">
                              Created {formatDate(journal.created_at)}
                              {journal.posted_at && ` • Posted ${formatDate(journal.posted_at)}`}
                              {journal.reversed_at && ` • Reversed ${formatDate(journal.reversed_at)}`}
                            </p>
                            <div className="flex items-center gap-2">
                              {journal.status === 'draft' && (
                                <Button
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handlePost(journal.id)
                                  }}
                                  disabled={postingId === journal.id}
                                  className="gap-2"
                                >
                                  {postingId === journal.id ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      Posting...
                                    </>
                                  ) : (
                                    <>
                                      <Send className="w-4 h-4" />
                                      Post to Ledger
                                    </>
                                  )}
                                </Button>
                              )}
                              {journal.status === 'posted' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const reason = prompt('Enter reason for reversal:')
                                    if (reason) {
                                      reverseMutation.mutate({ id: journal.id, reason })
                                    }
                                  }}
                                  disabled={reverseMutation.isPending}
                                  className="gap-2 text-gray-600"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                  Reverse
                                </Button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </div>
      )}

      {/* Create Journal Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Journal Entry"
        icon={Plus}
        size="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!isBalanced) {
              toast.error('Journal must be balanced (debits = credits)')
              return
            }
            createMutation.mutate(newJournal)
          }}
          className="space-y-6"
        >
          {/* Header Info */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              type="date"
              label="Date"
              value={newJournal.date}
              onChange={(e) => setNewJournal({ ...newJournal, date: e.target.value })}
              required
            />
            <div />
          </div>

          <Textarea
            label="Description"
            placeholder="Enter journal description..."
            value={newJournal.description}
            onChange={(e) => setNewJournal({ ...newJournal, description: e.target.value })}
            required
          />

          {/* Entries */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Journal Lines</label>
              <Button type="button" variant="outline" size="sm" onClick={addEntry}>
                <Plus className="w-3 h-3 mr-1" />
                Add Line
              </Button>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Account</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Description</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 w-28">Debit</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 w-28">Credit</th>
                    <th className="px-4 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {newJournal.entries.map((entry, index) => (
                    <tr key={index}>
                      <td className="px-4 py-2">
                        <select
                          value={entry.account}
                          onChange={(e) => updateEntry(index, 'account', Number(e.target.value))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          required
                        >
                          <option value={0}>Select account...</option>
                          {accounts?.map((acc: any) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.code} - {acc.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={entry.description}
                          onChange={(e) => updateEntry(index, 'description', e.target.value)}
                          placeholder="Line description"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={entry.debit_amount || ''}
                          onChange={(e) => {
                            updateEntry(index, 'debit_amount', Number(e.target.value))
                            if (Number(e.target.value) > 0) {
                              updateEntry(index, 'credit_amount', 0)
                            }
                          }}
                          placeholder="0.00"
                          className="w-full px-3 py-2 text-sm text-right border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 tabular-nums"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={entry.credit_amount || ''}
                          onChange={(e) => {
                            updateEntry(index, 'credit_amount', Number(e.target.value))
                            if (Number(e.target.value) > 0) {
                              updateEntry(index, 'debit_amount', 0)
                            }
                          }}
                          placeholder="0.00"
                          className="w-full px-3 py-2 text-sm text-right border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 tabular-nums"
                        />
                      </td>
                      <td className="px-4 py-2">
                        {newJournal.entries.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeEntry(index)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-right text-gray-700">Totals</td>
                    <td className="px-4 py-3 text-right text-blue-600 tabular-nums">{formatCurrency(totalDebit)}</td>
                    <td className="px-4 py-3 text-right text-rose-600 tabular-nums">{formatCurrency(totalCredit)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Balance Indicator */}
            <div className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-xl',
              isBalanced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            )}>
              {isBalanced ? (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Journal is balanced</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-medium">
                    {totalDebit === 0 && totalCredit === 0
                      ? 'Enter debit and credit amounts'
                      : `Out of balance by ${formatCurrency(Math.abs(totalDebit - totalCredit))}`
                    }
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={createMutation.isPending || !isBalanced}>
              {createMutation.isPending ? 'Creating...' : 'Create Journal'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
