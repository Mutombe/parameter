import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Plus,
  Search,
  Building2,
  Smartphone,
  Wallet,
  MoreVertical,
  Edit2,
  Trash2,
  RefreshCw,
  DollarSign,
  Download,
} from 'lucide-react'
import { bankAccountApi } from '../../services/api'
import { formatCurrency, cn } from '../../lib/utils'
import { showToast } from '../../lib/toast'
import { SelectionCheckbox, BulkActionsBar, Tooltip } from '../../components/ui'
import { exportTableData } from '../../lib/export'
import { useSelection } from '../../hooks/useSelection'

interface BankAccount {
  id: number
  code: string
  name: string
  account_type: 'bank' | 'mobile_money' | 'cash'
  bank_name: string
  branch: string
  account_number: string
  currency: string
  current_balance: number
  gl_account: number
  gl_account_name: string
  is_active: boolean
}

export default function BankAccounts() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null)
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    account_type: 'bank',
    bank_name: '',
    branch: '',
    account_number: '',
    currency: 'USD',
    gl_account: '',
  })

  const selection = useSelection<number>({ clearOnChange: [searchQuery] })

  const { data, isLoading } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountApi.list().then(r => r.data.results || r.data),
  })

  const { data: summary } = useQuery({
    queryKey: ['bank-accounts-summary'],
    queryFn: () => bankAccountApi.summary().then(r => r.data),
  })

  const seedMutation = useMutation({
    mutationFn: () => bankAccountApi.seedDefaults(),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['bank-accounts-summary'] })
      showToast.success(response.data.message || 'Default accounts created')
    },
    onError: () => showToast.error('Failed to seed accounts'),
  })

  const accounts: BankAccount[] = data || []

  const filteredAccounts = accounts.filter(acc =>
    acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    acc.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    acc.bank_name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'bank': return Building2
      case 'mobile_money': return Smartphone
      case 'cash': return Wallet
      default: return DollarSign
    }
  }

  const getAccountColor = (type: string) => {
    switch (type) {
      case 'bank': return 'bg-blue-100 text-blue-600'
      case 'mobile_money': return 'bg-green-100 text-green-600'
      case 'cash': return 'bg-amber-100 text-amber-600'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const selectableItems = (accounts || []).filter((a: any) => !a._isOptimistic)
  const pageIds = selectableItems.map((a: any) => a.id)

  const handleBulkExport = () => {
    const selected = selectableItems.filter((a: any) => selection.isSelected(a.id))
    exportTableData(selected, [
      { key: 'name', header: 'Account Name' },
      { key: 'bank_name', header: 'Bank' },
      { key: 'account_number', header: 'Account Number' },
      { key: 'currency', header: 'Currency' },
      { key: 'current_balance', header: 'Balance' },
    ], 'bank_accounts_export')
    showToast.success(`Exported ${selected.length} bank accounts`)
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <button onClick={() => navigate('/dashboard')} className="hover:text-gray-900 transition-colors">Dashboard</button>
        <span>/</span>
        <span className="text-gray-900 font-medium">Bank Accounts</span>
      </nav>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bank Accounts</h1>
          <p className="text-gray-500 mt-1">Manage your bank and mobile money accounts</p>
        </div>
        <div className="flex items-center gap-3">
          {accounts.length === 0 && (
            <button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              <RefreshCw className={cn("w-4 h-4", seedMutation.isPending && "animate-spin")} />
              Seed Defaults
            </button>
          )}
          <button
            onClick={() => {
              setEditingAccount(null)
              setFormData({
                code: '',
                name: '',
                account_type: 'bank',
                bank_name: '',
                branch: '',
                account_number: '',
                currency: 'USD',
                gl_account: '',
              })
              setShowModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            Add Account
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {!summary && isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
              <div className="h-3 w-24 bg-gray-200 rounded mb-2" />
              <div className="h-7 w-28 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      ) : summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4" title="Combined balance across all USD accounts">
            <p className="text-sm text-gray-500">Total Balance (USD)</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(summary.total_usd || 0, 'USD')}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4" title="Combined balance across all ZWG accounts">
            <p className="text-sm text-gray-500">Total Balance (ZWG)</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(summary.total_zwg || 0, 'ZWG')}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4" title="Number of traditional bank accounts">
            <p className="text-sm text-gray-500">Bank Accounts</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.bank_count || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4" title="Number of mobile money accounts">
            <p className="text-sm text-gray-500">Mobile Money</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.mobile_money_count || 0}</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search accounts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
            />
          </div>
          {selectableItems.length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-500">
              <SelectionCheckbox
                checked={selection.isAllPageSelected(pageIds)}
                indeterminate={selection.isPartialPageSelected(pageIds)}
                onChange={() => selection.selectPage(pageIds)}
              />
              Select all
            </label>
          )}
        </div>
      </div>

      {/* Accounts Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-gray-200 rounded-xl" />
                <div className="w-6 h-6 bg-gray-100 rounded-lg" />
              </div>
              <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-24 bg-gray-200 rounded mb-1" />
              <div className="h-3 w-16 bg-gray-100 rounded" />
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="h-3 w-12 bg-gray-200 rounded mb-2" />
                <div className="h-6 w-28 bg-gray-200 rounded" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-5 w-14 bg-gray-200 rounded-full" />
                <div className="h-5 w-10 bg-gray-100 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No bank accounts</h3>
          <p className="text-gray-500 mb-4">Get started by adding your first bank account or seeding defaults.</p>
          <button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700"
          >
            Seed Default Accounts
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAccounts.map((account) => {
            const Icon = getAccountIcon(account.account_type)
            return (
              <motion.div
                key={account.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "bg-white rounded-xl border border-gray-200 p-6 pl-10 hover:shadow-lg transition-shadow relative",
                  selection.isSelected(account.id) && 'ring-2 ring-primary-500 bg-primary-50/30'
                )}
              >
                <div
                  className="absolute top-3 left-3 z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <SelectionCheckbox
                    checked={selection.isSelected(account.id)}
                    onChange={() => selection.toggle(account.id)}
                  />
                </div>
                <div className="flex items-start justify-between mb-4">
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", getAccountColor(account.account_type))}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Account options">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="font-semibold text-gray-900">{account.name}</h3>
                <p className="text-sm text-gray-500">{account.bank_name || account.account_type}</p>
                {account.account_number && (
                  <p className="text-xs text-gray-400 mt-1">****{account.account_number.slice(-4)}</p>
                )}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-500">Balance</p>
                  <p className="text-xl font-bold text-gray-900">
                    {formatCurrency(account.current_balance || 0, account.currency)}
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Tooltip content={account.is_active ? "This account is active and available for transactions" : "This account is inactive and cannot be used for transactions"}>
                    <span className={cn(
                      "px-2 py-0.5 text-xs rounded-full",
                      account.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                    )}>
                      {account.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </Tooltip>
                  <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                    {account.currency}
                  </span>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      <BulkActionsBar
        selectedCount={selection.selectedCount}
        onClearSelection={selection.clearSelection}
        entityName="bank accounts"
        actions={[
          { label: 'Export', icon: Download, onClick: handleBulkExport, variant: 'outline' },
        ]}
      />
    </div>
  )
}
