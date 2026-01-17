import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  CheckCheck,
  Trash2,
  Building2,
  Users,
  FileText,
  AlertTriangle,
  Calendar,
  Settings,
} from 'lucide-react'
import { notificationsApi } from '../../services/api'
import { formatDistanceToNow } from '../../lib/utils'
import toast from 'react-hot-toast'

interface NotificationsPanelProps {
  open: boolean
  onClose: () => void
}

const notificationIcons: Record<string, any> = {
  masterfile_created: Building2,
  masterfile_updated: Building2,
  masterfile_deleted: Building2,
  invoice_overdue: AlertTriangle,
  lease_expiring: Calendar,
  payment_received: FileText,
  user_invited: Users,
  system: Settings,
}

const notificationColors: Record<string, string> = {
  masterfile_created: 'bg-emerald-100 text-emerald-600',
  masterfile_updated: 'bg-blue-100 text-blue-600',
  masterfile_deleted: 'bg-rose-100 text-rose-600',
  invoice_overdue: 'bg-amber-100 text-amber-600',
  lease_expiring: 'bg-purple-100 text-purple-600',
  payment_received: 'bg-emerald-100 text-emerald-600',
  user_invited: 'bg-cyan-100 text-cyan-600',
  system: 'bg-gray-100 text-gray-600',
}

export default function NotificationsPanel({ open, onClose }: NotificationsPanelProps) {
  const queryClient = useQueryClient()

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => notificationsApi.recent().then(r => r.data),
    enabled: open,
    refetchInterval: open ? 30000 : false, // Refresh every 30s when open
  })

  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.unreadCount().then(r => r.data),
  })

  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('All notifications marked as read')
    },
  })

  const clearAllMutation = useMutation({
    mutationFn: () => notificationsApi.clearAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('All notifications cleared')
    },
  })

  const unreadCount = unreadData?.unread_count || unreadData?.count || 0
  // Handle different response formats from API
  const notificationList = Array.isArray(notifications)
    ? notifications
    : (notifications?.notifications || notifications?.results || [])

  const handleNotificationClick = (notification: any) => {
    if (!notification.is_read) {
      markReadMutation.mutate(notification.id)
    }
    // Could navigate to related entity based on notification type
    onClose()
  }

  const getIcon = (type: string) => {
    const Icon = notificationIcons[type] || Bell
    return Icon
  }

  const getColorClass = (type: string) => {
    return notificationColors[type] || 'bg-gray-100 text-gray-600'
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-20"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllReadMutation.mutate()}
                    className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => clearAllMutation.mutate()}
                  className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="Clear all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-96 overflow-y-auto">
              {isLoading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto" />
                  <p className="text-sm text-gray-500 mt-2">Loading notifications...</p>
                </div>
              ) : notificationList.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No notifications</p>
                  <p className="text-sm text-gray-400 mt-1">You're all caught up!</p>
                </div>
              ) : (
                notificationList.map((notif: any) => {
                  const Icon = getIcon(notif.notification_type)
                  return (
                    <button
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-start gap-3 border-b border-gray-50 ${
                        !notif.is_read ? 'bg-primary-50/30' : ''
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${getColorClass(notif.notification_type)}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!notif.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                          {notif.title}
                        </p>
                        {notif.message && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDistanceToNow(notif.created_at)}
                        </p>
                      </div>
                      {!notif.is_read && (
                        <div className="w-2 h-2 rounded-full bg-primary-500 mt-2 flex-shrink-0" />
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Footer */}
            {notificationList.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                <button
                  onClick={() => {
                    onClose()
                    // Navigate to full notifications page if exists
                  }}
                  className="w-full text-center text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  View all notifications
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// Export a hook for getting unread count
export function useUnreadNotifications() {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.unreadCount().then(r => r.data),
    refetchInterval: 60000, // Refresh every minute
  })
  return data?.unread_count || data?.count || 0
}
