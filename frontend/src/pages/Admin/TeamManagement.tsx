import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
} from 'lucide-react'
import { invitationsApi, usersApi } from '../../services/api'
import { PageHeader, Button, Modal, SelectionCheckbox, BulkActionsBar, TimeAgo } from '../../components/ui'
import toast from 'react-hot-toast'
import { SiFsecure } from "react-icons/si";
import { PiUsersFour } from "react-icons/pi";
import { TbUserSquareRounded } from "react-icons/tb";
import { useAuthStore } from '../../stores/authStore'
import { useSelection } from '../../hooks/useSelection'


// Full list of role options with descriptions
const allRoleOptions = [
  { value: 'admin', label: 'Admin', description: 'Full access to all features' },
  { value: 'accountant', label: 'Accountant', description: 'Can manage finances and billing' },
  { value: 'clerk', label: 'Clerk', description: 'Basic data entry access' },
  { value: 'tenant_portal', label: 'Tenant Portal', description: 'Limited tenant-only access' },
]

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-rose-100 text-rose-700',
}

const roleTooltips: Record<string, string> = {
  admin: 'Full access to all features and settings',
  accountant: 'Can manage finances, billing, and financial reports',
  clerk: 'Basic data entry and viewing access',
  tenant_portal: 'Limited access to tenant-specific portal only',
  super_admin: 'Platform-wide administrative access',
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
    role: 'clerk',
  })

  // Multi invite state
  const [bulkEmails, setBulkEmails] = useState('')
  const [bulkRole, setBulkRole] = useState('clerk')
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

  // Check if current user can invite others
  const canInvite = Boolean(currentUser?.role && ['super_admin', 'admin', 'accountant'].includes(currentUser.role))

  // Check if current user can manage users (activate/deactivate)
  const canManageUsers = Boolean(currentUser?.role && ['super_admin', 'admin'].includes(currentUser.role))

  // Queries
  const { data: users, isLoading: usersLoading } = useQuery<{ results?: any[] } | any[]>({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then(r => r.data),
  })

  const { data: invitations, isLoading: invitationsLoading } = useQuery<{ results?: any[] } | any[]>({
    queryKey: ['invitations'],
    queryFn: () => invitationsApi.list().then(r => r.data),
    enabled: canInvite, // Only fetch invitations if user can invite
  })

  // Get allowed roles for this user
  const { data: allowedRolesData } = useQuery<{ allowed_roles: { value: string; label: string }[] }>({
    queryKey: ['allowed-roles'],
    queryFn: () => invitationsApi.allowedRoles().then(r => r.data),
    enabled: canInvite,
  })

  // Filter role options based on what user is allowed to invite
  const roleOptions = useMemo(() => {
    if (!allowedRolesData?.allowed_roles) return []
    const allowedValues = allowedRolesData.allowed_roles.map((r) => r.value)
    return allRoleOptions.filter(role => allowedValues.includes(role.value))
  }, [allowedRolesData])

  // Mutations
  const createInvitationMutation = useMutation({
    mutationFn: (data: typeof inviteForm) => invitationsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      setInviteModalOpen(false)
      setInviteForm({ email: '', first_name: '', last_name: '', role: 'clerk' })
      toast.success('Invitation sent successfully')
    },
    onError: (error: any) => {
      const errorData = error.response?.data
      // Handle validation errors (Django REST Framework format)
      if (errorData?.role) {
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

  const handleSubmitInvite = (e: React.FormEvent) => {
    e.preventDefault()
    createInvitationMutation.mutate(inviteForm)
  }

  // Reset form when modal opens with default allowed role
  const handleOpenInviteModal = () => {
    const defaultRole = roleOptions.length > 0 ? roleOptions[roleOptions.length - 1].value : 'clerk'
    setInviteForm({ email: '', first_name: '', last_name: '', role: defaultRole })
    setInviteTab('single')
    setBulkEmails('')
    setBulkRole(defaultRole)
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
        role: bulkRole,
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
  const handleBulkResend = async () => {
    const ids = Array.from(selection.selectedIds)
    let count = 0
    for (const id of ids) {
      try { await invitationsApi.resend(id); count++ } catch {}
    }
    selection.clearSelection()
    queryClient.invalidateQueries({ queryKey: ['invitations'] })
    toast.success(`Resent ${count} invitations`)
  }

  const handleBulkCancel = async () => {
    const ids = Array.from(selection.selectedIds)
    let count = 0
    for (const id of ids) {
      try { await invitationsApi.cancel(id); count++ } catch {}
    }
    selection.clearSelection()
    queryClient.invalidateQueries({ queryKey: ['invitations'] })
    toast.success(`Cancelled ${count} invitations`)
  }

  const userList = (users as any)?.results || users || []
  const invitationList = (invitations as any)?.results || invitations || []
  const pendingInvitations = invitationList.filter((i: any) => i.status === 'pending')
  const pageIds = pendingInvitations.map((i: any) => i.id)

  // Role selector component (shared between tabs)
  const RoleSelector = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div className="space-y-2">
      {roleOptions.map((role) => (
        <label
          key={role.value}
          className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
            value === role.value
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <input
            type="radio"
            name="role"
            value={role.value}
            checked={value === role.value}
            onChange={() => onChange(role.value)}
            className="mt-0.5"
          />
          <div>
            <p className="font-medium text-gray-900">{role.label}</p>
            <p className="text-sm text-gray-500">{role.description}</p>
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
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg capitalize"
                          title={roleTooltips[user.role] || 'User role'}
                        >
                          <Shield className="w-3 h-3" />
                          {user.role?.replace('_', ' ')}
                        </span>
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
                            title={roleTooltips[invite.role] || 'Assigned role'}
                          >
                            <Shield className="w-3 h-3" />
                            {invite.role?.replace('_', ' ')}
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
          { label: 'Resend', icon: RefreshCw, onClick: handleBulkResend, variant: 'primary' },
          { label: 'Cancel', icon: XCircle, onClick: handleBulkCancel, variant: 'danger' },
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                  <RoleSelector value={inviteForm.role} onChange={(v) => setInviteForm({ ...inviteForm, role: v })} />
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                  <RoleSelector value={bulkRole} onChange={setBulkRole} />
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
    </div>
  )
}
