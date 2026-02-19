import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Edit2,
  Mail,
  Phone,
  CreditCard,
  DollarSign,
  Wallet,
  AlertTriangle,
  FileText,
  Home,
  Calendar,
  Briefcase,
  Eye,
  Plus,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { tenantApi, reportsApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { Button } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'
import { TbUserSquareRounded } from 'react-icons/tb'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  color: 'blue' | 'green' | 'purple' | 'orange'
  isLoading?: boolean
}

const colorConfig = {
  blue: { bg: 'bg-blue-50', icon: 'bg-blue-500', text: 'text-blue-600' },
  green: { bg: 'bg-emerald-50', icon: 'bg-emerald-500', text: 'text-emerald-600' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-500', text: 'text-purple-600' },
  orange: { bg: 'bg-orange-50', icon: 'bg-orange-500', text: 'text-orange-600' },
}

function StatCard({ title, value, subtitle, icon: Icon, color, isLoading }: StatCardProps) {
  const colors = colorConfig[color]
  return (
    <motion.div
      variants={item}
      className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 hover:shadow-lg hover:border-gray-300 transition-all duration-300"
    >
      <div className="flex items-start justify-between">
        <div className={cn('p-2 md:p-3 rounded-xl', colors.bg)}>
          <div className={cn('p-1.5 md:p-2 rounded-lg', colors.icon)}>
            <Icon className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
        </div>
      </div>
      <div className="mt-3 md:mt-4">
        {isLoading ? (
          <div className="h-8 md:h-9 w-20 md:w-24 bg-gray-200 rounded animate-pulse" />
        ) : (
          <h3 className="text-2xl md:text-3xl font-bold text-gray-900 tabular-nums">{value}</h3>
        )}
        <p className="text-xs md:text-sm text-gray-500 mt-1">{title}</p>
        {isLoading ? (
          <div className="h-3 md:h-4 w-16 md:w-20 bg-gray-200 rounded animate-pulse mt-1" />
        ) : subtitle ? (
          <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
        ) : null}
      </div>
    </motion.div>
  )
}

function ChartSkeleton() {
  return (
    <div className="w-full h-full flex flex-col justify-end gap-2 px-4 pb-4">
      <div className="flex items-end gap-3 h-full">
        {[40, 55, 65, 50, 70, 60, 75].map((h, i) => (
          <div key={i} className="flex-1 flex flex-col gap-1 justify-end h-full">
            <div className="w-full bg-gray-200 rounded-t animate-pulse" style={{ height: `${h}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex gap-4 animate-pulse">
          <div className="h-4 flex-[2] bg-gray-200 rounded" />
          <div className="h-4 flex-1 bg-gray-200 rounded" />
          <div className="h-4 flex-1 bg-gray-200 rounded" />
          <div className="h-4 flex-1 bg-gray-200 rounded" />
          <div className="h-4 flex-1 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  )
}

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { startImpersonation } = useAuthStore()
  const tenantId = Number(id)

  // 1. Tenant profile
  const { data: tenant, isLoading: loadingProfile } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => tenantApi.get(tenantId).then((r) => r.data),
    enabled: !!tenantId,
  })

  // 2. Detail view (billing_summary, active_leases, recent_invoices, lease_history)
  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['tenant-detail-view', tenantId],
    queryFn: () => tenantApi.detailView(tenantId).then((r) => r.data),
    enabled: !!tenantId,
  })

  // 3. Ledger
  const { data: ledgerData, isLoading: loadingLedger } = useQuery({
    queryKey: ['tenant-ledger', tenantId],
    queryFn: () => tenantApi.ledger(tenantId).then((r) => r.data),
    enabled: !!tenantId,
  })

  // 4. Account statement chart
  const { data: accountData, isLoading: loadingAccount } = useQuery({
    queryKey: ['tenant-account', tenantId],
    queryFn: () => reportsApi.tenantAccount({ tenant_id: tenantId }).then((r) => r.data),
    enabled: !!tenantId,
  })

  // 5. Aged analysis
  const { data: agedData, isLoading: loadingAged } = useQuery({
    queryKey: ['tenant-aged', tenantId],
    queryFn: () => reportsApi.agedAnalysis({ tenant_id: tenantId }).then((r) => r.data),
    enabled: !!tenantId,
  })

  // 6. Deposit summary
  const { data: depositData, isLoading: loadingDeposit } = useQuery({
    queryKey: ['tenant-deposit', tenantId],
    queryFn: () => reportsApi.depositSummary({ tenant_id: tenantId }).then((r) => r.data),
    enabled: !!tenantId,
  })

  const tenantInfo = detail?.tenant || tenant
  const billing = detail?.billing_summary || {}
  const activeLeases = detail?.active_leases || []
  const recentInvoices = detail?.recent_invoices || []
  const ledger = ledgerData?.entries || ledgerData?.items || (Array.isArray(ledgerData) ? ledgerData : [])

  const hasActiveLease = activeLeases.length > 0 || tenant?.has_active_lease

  // Payment history chart
  const paymentChartData = (() => {
    if (!accountData) return []
    const items = accountData.monthly_summary || accountData.items || accountData.entries
    if (Array.isArray(items)) {
      return items.map((i: any) => ({
        name: i.month || i.period || i.name,
        invoiced: i.invoiced || i.charged || i.debit || 0,
        paid: i.paid || i.received || i.credit || 0,
      }))
    }
    return []
  })()

  // Aged chart
  const agedChartData = (() => {
    if (!agedData) return []
    if (Array.isArray(agedData)) {
      return agedData.map((b: any) => ({
        name: b.bucket || b.period || b.label || b.name,
        amount: b.amount || b.total || b.balance || 0,
      }))
    }
    const buckets = agedData.buckets || agedData.aging_buckets
    if (Array.isArray(buckets)) {
      return buckets.map((b: any) => ({
        name: b.bucket || b.period || b.label || b.name,
        amount: b.amount || b.total || b.balance || 0,
      }))
    }
    const fallbackKeys = ['current', '30_days', '60_days', '90_days', '120_plus']
    const labels: Record<string, string> = {
      current: 'Current', '30_days': '1-30 days', '60_days': '31-60 days', '90_days': '61-90 days', '120_plus': '90+ days',
    }
    return fallbackKeys
      .filter((k) => agedData[k] !== undefined)
      .map((k) => ({ name: labels[k] || k, amount: agedData[k] || 0 }))
  })()

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard/tenants')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-3">
            {loadingProfile && loadingDetail ? (
              <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">{tenantInfo?.name}</h1>
                <span className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium',
                  hasActiveLease ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-600'
                )}>
                  {hasActiveLease ? 'Active' : 'Inactive'}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              startImpersonation(tenantId, tenantInfo?.name || `Tenant #${tenantId}`)
              navigate('/portal')
            }}
            className="gap-2"
          >
            <Eye className="w-4 h-4" />
            View Portal
          </Button>
          <Button variant="outline" onClick={() => navigate('/dashboard/tenants')} className="gap-2">
            <Edit2 className="w-4 h-4" />
            Edit
          </Button>
        </div>
      </motion.div>

      {/* Profile Info Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-white rounded-xl border border-gray-200 p-4 md:p-6"
      >
        {loadingProfile && loadingDetail ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2 animate-pulse">
                <div className="h-3 w-16 bg-gray-200 rounded" />
                <div className="h-4 w-32 bg-gray-200 rounded" />
                <div className="h-4 w-28 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Contact */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Contact</p>
              <div className="space-y-1.5">
                {tenantInfo?.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                    <span className="truncate">{tenantInfo.email}</span>
                  </div>
                )}
                {tenantInfo?.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    <span>{tenantInfo.phone}</span>
                  </div>
                )}
                {(tenantInfo?.id_number || tenantInfo?.id_type) && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                    <span>{tenantInfo.id_number} ({tenantInfo.id_type})</span>
                  </div>
                )}
              </div>
            </div>

            {/* Active Lease */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Active Lease</p>
              <div className="space-y-1.5">
                {activeLeases.length > 0 ? (
                  <>
                    {activeLeases[0].unit_id ? (
                      <button
                        onClick={() => navigate(`/dashboard/units/${activeLeases[0].unit_id}`)}
                        className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
                      >
                        <Home className="w-3.5 h-3.5" />
                        <span>{activeLeases[0].unit}</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Home className="w-3.5 h-3.5 text-gray-400" />
                        <span>{activeLeases[0].unit}</span>
                      </div>
                    )}
                    {activeLeases[0].property_id ? (
                      <button
                        onClick={() => navigate(`/dashboard/properties/${activeLeases[0].property_id}`)}
                        className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{activeLeases[0].property}</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <FileText className="w-3.5 h-3.5 text-gray-400" />
                        <span>{activeLeases[0].property}</span>
                      </div>
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

            {/* Billing */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Billing</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                  <span>{formatCurrency(billing.total_invoiced || 0)} invoiced</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Wallet className="w-3.5 h-3.5 text-gray-400" />
                  <span>{formatCurrency(billing.total_paid || 0)} paid</span>
                </div>
                {(billing.overdue_amount || 0) > 0 && (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{formatCurrency(billing.overdue_amount)} overdue</span>
                  </div>
                )}
              </div>
            </div>

            {/* Employment */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Employment</p>
              <div className="space-y-1.5">
                {tenantInfo?.employer_name ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                      <span className="truncate">{tenantInfo.employer_name}</span>
                    </div>
                    {tenantInfo?.occupation && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <TbUserSquareRounded className="w-3.5 h-3.5 text-gray-400" />
                        <span>{tenantInfo.occupation}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400">Not provided</p>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Invoiced" value={formatCurrency(billing.total_invoiced || 0)} icon={FileText} color="blue" isLoading={loadingDetail} />
        <StatCard title="Total Paid" value={formatCurrency(billing.total_paid || 0)} icon={Wallet} color="green" isLoading={loadingDetail} />
        <StatCard title="Balance Due" value={formatCurrency(billing.balance_due || 0)} icon={DollarSign} color="purple" isLoading={loadingDetail} />
        <StatCard title="Overdue Amount" value={formatCurrency(billing.overdue_amount || 0)} icon={AlertTriangle} color="orange" isLoading={loadingDetail} />
      </motion.div>

      {/* Charts Row - Payment History (2/3) + Aged Outstanding (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Payment History</h3>
              <p className="text-sm text-gray-500">Invoiced vs paid monthly</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-gray-600">Invoiced</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-gray-600">Paid</span>
              </div>
            </div>
          </div>
          <div className="h-72">
            {loadingAccount ? (
              <ChartSkeleton />
            ) : paymentChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">No payment history available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={paymentChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="invoiced" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Invoiced" />
                  <Bar dataKey="paid" fill="#10b981" radius={[4, 4, 0, 0]} name="Paid" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Aged Outstanding</h3>
            <p className="text-sm text-gray-500">Receivables aging</p>
          </div>
          <div className="h-72">
            {loadingAged ? (
              <ChartSkeleton />
            ) : agedChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">No aged data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agedChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={80} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="amount" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Outstanding" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>
      </div>

      {/* Active Leases Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Active Leases</h3>
          <p className="text-sm text-gray-500">{activeLeases.length} active lease(s)</p>
        </div>
        <div className="overflow-x-auto">
          {loadingDetail ? (
            <div className="p-6"><TableSkeleton rows={3} /></div>
          ) : activeLeases.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No active leases</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Lease #</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Unit</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Rent</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Period</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeLeases.map((lease: any) => (
                  <tr
                    key={lease.id}
                    onClick={() => navigate(`/dashboard/leases/${lease.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/leases/${lease.id}`) }}
                        className="text-primary-600 hover:text-primary-700 hover:underline"
                      >
                        {lease.lease_number}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{lease.unit}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">{lease.currency} {lease.monthly_rent}/mo</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(lease.start_date)} - {formatDate(lease.end_date)}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Active</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>

      {/* Recent Invoices Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Recent Invoices</h3>
            <p className="text-sm text-gray-500">Latest billing activity</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard/invoices')}
              className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Create Invoice
            </button>
            <button
              onClick={() => navigate('/dashboard/receipts')}
              className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Record Payment
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {loadingDetail ? (
            <div className="p-6"><TableSkeleton /></div>
          ) : recentInvoices.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No invoices found</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Invoice #</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Due Date</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Balance</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentInvoices.map((inv: any) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/dashboard/invoices/${inv.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/invoices/${inv.id}`) }}
                        className="text-primary-600 hover:text-primary-700 hover:underline"
                      >
                        {inv.invoice_number}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(inv.date)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">{formatCurrency(inv.amount || inv.total_amount || 0)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-right">
                      <span className={(inv.balance || 0) > 0 ? 'text-red-600' : 'text-gray-900'}>
                        {formatCurrency(inv.balance || 0)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                        inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                        inv.status === 'overdue' ? 'bg-red-50 text-red-700' :
                        'bg-amber-50 text-amber-700'
                      )}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>

      {/* Ledger Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Ledger</h3>
          <p className="text-sm text-gray-500">Transaction history</p>
        </div>
        <div className="overflow-x-auto">
          {loadingLedger ? (
            <div className="p-6"><TableSkeleton rows={6} /></div>
          ) : ledger.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No ledger entries found</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Reference</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Description</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Debit</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Credit</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ledger.map((entry: any, idx: number) => (
                  <tr key={entry.id || idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(entry.date)}</td>
                    <td className="px-6 py-4 text-sm font-medium">
                      {entry.invoice_id ? (
                        <button onClick={() => navigate(`/dashboard/invoices/${entry.invoice_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                          {entry.reference || entry.ref || '-'}
                        </button>
                      ) : entry.receipt_id ? (
                        <button onClick={() => navigate(`/dashboard/receipts/${entry.receipt_id}`)} className="text-primary-600 hover:text-primary-700 hover:underline">
                          {entry.reference || entry.ref || '-'}
                        </button>
                      ) : (
                        <span className="text-gray-900">{entry.reference || entry.ref || '-'}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{entry.description || entry.narration || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{(entry.debit || 0) > 0 ? formatCurrency(entry.debit) : '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{(entry.credit || 0) > 0 ? formatCurrency(entry.credit) : '-'}</td>
                    <td className="px-6 py-4 text-sm font-medium text-right">
                      <span className={(entry.balance || 0) > 0 ? 'text-red-600' : 'text-gray-900'}>
                        {formatCurrency(entry.balance || 0)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </div>
  )
}
