import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  Home,
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Receipt,
  PiggyBank,
  Activity,
  ChevronRight,
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
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts'
import { reportsApi } from '../services/api'
import { formatCurrency, formatPercent, formatDate, cn } from '../lib/utils'
import { useNavigate } from 'react-router-dom'
import { PiUsersFour } from "react-icons/pi";
import { TbUserSquareRounded } from "react-icons/tb";
import { LiaUsersSolid } from "react-icons/lia";
import { PiBuildingApartmentLight } from "react-icons/pi";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: { value: number; label: string }
  icon: React.ElementType
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'cyan'
  isLoading?: boolean
}

const colorConfig = {
  blue: { bg: 'bg-blue-50', icon: 'bg-blue-500', text: 'text-blue-600' },
  green: { bg: 'bg-emerald-50', icon: 'bg-emerald-500', text: 'text-emerald-600' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-500', text: 'text-purple-600' },
  orange: { bg: 'bg-orange-50', icon: 'bg-orange-500', text: 'text-orange-600' },
  red: { bg: 'bg-red-50', icon: 'bg-red-500', text: 'text-red-600' },
  cyan: { bg: 'bg-cyan-50', icon: 'bg-cyan-500', text: 'text-cyan-600' },
}

function StatCard({ title, value, subtitle, trend, icon: Icon, color, isLoading }: StatCardProps) {
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
        {trend && (
          <div className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
            trend.value >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          )}>
            {trend.value >= 0 ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {Math.abs(trend.value)}%
          </div>
        )}
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

export default function Dashboard() {
  const navigate = useNavigate()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => reportsApi.dashboard().then(r => r.data),
  })

  const occupancyRate = stats?.properties?.occupancy_rate || 0
  const collectionRate = stats?.financial?.collection_rate || 0

  const overdueInvoices = stats?.alerts?.overdue_invoices || 0

  const kpis = [
    {
      title: 'Total Properties',
      value: stats?.properties?.total || 0,
      subtitle: `${stats?.properties?.units || 0} total units`,
      trend: { value: 12, label: 'vs last month' },
      icon: PiBuildingApartmentLight,
      color: 'blue' as const,
    },
    {
      title: 'Occupancy Rate',
      value: formatPercent(occupancyRate),
      subtitle: `${stats?.properties?.units - stats?.properties?.vacant || 0} occupied`,
      trend: { value: occupancyRate >= 90 ? 5 : -3, label: 'vs last month' },
      icon: Home,
      color: 'green' as const,
    },
    {
      title: 'Monthly Revenue',
      value: formatCurrency(stats?.monthly?.invoiced || 0),
      subtitle: `${formatCurrency(stats?.monthly?.collected || 0)} collected`,
      trend: { value: 8, label: 'vs last month' },
      icon: Wallet,
      color: 'purple' as const,
    },
    {
      title: 'Outstanding',
      value: formatCurrency(stats?.financial?.outstanding || 0),
      subtitle: `${formatPercent(collectionRate)} collection rate`,
      trend: { value: collectionRate >= 85 ? 2 : -5, label: 'vs last month' },
      icon: Receipt,
      color: 'orange' as const,
    },
    {
      title: 'Collection Rate',
      value: formatPercent(collectionRate),
      subtitle: collectionRate >= 85 ? 'On target' : 'Below target',
      trend: { value: collectionRate >= 85 ? 3 : -8, label: 'vs last month' },
      icon: PiggyBank,
      color: (collectionRate >= 85 ? 'green' : 'red') as 'green' | 'red',
    },
    {
      title: 'Overdue Invoices',
      value: overdueInvoices,
      subtitle: formatCurrency(stats?.alerts?.overdue_amount || 0),
      trend: { value: overdueInvoices > 0 ? -overdueInvoices : 0, label: 'items' },
      icon: AlertTriangle,
      color: (overdueInvoices > 0 ? 'red' : 'cyan') as 'red' | 'cyan',
    },
  ]

  const pieData = [
    { name: 'Occupied', value: stats?.properties?.units - stats?.properties?.vacant || 0, color: '#10b981' },
    { name: 'Vacant', value: stats?.properties?.vacant || 0, color: '#f43f5e' },
  ]

  const revenueData = stats?.revenue_trend?.length
    ? stats.revenue_trend
    : []

  const quickActions = [
    { label: 'New Invoice', href: '/dashboard/invoices', icon: Receipt, color: 'blue' },
    { label: 'Record Receipt', href: '/dashboard/receipts', icon: DollarSign, color: 'green' },
    { label: 'Add Tenant', href: '/dashboard/tenants', icon: LiaUsersSolid, color: 'purple' },
    { label: 'View Reports', href: '/dashboard/reports', icon: Activity, color: 'orange' },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"
      >
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm md:text-base text-gray-500 mt-1">
            Welcome back! Here's your property overview for{' '}
            <span className="font-medium text-gray-700">
              {formatDate(new Date())}
            </span>
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500">
          <Clock className="w-4 h-4" />
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </motion.div>

      {/* KPI Cards */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {kpis.map((kpi) => (
          <StatCard key={kpi.title} {...kpi} isLoading={isLoading} />
        ))}
      </motion.div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 lg:col-span-2"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 md:mb-6">
            <div>
              <h3 className="text-base md:text-lg font-semibold text-gray-900">Revenue Overview</h3>
              <p className="text-xs md:text-sm text-gray-500">Invoiced vs Collected amounts</p>
            </div>
            <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm">
              <div className="flex items-center gap-1.5 md:gap-2">
                <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-blue-500" />
                <span className="text-gray-600">Invoiced</span>
              </div>
              <div className="flex items-center gap-1.5 md:gap-2">
                <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-emerald-500" />
                <span className="text-gray-600">Collected</span>
              </div>
            </div>
          </div>
          <div className="h-56 md:h-72">
            {isLoading || !revenueData.length ? (
              <div className="w-full h-full flex flex-col justify-end gap-2 px-4 pb-4">
                <div className="flex items-end gap-3 h-full">
                  {[40, 55, 65, 50, 70, 60, 75].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col gap-1 justify-end h-full">
                      <div
                        className="w-full bg-gray-200 rounded-t animate-pulse"
                        style={{ height: `${h}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between">
                  {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <div key={i} className="h-3 w-8 bg-gray-200 rounded animate-pulse" />
                  ))}
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="invoicedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="collectedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="invoiced"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#invoicedGradient)"
                    name="Invoiced"
                  />
                  <Area
                    type="monotone"
                    dataKey="collected"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#collectedGradient)"
                    name="Collected"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Occupancy Pie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Unit Occupancy</h3>
            <p className="text-sm text-gray-500">Current status breakdown</p>
          </div>
          <div className="h-48 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                {isLoading ? (
                  <div className="h-9 w-16 bg-gray-200 rounded animate-pulse mx-auto" />
                ) : (
                  <p className="text-3xl font-bold text-gray-900">{formatPercent(occupancyRate)}</p>
                )}
                <p className="text-xs text-gray-500">Occupied</p>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            {pieData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-sm text-gray-600">{entry.name}</span>
                {isLoading ? (
                  <div className="h-4 w-6 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <span className="text-sm font-semibold text-gray-900">{entry.value}</span>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Additional Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoiced vs Collected Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Monthly Invoiced vs Collected</h3>
          <p className="text-sm text-gray-500 mb-6">Comparison of billed and received amounts</p>
          <div className="h-64">
            {isLoading || !revenueData.length ? (
              <div className="w-full h-full flex items-end gap-3 px-4 pb-4">
                {[50, 65, 40, 75, 55, 60].map((h, i) => (
                  <div key={i} className="flex-1 flex gap-1 justify-end h-full items-end">
                    <div className="w-1/2 bg-gray-200 rounded-t animate-pulse" style={{ height: `${h}%` }} />
                    <div className="w-1/2 bg-gray-200 rounded-t animate-pulse" style={{ height: `${h * 0.7}%` }} />
                  </div>
                ))}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="invoiced" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Invoiced" />
                  <Bar dataKey="collected" fill="#10b981" radius={[4, 4, 0, 0]} name="Collected" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Expense Breakdown Pie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Expense Breakdown</h3>
          <p className="text-sm text-gray-500 mb-4">By category</p>
          <div className="h-48 relative">
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-32 h-32 rounded-full bg-gray-200 animate-pulse" />
              </div>
            ) : (() => {
              const expenseData = stats?.expense_breakdown || []
              const COLORS = ['#f43f5e', '#f59e0b', '#8b5cf6', '#06b6d4', '#10b981', '#ec4899']
              return expenseData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={expenseData} innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="amount" nameKey="category">
                        {expenseData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-3 mt-2">
                    {expenseData.slice(0, 4).map((e: any, i: number) => (
                      <div key={e.category} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-xs text-gray-600">{e.category}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                  No expense data
                </div>
              )
            })()}
          </div>
        </motion.div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Alerts</h3>
            {isLoading ? (
              <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
            ) : (
              <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                {(stats?.alerts?.overdue_invoices || 0) + (stats?.alerts?.expiring_leases || 0)} items
              </span>
            )}
          </div>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/dashboard/invoices')}
              className="w-full flex items-center justify-between p-4 bg-red-50 hover:bg-red-100 rounded-xl transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">Overdue Invoices</p>
                  {isLoading ? (
                    <div className="h-3 w-24 bg-gray-200 rounded animate-pulse mt-1" />
                  ) : (
                    <p className="text-xs text-gray-500">{formatCurrency(stats?.alerts?.overdue_amount || 0)} outstanding</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isLoading ? (
                  <div className="h-7 w-8 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <span className="text-xl font-bold text-red-600">{stats?.alerts?.overdue_invoices || 0}</span>
                )}
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </div>
            </button>

            <button
              onClick={() => navigate('/dashboard/leases')}
              className="w-full flex items-center justify-between p-4 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Calendar className="w-5 h-5 text-amber-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">Expiring Leases</p>
                  <p className="text-xs text-gray-500">Within next 30 days</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isLoading ? (
                  <div className="h-7 w-8 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <span className="text-xl font-bold text-amber-600">{stats?.alerts?.expiring_leases || 0}</span>
                )}
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </div>
            </button>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.href)}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-xl transition-all hover:scale-105',
                  action.color === 'blue' && 'bg-blue-50 hover:bg-blue-100',
                  action.color === 'green' && 'bg-emerald-50 hover:bg-emerald-100',
                  action.color === 'purple' && 'bg-purple-50 hover:bg-purple-100',
                  action.color === 'orange' && 'bg-orange-50 hover:bg-orange-100',
                )}
              >
                <action.icon className={cn(
                  'w-6 h-6',
                  action.color === 'blue' && 'text-blue-600',
                  action.color === 'green' && 'text-emerald-600',
                  action.color === 'purple' && 'text-purple-600',
                  action.color === 'orange' && 'text-orange-600',
                )} />
                <span className="text-sm font-medium text-gray-700">{action.label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Entity Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
          <div className="space-y-4">
            <button
              onClick={() => navigate('/dashboard/landlords')}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <PiUsersFour className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm font-medium text-gray-700">Landlords</span>
              </div>
              <div className="flex items-center gap-2">
                {isLoading ? (
                  <div className="h-6 w-8 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <span className="text-lg font-bold text-gray-900">{stats?.counts?.landlords || 0}</span>
                )}
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
              </div>
            </button>

            <button
              onClick={() => navigate('/dashboard/tenants')}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <LiaUsersSolid className="w-5 h-5 text-purple-600" />
                </div>
                <span className="text-sm font-medium text-gray-700">Tenants</span>
              </div>
              <div className="flex items-center gap-2">
                {isLoading ? (
                  <div className="h-6 w-8 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <span className="text-lg font-bold text-gray-900">{stats?.counts?.tenants || 0}</span>
                )}
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
              </div>
            </button>

            <button
              onClick={() => navigate('/dashboard/leases')}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="text-sm font-medium text-gray-700">Active Leases</span>
              </div>
              <div className="flex items-center gap-2">
                {isLoading ? (
                  <div className="h-6 w-8 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <span className="text-lg font-bold text-gray-900">{stats?.counts?.active_leases || 0}</span>
                )}
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
              </div>
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
