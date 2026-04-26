import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Edit2, Mail, Phone, CreditCard, Wallet, Calendar, FileText,
  Briefcase, Plus, Layers, ChevronLeft, ChevronRight, Search, Building2,
} from 'lucide-react'
import { TbUserSquareRounded } from 'react-icons/tb'
import { accountHolderApi, invoiceApi, receiptApi, subsidiaryApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { Modal, Button, Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'
import { usePagination } from '../../hooks/usePagination'
import { usePrefetch } from '../../hooks/usePrefetch'
import TenantForm from '../../components/forms/TenantForm'

function shiftISODate(value: string, days: number): string {
  if (!value) {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  }
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1)
  dt.setDate(dt.getDate() + days)
  const yyyy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function DateNav({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel?: string }) {
  return (
    <div className="inline-flex items-center">
      <button
        type="button"
        aria-label={`Previous day${ariaLabel ? ` for ${ariaLabel}` : ''}`}
        onClick={() => onChange(shiftISODate(value, -1))}
        className="h-[30px] w-7 flex items-center justify-center border border-gray-200 rounded-l-lg bg-white text-gray-500 hover:bg-gray-50"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="h-[30px] px-2 text-sm border-y border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <button
        type="button"
        aria-label={`Next day${ariaLabel ? ` for ${ariaLabel}` : ''}`}
        onClick={() => onChange(shiftISODate(value, 1))}
        className="h-[30px] w-7 flex items-center justify-center border border-gray-200 rounded-r-lg bg-white text-gray-500 hover:bg-gray-50"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

const PAGE_SIZE = 10

export default function AccountHolderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const prefetch = usePrefetch()
  const holderId = Number(id)

  const [activeTab, setActiveTab] = useState<'overview' | 'leases' | 'statement' | 'sub-accounts'>('overview')
  const [showEditModal, setShowEditModal] = useState(false)

  // Date range for statement
  const [ledgerDateFrom, setLedgerDateFrom] = useState('')
  const [ledgerDateTo, setLedgerDateTo] = useState('')
  const [ledgerSearch, setLedgerSearch] = useState('')

  // ---- Queries ----
  const { data: holder, isLoading: loadingProfile } = useQuery({
    queryKey: ['account-holder', holderId],
    queryFn: () => accountHolderApi.get(holderId).then(r => r.data),
    enabled: !!holderId,
  })

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['account-holder-detail', holderId],
    queryFn: () => accountHolderApi.detailView(holderId).then(r => r.data),
    enabled: !!holderId,
  })

  const { data: ledgerData, isLoading: loadingLedger } = useQuery({
    queryKey: ['account-holder-ledger', holderId, ledgerDateFrom, ledgerDateTo],
    queryFn: () => accountHolderApi.ledger(holderId, { period_start: ledgerDateFrom, period_end: ledgerDateTo }).then(r => r.data),
    enabled: !!holderId && activeTab === 'statement',
    placeholderData: keepPreviousData,
  })

  const { data: subAccountsData, isLoading: loadingSubAccounts } = useQuery({
    queryKey: ['account-holder-sub-accounts', holderId],
    queryFn: () => subsidiaryApi.list({ tenant: holderId }).then(r => r.data),
    enabled: !!holderId && activeTab === 'sub-accounts',
  })

  const { data: invoicesData } = useQuery({
    queryKey: ['account-holder-invoices', holderId],
    queryFn: () => invoiceApi.list({ tenant: holderId }).then(r => r.data),
    enabled: !!holderId,
  })

  const { data: receiptsData } = useQuery({
    queryKey: ['account-holder-receipts', holderId],
    queryFn: () => receiptApi.list({ tenant: holderId }).then(r => r.data),
    enabled: !!holderId,
  })

  // ---- Update mutation ----
  const updateMutation = useMutation({
    mutationFn: (data: any) => accountHolderApi.update(holderId, data),
    onSuccess: () => {
      showToast.success('Account holder updated')
      queryClient.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey[0] as string
        return key === 'account-holders' || key.startsWith('account-holder')
      }})
      setShowEditModal(false)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to update account holder')),
  })

  // ---- Derived ----
  const holderInfo = detail?.tenant || holder
  const billing = detail?.billing_summary || {}
  const activeLeases = detail?.active_leases || []
  const subAccounts = useMemo(() => {
    const list = Array.isArray(subAccountsData) ? subAccountsData : (subAccountsData?.results || [])
    return list
  }, [subAccountsData])
  const ledger = ledgerData?.entries || ledgerData?.items || (Array.isArray(ledgerData) ? ledgerData : [])
  const invoices = invoicesData?.results || invoicesData || []
  const receipts = receiptsData?.results || receiptsData || []
  const hasActiveLease = activeLeases.length > 0 || holder?.has_active_lease

  // Filter ledger
  const filteredLedger = useMemo(() => {
    let r = ledger
    if (ledgerSearch) {
      const q = ledgerSearch.toLowerCase()
      r = r.filter((e: any) =>
        (e.reference || e.ref || '').toLowerCase().includes(q) ||
        (e.description || e.narration || '').toLowerCase().includes(q)
      )
    }
    return r
  }, [ledger, ledgerSearch])

  const { paginatedData: paginatedLedger, currentPage: ledgerPage, totalPages: ledgerTotalPages, setCurrentPage: setLedgerPage } = usePagination(filteredLedger, { pageSize: PAGE_SIZE })

  // ---- Render ----
  if (!holderId) {
    return <div className="p-12 text-center text-gray-400">Invalid account holder</div>
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <button onClick={() => navigate('/dashboard')} className="hover:text-gray-900">Dashboard</button>
        <span>/</span>
        <button onClick={() => navigate('/dashboard/account-holders')} className="hover:text-gray-900">Account Holders</button>
        <span>/</span>
        <span className="text-gray-900 font-medium">{holderInfo?.name || '...'}</span>
      </nav>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard/account-holders')} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-3">
            {loadingProfile && loadingDetail ? (
              <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">{holderInfo?.name}</h1>
                <span className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium',
                  hasActiveLease ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-600'
                )}>
                  {hasActiveLease ? 'Active' : 'Inactive'}
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-600">Levy</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate('/dashboard/account-holders')} className="gap-2">
            <Plus className="w-4 h-4" /> Add Account Holder
          </Button>
          <Button variant="outline" onClick={() => setShowEditModal(true)} className="gap-2">
            <Edit2 className="w-4 h-4" /> Edit
          </Button>
        </div>
      </motion.div>

      {/* Profile Info */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Account Holder</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <TbUserSquareRounded className="w-3.5 h-3.5 text-gray-400" />
                <span>{holderInfo?.code || '—'}</span>
              </div>
              {holderInfo?.tenant_type && (
                <div className="flex items-center gap-2 text-sm text-gray-700 capitalize">
                  <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                  <span>{holderInfo.tenant_type}</span>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Contact</p>
            <div className="space-y-1.5">
              {holderInfo?.email && (
                <div className="flex items-center gap-2 text-sm text-gray-600"><Mail className="w-3.5 h-3.5 text-gray-400" /><span className="truncate">{holderInfo.email}</span></div>
              )}
              {holderInfo?.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-600"><Phone className="w-3.5 h-3.5 text-gray-400" /><span>{holderInfo.phone}</span></div>
              )}
              {(holderInfo?.id_number || holderInfo?.id_type) && (
                <div className="flex items-center gap-2 text-sm text-gray-600"><CreditCard className="w-3.5 h-3.5 text-gray-400" /><span>{holderInfo.id_number} ({holderInfo.id_type})</span></div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Active Lease</p>
            <div className="space-y-1.5">
              {activeLeases.length > 0 ? (
                <>
                  {activeLeases[0].property_id && (
                    <button
                      onClick={() => navigate(`/dashboard/properties/${activeLeases[0].property_id}`)}
                      onMouseEnter={() => prefetch(`/dashboard/properties/${activeLeases[0].property_id}`)}
                      className="flex items-center gap-2 text-sm text-primary-600 hover:underline"
                    >
                      <Building2 className="w-3.5 h-3.5" /><span>{activeLeases[0].property}</span>
                    </button>
                  )}
                  {activeLeases[0].landlord_id && (
                    <button
                      onClick={() => navigate(`/dashboard/landlords/${activeLeases[0].landlord_id}`)}
                      onMouseEnter={() => prefetch(`/dashboard/landlords/${activeLeases[0].landlord_id}`)}
                      className="flex items-center gap-2 text-sm text-primary-600 hover:underline"
                    >
                      <Briefcase className="w-3.5 h-3.5" /><span>{activeLeases[0].landlord}</span>
                    </button>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    <span>{formatDate(activeLeases[0].start_date)} - {formatDate(activeLeases[0].end_date)}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400">No active lease</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Billing</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <Wallet className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-500">Balance:</span>
                <span className={cn('font-semibold', Number(billing.balance_due || 0) > 0 ? 'text-red-600' : 'text-emerald-600')}>
                  {formatCurrency(billing.balance_due || 0)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600"><FileText className="w-3.5 h-3.5 text-gray-400" /><span>{billing.invoice_count || 0} invoices</span></div>
            </div>
          </div>
        </div>
      </motion.div>

      <Tabs defaultValue="overview" onChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="overview" icon={Wallet}>Overview</TabsTrigger>
          <TabsTrigger value="leases" icon={FileText}>Leases</TabsTrigger>
          <TabsTrigger value="statement" icon={CreditCard}>Account Statement</TabsTrigger>
          <TabsTrigger value="sub-accounts" icon={Layers}>Sub Accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Invoices</h3>
              {invoices.length === 0 ? (
                <p className="text-sm text-gray-400">No invoices yet.</p>
              ) : (
                <div className="space-y-2">
                  {invoices.slice(0, 5).map((inv: any) => (
                    <button
                      key={inv.id}
                      onClick={() => navigate(`/dashboard/invoices/${inv.id}`)}
                      className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 text-left"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{inv.invoice_number}</p>
                        <p className="text-xs text-gray-500">{formatDate(inv.date)} · {inv.invoice_type}</p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{formatCurrency(inv.total_amount || 0)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Receipts</h3>
              {receipts.length === 0 ? (
                <p className="text-sm text-gray-400">No receipts yet.</p>
              ) : (
                <div className="space-y-2">
                  {receipts.slice(0, 5).map((r: any) => (
                    <button
                      key={r.id}
                      onClick={() => navigate(`/dashboard/receipts/${r.id}`)}
                      className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 text-left"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{r.receipt_number}</p>
                        <p className="text-xs text-gray-500">{formatDate(r.date)} · {r.payment_method}</p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-600 tabular-nums">{formatCurrency(r.amount || 0)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="leases">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {activeLeases.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-400">No active leases</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Lease #</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Property</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Period</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Monthly Levy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeLeases.map((l: any) => (
                    <tr key={l.id} onClick={() => navigate(`/dashboard/leases/${l.id}`)} className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{l.lease_number}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">{l.property}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{formatDate(l.start_date)} – {formatDate(l.end_date)}</td>
                      <td className="px-6 py-3 text-sm text-right tabular-nums font-semibold">{l.currency} {Number(l.monthly_rent).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="statement">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Account Statement</h3>
              <p className="text-sm text-gray-500">Bank-statement style view with running balance.</p>
            </div>
            {!loadingLedger && ledger.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-gray-50 border-b border-gray-100">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by reference or description..."
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <DateNav value={ledgerDateFrom} onChange={setLedgerDateFrom} ariaLabel="ledger start date" />
                  <span className="text-gray-400 text-sm">to</span>
                  <DateNav value={ledgerDateTo} onChange={setLedgerDateTo} ariaLabel="ledger end date" />
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              {loadingLedger ? (
                <div className="p-12 text-center text-gray-400">Loading…</div>
              ) : ledger.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-400">No ledger entries</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Date</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Reference</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Description</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Debit</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Credit</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedLedger.map((entry: any, idx: number) => (
                      <tr key={entry.id || idx} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-sm text-gray-600">{formatDate(entry.date)}</td>
                        <td className="px-6 py-3 text-sm font-medium text-gray-900">{entry.reference || entry.ref || '-'}</td>
                        <td className="px-6 py-3 text-sm text-gray-600">{entry.description || entry.narration || '-'}</td>
                        <td className="px-6 py-3 text-sm text-right">{(entry.debit || 0) > 0 ? formatCurrency(entry.debit) : ''}</td>
                        <td className="px-6 py-3 text-sm text-right">{(entry.credit || 0) > 0 ? formatCurrency(entry.credit) : ''}</td>
                        <td className="px-6 py-3 text-sm font-medium text-right tabular-nums">
                          <span className={(entry.balance || 0) > 0 ? 'text-red-600' : 'text-gray-900'}>
                            {formatCurrency(entry.balance || 0)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {ledgerTotalPages > 1 && (
                <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                  <span>Page {ledgerPage} of {ledgerTotalPages}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setLedgerPage(Math.max(1, ledgerPage - 1))} disabled={ledgerPage === 1} className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40">Prev</button>
                    <button onClick={() => setLedgerPage(Math.min(ledgerTotalPages, ledgerPage + 1))} disabled={ledgerPage === ledgerTotalPages} className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sub-accounts">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loadingSubAccounts ? (
              <div className="p-12 text-center text-gray-400">Loading…</div>
            ) : subAccounts.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-400">
                <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No subsidiary account found for this account holder
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Code</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Account</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Currency</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {subAccounts.map((acc: any) => (
                    <tr key={acc.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{acc.code}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">{acc.name}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{acc.currency}</td>
                      <td className="px-6 py-3 text-sm text-right font-semibold tabular-nums">{formatCurrency(acc.current_balance || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Account Holder"
        icon={Edit2}
      >
        <TenantForm
          kind="account-holder"
          initialValues={{
            name: holderInfo?.name || '',
            tenant_type: holderInfo?.tenant_type || 'individual',
            email: holderInfo?.email || '',
            phone: holderInfo?.phone || '',
            id_type: holderInfo?.id_type || 'national_id',
            id_number: holderInfo?.id_number || '',
          }}
          onSubmit={(data) => updateMutation.mutate(data)}
          isSubmitting={updateMutation.isPending}
          onCancel={() => setShowEditModal(false)}
        />
      </Modal>
    </div>
  )
}
