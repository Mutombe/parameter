import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
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
  Building2,
  Banknote,
} from 'lucide-react'
import { accountApi } from '../../services/api'
import { AccountsList, SuppliersList } from './GlobalAccounts'
import { formatCurrency, cn } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Badge, EmptyState, Skeleton, Tooltip, Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui'
import toast from 'react-hot-toast'
import { SelectionCheckbox, BulkActionsBar } from '../../components/ui'
import { exportTableData } from '../../lib/export'
import { useSelection } from '../../hooks/useSelection'
import NewAccountWizard from '../../components/NewAccountWizard'

interface Account {
  id: number
  code: string
  name: string
  account_type: string
  account_subtype: string
  category?: string
  category_label?: string
  normal_balance: 'debit' | 'credit'
  current_balance: number
  is_system: boolean
  parent?: number
  children?: Account[]
}

// Keyed by the code-derived category (see "Account categories" spec). The
// chart groups accounts by these rather than the raw account_type, so a
// fixed asset mis-typed as an expense still lands under Fixed Assets.
// The 11 hierarchy subclasses, in canonical code-range order — this is
// the display order of the chart's groups. Grouping keys come from each
// account's `account_subclass` (level 3 of the hierarchy), with a
// code/category fallback for engine-created accounts without one.
const accountTypeConfig: Record<string, { icon: any; color: string; bgColor: string; borderColor: string; label: string; tooltip: string }> = {
  noncurrent_assets: {
    icon: Wallet, color: 'text-sky-700', bgColor: 'bg-sky-50', borderColor: 'border-sky-200',
    label: 'Fixed / Non-current Assets', tooltip: 'Land, buildings, vehicles, equipment (codes 0001-0999)',
  },
  current_assets: {
    icon: Wallet, color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200',
    label: 'Current Assets', tooltip: 'Cash, bank, receivables, prepayments (codes 1000-1999)',
  },
  current_liabilities: {
    icon: CreditCard, color: 'text-rose-600', bgColor: 'bg-rose-50', borderColor: 'border-rose-200',
    label: 'Current Liabilities', tooltip: 'Payables, deferred revenue, tax liabilities, trust (codes 2000-2999)',
  },
  equity: {
    icon: Scale, color: 'text-purple-600', bgColor: 'bg-purple-50', borderColor: 'border-purple-200',
    label: 'Equity', tooltip: "Owner's residual interest (codes 3000-3999)",
  },
  longterm_liabilities: {
    icon: CreditCard, color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200',
    label: 'Long-term Liabilities', tooltip: 'Mortgages and long-term loans (codes 4000-4999)',
  },
  property_income: {
    icon: TrendingUp, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200',
    label: 'Property Income', tooltip: 'Rent, levy, rates, parking, VAT, deposit income (codes 5000-5499)',
  },
  other_income: {
    icon: TrendingUp, color: 'text-teal-600', bgColor: 'bg-teal-50', borderColor: 'border-teal-200',
    label: 'Other Income', tooltip: 'Non-property income (codes 5500-5999)',
  },
  cost_of_sales: {
    icon: TrendingDown, color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200',
    label: 'Cost of Sales', tooltip: 'Agent commission / management fees (codes 6000-6999)',
  },
  operating_expenses: {
    icon: TrendingDown, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200',
    label: 'Operating Expenses', tooltip: 'Property running costs (codes 7000-7999)',
  },
  taxation_expense: {
    icon: TrendingDown, color: 'text-pink-600', bgColor: 'bg-pink-50', borderColor: 'border-pink-200',
    label: 'Taxation Expense', tooltip: 'Income, withholding, presumptive taxes (codes 8000-8999)',
  },
  suspense: {
    icon: Database, color: 'text-gray-600', bgColor: 'bg-gray-100', borderColor: 'border-gray-300',
    label: 'Suspense / Opening Balances', tooltip: 'Opening balances and unresolved items (codes 9000-9999)',
  },
}

// Resolve an account's group: the hierarchy subclass when present, else
// derive from the 4-digit code range, else from the legacy category.
function subclassOf(account: Account): string {
  const sc = (account as any).account_subclass
  if (sc && accountTypeConfig[sc]) return sc
  const n = parseInt(String(account.code), 10)
  if (!Number.isNaN(n) && /^\d+$/.test(String(account.code).trim())) {
    if (n <= 999) return 'noncurrent_assets'
    if (n <= 1999) return 'current_assets'
    if (n <= 2999) return 'current_liabilities'
    if (n <= 3999) return 'equity'
    if (n <= 4999) return 'longterm_liabilities'
    if (n <= 5499) return 'property_income'
    if (n <= 5999) return 'other_income'
    if (n <= 6999) return 'cost_of_sales'
    if (n <= 7999) return 'operating_expenses'
    if (n <= 8999) return 'taxation_expense'
    return 'suspense'
  }
  const byCategory: Record<string, string> = {
    fixed_asset: 'noncurrent_assets', current_asset: 'current_assets',
    current_liability: 'current_liabilities', long_term_liability: 'longterm_liabilities',
    equity: 'equity', revenue: 'property_income', expense: 'operating_expenses',
  }
  return byCategory[account.category || ''] || byCategory[account.account_type] || 'suspense'
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
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(Object.keys(accountTypeConfig)))
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newAccount, setNewAccount] = useState({
    code: '',
    name: '',
    account_type: 'asset',
    account_subtype: 'bank',
    balance_sheet_category: 'current_assets',
  })

  const selection = useSelection<number>({ clearOnChange: [search, typeFilter] })

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    // page_size 500: the default page (25) hid system accounts like the
    // Unpaid* deferred-revenue set and Agent Commission from the chart.
    queryFn: () => accountApi.list({ page_size: 500 }).then(r => r.data.results || r.data),
    placeholderData: keepPreviousData,
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
      setNewAccount({ code: '', name: '', account_type: 'asset', account_subtype: 'bank', balance_sheet_category: 'current_assets' })
    },
    onError: () => {
      toast.error('Failed to create account')
    },
  })

  const filteredAccounts = accounts?.filter((account: Account) => {
    // Deactivated accounts stay out of the chart — notably the retired
    // legacy 2200 Unpaid Rent, relocated into the 6000/010–070 range.
    if ((account as any).is_active === false) return false
    const matchesSearch = !search ||
      account.name.toLowerCase().includes(search.toLowerCase()) ||
      account.code.toLowerCase().includes(search.toLowerCase())
    const cat = subclassOf(account)
    const matchesType = !typeFilter || cat === typeFilter
    return matchesSearch && matchesType
  }) || []

  const groupedAccounts = filteredAccounts.reduce((acc: Record<string, Account[]>, account: Account) => {
    const cat = subclassOf(account)
    if (!acc[cat]) {
      acc[cat] = []
    }
    acc[cat].push(account)
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

  // Sub-type values match the backend AccountSubType enum. Assets carry the
  // six canonical kinds; the label is what the user sees.
  const subtypeOptions: Record<string, { value: string; label: string }[]> = {
    asset: [
      { value: 'bank', label: 'Bank' },
      { value: 'cash', label: 'Cash' },
      { value: 'accounts_receivable', label: 'Receivables' },
      { value: 'fixed_asset', label: 'Fixed Assets (Immovable)' },
      { value: 'movable_asset', label: 'Movable' },
      { value: 'investment', label: 'Investments' },
    ],
    liability: [
      { value: 'accounts_payable', label: 'Accounts Payable' },
      { value: 'accrued_liabilities', label: 'Accrued Liabilities' },
      { value: 'vat_payable', label: 'VAT Payable' },
      { value: 'tenant_deposits', label: 'Tenant Deposits' },
    ],
    equity: [
      { value: 'capital', label: 'Capital' },
      { value: 'retained_earnings', label: 'Retained Earnings' },
    ],
    revenue: [
      { value: 'rental_income', label: 'Rental Income' },
      { value: 'commission_income', label: 'Commission Income' },
      { value: 'other_income', label: 'Other Income' },
    ],
    expense: [
      { value: 'operating_expense', label: 'Operating Expense' },
      { value: 'maintenance', label: 'Maintenance & Repairs' },
      { value: 'utilities', label: 'Utilities' },
      { value: 'custom_expense', label: 'Custom Expense' },
    ],
  }

  // Mandatory landlord Balance Sheet sub-category for asset/liability
  // accounts. The report places each account STRICTLY under the bucket
  // chosen here, so it must be selected at creation.
  const bsCategoryOptions: Record<string, { value: string; label: string }[]> = {
    asset: [
      { value: 'non_current_assets', label: 'Non-Current Assets' },
      { value: 'current_assets', label: 'Current Assets' },
      { value: 'accounts_receivable', label: 'Accounts Receivables' },
      { value: 'investments', label: 'Investments' },
      { value: 'funds_held_in_trust', label: 'Funds Held In Trust' },
    ],
    liability: [
      { value: 'funds_owed_by_trust', label: 'Funds Owed by Trust' },
      { value: 'lessees_prepayments', label: 'Lessees Prepayments' },
      { value: 'accruals', label: 'Accruals' },
      { value: 'other_current_liabilities', label: 'Other Current Liabilities' },
    ],
  }
  const defaultBsCategory: Record<string, string> = {
    asset: 'current_assets',
    liability: 'other_current_liabilities',
  }
  const needsBsCategory = newAccount.account_type === 'asset' || newAccount.account_type === 'liability'

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
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Chart of Accounts' },
        ]}
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

      {/* The Assets & Liabilities and Suppliers registers live here now
          (moved from the retired Assets & Liabilities page) — grouping
          unchanged. All GL accounts are created via the single "New
          Account" button above. */}
      <Tabs defaultValue="chart" className="space-y-6">
        <TabsList>
          <TabsTrigger value="chart" icon={BookOpen}>Chart of Accounts</TabsTrigger>
          <TabsTrigger value="assets" icon={Wallet}>Assets</TabsTrigger>
          <TabsTrigger value="liabilities" icon={Banknote}>Liabilities</TabsTrigger>
          <TabsTrigger value="suppliers" icon={Building2}>Suppliers</TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="space-y-6">
      {isLoading ? (
        <SkeletonChartOfAccounts />
      ) : !accounts?.length ? (
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
          {/* Agent Accounts — ALWAYS in plain sight. Credited on every
              commission-charging receipt; click through for the statement
              with opening/running balance. */}
          {(() => {
            const list: any[] = allAccounts || []
            const commissionAcct = list.find((a: any) => a.account_subtype === 'commission_income')
              || list.find((a: any) => /agent commission|commission revenue/i.test(a.name || ''))
            const vatAcct = list.find((a: any) => a.code === '2110')
              || list.find((a: any) => a.account_subtype === 'vat_payable')
            const cards = [
              // GL 6000 agent-side display override: to the agency this is
              // income, so it's shown as positive "Agent Commission Income".
              // (Its underlying Cost-of-Sales classification is unchanged — that
              // is what Landlord reporting needs.)
              commissionAcct && { acct: commissionAcct, label: 'Agent Commission Income', desc: 'Commission earned on every receipted income item (rent, levy, maintenance, parking, rates, …)', income: true },
              vatAcct && { acct: vatAcct, label: 'VAT Payable (Commission)', desc: 'VAT charged on the agent commission of every receipt' },
            ].filter(Boolean) as Array<{ acct: any; label: string; desc: string; income?: boolean }>
            if (!cards.length) return null
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cards.map(({ acct, label, desc, income }) => (
                  <button
                    key={acct.id}
                    onClick={() => navigate(`/dashboard/global-accounts/${acct.id}`)}
                    className="text-left rounded-xl border-2 border-primary-200 bg-primary-50/40 p-5 hover:border-primary-400 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">{label}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{acct.code} · {income ? 'Agent Commission Income' : acct.name}</p>
                      </div>
                      <TrendingUp className="w-5 h-5 text-primary-500 shrink-0" />
                    </div>
                    {/* Agent view shows commission as positive income; the raw GL
                        balance (a credit on a Cost-of-Sales account) is negative. */}
                    <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">{formatCurrency(income ? Math.abs(Number(acct.current_balance || 0)) : Number(acct.current_balance || 0))}</p>
                    <p className="mt-1 text-xs text-gray-500">{desc}</p>
                    <p className="mt-2 text-xs font-medium text-primary-600">View statement (opening + running balance) →</p>
                  </button>
                ))}
              </div>
            )
          })()}

          {/* Account Type Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
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
                  title={config.tooltip}
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
                <span className="text-xs" title="Clear filter">×</span>
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
              if (typeAccounts.length === 0) return null

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
                        <div className="overflow-x-auto">
                        <table className="w-full min-w-[820px]">
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
                                onClick={() => navigate(`/dashboard/global-accounts/${account.id}`)}
                                className={cn(
                                  'hover:bg-gray-50 transition-colors group cursor-pointer',
                                  selection.isSelected(account.id) && 'bg-primary-50'
                                )}
                              >
                                <td className="w-10 px-3 py-4" onClick={(e) => e.stopPropagation()}>
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
                                    <Tooltip content="Normal balance is Debit — increases with debits">
                                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium">
                                        <ArrowUpRight className="w-3 h-3" />
                                        Dr
                                      </span>
                                    </Tooltip>
                                  ) : (
                                    <Tooltip content="Normal balance is Credit — increases with credits">
                                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-50 text-rose-600 rounded-lg text-xs font-medium">
                                        <ArrowDownLeft className="w-3 h-3" />
                                        Cr
                                      </span>
                                    </Tooltip>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <Tooltip content={`Current balance for ${account.name}`}>
                                    <span className={cn(
                                      'font-semibold tabular-nums',
                                      account.current_balance >= 0 ? 'text-gray-900' : 'text-rose-600'
                                    )}>
                                      {formatCurrency(Math.abs(account.current_balance || 0))}
                                    </span>
                                  </Tooltip>
                                </td>
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
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
        </TabsContent>

        <TabsContent value="assets">
          <AccountsList accountType="asset" emptyHint='No asset accounts yet — create one with the "New Account" button above.' />
        </TabsContent>
        <TabsContent value="liabilities">
          <AccountsList accountType="liability" emptyHint='No liability accounts yet — create one with the "New Account" button above.' />
        </TabsContent>
        <TabsContent value="suppliers">
          <SuppliersList />
        </TabsContent>
      </Tabs>

      {/* Create Account Modal — guided hierarchy wizard */}
      <NewAccountWizard open={showCreateModal} onClose={() => setShowCreateModal(false)} />

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
