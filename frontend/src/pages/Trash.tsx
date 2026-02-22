import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Trash2,
  RotateCcw,
  Users,
  Building2,
  Home,
  UserCheck,
  FileText,
  Receipt,
  CreditCard,
  Wallet,
  AlertTriangle,
} from 'lucide-react'
import { trashApi } from '../services/api'
import {
  PageHeader,
  Card,
  Badge,
  Button,
  EmptyState,
  ConfirmDialog,
  BulkActionsBar,
  TimeAgo,
} from '../components/ui'
import { useSelection } from '../hooks/useSelection'
import { cn } from '../lib/utils'
import toast from 'react-hot-toast'

interface TrashItem {
  id: number
  type: string
  display_name: string
  deleted_at: string
  deleted_by: string
  days_remaining: number
}

const TYPE_TABS = [
  { key: '', label: 'All' },
  { key: 'landlord', label: 'Landlords' },
  { key: 'property', label: 'Properties' },
  { key: 'unit', label: 'Units' },
  { key: 'tenant', label: 'Tenants' },
  { key: 'lease', label: 'Leases' },
  { key: 'invoice', label: 'Invoices' },
  { key: 'receipt', label: 'Receipts' },
  { key: 'expense', label: 'Expenses' },
]

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  landlord: Users,
  property: Building2,
  unit: Home,
  tenant: UserCheck,
  lease: FileText,
  invoice: Receipt,
  receipt: CreditCard,
  expense: Wallet,
}

const TYPE_LABELS: Record<string, string> = {
  landlord: 'Landlord',
  property: 'Property',
  unit: 'Unit',
  tenant: 'Tenant',
  lease: 'Lease',
  invoice: 'Invoice',
  receipt: 'Receipt',
  expense: 'Expense',
}

export default function Trash() {
  const queryClient = useQueryClient()
  const [typeFilter, setTypeFilter] = useState('')
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState<{ type: string; ids: number[] } | null>(null)

  const selection = useSelection<number>({ clearOnChange: [typeFilter] })

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['trash', typeFilter],
    queryFn: () => trashApi.list(typeFilter ? { type: typeFilter } : undefined).then(r => r.data),
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['trash'] })
    // Invalidate source entity queries so restored items appear
    queryClient.invalidateQueries({ queryKey: ['landlords'] })
    queryClient.invalidateQueries({ queryKey: ['properties'] })
    queryClient.invalidateQueries({ queryKey: ['units'] })
    queryClient.invalidateQueries({ queryKey: ['tenants'] })
    queryClient.invalidateQueries({ queryKey: ['leases'] })
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    queryClient.invalidateQueries({ queryKey: ['receipts'] })
    queryClient.invalidateQueries({ queryKey: ['expenses'] })
  }

  const restoreMutation = useMutation({
    mutationFn: (data: { type: string; ids: number[] }) => trashApi.restore(data),
    onSuccess: (_, vars) => {
      toast.success(`Restored ${vars.ids.length} item(s)`)
      selection.clearSelection()
      invalidateAll()
    },
    onError: () => toast.error('Failed to restore items'),
  })

  const purgeMutation = useMutation({
    mutationFn: (data: { type: string; ids: number[] }) => trashApi.purge(data),
    onSuccess: (_, vars) => {
      toast.success(`Permanently deleted ${vars.ids.length} item(s)`)
      selection.clearSelection()
      invalidateAll()
    },
    onError: () => toast.error('Failed to delete items'),
  })

  const purgeAllMutation = useMutation({
    mutationFn: () => trashApi.purgeAll(),
    onSuccess: () => {
      toast.success('Trash emptied')
      selection.clearSelection()
      invalidateAll()
    },
    onError: () => toast.error('Failed to empty trash'),
  })

  const handleRestoreSingle = (item: TrashItem) => {
    restoreMutation.mutate({ type: item.type, ids: [item.id] })
  }

  const handlePurgeSingle = (item: TrashItem) => {
    setConfirmPurge({ type: item.type, ids: [item.id] })
  }

  const handleBulkRestore = () => {
    // Group selected items by type
    const byType: Record<string, number[]> = {}
    for (const item of items) {
      if (selection.isSelected(item.id)) {
        if (!byType[item.type]) byType[item.type] = []
        byType[item.type].push(item.id)
      }
    }
    for (const [type, ids] of Object.entries(byType)) {
      restoreMutation.mutate({ type, ids })
    }
  }

  const handleBulkPurge = () => {
    const byType: Record<string, number[]> = {}
    for (const item of items) {
      if (selection.isSelected(item.id)) {
        if (!byType[item.type]) byType[item.type] = []
        byType[item.type].push(item.id)
      }
    }
    // Use the first type for the confirm dialog, then purge all
    const entries = Object.entries(byType)
    if (entries.length === 1) {
      setConfirmPurge({ type: entries[0][0], ids: entries[0][1] })
    } else {
      // Multiple types — confirm then purge each
      setConfirmPurge({ type: 'multiple', ids: Array.from(selection.selectedIds) })
    }
  }

  const executePurge = () => {
    if (!confirmPurge) return
    if (confirmPurge.type === 'multiple') {
      // Group and purge each type
      const byType: Record<string, number[]> = {}
      for (const item of items) {
        if (confirmPurge.ids.includes(item.id)) {
          if (!byType[item.type]) byType[item.type] = []
          byType[item.type].push(item.id)
        }
      }
      for (const [type, ids] of Object.entries(byType)) {
        purgeMutation.mutate({ type, ids })
      }
    } else {
      purgeMutation.mutate(confirmPurge)
    }
    setConfirmPurge(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trash"
        subtitle="Items are permanently deleted after 30 days"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Trash' },
        ]}
        actions={
          items.length > 0 ? (
            <Button
              variant="outline"
              onClick={() => setConfirmEmpty(true)}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Empty Trash
            </Button>
          ) : undefined
        }
      />

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {TYPE_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setTypeFilter(tab.key)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-lg font-medium transition-colors',
              typeFilter === tab.key
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Items List */}
      {isLoading ? (
        <Card className="p-8">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title="Trash is empty"
          description="Deleted items will appear here and be automatically removed after 30 days."
        />
      ) : (
        <Card className="divide-y divide-gray-100">
          {items.map((item: TrashItem) => {
            const Icon = TYPE_ICONS[item.type] || FileText
            const isSelected = selection.isSelected(item.id)
            return (
              <div
                key={`${item.type}-${item.id}`}
                className={cn(
                  'flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors',
                  isSelected && 'bg-primary-50'
                )}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => selection.toggle(item.id)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />

                {/* Type Icon */}
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-gray-500" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.display_name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Badge variant="outline" className="text-xs">
                      {TYPE_LABELS[item.type] || item.type}
                    </Badge>
                    {item.deleted_by && (
                      <span>by {item.deleted_by}</span>
                    )}
                    <span><TimeAgo date={item.deleted_at} /></span>
                  </div>
                </div>

                {/* Days Remaining */}
                <Badge
                  variant={item.days_remaining <= 7 ? 'danger' : 'outline'}
                  className="flex-shrink-0"
                >
                  {item.days_remaining}d left
                </Badge>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleRestoreSingle(item)}
                    className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    title="Restore"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handlePurgeSingle(item)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete permanently"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </Card>
      )}

      {/* Bulk Actions */}
      {selection.hasSelection && (
        <BulkActionsBar
          selectedCount={selection.selectedCount}
          onClearSelection={selection.clearSelection}
          entityName="items"
          actions={[
            {
              label: 'Restore',
              icon: RotateCcw,
              onClick: handleBulkRestore,
              variant: 'primary',
              loading: restoreMutation.isPending,
            },
            {
              label: 'Delete Permanently',
              icon: Trash2,
              onClick: handleBulkPurge,
              variant: 'danger',
              loading: purgeMutation.isPending,
            },
          ]}
        />
      )}

      {/* Confirm Empty Trash */}
      <ConfirmDialog
        isOpen={confirmEmpty}
        onClose={() => setConfirmEmpty(false)}
        onConfirm={() => {
          purgeAllMutation.mutate()
          setConfirmEmpty(false)
        }}
        title="Empty Trash"
        message={`This will permanently delete all ${items.length} item(s) in the trash. This action cannot be undone.`}
        confirmText="Empty Trash"
        type="danger"
        isLoading={purgeAllMutation.isPending}
      />

      {/* Confirm Permanent Delete */}
      <ConfirmDialog
        isOpen={!!confirmPurge}
        onClose={() => setConfirmPurge(null)}
        onConfirm={executePurge}
        title="Permanently Delete"
        message="This will permanently delete the selected item(s). This action cannot be undone."
        confirmText="Delete Permanently"
        type="danger"
        isLoading={purgeMutation.isPending}
      />
    </div>
  )
}
