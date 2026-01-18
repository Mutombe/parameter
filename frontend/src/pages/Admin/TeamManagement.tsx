import { useState } from 'react'
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
} from 'lucide-react'
import { invitationsApi, usersApi } from '../../services/api'
import { formatDistanceToNow } from '../../lib/utils'
import { PageHeader, Button, Modal } from '../../components/ui'
import toast from 'react-hot-toast'
import { SiFsecure } from "react-icons/si";
import { PiUsersFour } from "react-icons/pi";
import { TbUserSquareRounded } from "react-icons/tb";


const roleOptions = [
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

const statusIcons: Record<string, any> = {
  pending: Clock,
  accepted: CheckCircle,
  expired: AlertTriangle,
  cancelled: XCircle,
}

export default function TeamManagement() {
  const queryClient = useQueryClient()
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'users' | 'invitations'>('users')

  // Form state
  const [inviteForm, setInviteForm] = useState({
    email: '',
    first_name: '',
    last_name: '',
    role: 'clerk',
  })

  // Queries
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then(r => r.data),
  })

  const { data: invitations, isLoading: invitationsLoading } = useQuery({
    queryKey: ['invitations'],
    queryFn: () => invitationsApi.list().then(r => r.data),
  })

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
      toast.error(error.response?.data?.error || 'Failed to send invitation')
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

  const userList = users?.results || users || []
  const invitationList = invitations?.results || invitations || []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Management"
        description="Manage users and send invitations"
        icon={TbUserSquareRounded}
        actions={
          <Button onClick={() => setInviteModalOpen(true)} className="gap-2">
            <UserPlus className="w-4 h-4" />
            Invite Team Member
          </Button>
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
        <button
          onClick={() => setActiveTab('invitations')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'invitations'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Pending Invitations ({invitationList.filter((i: any) => i.status === 'pending').length})
        </button>
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
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white/50 font-medium text-sm">
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
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-medium text-sm">
                            {user.first_name?.[0]}{user.last_name?.[0]}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{user.first_name} {user.last_name}</p>
                            <p className="text-sm text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg capitalize">
                          <Shield className="w-3 h-3" />
                          {user.role?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg ${
                          user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {user.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {user.last_activity ? formatDistanceToNow(user.last_activity) : 'Never'}
                      </td>
                      <td className="px-6 py-4 text-right">
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
                        >
                          {user.is_active ? 'Deactivate' : 'Activate'}
                        </button>
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
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400">
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
                      <tr key={invite.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500">
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
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg capitalize">
                            <Shield className="w-3 h-3" />
                            {invite.role?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg capitalize ${statusColors[invite.status]}`}>
                            <StatusIcon className="w-3 h-3" />
                            {invite.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {formatDistanceToNow(invite.created_at)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {invite.status === 'pending' && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => resendInvitationMutation.mutate(invite.id)}
                                className="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1"
                              >
                                <RefreshCw className="w-3 h-3" />
                                Resend
                              </button>
                              <button
                                onClick={() => cancelInvitationMutation.mutate(invite.id)}
                                className="text-sm font-medium text-rose-600 hover:text-rose-700 flex items-center gap-1"
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

      {/* Invite Modal */}
      <Modal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Invite Team Member"
      >
        <form onSubmit={handleSubmitInvite} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address *
            </label>
            <input
              type="email"
              required
              value={inviteForm.email}
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="colleague@company.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>
              <input
                type="text"
                value={inviteForm.first_name}
                onChange={(e) => setInviteForm({ ...inviteForm, first_name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              <input
                type="text"
                value={inviteForm.last_name}
                onChange={(e) => setInviteForm({ ...inviteForm, last_name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role *
            </label>
            <div className="space-y-2">
              {roleOptions.map((role) => (
                <label
                  key={role.value}
                  className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                    inviteForm.role === role.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={role.value}
                    checked={inviteForm.role === role.value}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="font-medium text-gray-900">{role.label}</p>
                    <p className="text-sm text-gray-500">{role.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setInviteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createInvitationMutation.isPending}
              className="gap-2"
            >
              <Send className="w-4 h-4" />
              {createInvitationMutation.isPending ? 'Sending...' : 'Send Invitation'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
