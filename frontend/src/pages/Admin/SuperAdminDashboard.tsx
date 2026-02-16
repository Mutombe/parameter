import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  Mail,
  Plus,
  Send,
  X,
  UserPlus,
  Loader2,
  Pause,
  Play,
  Trash2,
  RotateCcw,
} from 'lucide-react'
import { tenantsApi, tenantInvitationsApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'
import { showToast, parseApiError } from '../../lib/toast'
import { TbUserSquareRounded } from "react-icons/tb"

interface TenantSummary {
  id: number
  company_name?: string
  name?: string
  subdomain?: string
  schema_name?: string
  plan?: string
  subscription_plan?: string
  status?: 'active' | 'trial' | 'suspended' | 'cancelled'
  account_status?: string
  is_active?: boolean
  scheduled_deletion_at?: string
  is_scheduled_for_deletion?: boolean
  deletion_time_remaining?: number
  users_count?: number
  users?: number
  properties_count?: number
  properties?: number
  mrr?: number
  created_at?: string
  last_activity?: string
}

interface DashboardStats {
  total_tenants: number
  active_tenants: number
  trial_tenants: number
  demo_tenants: number
  pending_invitations: number
  total_users: number
  total_mrr: number
  mrr_change: number
  total_properties: number
  storage_used_gb: number
}

interface Invitation {
  id: number
  email: string
  company_name: string
  first_name: string
  last_name: string
  invitation_type: 'full' | 'demo'
  subscription_plan: string
  status: 'pending' | 'accepted' | 'expired' | 'cancelled'
  created_at: string
  expires_at: string
  accepted_at?: string
  invited_by_name?: string
}

export default function SuperAdminDashboard() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'companies' | 'invitations'>('companies')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteForm, setInviteForm] = useState({
    email: '',
    company_name: '',
    first_name: '',
    last_name: '',
    invitation_type: 'full' as 'full' | 'demo',
    subscription_plan: 'basic',
    message: '',
  })

  // Check if user has super_admin role
  const isSuperAdmin = user?.role === 'super_admin' || user?.is_superuser

  // Fetch dashboard stats
  const { data: dashboardData, error: statsError, refetch } = useQuery({
    queryKey: ['super-admin-stats'],
    queryFn: () => tenantsApi.dashboard().then(r => r.data),
    enabled: isSuperAdmin,
    retry: false,
  })

  const stats = dashboardData?.overview
  const tenants: TenantSummary[] = dashboardData?.recent_tenants || []

  // Fetch invitations
  const { data: invitationsData, isLoading: invitationsLoading } = useQuery({
    queryKey: ['tenant-invitations'],
    queryFn: () => tenantInvitationsApi.list().then(r => r.data.results || r.data),
    enabled: isSuperAdmin && activeTab === 'invitations',
  })

  const invitations: Invitation[] = invitationsData || []

  // Create invitation mutation
  const createInvitationMutation = useMutation({
    mutationFn: (data: typeof inviteForm) => tenantInvitationsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-invitations'] })
      queryClient.invalidateQueries({ queryKey: ['super-admin-stats'] })
      showToast.success('Invitation sent successfully!')
      setShowInviteModal(false)
      setInviteForm({
        email: '',
        company_name: '',
        first_name: '',
        last_name: '',
        invitation_type: 'full',
        subscription_plan: 'basic',
        message: '',
      })
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.error || 'Failed to send invitation')
    },
  })

  // Resend invitation mutation
  const resendMutation = useMutation({
    mutationFn: (id: number) => tenantInvitationsApi.resend(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-invitations'] })
      showToast.success('Invitation resent!')
    },
    onError: () => {
      showToast.error('Failed to resend invitation')
    },
  })

  // Cancel invitation mutation
  const cancelMutation = useMutation({
    mutationFn: (id: number) => tenantInvitationsApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-invitations'] })
      showToast.success('Invitation cancelled')
    },
    onError: () => {
      showToast.error('Failed to cancel invitation')
    },
  })

  // Company management mutations
  const suspendMutation = useMutation({
    mutationFn: (id: number) => tenantsApi.suspend(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-stats'] })
      showToast.success('Company suspended')
      setActionMenuOpen(null)
    },
    onError: (error) => {
      showToast.error(parseApiError(error, 'Failed to suspend company'))
    },
  })

  const activateMutation = useMutation({
    mutationFn: (id: number) => tenantsApi.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-stats'] })
      showToast.success('Company activated')
      setActionMenuOpen(null)
    },
    onError: (error) => {
      showToast.error(parseApiError(error, 'Failed to activate company'))
    },
  })

  const scheduleDeletionMutation = useMutation({
    mutationFn: (id: number) => tenantsApi.scheduleDeletion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-stats'] })
      showToast.success('Company scheduled for deletion in 24 hours')
      setActionMenuOpen(null)
      setConfirmDialog(null)
    },
    onError: (error) => {
      showToast.error(parseApiError(error, 'Failed to schedule deletion'))
    },
  })

  const cancelDeletionMutation = useMutation({
    mutationFn: (id: number) => tenantsApi.cancelDeletion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-stats'] })
      showToast.success('Deletion cancelled, company reactivated')
      setActionMenuOpen(null)
    },
    onError: (error) => {
      showToast.error(parseApiError(error, 'Failed to cancel deletion'))
    },
  })

  // State for action menu and confirm dialog
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'suspend' | 'delete'
    tenant: TenantSummary
  } | null>(null)

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
  if (statsError) {
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

  const filteredTenants = tenants.filter(tenant => {
    const companyName = tenant.company_name || tenant.name || ''
    const subdomain = tenant.subdomain || tenant.schema_name || ''
    const matchesSearch = companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subdomain.toLowerCase().includes(searchQuery.toLowerCase())
    const tenantStatus = tenant.status || tenant.account_status || 'active'
    const matchesStatus = statusFilter === 'all' || tenantStatus === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      trial: 'bg-blue-100 text-blue-700',
      pending: 'bg-yellow-100 text-yellow-700',
      suspended: 'bg-orange-100 text-orange-700',
      cancelled: 'bg-red-100 text-red-700',
      expired: 'bg-gray-100 text-gray-700',
      accepted: 'bg-green-100 text-green-700',
    }
    return styles[status] || 'bg-gray-100 text-gray-700'
  }

  const getStatusIcon = (status: string) => {
    const icons: Record<string, any> = {
      active: CheckCircle,
      trial: Clock,
      pending: Clock,
      suspended: AlertTriangle,
      cancelled: XCircle,
      expired: XCircle,
      accepted: CheckCircle,
    }
    const Icon = icons[status] || Activity
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Invite Company
          </button>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
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
            <span className="text-blue-600">{stats?.demo_tenants || 0} demo</span>
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
              <TbUserSquareRounded className="w-6 h-6 text-purple-600" />
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
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <Mail className="w-6 h-6 text-amber-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats?.pending_invitations || 0}</p>
          <p className="text-sm text-gray-500 mt-1">Pending Invitations</p>
          <div className="mt-3 text-xs text-gray-500">
            Awaiting response
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
              <p className="text-sm font-medium text-green-900">Task Queue</p>
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

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('companies')}
              className={cn(
                "px-6 py-4 text-sm font-medium border-b-2 transition-colors",
                activeTab === 'companies'
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Companies
              </div>
            </button>
            <button
              onClick={() => setActiveTab('invitations')}
              className={cn(
                "px-6 py-4 text-sm font-medium border-b-2 transition-colors",
                activeTab === 'invitations'
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Invitations
                {(stats?.pending_invitations || 0) > 0 && (
                  <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
                    {stats?.pending_invitations}
                  </span>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Companies Tab */}
        {activeTab === 'companies' && (
          <>
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
                      className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent w-64 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600"
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
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Company</th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan</th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Users</th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Properties</th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-500">
                        No companies found
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.map((tenant) => (
                      <tr key={tenant.id} className="hover:bg-gray-50">
                        <td className="py-4 px-6">
                          <div>
                            <p className="font-medium text-gray-900">{tenant.name || tenant.company_name}</p>
                            <p className="text-sm text-gray-500">{tenant.schema_name || tenant.subdomain}.parameter.co.zw</p>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className="text-sm text-gray-900 capitalize">{tenant.subscription_plan || tenant.plan}</span>
                        </td>
                        <td className="py-4 px-6">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize",
                            getStatusBadge(tenant.account_status || tenant.status || 'active')
                          )}>
                            {getStatusIcon(tenant.account_status || tenant.status || 'active')}
                            {tenant.account_status || tenant.status || 'active'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-900">{tenant.users || tenant.users_count || 0}</td>
                        <td className="py-4 px-6 text-sm text-gray-900">{tenant.properties || tenant.properties_count || 0}</td>
                        <td className="py-4 px-6 text-sm text-gray-500">{tenant.created_at ? formatDate(tenant.created_at) : '-'}</td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2 relative">
                            <button className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="View details">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setActionMenuOpen(actionMenuOpen === tenant.id ? null : tenant.id)}
                              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {/* Action Dropdown Menu */}
                            {actionMenuOpen === tenant.id && (
                              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-1">
                                {/* Scheduled for deletion - show cancel */}
                                {tenant.is_scheduled_for_deletion || tenant.scheduled_deletion_at ? (
                                  <>
                                    <div className="px-3 py-2 text-xs text-red-600 border-b border-gray-100">
                                      Scheduled for deletion
                                    </div>
                                    <button
                                      onClick={() => cancelDeletionMutation.mutate(tenant.id)}
                                      disabled={cancelDeletionMutation.isPending}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-green-600 hover:bg-green-50"
                                    >
                                      <RotateCcw className="w-4 h-4" />
                                      Cancel Deletion
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {/* Active company - can suspend */}
                                    {(tenant.is_active !== false && tenant.account_status !== 'suspended') ? (
                                      <button
                                        onClick={() => setConfirmDialog({ type: 'suspend', tenant })}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-amber-600 hover:bg-amber-50"
                                      >
                                        <Pause className="w-4 h-4" />
                                        Suspend Company
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => activateMutation.mutate(tenant.id)}
                                        disabled={activateMutation.isPending}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-green-600 hover:bg-green-50"
                                      >
                                        <Play className="w-4 h-4" />
                                        Activate Company
                                      </button>
                                    )}
                                    <button
                                      onClick={() => setConfirmDialog({ type: 'delete', tenant })}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-600 hover:bg-red-50"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                      Schedule Deletion
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Invitations Tab */}
        {activeTab === 'invitations' && (
          <>
            <div className="p-6 border-b border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h2 className="text-lg font-semibold text-gray-900">Company Invitations</h2>
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Invitation
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Company</th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan</th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sent</th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Expires</th>
                    <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invitationsLoading ? (
                    [...Array(3)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="py-4 px-6"><div className="h-4 w-32 bg-gray-200 rounded" /></td>
                        <td className="py-4 px-6"><div className="h-4 w-40 bg-gray-200 rounded" /></td>
                        <td className="py-4 px-6"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                        <td className="py-4 px-6"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                        <td className="py-4 px-6"><div className="h-5 w-20 bg-gray-200 rounded-full" /></td>
                        <td className="py-4 px-6"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                        <td className="py-4 px-6"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                        <td className="py-4 px-6"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                      </tr>
                    ))
                  ) : invitations.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center">
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <Mail className="w-6 h-6 text-gray-400" />
                          </div>
                          <p className="text-gray-500 mb-2">No invitations yet</p>
                          <button
                            onClick={() => setShowInviteModal(true)}
                            className="text-primary-600 hover:text-primary-700 font-medium text-sm"
                          >
                            Send your first invitation
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    invitations.map((invitation) => (
                      <tr key={invitation.id} className="hover:bg-gray-50">
                        <td className="py-4 px-6">
                          <div>
                            <p className="font-medium text-gray-900">{invitation.company_name}</p>
                            {invitation.first_name && (
                              <p className="text-sm text-gray-500">{invitation.first_name} {invitation.last_name}</p>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-600">{invitation.email}</td>
                        <td className="py-4 px-6">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-xs font-medium capitalize",
                            invitation.invitation_type === 'demo' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          )}>
                            {invitation.invitation_type}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-900 capitalize">{invitation.subscription_plan}</td>
                        <td className="py-4 px-6">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize",
                            getStatusBadge(invitation.status)
                          )}>
                            {getStatusIcon(invitation.status)}
                            {invitation.status}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-500">{invitation.created_at ? formatDate(invitation.created_at) : '-'}</td>
                        <td className="py-4 px-6 text-sm text-gray-500">{invitation.expires_at ? formatDate(invitation.expires_at) : '-'}</td>
                        <td className="py-4 px-6 text-right">
                          {invitation.status === 'pending' && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => resendMutation.mutate(invitation.id)}
                                disabled={resendMutation.isPending}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Resend invitation"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => cancelMutation.mutate(invitation.id)}
                                disabled={cancelMutation.isPending}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Cancel invitation"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4"
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Invite New Company</h2>
                  <p className="text-sm text-gray-500">Send an invitation to join the platform</p>
                </div>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                createInvitationMutation.mutate(inviteForm)
              }}
              className="p-6 space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={inviteForm.company_name}
                    onChange={(e) => setInviteForm({ ...inviteForm, company_name: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600"
                    required
                    placeholder="Acme Real Estate"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600"
                    required
                    placeholder="admin@company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={inviteForm.first_name}
                    onChange={(e) => setInviteForm({ ...inviteForm, first_name: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={inviteForm.last_name}
                    onChange={(e) => setInviteForm({ ...inviteForm, last_name: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600"
                    placeholder="Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
                  <select
                    value={inviteForm.invitation_type}
                    onChange={(e) => setInviteForm({ ...inviteForm, invitation_type: e.target.value as 'full' | 'demo' })}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600"
                  >
                    <option value="full">Full Account</option>
                    <option value="demo">Demo Account (2 hours)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Plan</label>
                  <select
                    value={inviteForm.subscription_plan}
                    onChange={(e) => setInviteForm({ ...inviteForm, subscription_plan: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600"
                  >
                    <option value="free">Free Trial</option>
                    <option value="basic">Basic</option>
                    <option value="professional">Professional</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Personal Message (optional)</label>
                  <textarea
                    value={inviteForm.message}
                    onChange={(e) => setInviteForm({ ...inviteForm, message: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600"
                    rows={3}
                    placeholder="Welcome to Parameter! We're excited to have you on board..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createInvitationMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {createInvitationMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Invitation
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center",
                confirmDialog.type === 'delete' ? 'bg-red-100' : 'bg-amber-100'
              )}>
                {confirmDialog.type === 'delete' ? (
                  <Trash2 className="w-5 h-5 text-red-600" />
                ) : (
                  <Pause className="w-5 h-5 text-amber-600" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {confirmDialog.type === 'delete' ? 'Schedule Deletion' : 'Suspend Company'}
                </h3>
                <p className="text-sm text-gray-500">{confirmDialog.tenant.name || confirmDialog.tenant.company_name}</p>
              </div>
            </div>

            <p className="text-gray-600 mb-6">
              {confirmDialog.type === 'delete' ? (
                <>
                  This will schedule <strong>{confirmDialog.tenant.name || confirmDialog.tenant.company_name}</strong> for deletion.
                  The company will be permanently deleted after <strong>24 hours</strong>.
                  You can cancel this action during the grace period.
                </>
              ) : (
                <>
                  This will suspend <strong>{confirmDialog.tenant.name || confirmDialog.tenant.company_name}</strong>.
                  Users will not be able to access the system until reactivated.
                </>
              )}
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmDialog.type === 'delete') {
                    scheduleDeletionMutation.mutate(confirmDialog.tenant.id)
                  } else {
                    suspendMutation.mutate(confirmDialog.tenant.id)
                    setConfirmDialog(null)
                  }
                }}
                disabled={scheduleDeletionMutation.isPending || suspendMutation.isPending}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl transition-colors disabled:opacity-50",
                  confirmDialog.type === 'delete'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-amber-600 text-white hover:bg-amber-700'
                )}
              >
                {(scheduleDeletionMutation.isPending || suspendMutation.isPending) ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : confirmDialog.type === 'delete' ? (
                  <Trash2 className="w-4 h-4" />
                ) : (
                  <Pause className="w-4 h-4" />
                )}
                {confirmDialog.type === 'delete' ? 'Schedule Deletion' : 'Suspend'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Click outside to close action menu */}
      {actionMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setActionMenuOpen(null)}
        />
      )}
    </div>
  )
}
