import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Search,
  Eye,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  MoreVertical,
  Activity,
  Database,
  Server,
  Clock,
  ShieldAlert,
} from 'lucide-react'
import { tenantsApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'
import { Navigate } from 'react-router-dom'

interface TenantSummary {
  id: number
  company_name: string
  subdomain: string
  plan: string
  status: 'active' | 'trial' | 'suspended' | 'cancelled'
  users_count: number
  properties_count: number
  mrr: number
  created_at: string
  last_activity: string
}

interface DashboardStats {
  total_tenants: number
  active_tenants: number
  trial_tenants: number
  total_users: number
  total_mrr: number
  mrr_change: number
  total_properties: number
  storage_used_gb: number
}

export default function SuperAdminDashboard() {
  const { user } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [, setSelectedTenant] = useState<number | null>(null)

  // Check if user has super_admin role
  const isSuperAdmin = user?.role === 'super_admin' || user?.is_superuser

  // Fetch dashboard stats - only if user is super admin
  const { data: stats, error: statsError } = useQuery<DashboardStats>({
    queryKey: ['super-admin-stats'],
    queryFn: () => tenantsApi.dashboard().then(r => r.data.overview),
    enabled: isSuperAdmin,
    retry: false,
  })

  // Fetch tenants list - only if user is super admin
  const { data: tenantsData, isLoading: tenantsLoading, refetch, error: tenantsError } = useQuery({
    queryKey: ['super-admin-tenants', statusFilter],
    queryFn: () => tenantsApi.dashboard().then(r => r.data.recent_tenants),
    enabled: isSuperAdmin,
    retry: false,
  })

  // If not authorized, show access denied
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="p-4 bg-red-50 rounded-full mb-4">
          <ShieldAlert className="w-12 h-12 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600 mb-4">You don't have permission to access this page.</p>
        <p className="text-sm text-gray-500">This page is only accessible to super administrators.</p>
      </div>
    )
  }

  // Handle API errors
  if (statsError || tenantsError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="p-4 bg-yellow-50 rounded-full mb-4">
          <AlertTriangle className="w-12 h-12 text-yellow-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Unable to Load Dashboard</h2>
        <p className="text-gray-600 mb-4">There was an error loading the admin dashboard.</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Try Again
        </button>
      </div>
    )
  }

  const tenants: TenantSummary[] = tenantsData || []

  const filteredTenants = tenants.filter(tenant => {
    const matchesSearch = tenant.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tenant.subdomain.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || tenant.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-green-100 text-green-700',
      trial: 'bg-blue-100 text-blue-700',
      suspended: 'bg-yellow-100 text-yellow-700',
      cancelled: 'bg-red-100 text-red-700',
    }
    return styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-700'
  }

  const getStatusIcon = (status: string) => {
    const icons = {
      active: CheckCircle,
      trial: Clock,
      suspended: AlertTriangle,
      cancelled: XCircle,
    }
    const Icon = icons[status as keyof typeof icons] || Activity
    return <Icon className="w-3.5 h-3.5" />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
          <p className="text-gray-500 mt-1">Monitor and manage all tenants across the platform</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-sm text-green-600 font-medium flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              +12%
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats?.total_tenants || 0}</p>
          <p className="text-sm text-gray-500 mt-1">Total Companies</p>
          <div className="mt-3 flex items-center gap-4 text-xs">
            <span className="text-green-600">{stats?.active_tenants || 0} active</span>
            <span className="text-blue-600">{stats?.trial_tenants || 0} trial</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats?.total_users || 0}</p>
          <p className="text-sm text-gray-500 mt-1">Total Users</p>
          <div className="mt-3 text-xs text-gray-500">
            Across all companies
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <span className={cn(
              "text-sm font-medium flex items-center gap-1",
              (stats?.mrr_change || 0) >= 0 ? "text-green-600" : "text-red-600"
            )}>
              {(stats?.mrr_change || 0) >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {Math.abs(stats?.mrr_change || 0)}%
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(stats?.total_mrr || 0)}</p>
          <p className="text-sm text-gray-500 mt-1">Monthly Recurring Revenue</p>
          <div className="mt-3 text-xs text-gray-500">
            vs. last month
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <Database className="w-6 h-6 text-orange-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats?.storage_used_gb?.toFixed(1) || 0} GB</p>
          <p className="text-sm text-gray-500 mt-1">Storage Used</p>
          <div className="mt-3 text-xs text-gray-500">
            {stats?.total_properties || 0} properties managed
          </div>
        </motion.div>
      </div>

      {/* System Health */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">System Health</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Server className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-900">API Server</p>
              <p className="text-xs text-green-600">Operational</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Database className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-900">Database</p>
              <p className="text-xs text-green-600">Operational</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-900">Celery Workers</p>
              <p className="text-xs text-green-600">Operational</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-900">Scheduler</p>
              <p className="text-xs text-green-600">Operational</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900">All Companies</h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search companies..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent w-64"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Company
                </th>
                <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Plan
                </th>
                <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Users
                </th>
                <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Properties
                </th>
                <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  MRR
                </th>
                <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tenantsLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-6">
                      <div className="space-y-2">
                        <div className="h-4 w-32 bg-gray-200 rounded" />
                        <div className="h-3 w-40 bg-gray-200 rounded" />
                      </div>
                    </td>
                    <td className="py-4 px-6"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="h-3 w-10 bg-gray-200 rounded inline-block" />
                      </span>
                    </td>
                    <td className="py-4 px-6"><div className="h-4 w-8 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-6"><div className="h-4 w-8 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-6"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-6"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-2 text-gray-300 rounded-lg">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-gray-300 rounded-lg">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-500">
                    No companies found
                  </td>
                </tr>
              ) : (
                filteredTenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-gray-50">
                    <td className="py-4 px-6">
                      <div>
                        <p className="font-medium text-gray-900">{tenant.company_name}</p>
                        <p className="text-sm text-gray-500">{tenant.subdomain}.parameter.co.zw</p>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-sm text-gray-900 capitalize">{tenant.plan}</span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize",
                        getStatusBadge(tenant.status)
                      )}>
                        {getStatusIcon(tenant.status)}
                        {tenant.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-900">
                      {tenant.users_count}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-900">
                      {tenant.properties_count}
                    </td>
                    <td className="py-4 px-6 text-sm font-medium text-gray-900">
                      {formatCurrency(tenant.mrr)}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">
                      {formatDate(tenant.created_at)}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedTenant(tenant.id)}
                          className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
