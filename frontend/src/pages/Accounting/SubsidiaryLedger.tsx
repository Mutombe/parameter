import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  BookOpen,
  Search,
  Filter,
  Users,
  Building2,
  User,
  Calendar,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Loader2,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react'
import { subsidiaryApi } from '../../services/api'
import { formatCurrency, formatDate, cn, useDebounce } from '../../lib/utils'
import { PageHeader, Button, Input, Select, Badge, EmptyState, Skeleton, Pagination } from '../../components/ui'
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
  debit_amount: string
  credit_amount: string
  balance: string
  created_at: string
}

interface StatementData {
  account: SubsidiaryAccount
  period_start: string
  period_end: string
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

  const debouncedSearch = useDebounce(search, 300)

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
    queryKey: ['subsidiary-statement', selectedAccount?.id, periodStart, periodEnd],
    queryFn: () => subsidiaryApi.statement(selectedAccount!.id, {
      period_start: periodStart,
      period_end: periodEnd,
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

  const handleExport = () => {
    if (!statement) return
    const rows = statement.transactions.map(t => ({
      'Txn #': t.transaction_number,
      Date: t.date,
      'Contra Acc': t.contra_account,
      Ref: t.reference,
      Description: t.description,
      Debit: t.debit_amount,
      Credit: t.credit_amount,
      Balance: t.balance,
    }))
    const columns = [
      { key: 'Txn #', header: 'Txn #' },
      { key: 'Date', header: 'Date' },
      { key: 'Contra Acc', header: 'Contra Acc' },
      { key: 'Ref', header: 'Ref' },
      { key: 'Description', header: 'Description' },
      { key: 'Debit', header: 'Debit' },
      { key: 'Credit', header: 'Credit' },
      { key: 'Balance', header: 'Balance' },
    ]
    exportTableData(rows, columns, `${statement.account.code}_statement`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subsidiary Ledger"
        subtitle="Trust accounting — tenant, landlord, and account holder statements"
        icon={BookOpen}
        actions={
          <Button variant="outline" size="sm" onClick={handleSync}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Sync Accounts
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left panel — Account list */}
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
                    onClick={() => setSelectedAccount(account)}
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

        {/* Right panel — Statement */}
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
                  <Button variant="outline" size="sm" onClick={handleExport} disabled={!statement}>
                    <Download className="w-4 h-4 mr-1.5" />
                    Export
                  </Button>
                </div>
              </div>

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
                          <th className="px-3 py-2.5 text-left font-medium text-gray-600 w-16">Txn #</th>
                          <th className="px-3 py-2.5 text-left font-medium text-gray-600 w-24">Date</th>
                          <th className="px-3 py-2.5 text-left font-medium text-gray-600 w-24">Contra Acc</th>
                          <th className="px-3 py-2.5 text-left font-medium text-gray-600 w-28">Ref</th>
                          <th className="px-3 py-2.5 text-left font-medium text-gray-600">Description</th>
                          <th className="px-3 py-2.5 text-right font-medium text-gray-600 w-24">Debit</th>
                          <th className="px-3 py-2.5 text-right font-medium text-gray-600 w-24">Credit</th>
                          <th className="px-3 py-2.5 text-right font-medium text-gray-600 w-28">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {/* Opening balance row */}
                        <tr className="bg-blue-50/30">
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
                        </tr>

                        {statement.transactions.map(txn => (
                          <tr key={txn.id} className="hover:bg-gray-50/50">
                            <td className="px-3 py-2 font-mono text-xs text-gray-500">{txn.transaction_number}</td>
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
                            <td className="px-3 py-2 text-xs text-gray-700 max-w-xs truncate" title={txn.description}>
                              {txn.description}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs">
                              {parseFloat(txn.debit_amount) > 0 && (
                                <span className="text-red-600">{formatCurrency(parseFloat(txn.debit_amount))}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs">
                              {parseFloat(txn.credit_amount) > 0 && (
                                <span className="text-green-600">{formatCurrency(parseFloat(txn.credit_amount))}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs font-medium">
                              {formatCurrency(parseFloat(txn.balance))}
                            </td>
                          </tr>
                        ))}

                        {/* Totals row */}
                        <tr className="bg-gray-50 border-t-2 font-medium">
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
