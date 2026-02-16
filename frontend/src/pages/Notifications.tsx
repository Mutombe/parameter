import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  CheckCheck,
  Trash2,
  FileText,
  AlertTriangle,
  Calendar,
  Settings,
  Filter,
  Search,
  Loader2,
  Clock,
} from 'lucide-react'
import { notificationsApi } from '../services/api'
import { PageHeader, Button, Badge, Pagination, EmptyState } from '../components/ui'
import toast from 'react-hot-toast'
import { cn, formatDistanceToNow } from '../lib/utils'
import { PiBuildingApartmentLight } from "react-icons/pi"
import { TbUserSquareRounded } from "react-icons/tb"

const PAGE_SIZE = 20

const notificationIcons: Record<string, any> = {
  masterfile_created: PiBuildingApartmentLight,
  masterfile_updated: PiBuildingApartmentLight,
  masterfile_deleted: PiBuildingApartmentLight,
  invoice_created: FileText,
  invoice_overdue: AlertTriangle,
  invoice_reminder: Clock,
  payment_received: FileText,
  lease_expiring: Calendar,
  lease_activated: Calendar,
  lease_terminated: Calendar,
  rental_due: Clock,
  late_penalty: AlertTriangle,
  user_invited: TbUserSquareRounded,
  user_joined: TbUserSquareRounded,
  system_alert: Settings,
}

const notificationColors: Record<string, string> = {
  masterfile_created: 'bg-emerald-100 text-emerald-600',
  masterfile_updated: 'bg-blue-100 text-blue-600',
  masterfile_deleted: 'bg-rose-100 text-rose-600',
  invoice_created: 'bg-blue-100 text-blue-600',
  invoice_overdue: 'bg-amber-100 text-amber-600',
  invoice_reminder: 'bg-orange-100 text-orange-600',
  payment_received: 'bg-emerald-100 text-emerald-600',
  lease_expiring: 'bg-purple-100 text-purple-600',
  lease_activated: 'bg-emerald-100 text-emerald-600',
  lease_terminated: 'bg-rose-100 text-rose-600',
  rental_due: 'bg-orange-100 text-orange-600',
  late_penalty: 'bg-red-100 text-red-600',
  user_invited: 'bg-cyan-100 text-cyan-600',
  user_joined: 'bg-cyan-100 text-cyan-600',
  system_alert: 'bg-gray-100 text-gray-600',
}

const typeFilterOptions = [
  { value: '', label: 'All Types' },
  { value: 'masterfile_created', label: 'Masterfile Created' },
  { value: 'masterfile_updated', label: 'Masterfile Updated' },
  { value: 'masterfile_deleted', label: 'Masterfile Deleted' },
  { value: 'invoice_created', label: 'Invoice Created' },
  { value: 'invoice_overdue', label: 'Invoice Overdue' },
  { value: 'invoice_reminder', label: 'Invoice Reminder' },
  { value: 'payment_received', label: 'Payment Received' },
  { value: 'lease_expiring', label: 'Lease Expiring' },
  { value: 'lease_activated', label: 'Lease Activated' },
  { value: 'rental_due', label: 'Rental Due' },
  { value: 'late_penalty', label: 'Late Penalty' },
  { value: 'system_alert', label: 'System Alert' },
]

type TabFilter = 'all' | 'unread' | 'read'

export default function Notifications() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<TabFilter>('all')
  const [typeFilter, setTypeFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const queryParams: Record<string, any> = { page: currentPage, page_size: PAGE_SIZE }
  if (tab === 'unread') queryParams.is_read = 'false'
  if (tab === 'read') queryParams.is_read = 'true'
  if (typeFilter) queryParams.type = typeFilter

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'list', tab, typeFilter, currentPage],
    queryFn: () => notificationsApi.list(queryParams).then(r => r.data),
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
      toast.success('Read notifications cleared')
    },
  })

  const notifications = data?.results || data || []
  const totalCount = data?.count || notifications.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const unreadCount = unreadData?.unread_count || unreadData?.count || 0

  const getIcon = (type: string) => notificationIcons[type] || Bell
  const getColorClass = (type: string) => notificationColors[type] || 'bg-gray-100 text-gray-600'

  const tabs: { key: TabFilter; label: string; count?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread', count: unreadCount },
    { key: 'read', label: 'Read' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
        icon={Bell}
        actions={
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
              >
                <CheckCheck className="w-4 h-4 mr-1" />
                Mark All Read
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearAllMutation.mutate()}
              disabled={clearAllMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Clear Read
            </Button>
          </div>
        }
      />

      {/* Tabs and Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Tab Buttons */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setCurrentPage(1) }}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-1.5',
                  tab === t.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="px-1.5 py-0.5 text-xs bg-primary-100 text-primary-700 rounded-full">
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1) }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {typeFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="ml-auto text-sm text-gray-500">
            {isLoading ? (
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>{totalCount} notification{totalCount !== 1 ? 's' : ''}</>
            )}
          </div>
        </div>
      </div>

      {/* Notifications List */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-64 bg-gray-200 rounded" />
                  <div className="h-3 w-96 bg-gray-100 rounded" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description={tab === 'unread' ? "You're all caught up! No unread notifications." : "No notifications to display."}
        />
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {notifications.map((notif: any, index: number) => {
              const Icon = getIcon(notif.notification_type)
              return (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => {
                    if (!notif.is_read) markReadMutation.mutate(notif.id)
                  }}
                  className={cn(
                    'bg-white rounded-xl border p-4 hover:shadow-sm transition-all cursor-pointer group',
                    notif.is_read
                      ? 'border-gray-200'
                      : 'border-primary-200 bg-primary-50/30'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                      getColorClass(notif.notification_type)
                    )}>
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          'text-sm',
                          notif.is_read ? 'text-gray-700' : 'font-semibold text-gray-900'
                        )}>
                          {notif.title}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {notif.priority === 'high' && (
                            <Badge variant="danger" className="text-[10px]">High</Badge>
                          )}
                          {notif.priority === 'urgent' && (
                            <Badge variant="danger" className="text-[10px]">Urgent</Badge>
                          )}
                          {!notif.is_read && (
                            <div className="w-2 h-2 rounded-full bg-primary-500" />
                          )}
                        </div>
                      </div>
                      {notif.message && (
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-gray-400">
                          {notif.time_ago || formatDistanceToNow(notif.created_at)}
                        </span>
                        <span className="text-xs text-gray-300">
                          {notif.notification_type?.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            showPageSize={false}
          />
        </div>
      )}
    </div>
  )
}
