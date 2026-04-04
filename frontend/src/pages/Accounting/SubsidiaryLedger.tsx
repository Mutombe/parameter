import { useState, useCallback } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  BookOpen,
  Search,
  Users,
  Building2,
  User,
  Loader2,
  Download,
  RefreshCw,
  Merge,
  Unlink,
  Edit3,
  Eye,
  FileText,
  ChevronDown,
  ChevronUp,
  X,
  Check,
} from 'lucide-react'
import { subsidiaryApi } from '../../services/api'
import { formatCurrency, cn, useDebounce } from '../../lib/utils'
import { PageHeader, Button, Input, Select, Badge, Skeleton, Pagination } from '../../components/ui'
import { exportTableData } from '../../lib/export'
import toast from 'react-hot-toast'

const PAGE_SIZE = 25

interface SubsidiaryAccount {
  id: number
  code: string
  name: string
  entity_type: 'tenant' | 'landlord' | 'account_holder'
  entity_name: string
  entity_id: number | null
  currency: string
  current_balance: string
  is_active: boolean
  transaction_count: number
  created_at: string
}

interface SubsidiaryTransaction {
  id: number
  transaction_number: number
  date: string
  contra_account: string
  reference: string
  description: string
  display_description: string
  debit_amount: string
  credit_amount: string
  balance: string
  is_reversal: boolean
  reversed_transaction: number | null
  is_consolidated: boolean
  consolidation_marker: string
  overwritten_description: string
  created_at: string
}

interface ConsolidationDetail {
  id: number
  source_transactions: SubsidiaryTransaction[]
  reason: string
  created_at: string
}

interface StatementData {
  account: SubsidiaryAccount
  period_start: string
  period_end: string
  view_mode: string
  opening_balance: string
  transactions: SubsidiaryTransaction[]
  total_debits: string
  total_credits: string
  closing_balance: string
}

const entityTypeLabels: Record<string, string> = {
  tenant: 'Tenant',
  landlord: 'Landlord',
  account_holder: 'Account Holder',
}

const entityTypeIcons: Record<string, typeof User> = {
  tenant: User,
  landlord: Building2,
  account_holder: Users,
}

export default function SubsidiaryLedger() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [entityTypeFilter, setEntityTypeFilter] = useState('')
  const [selectedAccount, setSelectedAccount] = useState<SubsidiaryAccount | null>(null)
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().split('T')[0])
  const [page, setPage] = useState(1)

  // View mode: consolidated (default) or audit
  const [viewMode, setViewMode] = useState<'consolidated' | 'audit'>('consolidated')

  // Selection state for consolidation
  const [selectedTxnIds, setSelectedTxnIds] = useState<Set<number>>(new Set())
  const [isConsolidating, setIsConsolidating] = useState(false)
  const [consolidateDesc, setConsolidateDesc] = useState('')
  const [consolidateReason, setConsolidateReason] = useState('')

  // Expanded consolidation detail
  const [expandedConsolidation, setExpandedConsolidation] = useState<number | null>(null)
  const [consolidationDetail, setConsolidationDetail] = useState<ConsolidationDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Narration overwrite
  const [editingNarrationId, setEditingNarrationId] = useState<number | null>(null)
  const [narrationText, setNarrationText] = useState('')

  const debouncedSearch = useDebounce(search, 300)

  const invalidateStatement = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['subsidiary-statement'] })
  }, [queryClient])

  // Fetch accounts list
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['subsidiary-accounts', debouncedSearch, entityTypeFilter, page],
    queryFn: () => subsidiaryApi.list({
      search: debouncedSearch || undefined,
      entity_type: entityTypeFilter || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
  })

  const accounts: SubsidiaryAccount[] = accountsData?.data?.results || accountsData?.data || []
  const totalCount = accountsData?.data?.count || accounts.length

  // Fetch statement for selected account
  const { data: statementData, isLoading: statementLoading } = useQuery({
    queryKey: ['subsidiary-statement', selectedAccount?.id, periodStart, periodEnd, viewMode],
    queryFn: () => subsidiaryApi.statement(selectedAccount!.id, {
      period_start: periodStart,
      period_end: periodEnd,
      view: viewMode,
    }),
    enabled: !!selectedAccount,
    placeholderData: keepPreviousData,
  })

  const statement: StatementData | null = statementData?.data || null

  const handleSync = async () => {
    try {
      await subsidiaryApi.syncAccounts()
      toast.success('Subsidiary accounts synced')
    } catch {
      toast.error('Failed to sync accounts')
    }
  }

  const handleExport = async (format: 'csv' | 'pdf' = 'csv') => {
    if (!selectedAccount) return
    try {
      const res = await subsidiaryApi.exportStatement(selectedAccount.id, {
        period_start: periodStart,
        period_end: periodEnd,
        view: viewMode,
        format,
      })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `${selectedAccount.code.replace(/\//g, '-')}_statement.${format}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Statement exported')
    } catch {
      toast.error('Failed to export statement')
    }
  }

  // Toggle transaction selection for consolidation
  const toggleTxnSelection = (id: number) => {
    setSelectedTxnIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Consolidate selected transactions
  const handleConsolidate = async () => {
    if (!selectedAccount || selectedTxnIds.size < 2) return
    setIsConsolidating(true)
    try {
      await subsidiaryApi.consolidate(selectedAccount.id, {
        transaction_ids: Array.from(selectedTxnIds),
        description: consolidateDesc || undefined,
        reason: consolidateReason || undefined,
      })
      toast.success(`Consolidated ${selectedTxnIds.size} transactions`)
      setSelectedTxnIds(new Set())
      setConsolidateDesc('')
      setConsolidateReason('')
      invalidateStatement()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to consolidate')
    } finally {
      setIsConsolidating(false)
    }
  }

  // Expand a consolidated entry to see underlying transactions
  const handleExpandConsolidation = async (entryId: number) => {
    if (!selectedAccount) return
    if (expandedConsolidation === entryId) {
      setExpandedConsolidation(null)
      setConsolidationDetail(null)
      return
    }
    setExpandedConsolidation(entryId)
    setLoadingDetail(true)
    try {
      const res = await subsidiaryApi.consolidationDetail(selectedAccount.id, { entry_id: entryId })
      setConsolidationDetail(res.data)
    } catch {
      toast.error('Failed to load consolidation details')
      setExpandedConsolidation(null)
    } finally {
      setLoadingDetail(false)
    }
  }

  // Unmerge a consolidation
  const handleUnmerge = async (consolidationId: number) => {
    if (!selectedAccount) return
    try {
      await subsidiaryApi.unmerge(selectedAccount.id, { consolidation_id: consolidationId })
      toast.success('Transactions unmerged')
      setExpandedConsolidation(null)
      setConsolidationDetail(null)
      invalidateStatement()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to unmerge')
    }
  }

  // Overwrite narration
  const handleOverwriteNarration = async (txnId: number) => {
    if (!selectedAccount || !narrationText.trim()) return
    try {
      await subsidiaryApi.overwriteNarration(selectedAccount.id, {
        transaction_id: txnId,
        description: narrationText,
      })
      toast.success('Narration updated')
      setEditingNarrationId(null)
      setNarrationText('')
      invalidateStatement()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update narration')
    }
  }

  const startEditNarration = (txn: SubsidiaryTransaction) => {
    setEditingNarrationId(txn.id)
    setNarrationText(txn.overwritten_description || txn.description)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subsidiary Ledger"
        subtitle="Trust accounting -- tenant, landlord, and account holder statements"
        icon={BookOpen}
        actions={
          <Button variant="outline" size="sm" onClick={handleSync}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Sync Accounts
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left panel -- Account list */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search accounts..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <Select
            value={entityTypeFilter}
            onChange={e => { setEntityTypeFilter(e.target.value); setPage(1) }}
          >
            <option value="">All Types</option>
            <option value="tenant">Tenants</option>
            <option value="landlord">Landlords</option>
            <option value="account_holder">Account Holders</option>
          </Select>

          <div className="border rounded-xl divide-y max-h-[600px] overflow-y-auto">
            {accountsLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : accounts.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                No accounts found. Click "Sync Accounts" to create them.
              </div>
            ) : (
              accounts.map(account => {
                const Icon = entityTypeIcons[account.entity_type] || User
                const isSelected = selectedAccount?.id === account.id
                return (
                  <button
                    key={account.id}
                    onClick={() => {
                      setSelectedAccount(account)
                      setSelectedTxnIds(new Set())
                      setExpandedConsolidation(null)
                    }}
                    className={cn(
                      'w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors',
                      isSelected && 'bg-blue-50 border-l-2 border-l-blue-500'
                    )}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium',
                      account.entity_type === 'landlord' ? 'bg-green-100 text-green-700' :
                      account.entity_type === 'account_holder' ? 'bg-purple-100 text-purple-700' :
                      'bg-blue-100 text-blue-700'
                    )}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{account.name}</div>
                      <div className="text-xs text-gray-500">{account.code}</div>
                    </div>
                    <div className="text-right">
                      <div className={cn(
                        'text-sm font-mono font-medium',
                        parseFloat(account.current_balance) < 0 ? 'text-red-600' : 'text-gray-900'
                      )}>
                        {formatCurrency(parseFloat(account.current_balance))}
                      </div>
                      <div className="text-xs text-gray-400">
                        {account.transaction_count} txns
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {totalCount > PAGE_SIZE && (
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(totalCount / PAGE_SIZE)}
              totalItems={totalCount}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          )}
        </div>

        {/* Right panel -- Statement */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedAccount ? (
            <div className="border rounded-xl p-12 text-center text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Select an account to view its statement</p>
              <p className="text-sm mt-1">Choose a tenant or landlord from the left panel</p>
            </div>
          ) : (
            <>
              {/* Statement Header */}
              <div className="border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold">{selectedAccount.name}</h3>
                    <p className="text-sm text-gray-500">
                      {entityTypeLabels[selectedAccount.entity_type]} &middot; {selectedAccount.code} &middot; {selectedAccount.currency}
                    </p>
                  </div>
                  <Badge variant={
                    selectedAccount.entity_type === 'landlord' ? 'success' :
                    selectedAccount.entity_type === 'account_holder' ? 'warning' : 'info'
                  }>
                    {entityTypeLabels[selectedAccount.entity_type]}
                  </Badge>
                </div>

                {/* View mode toggle */}
                <div className="flex items-center gap-4 mb-3">
                  <span className="text-xs font-medium text-gray-500">View:</span>
                  <div className="inline-flex rounded-lg border overflow-hidden">
                    <button
                      onClick={() => { setViewMode('consolidated'); setSelectedTxnIds(new Set()) }}
                      className={cn(
                        'px-3 py-1.5 text-xs font-medium transition-colors',
                        viewMode === 'consolidated'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      <Eye className="w-3.5 h-3.5 inline mr-1" />
                      Consolidated
                    </button>
                    <button
                      onClick={() => { setViewMode('audit'); setSelectedTxnIds(new Set()) }}
                      className={cn(
                        'px-3 py-1.5 text-xs font-medium transition-colors',
                        viewMode === 'audit'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      <FileText className="w-3.5 h-3.5 inline mr-1" />
                      Audit
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-600 block mb-1">From</label>
                    <Input
                      type="date"
                      value={periodStart}
                      onChange={e => setPeriodStart(e.target.value)}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-600 block mb-1">To</label>
                    <Input
                      type="date"
                      value={periodEnd}
                      onChange={e => setPeriodEnd(e.target.value)}
                    />
                  </div>
                  <div className="relative group">
                    <Button variant="outline" size="sm" disabled={!statement}>
                      <Download className="w-4 h-4 mr-1.5" />
                      Export
                    </Button>
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg hidden group-hover:block z-10 min-w-[100px]">
                      <button onClick={() => handleExport('csv')} className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left rounded-t-lg">CSV</button>
                      <button onClick={() => handleExport('pdf')} className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left rounded-b-lg">PDF</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Consolidation toolbar */}
              {selectedTxnIds.size >= 2 && (
                <div className="border rounded-xl p-3 bg-amber-50 border-amber-200">
                  <div className="flex items-center gap-3 mb-2">
                    <Merge className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-800">
                      {selectedTxnIds.size} transactions selected for consolidation
                    </span>
                    <button
                      onClick={() => setSelectedTxnIds(new Set())}
                      className="ml-auto text-amber-600 hover:text-amber-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Input
                        placeholder="New description (optional)"
                        value={consolidateDesc}
                        onChange={e => setConsolidateDesc(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        placeholder="Reason (optional)"
                        value={consolidateReason}
                        onChange={e => setConsolidateReason(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={handleConsolidate}
                      disabled={isConsolidating}
                    >
                      {isConsolidating ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <Merge className="w-4 h-4 mr-1" />
                      )}
                      Consolidate
                    </Button>
                  </div>
                </div>
              )}

              {/* Statement Table */}
              {statementLoading ? (
                <div className="border rounded-xl p-6">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                </div>
              ) : statement ? (
                <div className="border rounded-xl overflow-hidden">
                  {/* Summary row */}
                  <div className="bg-gray-50 px-4 py-3 flex items-center justify-between text-sm border-b">
                    <span className="text-gray-600">
                      {statement.transactions.length} transaction(s) in period
                      {viewMode === 'consolidated' && (
                        <span className="ml-1 text-blue-600">(consolidated view)</span>
                      )}
                      {viewMode === 'audit' && (
                        <span className="ml-1 text-orange-600">(audit view - all entries)</span>
                      )}
                    </span>
                    <div className="flex gap-6">
                      <span>Debits: <strong className="font-mono">{formatCurrency(parseFloat(statement.total_debits))}</strong></span>
                      <span>Credits: <strong className="font-mono">{formatCurrency(parseFloat(statement.total_credits))}</strong></span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50/50 border-b">
                          <th className="px-2 py-2.5 w-8"></th>
                          <th className="px-3 py-2.5 text-left font-medium text-gray-600 w-16">Txn #</th>
                          <th className="px-3 py-2.5 text-left font-medium text-gray-600 w-24">Date</th>
                          <th className="px-3 py-2.5 text-left font-medium text-gray-600 w-24">Contra Acc</th>
                          <th className="px-3 py-2.5 text-left font-medium text-gray-600 w-28">Ref</th>
                          <th className="px-3 py-2.5 text-left font-medium text-gray-600">Description</th>
                          <th className="px-3 py-2.5 text-right font-medium text-gray-600 w-24">Debit</th>
                          <th className="px-3 py-2.5 text-right font-medium text-gray-600 w-24">Credit</th>
                          <th className="px-3 py-2.5 text-right font-medium text-gray-600 w-28">Balance</th>
                          <th className="px-2 py-2.5 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {/* Opening balance row */}
                        <tr className="bg-blue-50/30">
                          <td className="px-2 py-2"></td>
                          <td className="px-3 py-2"></td>
                          <td className="px-3 py-2 font-mono text-xs">{statement.period_start}</td>
                          <td className="px-3 py-2"></td>
                          <td className="px-3 py-2"></td>
                          <td className="px-3 py-2 font-medium text-gray-700">Balance brought forward</td>
                          <td className="px-3 py-2"></td>
                          <td className="px-3 py-2"></td>
                          <td className="px-3 py-2 text-right font-mono font-medium">
                            {formatCurrency(parseFloat(statement.opening_balance))}
                          </td>
                          <td className="px-2 py-2"></td>
                        </tr>

                        {statement.transactions.map(txn => {
                          const isConsolidatedEntry = txn.consolidation_marker === 'C'
                          const isExpanded = expandedConsolidation === txn.id
                          const isSelected = selectedTxnIds.has(txn.id)
                          const debit = parseFloat(txn.debit_amount)
                          const credit = parseFloat(txn.credit_amount)

                          return (
                            <>{/* Fragment for main row + optional expansion */}
                              <tr
                                key={txn.id}
                                className={cn(
                                  'hover:bg-gray-50/50 group',
                                  txn.is_reversal && 'bg-red-50/30',
                                  txn.is_consolidated && viewMode === 'audit' && 'bg-gray-100/50 opacity-60',
                                  isConsolidatedEntry && 'bg-amber-50/30',
                                  isSelected && 'bg-blue-50',
                                )}
                              >
                                {/* Checkbox for consolidation selection */}
                                <td className="px-2 py-2 text-center">
                                  {!isConsolidatedEntry && !txn.is_consolidated && (
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleTxnSelection(txn.id)}
                                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                  )}
                                  {isConsolidatedEntry && (
                                    <button
                                      onClick={() => handleExpandConsolidation(txn.id)}
                                      className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-100 text-amber-700 text-xs font-bold hover:bg-amber-200 transition-colors"
                                      title="Consolidated entry - click to expand"
                                    >
                                      C
                                    </button>
                                  )}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs text-gray-500">
                                  {txn.transaction_number}
                                  {txn.is_reversal && (
                                    <span className="ml-1 text-red-500 text-[10px]">REV</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">{txn.date}</td>
                                <td className="px-3 py-2">
                                  <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                                    {txn.contra_account}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <span className={cn(
                                    'text-xs font-mono',
                                    txn.reference.startsWith('INV') ? 'text-blue-600' :
                                    txn.reference.startsWith('RCT') ? 'text-green-600' :
                                    txn.reference.startsWith('CMA') ? 'text-orange-600' :
                                    txn.reference.startsWith('EXP') ? 'text-red-600' :
                                    'text-gray-600'
                                  )}>
                                    {txn.reference}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-700 max-w-xs">
                                  {editingNarrationId === txn.id ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="text"
                                        value={narrationText}
                                        onChange={e => setNarrationText(e.target.value)}
                                        className="flex-1 border rounded px-2 py-0.5 text-xs"
                                        autoFocus
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') handleOverwriteNarration(txn.id)
                                          if (e.key === 'Escape') setEditingNarrationId(null)
                                        }}
                                      />
                                      <button
                                        onClick={() => handleOverwriteNarration(txn.id)}
                                        className="text-green-600 hover:text-green-800"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => setEditingNarrationId(null)}
                                        className="text-gray-400 hover:text-gray-600"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span
                                      className="truncate block cursor-default"
                                      title={txn.display_description || txn.description}
                                    >
                                      {txn.overwritten_description && (
                                        <span className="text-purple-500 text-[10px] mr-1" title="Narration overwritten">OW</span>
                                      )}
                                      {txn.display_description || txn.description}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-xs">
                                  {debit !== 0 && (
                                    <span className={debit < 0 ? 'text-orange-600' : 'text-red-600'}>
                                      {formatCurrency(debit)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-xs">
                                  {credit !== 0 && (
                                    <span className={credit < 0 ? 'text-orange-600' : 'text-green-600'}>
                                      {formatCurrency(credit)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-xs font-medium">
                                  {formatCurrency(parseFloat(txn.balance))}
                                </td>
                                {/* Actions */}
                                <td className="px-2 py-2">
                                  <button
                                    onClick={() => startEditNarration(txn)}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-all"
                                    title="Edit narration"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>

                              {/* Expanded consolidation detail */}
                              {isConsolidatedEntry && isExpanded && (
                                <tr key={`detail-${txn.id}`}>
                                  <td colSpan={10} className="px-0 py-0">
                                    <div className="bg-amber-50 border-t border-b border-amber-200 px-6 py-3">
                                      {loadingDetail ? (
                                        <div className="text-center py-2">
                                          <Loader2 className="w-4 h-4 animate-spin inline text-amber-600" />
                                          <span className="ml-2 text-sm text-amber-700">Loading details...</span>
                                        </div>
                                      ) : consolidationDetail ? (
                                        <div>
                                          <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-medium text-amber-800">
                                              Merged from {consolidationDetail.source_transactions.length} transactions
                                              {consolidationDetail.reason && (
                                                <span className="ml-2 text-amber-600">-- {consolidationDetail.reason}</span>
                                              )}
                                            </span>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleUnmerge(consolidationDetail.id)}
                                              className="text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                                            >
                                              <Unlink className="w-3.5 h-3.5 mr-1" />
                                              Unmerge
                                            </Button>
                                          </div>
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="text-amber-700">
                                                <th className="text-left py-1 px-2">Txn #</th>
                                                <th className="text-left py-1 px-2">Date</th>
                                                <th className="text-left py-1 px-2">Contra</th>
                                                <th className="text-left py-1 px-2">Ref</th>
                                                <th className="text-left py-1 px-2">Description</th>
                                                <th className="text-right py-1 px-2">Debit</th>
                                                <th className="text-right py-1 px-2">Credit</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {consolidationDetail.source_transactions.map(st => (
                                                <tr key={st.id} className="border-t border-amber-200/50">
                                                  <td className="py-1 px-2 font-mono">{st.transaction_number}</td>
                                                  <td className="py-1 px-2 font-mono">{st.date}</td>
                                                  <td className="py-1 px-2 font-mono">{st.contra_account}</td>
                                                  <td className="py-1 px-2 font-mono">{st.reference}</td>
                                                  <td className="py-1 px-2">{st.description}</td>
                                                  <td className="py-1 px-2 text-right font-mono">
                                                    {parseFloat(st.debit_amount) !== 0 && formatCurrency(parseFloat(st.debit_amount))}
                                                  </td>
                                                  <td className="py-1 px-2 text-right font-mono">
                                                    {parseFloat(st.credit_amount) !== 0 && formatCurrency(parseFloat(st.credit_amount))}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          )
                        })}

                        {/* Totals row */}
                        <tr className="bg-gray-50 border-t-2 font-medium">
                          <td className="px-2 py-2.5" />
                          <td className="px-3 py-2.5" colSpan={5} />
                          <td className="px-3 py-2.5 text-right font-mono text-sm">
                            {formatCurrency(parseFloat(statement.total_debits))}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-sm">
                            {formatCurrency(parseFloat(statement.total_credits))}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-sm font-bold">
                            {formatCurrency(parseFloat(statement.closing_balance))}
                          </td>
                          <td className="px-2 py-2.5" />
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {statement.transactions.length === 0 && (
                    <div className="p-8 text-center text-gray-500 text-sm">
                      No transactions in this period
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
