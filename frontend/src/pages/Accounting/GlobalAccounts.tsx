import { useState, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  Wallet,
  Banknote,
  Building2,
  Plus,
  Search,
  Edit2,
  Trash2,
} from 'lucide-react'
import {
  PageHeader, Modal, Button, Input, Select, EmptyState,
  Tabs, TabsList, TabsTrigger, TabsContent, Skeleton,
} from '../../components/ui'
import { accountApi, supplierApi } from '../../services/api'
import { showToast, parseApiError } from '../../lib/toast'
import { cn, useDebounce } from '../../lib/utils'

/* Global Accounts page — three tabs:
 *
 *   • Assets       — ChartOfAccount with account_type='asset'
 *   • Liabilities  — ChartOfAccount with account_type='liability'
 *   • Suppliers    — Supplier model
 *
 * All three lists are GLOBAL — shared across every landlord in the
 * tenant. The Opening Balance form, Expense form, and reports use
 * them as a common reference set, with per-landlord exposure
 * computed from the transactions (which carry the landlord
 * dimension) rather than from the entities themselves.
 */
export default function GlobalAccounts() {
  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Assets & Liabilities"
        subtitle="Assets, Liabilities and Suppliers — shared across every landlord"
        icon={Wallet}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Assets & Liabilities' },
        ]}
      />

      <Tabs defaultValue="assets" className="space-y-6">
        <TabsList>
          <TabsTrigger value="assets" icon={Wallet}>Assets</TabsTrigger>
          <TabsTrigger value="liabilities" icon={Banknote}>Liabilities</TabsTrigger>
          <TabsTrigger value="suppliers" icon={Building2}>Suppliers</TabsTrigger>
        </TabsList>

        <TabsContent value="assets">
          <AccountsList accountType="asset" emptyHint="No asset accounts yet — add Motor Vehicles, Equipment, etc." />
        </TabsContent>
        <TabsContent value="liabilities">
          <AccountsList accountType="liability" emptyHint="No liability accounts yet — add Loans Payable, Accruals, etc." />
        </TabsContent>
        <TabsContent value="suppliers">
          <SuppliersList />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// --------------------------------------------------------------------------
// Assets / Liabilities (ChartOfAccount)
// --------------------------------------------------------------------------
function AccountsList({
  accountType,
  emptyHint,
}: {
  accountType: 'asset' | 'liability'
  emptyHint: string
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [currency, setCurrency] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState({
    code: '', name: '', account_subtype: '', description: '',
  })

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', accountType],
    queryFn: () =>
      accountApi.list({ account_type: accountType, page_size: 500 })
        .then((r: any) => r.data.results || r.data),
    placeholderData: keepPreviousData,
    staleTime: 30000,
  })

  // The currency column isn't reliably maintained on ZWG variants (they
  // carry "(ZWG)" in the name but currency='USD'), so derive it from the
  // name/code as a fallback.
  const currencyOf = (a: any) => {
    const n = (a.name || '').toLowerCase()
    if ((a.currency || '').toUpperCase() === 'ZWG' || n.includes('(zwg)') || n.includes('(zig)')) return 'ZWG'
    return 'USD'
  }
  const filtered = (accounts as any[]).filter((a: any) => {
    if (currency && currencyOf(a) !== currency) return false
    if (!debouncedSearch) return true
    const q = debouncedSearch.toLowerCase()
    return (
      (a.code || '').toLowerCase().includes(q) ||
      (a.name || '').toLowerCase().includes(q)
    )
  })

  // Assets are grouped into Non-Current (split Immovable vs Movable) and
  // Current. Computer equipment, furniture, vehicles etc. are movable
  // assets; land/buildings are immovable. Liabilities stay a single list.
  const IMMOVABLE_KW = ['land', 'building', 'property', 'premises', 'estate',
    'leasehold', 'freehold', 'structure', 'immovable']
  const assetGroupOf = (a: any) => {
    const isFixed = a.category === 'fixed_asset' || a.account_subtype === 'fixed_asset'
    if (!isFixed) return 'Current Assets'
    const n = (a.name || '').toLowerCase()
    return IMMOVABLE_KW.some(k => n.includes(k)) ? 'Immovable Assets' : 'Movable Assets'
  }
  const assetGroupOrder = ['Immovable Assets', 'Movable Assets', 'Current Assets']
  const groupedAssets: Array<[string, any[]]> = accountType === 'asset'
    ? assetGroupOrder
        .map((g) => [g, filtered.filter((a) => assetGroupOf(a) === g)] as [string, any[]])
        .filter(([, rows]) => rows.length > 0)
    : [['', filtered]]

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      editing
        ? accountApi.update(editing.id, data)
        : accountApi.create({ ...data, account_type: accountType }),
    onSuccess: () => {
      showToast.success(editing ? 'Account updated' : 'Account created')
      queryClient.invalidateQueries({ queryKey: ['accounts', accountType] })
      resetForm()
    },
    onError: (err) => showToast.error(parseApiError(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => accountApi.delete(id),
    onSuccess: () => {
      showToast.success('Account deleted')
      queryClient.invalidateQueries({ queryKey: ['accounts', accountType] })
    },
    onError: (err) => showToast.error(parseApiError(err)),
  })

  const resetForm = () => {
    setShowForm(false)
    setEditing(null)
    setForm({ code: '', name: '', account_subtype: '', description: '' })
  }

  const startEdit = (account: any) => {
    setEditing(account)
    setForm({
      code: account.code || '',
      name: account.name || '',
      account_subtype: account.account_subtype || '',
      description: account.description || '',
    })
    setShowForm(true)
  }

  // Subtype options scoped to the chosen account_type. Mirrors the
  // django-side AccountSubtype enum on ChartOfAccount.
  const subtypeOptions =
    accountType === 'asset'
      ? [
          { value: '', label: '—' },
          { value: 'bank', label: 'Bank' },
          { value: 'cash', label: 'Cash' },
          { value: 'accounts_receivable', label: 'Accounts Receivable' },
          { value: 'fixed_asset', label: 'Fixed Asset' },
          { value: 'inventory', label: 'Inventory' },
        ]
      : [
          { value: '', label: '—' },
          { value: 'accounts_payable', label: 'Accounts Payable' },
          { value: 'tenant_deposits', label: 'Tenant Deposits' },
          { value: 'vat_payable', label: 'VAT Payable' },
          { value: 'accrued_expenses', label: 'Accrued Expenses' },
          { value: 'loan_payable', label: 'Loan Payable' },
        ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${accountType} accounts...`}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={[
              { value: '', label: 'All currencies' },
              { value: 'USD', label: 'USD' },
              { value: 'ZWG', label: 'ZWG' },
            ]}
          />
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New {accountType === 'asset' ? 'Asset' : 'Liability'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={accountType === 'asset' ? Wallet : Banknote}
          title={debouncedSearch ? 'No matches' : `No ${accountType} accounts`}
          description={debouncedSearch ? 'Try a different search term.' : emptyHint}
          action={!debouncedSearch ? (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add the first one
            </Button>
          ) : undefined}
        />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-6 py-3 font-medium text-gray-500 uppercase tracking-wider text-xs">Code</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500 uppercase tracking-wider text-xs">Name</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500 uppercase tracking-wider text-xs">Subtype</th>
              <th className="text-right px-6 py-3 font-medium text-gray-500 uppercase tracking-wider text-xs">Balance</th>
              <th className="px-6 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {groupedAssets.map(([groupName, rows]) => (
              <Fragment key={groupName || 'all'}>
                {groupName && (
                  <tr className="bg-gray-50/70">
                    <td colSpan={5} className="px-6 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                      {groupName} <span className="text-gray-400 font-normal">· {rows.length}</span>
                    </td>
                  </tr>
                )}
                {rows.map((a: any) => (
                  <tr
                    key={a.id}
                    onClick={() => navigate(`/dashboard/global-accounts/${a.id}`)}
                    className="hover:bg-gray-50/40 cursor-pointer"
                  >
                    <td className="px-6 py-3 font-mono text-xs text-primary-600">{a.code}</td>
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {a.name}
                      {currencyOf(a) === 'ZWG' && (
                        <span className="ml-1.5 text-[10px] text-gray-400">ZWG</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs">
                      {(a.account_subtype || '—').replace(/_/g, ' ')}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-700">
                      {Number(a.current_balance || 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => startEdit(a)}
                          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {!a.is_system && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete "${a.name}"?`)) deleteMutation.mutate(a.id)
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        isOpen={showForm}
        onClose={resetForm}
        title={`${editing ? 'Edit' : 'New'} ${accountType === 'asset' ? 'Asset' : 'Liability'}`}
        size="md"
      >
        <form
          onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form) }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder={accountType === 'asset' ? 'e.g. 1500' : 'e.g. 2400'}
              required
            />
            <Select
              label="Subtype"
              value={form.account_subtype}
              onChange={(e) => setForm({ ...form, account_subtype: e.target.value })}
              options={subtypeOptions}
            />
          </div>
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={accountType === 'asset' ? 'e.g. Motor Vehicles' : 'e.g. Loans Payable'}
            required
          />
          <Input
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// --------------------------------------------------------------------------
// Suppliers
// --------------------------------------------------------------------------
function SuppliersList() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '', tax_id: '', notes: '',
  })

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => supplierApi.list({ page_size: 500 }).then((r: any) => r.data.results || r.data),
    placeholderData: keepPreviousData,
    staleTime: 30000,
  })

  const filtered = (suppliers as any[]).filter((s: any) => {
    if (!debouncedSearch) return true
    const q = debouncedSearch.toLowerCase()
    return (
      (s.code || '').toLowerCase().includes(q) ||
      (s.name || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q)
    )
  })

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      editing ? supplierApi.update(editing.id, data) : supplierApi.create(data),
    onSuccess: () => {
      showToast.success(editing ? 'Supplier updated' : 'Supplier created')
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      resetForm()
    },
    onError: (err) => showToast.error(parseApiError(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => supplierApi.delete(id),
    onSuccess: () => {
      showToast.success('Supplier deleted')
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
    onError: (err) => showToast.error(parseApiError(err)),
  })

  const resetForm = () => {
    setShowForm(false)
    setEditing(null)
    setForm({ name: '', email: '', phone: '', address: '', tax_id: '', notes: '' })
  }

  const startEdit = (s: any) => {
    setEditing(s)
    setForm({
      name: s.name || '',
      email: s.email || '',
      phone: s.phone || '',
      address: s.address || '',
      tax_id: s.tax_id || '',
      notes: s.notes || '',
    })
    setShowForm(true)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Supplier
        </Button>
      </div>

      {isLoading ? (
        <div className="p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={debouncedSearch ? 'No matches' : 'No suppliers yet'}
          description={
            debouncedSearch
              ? 'Try a different search term.'
              : 'Add suppliers like Apex Finance, ZESA, City of Harare.'
          }
          action={!debouncedSearch ? (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add the first one
            </Button>
          ) : undefined}
        />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-6 py-3 font-medium text-gray-500 uppercase tracking-wider text-xs">Code</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500 uppercase tracking-wider text-xs">Name</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500 uppercase tracking-wider text-xs">Contact</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500 uppercase tracking-wider text-xs">Tax ID</th>
              <th className="px-6 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((s: any) => (
              <tr
                key={s.id}
                onClick={() => navigate(`/dashboard/suppliers/${s.id}`)}
                className="hover:bg-gray-50/40 cursor-pointer"
              >
                <td className="px-6 py-3 font-mono text-xs text-gray-500">{s.code}</td>
                <td className="px-6 py-3 font-medium text-gray-900">{s.name}</td>
                <td className="px-6 py-3 text-gray-600 text-xs">
                  {s.email || '—'}
                  {s.phone && <div className="text-gray-400">{s.phone}</div>}
                </td>
                <td className="px-6 py-3 text-gray-500 text-xs">{s.tax_id || '—'}</td>
                <td className="px-6 py-3 text-right">
                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => startEdit(s)}
                      className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete "${s.name}"?`)) deleteMutation.mutate(s.id)
                      }}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        isOpen={showForm}
        onClose={resetForm}
        title={`${editing ? 'Edit' : 'New'} Supplier`}
        size="md"
      >
        <form
          onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form) }}
          className="space-y-4"
        >
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Apex Finance"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              type="email"
              label="Email (optional)"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              label="Phone (optional)"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <Input
            label="Address (optional)"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <Input
            label="Tax ID / VAT (optional)"
            value={form.tax_id}
            onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
