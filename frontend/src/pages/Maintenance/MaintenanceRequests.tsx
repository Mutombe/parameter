import { useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Wrench,
  Plus,
  Search,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import api from '../../services/api'
import { formatDate, cn } from '../../lib/utils'
import { showToast, parseApiError } from '../../lib/toast'
import {
  PageHeader,
  Modal,
  ModalFooter,
  Button,
  Badge,
  DataTable,
  EmptyState,
} from '../../components/ui'
import type { Column } from '../../components/ui/DataTable'
import { MaintenanceForm } from './MaintenanceForm'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MaintenanceRequest {
  id: number | string
  title: string
  description: string
  property: number
  property_name?: string
  unit: number | null
  unit_name?: string
  priority: string
  status: string
  created_at?: string
  updated_at?: string
}

interface FormData {
  property: string
  unit: string
  title: string
  description: string
  priority: string
}

// ---------------------------------------------------------------------------
// Priority helpers
// ---------------------------------------------------------------------------

const priorityConfig: Record<string, { variant: 'default' | 'info' | 'warning' | 'danger'; label: string }> = {
  low: { variant: 'default', label: 'Low' },
  medium: { variant: 'info', label: 'Medium' },
  high: { variant: 'warning', label: 'High' },
  emergency: { variant: 'danger', label: 'Emergency' },
}

const statusTabs = [
  { key: 'all', label: 'All', icon: Wrench },
  { key: 'open', label: 'Open', icon: AlertTriangle },
  { key: 'in_progress', label: 'In Progress', icon: Clock },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MaintenanceRequests() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab = searchParams.get('status') || 'all'
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formData, setFormData] = useState<FormData | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25

  // Build query params
  const queryParams: Record<string, any> = { page, page_size: PAGE_SIZE }
  if (activeTab !== 'all') queryParams.status = activeTab
  if (search) queryParams.search = search

  // Fetch maintenance requests
  const { data, isLoading } = useQuery({
    queryKey: ['maintenance-requests', queryParams],
    queryFn: () =>
      api.get('/maintenance/requests/', { params: queryParams }).then((r) => r.data),
    placeholderData: (prev: any) => prev,
  })

  const requests: MaintenanceRequest[] = data?.results || data || []
  const totalCount = data?.count ?? requests.length

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, any>) =>
      api.post('/maintenance/requests/', payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] })
      showToast.success('Maintenance request created successfully')
      setShowCreateModal(false)
      setFormData(null)
      setFormErrors({})
    },
    onError: (err: any) => {
      showToast.error(parseApiError(err, 'Failed to create maintenance request'))
    },
  })

  // Handle tab switch
  const handleTabChange = useCallback(
    (tab: string) => {
      setPage(1)
      if (tab === 'all') {
        searchParams.delete('status')
      } else {
        searchParams.set('status', tab)
      }
      setSearchParams(searchParams)
    },
    [searchParams, setSearchParams],
  )

  // Validate and submit
  const handleSubmit = () => {
    if (!formData) return

    const errors: Record<string, string> = {}
    if (!formData.property) errors.property = 'Property is required'
    if (!formData.title.trim()) errors.title = 'Title is required'
    if (!formData.description.trim()) errors.description = 'Description is required'
    if (!formData.priority) errors.priority = 'Priority is required'

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setFormErrors({})
    createMutation.mutate({
      property: Number(formData.property),
      unit: formData.unit ? Number(formData.unit) : null,
      title: formData.title.trim(),
      description: formData.description.trim(),
      priority: formData.priority,
    })
  }

  // Navigate to detail
  const handleRowClick = (item: MaintenanceRequest) => {
    navigate(`/dashboard/maintenance/${item.id}`)
  }

  // Table columns
  const columns: Column<MaintenanceRequest>[] = [
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      render: (item) => (
        <div>
          <p className="text-sm font-medium text-gray-900">{item.title}</p>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.description}</p>
        </div>
      ),
    },
    {
      key: 'property_name',
      header: 'Property',
      sortable: true,
      render: (item) => (
        <div>
          <p className="text-sm text-gray-900">{item.property_name || '-'}</p>
          {item.unit_name && (
            <p className="text-xs text-gray-500">{item.unit_name}</p>
          )}
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (item) => {
        const config = priorityConfig[item.priority] || priorityConfig.medium
        return (
          <Badge variant={config.variant} dot>
            {config.label}
          </Badge>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => {
        const statusLabel =
          item.status === 'in_progress'
            ? 'In Progress'
            : item.status.charAt(0).toUpperCase() + item.status.slice(1)
        const statusVariant: Record<string, 'default' | 'warning' | 'info' | 'success'> = {
          open: 'warning',
          in_progress: 'info',
          completed: 'success',
        }
        return (
          <Badge variant={statusVariant[item.status] || 'default'} dot>
            {statusLabel}
          </Badge>
        )
      },
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (item) => (
        <span className="text-sm text-gray-500">
          {item.created_at ? formatDate(item.created_at) : '-'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenance Requests"
        description="Track and manage property maintenance requests"
        icon={Wrench}
        actions={
          <Button icon={Plus} onClick={() => setShowCreateModal(true)}>
            New Request
          </Button>
        }
      />

      {/* Status Tabs */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {statusTabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Data Table */}
      <DataTable<MaintenanceRequest>
        columns={columns}
        data={requests}
        loading={isLoading}
        searchable
        searchPlaceholder="Search requests..."
        searchValue={search}
        onSearch={setSearch}
        onRowClick={handleRowClick}
        rowKey={(item) => item.id}
        emptyTitle="No maintenance requests"
        emptyDescription="There are no maintenance requests matching your filters."
        emptyAction={{
          label: 'Create Request',
          onClick: () => setShowCreateModal(true),
        }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: totalCount,
          onPageChange: setPage,
        }}
      />

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setFormData(null)
          setFormErrors({})
        }}
        title="New Maintenance Request"
        description="Submit a new maintenance request for a property"
        icon={Wrench}
        size="lg"
      >
        <MaintenanceForm
          onChange={setFormData}
          errors={formErrors}
          disabled={createMutation.isPending}
        />
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => {
              setShowCreateModal(false)
              setFormData(null)
              setFormErrors({})
            }}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={createMutation.isPending}
            icon={Plus}
          >
            Create Request
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
