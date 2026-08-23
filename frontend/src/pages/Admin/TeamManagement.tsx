import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  UserPlus,
  Mail,
  Send,
  RefreshCw,
  XCircle,
  CheckCircle,
  Clock,
  AlertTriangle,
  Shield,
  Upload,
  Download,
  FileText,
  Loader2,
  X,
} from '@/lib/icons'
import { invitationsApi, usersApi } from '../../services/api'
import { PageHeader, Button, Modal, SelectionCheckbox, BulkActionsBar, TimeAgo } from '../../components/ui'
import toast from 'react-hot-toast'
import { SiFsecure } from "react-icons/si";
import { PiUsersFour } from "react-icons/pi";
import { TbUserSquareRounded } from "react-icons/tb";
import { useAuthStore } from '../../stores/authStore'
import { useSelection } from '../../hooks/useSelection'
import { useBulkLoading } from '../../hooks/useBulkLoading'


// Invite user-type options. Invitations now carry the full user type; the
// invitee is created with that type (and its default permission role) on
// acceptance. The backend filters this list per the inviter's authority.
const allTypeOptions = [
  { value: 'admin', label: 'Admin', description: 'Full access except receipting' },
  { value: 'accounts_officer', label: 'Accounts Officer', description: 'Finances & billing; no bank/income-category creation or receipting' },
  { value: 'clerk', label: 'Clerk', description: 'General operational data entry' },
  { value: 'cashier', label: 'Cashier', description: 'Cash & receipting; no posting, voiding or general journals' },
  { value: 'portfolio_manager', label: 'Portfolio Manager', description: 'View & print only' },
  { value: 'tenant', label: 'Tenant', description: 'Own tenant portal only' },
  { value: 'account_holder', label: 'Account Holder', description: 'Own account-holder portal only' },
]

// CSV bulk upload still uses legacy role codes in its `role` column; they map
// to the corresponding user type on acceptance.
const csvRoleToTypeNote = 'admin, accountant, clerk, tenant_portal'

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-rose-100 text-rose-700',
}

const statusTooltips: Record<string, string> = {
  pending: 'Invitation sent and awaiting response',
  accepted: 'Invitation accepted and account created',
  expired: 'Invitation has expired and is no longer valid',
  cancelled: 'Invitation was cancelled before acceptance',
}

const statusIcons: Record<string, any> = {
  pending: Clock,
  accepted: CheckCircle,
  expired: AlertTriangle,
  cancelled: XCircle,
}

interface BulkInviteResult {
  row: number
  email: string
  status: 'success' | 'error'
  error?: string
}

export default function TeamManagement() {
  const queryClient = useQueryClient()
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'users' | 'invitations'>('users')
  const [inviteTab, setInviteTab] = useState<'single' | 'multiple' | 'csv'>('single')
  const { user: currentUser } = useAuthStore()

  // Form state - single invite
  const [inviteForm, setInviteForm] = useState({
    email: '',
    first_name: '',
    last_name: '',
    user_type: 'clerk',
  })

  // Multi invite state
  const [bulkEmails, setBulkEmails] = useState('')
  const [bulkUserType, setBulkUserType] = useState('clerk')
  const [bulkFirstName, setBulkFirstName] = useState('')
  const [bulkLastName, setBulkLastName] = useState('')

  // CSV invite state
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvRows, setCsvRows] = useState<Array<{ email: string; first_name: string; last_name: string; role: string }>>([])
  const [csvParsed, setCsvParsed] = useState(false)

  // Bulk invite results
  const [bulkResults, setBulkResults] = useState<BulkInviteResult[] | null>(null)
  const [bulkSending, setBulkSending] = useState(false)

  // Selection for invitations tab
  const selection = useSelection<number>({ clearOnChange: [activeTab] })
  const bulkLoading = useBulkLoading()

  // Permission management (Admin only)
  const [permUser, setPermUser] = useState<any | null>(null)
  const [permUserType, setPermUserType] = useState<string>('')
  const [permRole, setPermRole] = useState<string>('')
  const [permCustomCaps, setPermCustomCaps] = useState<Set<string>>(new Set())

  // Check if current user can invite others
  const canInvite = Boolean(currentUser?.role && ['super_admin', 'admin', 'accountant'].includes(currentUser.role))

  // Check if current user can manage users (activate/deactivate + permissions)
  const canManageUsers = Boolean(currentUser?.role && ['super_admin', 'admin'].includes(currentUser.role))

  // Capability catalog (groups, user types, permission roles + their defaults)
  const { data: catalog } = useQuery<{
    groups: { title: string; capabilities: { code: string; label: string }[] }[]
    user_types: { value: string; label: string; locked: boolean }[]
    permission_roles: { value: string; label: string; assignable: boolean; capabilities: string[] }[]
  }>({
    queryKey: ['capability-catalog'],
    queryFn: () => usersApi.capabilityCatalog().then(r => r.data),
    enabled: canManageUsers,
    staleTime: 1000 * 60 * 30,
  })

  const assignableUserTypes = useMemo(
    () => (catalog?.user_types || []).filter(t => !t.locked && t.value !== 'super_admin'),
    [catalog]
  )
  const assignableRoles = useMemo(
    () => (catalog?.permission_roles || []).filter(r => r.assignable),
    [catalog]
  )
  const roleDefaults = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const r of catalog?.permission_roles || []) m[r.value] = r.capabilities
    return m
  }, [catalog])

  // The capabilities currently in effect for the modal: predefined roles show
  // their fixed default set; 'custom' uses the editable checkbox selection.
  const effectivePermCaps = useMemo(() => {
    if (permRole === 'custom') return permCustomCaps
    return new Set(roleDefaults[permRole] || [])
  }, [permRole, permCustomCaps, roleDefaults])

  // Queries
  const { data: users, isLoading: usersLoading } = useQuery<{ results?: any[] } | any[]>({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then(r => r.data),
    placeholderData: keepPreviousData,
  })

  const { data: invitations, isLoading: invitationsLoading } = useQuery<{ results?: any[] } | any[]>({
    queryKey: ['invitations'],
    queryFn: () => invitationsApi.list().then(r => r.data),
    enabled: canInvite, // Only fetch invitations if user can invite
    placeholderData: keepPreviousData,
  })

  // Get allowed user types for this inviter
  const { data: allowedTypesData } = useQuery<{ allowed_types: { value: string; label: string }[] }>({
    queryKey: ['allowed-types'],
    queryFn: () => invitationsApi.allowedTypes().then(r => r.data),
    enabled: canInvite,
    placeholderData: keepPreviousData,
  })

  // Filter type options based on what the inviter is allowed to invite
  const typeOptions = useMemo(() => {
    if (!allowedTypesData?.allowed_types) return []
    const allowedValues = allowedTypesData.allowed_types.map((t) => t.value)
    return allTypeOptions.filter(t => allowedValues.includes(t.value))
  }, [allowedTypesData])

  // Mutations
  const createInvitationMutation = useMutation({
    mutationFn: (data: typeof inviteForm) => invitationsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      setInviteModalOpen(false)
      setInviteForm({ email: '', first_name: '', last_name: '', user_type: 'clerk' })
      toast.success('Invitation sent successfully')
    },
    onError: (error: any) => {
      const errorData = error.response?.data
      // Handle validation errors (Django REST Framework format)
      if (errorData?.user_type) {
        toast.error(errorData.user_type[0] || errorData.user_type)
      } else if (errorData?.role) {
        toast.error(errorData.role[0] || errorData.role)
      } else if (errorData?.email) {
        toast.error(errorData.email[0] || errorData.email)
      } else if (errorData?.error) {
        toast.error(errorData.error)
      } else if (errorData?.detail) {
        toast.error(errorData.detail)
      } else {
        toast.error('Failed to send invitation')
      }
    },
  })

  const resendInvitationMutation = useMutation({
    mutationFn: (id: number) => invitationsApi.resend(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      toast.success('Invitation resent')
    },
  })

  const cancelInvitationMutation = useMutation({
    mutationFn: (id: number) => invitationsApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      toast.success('Invitation cancelled')
    },
  })

  const toggleUserStatusMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      active ? usersApi.activate(id) : usersApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User status updated')
    },
  })

  const updatePermsMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { user_type?: string; permission_role?: string; custom_capabilities?: string[] } }) =>
      usersApi.updatePermissions(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setPermUser(null)
      toast.success('Permissions updated')
    },
    onError: (error: any) => {
      const d = error.response?.data
      toast.error(d?.error || d?.permission_role?.[0] || d?.detail || 'Failed to update permissions')
    },
  })

  const openPermissions = (u: any) => {
    setPermUser(u)
    const utype = u.user_type || 'clerk'
    const prole = u.permission_role || 'clerk_default'
    setPermUserType(utype)
    setPermRole(prole)
    // Seed the custom checkboxes from the user's current effective set so
    // switching to 'custom' starts from where they are today.
    const seed: string[] = prole === 'custom'
      ? (u.custom_capabilities || [])
      : (roleDefaults[prole] || u.capabilities || [])
    setPermCustomCaps(new Set(seed))
  }

  const toggleCap = (code: string) => {
    setPermCustomCaps(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code); else next.add(code)
      return next
    })
  }

  const handleSavePermissions = () => {
    if (!permUser) return
    const payload: { user_type?: string; permission_role?: string; custom_capabilities?: string[] } = {
      user_type: permUserType,
      permission_role: permRole,
    }
    if (permRole === 'custom') payload.custom_capabilities = Array.from(permCustomCaps)
    updatePermsMutation.mutate({ id: permUser.id, data: payload })
  }

  const handleSubmitInvite = (e: React.FormEvent) => {
    e.preventDefault()
    createInvitationMutation.mutate(inviteForm)
  }

  // Reset form when modal opens with default allowed type
  const handleOpenInviteModal = () => {
    const defaultType = typeOptions.length > 0 ? typeOptions[typeOptions.length - 1].value : 'clerk'
    setInviteForm({ email: '', first_name: '', last_name: '', user_type: defaultType })
    setInviteTab('single')
    setBulkEmails('')
    setBulkUserType(defaultType)
    setBulkFirstName('')
    setBulkLastName('')
    setCsvFile(null)
    setCsvRows([])
    setCsvParsed(false)
    setBulkResults(null)
    setInviteModalOpen(true)
  }

  // Bulk invite: Multiple emails
  const handleBulkInviteMultiple = async () => {
    const emails = bulkEmails
      .split(/[,\n]/)
      .map(e => e.trim())
      .filter(e => e && e.includes('@'))

    if (emails.length === 0) {
      toast.error('Please enter at least one valid email')
      return
    }

    setBulkSending(true)
    try {
      const invitations = emails.map(email => ({
        email,
        first_name: bulkFirstName,
        last_name: bulkLastName,
        user_type: bulkUserType,
      }))
      const res = await invitationsApi.bulkCreate({ invitations })
      setBulkResults(res.data.results)
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      toast.success(`${res.data.success_count} invitations sent`)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to send invitations')
    }
    setBulkSending(false)
  }

  // CSV parsing
  const handleCsvFile = (file: File) => {
    setCsvFile(file)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n').filter(l => l.trim())
      // Skip header row
      const rows = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
        return {
          email: cols[0] || '',
          first_name: cols[1] || '',
          last_name: cols[2] || '',
          role: cols[3] || 'clerk',
        }
      }).filter(r => r.email && r.email.includes('@'))
      setCsvRows(rows)
      setCsvParsed(true)
    }
    reader.readAsText(file)
  }

  const handleCsvInvite = async () => {
    if (csvRows.length === 0) return
    setBulkSending(true)
    try {
      const res = await invitationsApi.bulkCreate({ invitations: csvRows })
      setBulkResults(res.data.results)
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      toast.success(`${res.data.success_count} invitations sent`)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to send invitations')
    }
    setBulkSending(false)
  }

  const downloadCsvTemplate = () => {
    const csv = 'email,first_name,last_name,role\njohn@example.com,John,Doe,clerk\njane@example.com,Jane,Smith,accountant'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'invite_template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  // Bulk actions for invitations tab
  const handleBulkResend = () => {
    const ids = Array.from(selection.selectedIds)
    bulkLoading.run('resend', async () => {
      let count = 0
      for (const id of ids) {
        try { await invitationsApi.resend(id); count++ } catch {}
      }
      selection.clearSelection()
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      toast.success(`Resent ${count} invitations`)
    })
  }

  const handleBulkCancel = () => {
    const ids = Array.from(selection.selectedIds)
    bulkLoading.run('cancel', async () => {
      let count = 0
      for (const id of ids) {
        try { await invitationsApi.cancel(id); count++ } catch {}
      }
      selection.clearSelection()
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      toast.success(`Cancelled ${count} invitations`)
    })
  }

  const userList = (users as any)?.results || users || []
  const invitationList = (invitations as any)?.results || invitations || []
  const pendingInvitations = invitationList.filter((i: any) => i.status === 'pending')
  const pageIds = pendingInvitations.map((i: any) => i.id)

  // User-type selector component (shared between tabs)
  const TypeSelector = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div className="space-y-2">
      {typeOptions.map((t) => (
        <label
          key={t.value}
          className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
            value === t.value
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <input
            type="radio"
            name="user_type"
            value={t.value}
            checked={value === t.value}
            onChange={() => onChange(t.value)}
            className="mt-0.5"
          />
          <div>
            <p className="font-medium text-gray-900">{t.label}</p>
            <p className="text-sm text-gray-500">{t.description}</p>
          </div>
        </label>
      ))}
    </div>
  )

  const inputClass = "w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Management"
        description="Manage users and send invitations"
        icon={TbUserSquareRounded}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Team' },
        ]}
        actions={
          canInvite ? (
            <Button onClick={handleOpenInviteModal} className="gap-2">
              <UserPlus className="w-4 h-4" />
              Invite Team Member
            </Button>
          ) : null
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Active Users ({userList.length})
        </button>
        {canInvite && (
          <button
            onClick={() => setActiveTab('invitations')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'invitations'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Pending Invitations ({pendingInvitations.length})
          </button>
        )}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'users' ? (
          <motion.div
            key="users"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            {usersLoading ? (
              <>
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">User</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Role</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Last Activity</th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[...Array(4)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white/50 font-medium text-sm">
                              --
                            </div>
                            <div className="space-y-2">
                              <div className="h-4 w-32 bg-gray-200 rounded" />
                              <div className="h-3 w-40 bg-gray-200 rounded" />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-400 text-xs font-medium rounded-lg">
                            <Shield className="w-3 h-3" />
                            <span className="h-3 w-12 bg-gray-200 rounded inline-block" />
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-400 text-xs font-medium rounded-lg">
                            <CheckCircle className="w-3 h-3" />
                            <span className="h-3 w-10 bg-gray-200 rounded inline-block" />
                          </span>
                        </td>
                        <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                        <td className="px-6 py-4 text-right"><span className="text-gray-300 text-sm font-medium">Deactivate</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : userList.length === 0 ? (
              <div className="p-12 text-center">
                <TbUserSquareRounded className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No users found</p>
                <p className="text-sm text-gray-400 mt-1">Invite team members to get started</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">User</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Role</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Last Activity</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {userList.map((user: any) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-medium text-sm">
                            {user.first_name?.[0]}{user.last_name?.[0]}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{user.first_name} {user.last_name}</p>
                            <p className="text-sm text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg w-fit"
                            title="User type (identity)"
                          >
                            <Shield className="w-3 h-3" />
                            {user.user_type_display || user.role?.replace('_', ' ')}
                          </span>
                          {user.permission_role_display && (
                            <span
                              className="text-[11px] text-gray-500 pl-1"
                              title="Permission role (capability set)"
                            >
                              {user.permissions_locked ? '🔒 ' : ''}{user.permission_role_display}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg ${
                            user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                          }`}
                          title={user.is_active ? 'User can log in and access the system' : 'User account is deactivated and cannot log in'}
                        >
                          {user.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <TimeAgo date={user.last_activity} fallback="Never" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {canManageUsers && (
                            <button
                              onClick={() => openPermissions(user)}
                              className="text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
                              title={user.permissions_locked ? 'Portal user — permissions are permanently restricted' : 'Manage this user’s permissions'}
                            >
                              <Shield className="w-3.5 h-3.5" />
                              Permissions
                            </button>
                          )}
                          {canManageUsers && user.id !== currentUser?.id && (
                            <button
                              onClick={() => toggleUserStatusMutation.mutate({
                                id: user.id,
                                active: !user.is_active
                              })}
                              className={`text-sm font-medium ${
                                user.is_active
                                  ? 'text-rose-600 hover:text-rose-700'
                                  : 'text-emerald-600 hover:text-emerald-700'
                              }`}
                              title={user.is_active ? 'Deactivate this user account' : 'Reactivate this user account'}
                            >
                              {user.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="invitations"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            {invitationsLoading ? (
              <>
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-4 w-10" />
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Invitee</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Role</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Sent</th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[...Array(3)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-4 py-4" />
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                              <Mail className="w-5 h-5" />
                            </div>
                            <div className="space-y-2">
                              <div className="h-4 w-28 bg-gray-200 rounded" />
                              <div className="h-3 w-36 bg-gray-200 rounded" />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-400 text-xs font-medium rounded-lg">
                            <Shield className="w-3 h-3" />
                            <span className="h-3 w-12 bg-gray-200 rounded inline-block" />
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-400 text-xs font-medium rounded-lg">
                            <Clock className="w-3 h-3" />
                            <span className="h-3 w-12 bg-amber-200 rounded inline-block" />
                          </span>
                        </td>
                        <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-gray-300 text-sm font-medium flex items-center gap-1">
                              <RefreshCw className="w-3 h-3" /> Resend
                            </span>
                            <span className="text-gray-300 text-sm font-medium flex items-center gap-1">
                              <XCircle className="w-3 h-3" /> Cancel
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : invitationList.length === 0 ? (
              <div className="p-12 text-center">
                <Mail className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No invitations</p>
                <p className="text-sm text-gray-400 mt-1">Send invitations to add team members</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-4 w-10">
                      <SelectionCheckbox
                        checked={selection.isAllPageSelected(pageIds)}
                        indeterminate={selection.isPartialPageSelected(pageIds)}
                        onChange={() => selection.selectPage(pageIds)}
                      />
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Invitee</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Role</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Sent</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invitationList.map((invite: any) => {
                    const StatusIcon = statusIcons[invite.status] || Clock
                    return (
                      <tr key={invite.id} className={`transition-colors ${selection.isSelected(invite.id) ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-4 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                          {invite.status === 'pending' && (
                            <SelectionCheckbox
                              checked={selection.isSelected(invite.id)}
                              onChange={() => selection.toggle(invite.id)}
                            />
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                              <Mail className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {invite.first_name && invite.last_name
                                  ? `${invite.first_name} ${invite.last_name}`
                                  : 'Pending'}
                              </p>
                              <p className="text-sm text-gray-500">{invite.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg capitalize"
                            title="User type the invitee will be created as"
                          >
                            <Shield className="w-3 h-3" />
                            {invite.user_type_display || invite.role?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg capitalize ${statusColors[invite.status]}`}
                            title={statusTooltips[invite.status] || 'Invitation status'}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {invite.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          <TimeAgo date={invite.created_at} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          {invite.status === 'pending' && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => resendInvitationMutation.mutate(invite.id)}
                                className="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1"
                                title="Resend invitation"
                              >
                                <RefreshCw className="w-3 h-3" />
                                Resend
                              </button>
                              <button
                                onClick={() => cancelInvitationMutation.mutate(invite.id)}
                                className="text-sm font-medium text-rose-600 hover:text-rose-700 flex items-center gap-1"
                                title="Cancel invitation"
                              >
                                <XCircle className="w-3 h-3" />
                                Cancel
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selection Bulk Actions */}
      <BulkActionsBar
        selectedCount={selection.selectedCount}
        onClearSelection={selection.clearSelection}
        entityName="invitations"
        actions={[
          { label: 'Resend', icon: RefreshCw, onClick: handleBulkResend, variant: 'primary', loading: bulkLoading.is('resend'), disabled: bulkLoading.busy && !bulkLoading.is('resend') },
          { label: 'Cancel', icon: XCircle, onClick: handleBulkCancel, variant: 'danger', loading: bulkLoading.is('cancel'), disabled: bulkLoading.busy && !bulkLoading.is('cancel') },
        ]}
      />

      {/* Invite Modal - Tabbed */}
      <Modal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Invite Team Members"
      >
        {bulkResults ? (
          /* Results view */
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">{bulkResults.filter(r => r.status === 'success').length} sent</span>
              </div>
              {bulkResults.some(r => r.status === 'error') && (
                <div className="flex items-center gap-2 text-rose-600">
                  <XCircle className="w-5 h-5" />
                  <span className="font-medium">{bulkResults.filter(r => r.status === 'error').length} failed</span>
                </div>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">#</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Email</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bulkResults.map((r) => (
                    <tr key={r.row}>
                      <td className="px-3 py-2 text-gray-500">{r.row}</td>
                      <td className="px-3 py-2">{r.email}</td>
                      <td className="px-3 py-2">
                        {r.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle className="w-3.5 h-3.5" /> Sent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-600" title={r.error}>
                            <XCircle className="w-3.5 h-3.5" /> {r.error?.substring(0, 50)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => { setBulkResults(null); setInviteModalOpen(false) }}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          /* Tabbed invite form */
          <div className="space-y-4">
            {/* Tab selector */}
            <div className="flex border-b border-gray-200">
              {(['single', 'multiple', 'csv'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setInviteTab(tab)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                    inviteTab === tab
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'csv' ? 'CSV Upload' : tab}
                </button>
              ))}
            </div>

            {inviteTab === 'single' && (
              <form onSubmit={handleSubmitInvite} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    className={inputClass}
                    placeholder="colleague@company.com"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                    <input
                      type="text"
                      value={inviteForm.first_name}
                      onChange={(e) => setInviteForm({ ...inviteForm, first_name: e.target.value })}
                      className={inputClass}
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={inviteForm.last_name}
                      onChange={(e) => setInviteForm({ ...inviteForm, last_name: e.target.value })}
                      className={inputClass}
                      placeholder="Doe"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">User Type *</label>
                  <TypeSelector value={inviteForm.user_type} onChange={(v) => setInviteForm({ ...inviteForm, user_type: v })} />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setInviteModalOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createInvitationMutation.isPending} className="gap-2">
                    <Send className="w-4 h-4" />
                    {createInvitationMutation.isPending ? 'Sending...' : 'Send Invitation'}
                  </Button>
                </div>
              </form>
            )}

            {inviteTab === 'multiple' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Addresses (one per line or comma-separated) *
                  </label>
                  <textarea
                    value={bulkEmails}
                    onChange={(e) => setBulkEmails(e.target.value)}
                    className={`${inputClass} min-h-[120px]`}
                    placeholder={"john@example.com\njane@example.com\nbob@example.com"}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {bulkEmails.split(/[,\n]/).filter(e => e.trim() && e.trim().includes('@')).length} email(s) detected
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shared First Name</label>
                    <input type="text" value={bulkFirstName} onChange={(e) => setBulkFirstName(e.target.value)} className={inputClass} placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shared Last Name</label>
                    <input type="text" value={bulkLastName} onChange={(e) => setBulkLastName(e.target.value)} className={inputClass} placeholder="Optional" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">User Type *</label>
                  <TypeSelector value={bulkUserType} onChange={setBulkUserType} />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setInviteModalOpen(false)}>Cancel</Button>
                  <Button onClick={handleBulkInviteMultiple} disabled={bulkSending} className="gap-2">
                    {bulkSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {bulkSending ? 'Sending...' : `Send ${bulkEmails.split(/[,\n]/).filter(e => e.trim() && e.trim().includes('@')).length} Invitations`}
                  </Button>
                </div>
              </div>
            )}

            {inviteTab === 'csv' && (
              <div className="space-y-4">
                {!csvParsed ? (
                  <>
                    <div
                      className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-primary-400 transition-colors cursor-pointer"
                      onClick={() => document.getElementById('csv-upload')?.click()}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const file = e.dataTransfer.files[0]
                        if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
                          handleCsvFile(file)
                        }
                      }}
                    >
                      <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600 font-medium">Drop a CSV file here or click to browse</p>
                      <p className="text-sm text-gray-400 mt-1">Columns: email, first_name, last_name, role</p>
                      <p className="text-xs text-gray-400 mt-0.5">Valid role values: {csvRoleToTypeNote}</p>
                      <input
                        id="csv-upload"
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleCsvFile(file)
                        }}
                      />
                    </div>
                    <button
                      onClick={downloadCsvTemplate}
                      className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                    >
                      <Download className="w-4 h-4" />
                      Download Template
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-gray-400" />
                        <span className="text-sm font-medium">{csvFile?.name}</span>
                        <span className="text-xs text-gray-500">({csvRows.length} rows)</span>
                      </div>
                      <button
                        onClick={() => { setCsvFile(null); setCsvRows([]); setCsvParsed(false) }}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        Change file
                      </button>
                    </div>

                    <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Email</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">First Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Last Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Role</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {csvRows.map((row, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2">{row.email}</td>
                              <td className="px-3 py-2">{row.first_name || '-'}</td>
                              <td className="px-3 py-2">{row.last_name || '-'}</td>
                              <td className="px-3 py-2 capitalize">{row.role}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setInviteModalOpen(false)}>Cancel</Button>
                      <Button onClick={handleCsvInvite} disabled={bulkSending || csvRows.length === 0} className="gap-2">
                        {bulkSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {bulkSending ? 'Sending...' : `Send ${csvRows.length} Invitations`}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Permission Management Modal (Admin only) */}
      <Modal
        open={!!permUser}
        onClose={() => setPermUser(null)}
        title={permUser ? `Permissions — ${permUser.first_name} ${permUser.last_name}` : 'Permissions'}
      >
        {permUser?.permissions_locked ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Portal user — permissions are permanently restricted.</p>
                <p className="mt-1">
                  {permUser.user_type_display || 'This user'} can only access their own portal
                  ({permUser.permission_role_display}). This cannot be changed.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setPermUser(null)}>Close</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-gray-500">
              A user's <span className="font-medium text-gray-700">type</span> is their identity;
              their <span className="font-medium text-gray-700">permission role</span> is what they
              may do. Choose a predefined role, or pick <span className="font-medium">Custom</span> to
              hand-tune individual capabilities.
            </p>

            {/* User type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">User Type</label>
              <select
                value={permUserType}
                onChange={(e) => setPermUserType(e.target.value)}
                className={inputClass}
              >
                {assignableUserTypes.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Permission role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Permission Role</label>
              <select
                value={permRole}
                onChange={(e) => {
                  const v = e.target.value
                  // When switching to Custom, seed the checkboxes from the
                  // currently effective set so it starts from where they are.
                  if (v === 'custom' && permRole !== 'custom') {
                    setPermCustomCaps(new Set(effectivePermCaps))
                  }
                  setPermRole(v)
                }}
                className={inputClass}
              >
                {assignableRoles.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Capability matrix */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Capabilities</label>
                <span className="text-xs text-gray-400">
                  {permRole === 'custom' ? 'Toggle individual capabilities' : 'Defined by the selected role (read-only)'}
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                {(catalog?.groups || []).map(group => (
                  <div key={group.title} className="p-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{group.title}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                      {group.capabilities
                        // Portal caps are never part of an internal set.
                        .filter(c => c.code !== 'portal.tenant' && c.code !== 'portal.account_holder')
                        .map(c => (
                        <label
                          key={c.code}
                          className={`flex items-center gap-2 text-sm ${permRole === 'custom' ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                          <input
                            type="checkbox"
                            checked={effectivePermCaps.has(c.code)}
                            disabled={permRole !== 'custom'}
                            onChange={() => toggleCap(c.code)}
                            className="rounded border-gray-300 disabled:opacity-60"
                          />
                          <span className={effectivePermCaps.has(c.code) ? 'text-gray-800' : 'text-gray-400'}>
                            {c.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => setPermUser(null)}>Cancel</Button>
              <Button onClick={handleSavePermissions} disabled={updatePermsMutation.isPending} className="gap-2">
                <Shield className="w-4 h-4" />
                {updatePermsMutation.isPending ? 'Saving...' : 'Save Permissions'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
