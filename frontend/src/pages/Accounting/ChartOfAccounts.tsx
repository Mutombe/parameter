import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Wallet,
  CreditCard,
  Scale,
  TrendingUp,
  TrendingDown,
  Database,
  RefreshCw,
  MoreVertical,
  Eye,
  Edit2,
  ArrowUpRight,
  ArrowDownLeft,
  Sparkles,
  Download,
} from 'lucide-react'
import { accountApi } from '../../services/api'
import { formatCurrency, cn } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Badge, EmptyState, Skeleton } from '../../components/ui'
import toast from 'react-hot-toast'
import { SelectionCheckbox, BulkActionsBar } from '../../components/ui'
import { exportTableData } from '../../lib/export'
import { useSelection } from '../../hooks/useSelection'

interface Account {
  id: number
  code: string
  name: string
  account_type: string
  account_subtype: string
  normal_balance: 'debit' | 'credit'
  current_balance: number
  is_system: boolean
  parent?: number
  children?: Account[]
}

const accountTypeConfig: Record<string, { icon: any; color: string; bgColor: string; borderColor: string; label: string }> = {
  asset: {
    icon: Wallet,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    label: 'Assets',
  },
  liability: {
    icon: CreditCard,
    color: 'text-rose-600',
    bgColor: 'bg-rose-50',
    borderColor: 'border-rose-200',
    label: 'Liabilities',
  },
  equity: {
    icon: Scale,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    label: 'Equity',
  },
  revenue: {
    icon: TrendingUp,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    label: 'Revenue',
  },
  expense: {
    icon: TrendingDown,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    label: 'Expenses',
  },
}

function SkeletonChartOfAccounts() {
  return (
    <div className="space-y-6">
      {/* Stats Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Table Skeleton */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="px-6 py-4 flex items-center gap-4">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 flex-1 max-w-xs" />
                <Skeleton className="h-4 w-24 ml-auto" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ChartOfAccounts() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(['asset', 'liability', 'equity', 'revenue', 'expense']))
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newAccount, setNewAccount] = useState({
    code: '',
    name: '',
    account_type: 'asset',
    account_subtype: 'current_asset',
  })

  const selection = useSelection<number>({ clearOnChange: [search, typeFilter] })

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountApi.list().then(r => r.data.results || r.data),
  })

  const seedMutation = useMutation({
    mutationFn: () => accountApi.seedDefaults(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Default accounts seeded successfully')
    },
    onError: () => {
      toast.error('Failed to seed accounts')
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof newAccount) => accountApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Account created successfully')
      setShowCreateModal(false)
      setNewAccount({ code: '', name: '', account_type: 'asset', account_subtype: 'current_asset' })
    },
    onError: () => {
      toast.error('Failed to create account')
    },
  })

  const filteredAccounts = accounts?.filter((account: Account) => {
    const matchesSearch = !search ||
      account.name.toLowerCase().includes(search.toLowerCase()) ||
      account.code.toLowerCase().includes(search.toLowerCase())
    const matchesType = !typeFilter || account.account_type === typeFilter
    return matchesSearch && matchesType
  }) || []

  const groupedAccounts = filteredAccounts.reduce((acc: Record<string, Account[]>, account: Account) => {
    if (!acc[account.account_type]) {
      acc[account.account_type] = []
    }
    acc[account.account_type].push(account)
    return acc
  }, {})

  const accountTypeTotals = Object.entries(groupedAccounts).reduce((acc, [type, accts]) => {
    acc[type] = (accts as Account[]).reduce((sum, a) => sum + Math.abs(a.current_balance || 0), 0)
    return acc
  }, {} as Record<string, number>)

  const toggleType = (type: string) => {
    const newExpanded = new Set(expandedTypes)
    if (newExpanded.has(type)) {
      newExpanded.delete(type)
    } else {
      newExpanded.add(type)
    }
    setExpandedTypes(newExpanded)
  }

  const subtypeOptions: Record<string, string[]> = {
    asset: ['current_asset', 'non_current_asset', 'bank', 'receivable'],
    liability: ['current_liability', 'non_current_liability', 'payable'],
    equity: ['capital', 'retained_earnings'],
    revenue: ['operating_revenue', 'other_income'],
    expense: ['operating_expense', 'cost_of_sales', 'other_expense'],
  }

  const allAccounts = accounts || []
  const selectableItems = Array.isArray(allAccounts) ? allAccounts.filter((a: any) => !a._isOptimistic) : []
  const pageIds = selectableItems.map((a: any) => a.id)

  const handleBulkExport = () => {
    const selected = selectableItems.filter((a: any) => selection.isSelected(a.id))
    exportTableData(selected, [
      { key: 'code', header: 'Code' },
      { key: 'name', header: 'Name' },
      { key: 'account_type', header: 'Type' },
      { key: 'current_balance', header: 'Balance' },
    ], 'chart_of_accounts_export')
    toast.success(`Exported ${selected.length} accounts`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chart of Accounts"
        subtitle="Double-entry bookkeeping account structure"
        icon={BookOpen}
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="gap-2"
            >
              <Database className="w-4 h-4" />
              {seedMutation.isPending ? 'Seeding...' : 'Seed Defaults'}
            </Button>
            <Button onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              New Account
            </Button>
          </div>
        }
      />

      {!accounts?.length && !isLoading ? (
        <EmptyState
          icon={BookOpen}
          title="No accounts found"
          description="Get started by seeding the default chart of accounts or create your first account manually."
          action={
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => seedMutation.mutate()}>
                <Database className="w-4 h-4 mr-2" />
                Seed Defaults
              </Button>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Account
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {/* Account Type Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {Object.entries(accountTypeConfig).map(([type, config]) => {
              const TypeIcon = config.icon
              const count = groupedAccounts[type]?.length || 0
              const total = accountTypeTotals[type] || 0
              return (
                <motion.div
                  key={type}
                  whileHover={{ y: -2 }}
                  className={cn(
                    'bg-white rounded-xl border p-4 cursor-pointer transition-all',
                    typeFilter === type ? config.borderColor : 'border-gray-200 hover:border-gray-300'
                  )}
                  onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', config.bgColor)}>
                      <TypeIcon className={cn('w-5 h-5', config.color)} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-medium">{config.label}</p>
                      {isLoading ? (
                        <>
                          <div className="h-6 w-20 bg-gray-200 rounded animate-pulse mt-1" />
                          <div className="h-3 w-16 bg-gray-200 rounded animate-pulse mt-1" />
                        </>
                      ) : (
                        <>
                          <p className={cn('text-lg font-bold', config.color)}>{formatCurrency(total)}</p>
                          <p className="text-xs text-gray-400">{count} accounts</p>
                        </>
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
                placeholder="Search by code or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
              />
            </div>
            {typeFilter && (
              <Badge
                variant="default"
                className="gap-1 cursor-pointer"
                onClick={() => setTypeFilter('')}
              >
                {accountTypeConfig[typeFilter]?.label}
                <span className="text-xs">×</span>
              </Badge>
            )}
            <div className="flex items-center gap-3 ml-auto">
              {pageIds.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-500">
                  <SelectionCheckbox
                    checked={selection.isAllPageSelected(pageIds)}
                    indeterminate={selection.isPartialPageSelected(pageIds)}
                    onChange={() => selection.selectPage(pageIds)}
                  />
                  Select all
                </label>
              )}
              <div className="text-sm text-gray-500">
                {isLoading ? (
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <>{filteredAccounts.length} accounts</>
                )}
              </div>
            </div>
          </div>

          {/* Account Groups */}
          <div className="space-y-4">
            {Object.entries(accountTypeConfig).map(([type, config]) => {
              const typeAccounts = groupedAccounts[type] || []
              if (typeAccounts.length === 0 && typeFilter && typeFilter !== type) return null

              const TypeIcon = config.icon
              const isExpanded = expandedTypes.has(type)
              const typeTotal = accountTypeTotals[type] || 0

              return (
                <motion.div
                  key={type}
                  layout
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  {/* Group Header */}
                  <button
                    onClick={() => toggleType(type)}
                    className={cn(
                      'w-full px-6 py-4 flex items-center justify-between transition-colors',
                      config.bgColor
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <motion.div
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronRight className={cn('w-5 h-5', config.color)} />
                      </motion.div>
                      <div className={cn('w-10 h-10 rounded-lg bg-white/50 flex items-center justify-center')}>
                        <TypeIcon className={cn('w-5 h-5', config.color)} />
                      </div>
                      <div className="text-left">
                        <h3 className={cn('font-semibold', config.color)}>{config.label}</h3>
                        <p className="text-xs text-gray-500">{typeAccounts.length} accounts</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn('text-lg font-bold', config.color)}>
                        {formatCurrency(typeTotal)}
                      </p>
                    </div>
                  </button>

                  {/* Accounts Table */}
                  <AnimatePresence>
                    {isExpanded && typeAccounts.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <table className="w-full">
                          <thead className="bg-gray-50 border-y border-gray-200">
                            <tr>
                              <th className="w-10 px-3 py-3"></th>
                              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Name</th>
                              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Sub-Type</th>
                              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Normal</th>
                              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {typeAccounts.map((account: Account, index: number) => (
                              <motion.tr
                                key={account.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.02 }}
                                className={cn(
                                  'hover:bg-gray-50 transition-colors group',
                                  selection.isSelected(account.id) && 'bg-primary-50'
                                )}
                              >
                                <td className="w-10 px-3 py-4">
                                  <SelectionCheckbox
                                    checked={selection.isSelected(account.id)}
                                    onChange={() => selection.toggle(account.id)}
                                  />
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', config.bgColor)}>
                                      <BookOpen className={cn('w-4 h-4', config.color)} />
                                    </div>
                                    <span className="font-mono font-semibold text-gray-900">{account.code}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-900">{account.name}</span>
                                    {account.is_system && (
                                      <Badge variant="secondary" className="text-xs">System</Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-xs font-medium text-gray-600 capitalize">
                                    {account.account_subtype?.replace(/_/g, ' ')}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  {account.normal_balance === 'debit' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium">
                                      <ArrowUpRight className="w-3 h-3" />
                                      Dr
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-50 text-rose-600 rounded-lg text-xs font-medium">
                                      <ArrowDownLeft className="w-3 h-3" />
                                      Cr
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <span className={cn(
                                    'font-semibold tabular-nums',
                                    account.current_balance >= 0 ? 'text-gray-900' : 'text-rose-600'
                                  )}>
                                    {formatCurrency(Math.abs(account.current_balance || 0))}
                                  </span>
                                </td>
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {isExpanded && typeAccounts.length === 0 && (
                    <div className="px-6 py-8 text-center text-gray-500 text-sm">
                      No {config.label.toLowerCase()} accounts found
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        </>
      )}

      {/* Create Account Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Account"
        icon={Plus}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createMutation.mutate(newAccount)
          }}
          className="space-y-5"
        >
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Account Code"
              placeholder="e.g., 1100"
              value={newAccount.code}
              onChange={(e) => setNewAccount({ ...newAccount, code: e.target.value })}
              required
            />
            <Select
              label="Account Type"
              value={newAccount.account_type}
              onChange={(e) => setNewAccount({
                ...newAccount,
                account_type: e.target.value,
                account_subtype: subtypeOptions[e.target.value][0]
              })}
            >
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
              <option value="equity">Equity</option>
              <option value="revenue">Revenue</option>
              <option value="expense">Expense</option>
            </Select>
          </div>

          <Input
            label="Account Name"
            placeholder="e.g., Accounts Receivable"
            value={newAccount.name}
            onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
            required
          />

          <Select
            label="Sub-Type"
            value={newAccount.account_subtype}
            onChange={(e) => setNewAccount({ ...newAccount, account_subtype: e.target.value })}
          >
            {subtypeOptions[newAccount.account_type]?.map((subtype) => (
              <option key={subtype} value={subtype}>
                {subtype.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </option>
            ))}
          </Select>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Account'}
            </Button>
          </div>
        </form>
      </Modal>

      <BulkActionsBar
        selectedCount={selection.selectedCount}
        onClearSelection={selection.clearSelection}
        entityName="accounts"
        actions={[
          { label: 'Export', icon: Download, onClick: handleBulkExport, variant: 'outline' },
        ]}
      />
    </div>
  )
}
