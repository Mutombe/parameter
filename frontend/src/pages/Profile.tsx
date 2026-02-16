import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  User,
  Mail,
  Phone,
  Camera,
  Shield,
  Bell,
  Key,
  Save,
  Loader2,
  Check,
  Trash2,
  Upload,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { authApi } from '../services/api'
import { getMediaUrl } from '../lib/utils'
import { PageHeader, Button, Input, Card, CardHeader, CardContent } from '../components/ui'
import toast from 'react-hot-toast'
import { SiFsecure } from "react-icons/si";
import { PiUsersFour } from "react-icons/pi";
import { TbUserSquareRounded } from "react-icons/tb";


export default function Profile() {
  const { user, setUser } = useAuthStore()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  })
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })

  const updateProfileMutation = useMutation({
    mutationFn: (data: typeof form) => authApi.updateProfile(data),
    onSuccess: (response) => {
      setUser(response.data.user)
      setIsEditing(false)
      toast.success('Profile updated successfully')
    },
    onError: () => {
      toast.error('Failed to update profile')
    }
  })

  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => authApi.uploadAvatar(file),
    onSuccess: async () => {
      // Refresh user data
      const response = await authApi.me()
      setUser(response.data)
      toast.success('Avatar uploaded successfully')
    },
    onError: () => {
      toast.error('Failed to upload avatar')
    }
  })

  const removeAvatarMutation = useMutation({
    mutationFn: () => authApi.removeAvatar(),
    onSuccess: async () => {
      const response = await authApi.me()
      setUser(response.data)
      toast.success('Avatar removed')
    },
    onError: () => {
      toast.error('Failed to remove avatar')
    }
  })

  const changePasswordMutation = useMutation({
    mutationFn: (data: typeof passwordForm) => authApi.changePassword(data),
    onSuccess: () => {
      toast.success('Password changed successfully')
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to change password')
    }
  })

  const handleSave = () => {
    updateProfileMutation.mutate(form)
  }

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('Passwords do not match')
      return
    }
    changePasswordMutation.mutate(passwordForm)
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        toast.error('Invalid file type. Use JPEG, PNG, GIF, or WebP')
        return
      }
      // Validate size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File too large. Maximum size is 5MB')
        return
      }
      // Create preview URL
      const previewUrl = URL.createObjectURL(file)
      setAvatarPreview(previewUrl)
      setSelectedFile(file)
    }
  }

  const handleSaveAvatar = () => {
    if (selectedFile) {
      uploadAvatarMutation.mutate(selectedFile, {
        onSuccess: () => {
          setAvatarPreview(null)
          setSelectedFile(null)
        }
      })
    }
  }

  const handleCancelAvatar = () => {
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview)
    }
    setAvatarPreview(null)
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        subtitle="Manage your personal information and account settings"
        icon={TbUserSquareRounded}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="lg:col-span-1">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            <div className="flex flex-col items-center">
              <div className="relative group">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Preview"
                    className="w-24 h-24 rounded-full object-cover shadow-lg ring-2 ring-primary-500 ring-offset-2"
                  />
                ) : user?.avatar ? (
                  <img
                    src={getMediaUrl(user.avatar) || ''}
                    alt={user.first_name}
                    className="w-24 h-24 rounded-full object-cover shadow-lg"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                    {user?.first_name?.[0]}{user?.last_name?.[0]}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {!avatarPreview && (
                  <>
                    <button
                      onClick={handleAvatarClick}
                      disabled={uploadAvatarMutation.isPending}
                      className="absolute -bottom-2 -right-2 w-8 h-8 bg-white rounded-lg shadow-md border border-gray-200 flex items-center justify-center text-gray-500 hover:text-primary-600 transition-colors disabled:opacity-50"
                    >
                      {uploadAvatarMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4" />
                      )}
                    </button>
                    {user?.avatar && (
                      <button
                        onClick={() => removeAvatarMutation.mutate()}
                        disabled={removeAvatarMutation.isPending}
                        className="absolute -bottom-2 -left-2 w-8 h-8 bg-white rounded-lg shadow-md border border-gray-200 flex items-center justify-center text-gray-500 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
              {avatarPreview && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleSaveAvatar}
                    disabled={uploadAvatarMutation.isPending}
                    className="px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {uploadAvatarMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Save
                  </button>
                  <button
                    onClick={handleCancelAvatar}
                    disabled={uploadAvatarMutation.isPending}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <h2 className="mt-4 text-xl font-semibold text-gray-900">
                {user?.first_name} {user?.last_name}
              </h2>
              <p className="text-sm text-gray-500">{user?.email}</p>
              <span className="mt-2 px-3 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded-full capitalize">
                {user?.role?.replace('_', ' ')}
              </span>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100 space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-gray-600">{user?.email}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                  <Phone className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-gray-600">{user?.phone || 'Not set'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-purple-600" />
                </div>
                <span className="text-gray-600 capitalize">{user?.role?.replace('_', ' ')}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Edit Form */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
                <p className="text-sm text-gray-500">Update your personal details</p>
              </div>
              {!isEditing ? (
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  Edit Profile
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="First Name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                disabled={!isEditing}
              />
              <Input
                label="Last Name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                disabled={!isEditing}
              />
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={!isEditing}
              />
              <Input
                label="Phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                disabled={!isEditing}
                placeholder="+263 77 123 4567"
              />
            </div>
          </motion.div>

          {/* Password Change */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Change Password</h3>
              <p className="text-sm text-gray-500">Update your password to keep your account secure</p>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <Input
                label="Current Password"
                type="password"
                value={passwordForm.current_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                placeholder="Enter current password"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="New Password"
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  placeholder="Enter new password"
                />
                <Input
                  label="Confirm Password"
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                  placeholder="Confirm new password"
                />
              </div>
              <div className="pt-2">
                <Button type="submit" variant="outline">
                  <Key className="w-4 h-4 mr-2" />
                  Update Password
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
