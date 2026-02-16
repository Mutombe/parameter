import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  DollarSign,
  Calendar,
  TrendingUp,
  FileText,
  Clock,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { tenantPortalApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

export default function TenantDashboard() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['tenant-dashboard'],
    queryFn: () => tenantPortalApi.dashboard().then(r => r.data),
  })

  const { data: paymentHistory } = useQuery({
    queryKey: ['tenant-payment-history'],
    queryFn: () => tenantPortalApi.paymentHistory().then(r => r.data),
  })

  const payments = paymentHistory?.monthly_payments || []

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back! Here's your account overview.</p>
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div variants={item} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all">
          <div className="flex items-start justify-between">
            <div className="p-3 rounded-xl bg-red-50">
              <div className="p-2 rounded-lg bg-red-500">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <div className="h-9 w-24 bg-gray-200 rounded animate-pulse" />
            ) : (
              <h3 className="text-3xl font-bold text-gray-900">{formatCurrency(dashboard?.account_summary?.current_balance || 0)}</h3>
            )}
            <p className="text-sm text-gray-500 mt-1">Outstanding Balance</p>
          </div>
        </motion.div>

        <motion.div variants={item} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all">
          <div className="flex items-start justify-between">
            <div className="p-3 rounded-xl bg-amber-50">
              <div className="p-2 rounded-lg bg-amber-500">
                <Calendar className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <div className="h-9 w-24 bg-gray-200 rounded animate-pulse" />
            ) : (
              <h3 className="text-2xl font-bold text-gray-900">
                {dashboard?.lease?.payment_day ? `Day ${dashboard.lease.payment_day}` : 'N/A'}
              </h3>
            )}
            <p className="text-sm text-gray-500 mt-1">Next Due Date</p>
          </div>
        </motion.div>

        <motion.div variants={item} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all">
          <div className="flex items-start justify-between">
            <div className="p-3 rounded-xl bg-emerald-50">
              <div className="p-2 rounded-lg bg-emerald-500">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <div className="h-9 w-24 bg-gray-200 rounded animate-pulse" />
            ) : (
              <h3 className="text-3xl font-bold text-gray-900">{formatCurrency(dashboard?.account_summary?.total_paid || 0)}</h3>
            )}
            <p className="text-sm text-gray-500 mt-1">Total Paid</p>
          </div>
        </motion.div>

        <motion.div variants={item} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all">
          <div className="flex items-start justify-between">
            <div className="p-3 rounded-xl bg-blue-50">
              <div className="p-2 rounded-lg bg-blue-500">
                <FileText className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <div className="h-9 w-24 bg-gray-200 rounded animate-pulse" />
            ) : (
              <h3 className={cn(
                "text-2xl font-bold",
                dashboard?.lease ? 'text-emerald-600' : 'text-gray-400'
              )}>
                {dashboard?.lease ? 'Active' : 'No Lease'}
              </h3>
            )}
            <p className="text-sm text-gray-500 mt-1">Active Lease Status</p>
          </div>
        </motion.div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment History Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Payment History</h3>
          <p className="text-sm text-gray-500 mb-6">Your recent payment activity</p>
          <div className="h-64">
            {!payments.length ? (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                No payment history available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={payments.slice(0, 12).reverse()}>
                  <defs>
                    <linearGradient id="paymentGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => { const d = new Date(v + '-01'); return d.toLocaleDateString('en', { month: 'short' }); }} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} labelFormatter={(v) => { const d = new Date(v + '-01'); return d.toLocaleDateString('en', { month: 'long', year: 'numeric' }); }} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                  <Area type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} fill="url(#paymentGradient)" name="Payment" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Recent Invoices */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Recent Invoices</h3>
          <p className="text-sm text-gray-500 mb-4">Latest billing activity</p>
          <div className="space-y-3">
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 animate-pulse">
                  <div className="space-y-1">
                    <div className="h-4 w-20 bg-gray-200 rounded" />
                    <div className="h-3 w-16 bg-gray-200 rounded" />
                  </div>
                  <div className="h-4 w-16 bg-gray-200 rounded" />
                </div>
              ))
            ) : dashboard?.recent_invoices?.length ? (
              dashboard.recent_invoices.slice(0, 5).map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{inv.invoice_number}</p>
                    <p className="text-xs text-gray-500">{formatDate(inv.date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(inv.amount || inv.total_amount || 0)}</p>
                    <span className={cn(
                      'text-xs font-medium',
                      inv.status === 'paid' ? 'text-emerald-600' :
                      inv.status === 'overdue' ? 'text-red-600' : 'text-amber-600'
                    )}>
                      {inv.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-sm text-gray-400">No recent invoices</div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
