import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Wrench,
  Calendar,
  DollarSign,
  ClipboardList,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  FileText,
  Building2,
  Home,
} from 'lucide-react'
import api from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { showToast, parseApiError } from '../../lib/toast'
import {
  Card,
  CardHeader,
  CardContent,
  Badge,
  Button,
  Input,
  Select,
  Textarea,
  Modal,
  ModalFooter,
} from '../../components/ui'

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

interface WorkOrder {
  id: number | string
  vendor: string
  estimated_cost: number | string
  scheduled_date: string
  notes: string
  status: string
  completed_at?: string | null
  created_at?: string
}

// ---------------------------------------------------------------------------
// Priority / Status helpers
// ---------------------------------------------------------------------------

const priorityConfig: Record<string, { variant: 'default' | 'info' | 'warning' | 'danger'; label: string; color: string; bgColor: string }> = {
  low: { variant: 'default', label: 'Low', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  medium: { variant: 'info', label: 'Medium', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  high: { variant: 'warning', label: 'High', color: 'text-orange-600', bgColor: 'bg-orange-50' },
  emergency: { variant: 'danger', label: 'Emergency', color: 'text-red-600', bgColor: 'bg-red-50' },
}

const statusOptions = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
]

const statusConfig: Record<string, { icon: any; color: string; bgColor: string; label: string }> = {
  open: { icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-50', label: 'Open' },
  in_progress: { icon: Clock, color: 'text-blue-600', bgColor: 'bg-blue-50', label: 'In Progress' },
  completed: { icon: CheckCircle2, color: 'text-emerald-600', bgColor: 'bg-emerald-50', label: 'Completed' },
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MaintenanceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const requestId = id

  const [showWorkOrderModal, setShowWorkOrderModal] = useState(false)
  const [workOrderForm, setWorkOrderForm] = useState({
    vendor: '',
    estimated_cost: '',
    scheduled_date: '',
    notes: '',
  })
  const [workOrderErrors, setWorkOrderErrors] = useState<Record<string, string>>({})

  // ---- Fetch request details ----
  const { data: request, isLoading } = useQuery<MaintenanceRequest>({
    queryKey: ['maintenance-request', requestId],
    queryFn: () =>
      api.get(`/maintenance/requests/${requestId}/`).then((r) => r.data),
    enabled: !!requestId,
  })

  // ---- Fetch work orders for this request ----
  const { data: workOrdersData, isLoading: loadingWorkOrders } = useQuery({
    queryKey: ['maintenance-work-orders', requestId],
    queryFn: () =>
      api
        .get('/maintenance/work-orders/', { params: { request: requestId } })
        .then((r) => r.data),
    enabled: !!requestId,
  })

  const workOrders: WorkOrder[] = workOrdersData?.results || workOrdersData || []

  // ---- Mutations ----

  // Update request status
  const updateStatusMutation = useMutation({
    mutationFn: (status: string) =>
      api.patch(`/maintenance/requests/${requestId}/`, { status }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-request', requestId] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] })
      showToast.success('Request status updated')
    },
    onError: (err: any) => {
      showToast.error(parseApiError(err, 'Failed to update status'))
    },
  })

  // Create work order
  const createWorkOrderMutation = useMutation({
    mutationFn: (payload: Record<string, any>) =>
      api.post('/maintenance/work-orders/', payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-work-orders', requestId] })
      showToast.success('Work order created successfully')
      setShowWorkOrderModal(false)
      setWorkOrderForm({ vendor: '', estimated_cost: '', scheduled_date: '', notes: '' })
      setWorkOrderErrors({})
    },
    onError: (err: any) => {
      showToast.error(parseApiError(err, 'Failed to create work order'))
    },
  })

  // Complete work order
  const completeWorkOrderMutation = useMutation({
    mutationFn: (workOrderId: number | string) =>
      api.post(`/maintenance/work-orders/${workOrderId}/complete/`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-work-orders', requestId] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-request', requestId] })
      showToast.success('Work order marked as complete')
    },
    onError: (err: any) => {
      showToast.error(parseApiError(err, 'Failed to complete work order'))
    },
  })

  // ---- Handlers ----

  const handleStatusChange = (e: { target: { value: string } }) => {
    updateStatusMutation.mutate(e.target.value)
  }

  const handleWorkOrderSubmit = () => {
    const errors: Record<string, string> = {}
    if (!workOrderForm.vendor.trim()) errors.vendor = 'Vendor is required'
    if (!workOrderForm.scheduled_date) errors.scheduled_date = 'Scheduled date is required'

    if (Object.keys(errors).length > 0) {
      setWorkOrderErrors(errors)
      return
    }

    setWorkOrderErrors({})
    createWorkOrderMutation.mutate({
      request: requestId,
      vendor: workOrderForm.vendor.trim(),
      estimated_cost: workOrderForm.estimated_cost
        ? Number(workOrderForm.estimated_cost)
        : 0,
      scheduled_date: workOrderForm.scheduled_date,
      notes: workOrderForm.notes.trim(),
    })
  }

  // ---- Derived values ----

  const reqStatus = statusConfig[request?.status || 'open'] || statusConfig.open
  const ReqStatusIcon = reqStatus.icon
  const priority = priorityConfig[request?.priority || 'medium'] || priorityConfig.medium

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <button
          onClick={() => navigate('/dashboard')}
          className="hover:text-gray-900 transition-colors"
        >
          Dashboard
        </button>
        <span>/</span>
        <button
          onClick={() => navigate('/dashboard/maintenance')}
          className="hover:text-gray-900 transition-colors"
        >
          Maintenance
        </button>
        <span>/</span>
        <span className="text-gray-900 font-medium">
          {request?.title || '...'}
        </span>
      </nav>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard/maintenance')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-3">
            {isLoading ? (
              <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">
                  {request?.title}
                </h1>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                    reqStatus.bgColor,
                    reqStatus.color,
                  )}
                >
                  <ReqStatusIcon className="w-3 h-3" />
                  {reqStatus.label}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select
            label=""
            placeholder="Update status"
            options={statusOptions}
            value={request?.status || ''}
            onChange={handleStatusChange}
            disabled={updateStatusMutation.isPending}
          />
        </div>
      </motion.div>

      {/* Request Info Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-white rounded-xl border border-gray-200 p-4 md:p-6"
      >
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2 animate-pulse">
                <div className="h-3 w-16 bg-gray-200 rounded" />
                <div className="h-4 w-32 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Property */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Property
              </p>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                <span>{request?.property_name || '-'}</span>
              </div>
            </div>

            {/* Unit */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Unit
              </p>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Home className="w-3.5 h-3.5 text-gray-400" />
                <span>{request?.unit_name || '-'}</span>
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Priority
              </p>
              <Badge variant={priority.variant} dot>
                {priority.label}
              </Badge>
            </div>

            {/* Created */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Created
              </p>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <span>
                  {request?.created_at ? formatDate(request.created_at) : '-'}
                </span>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Description Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardHeader title="Description" />
          <CardContent>
            {isLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-4 w-full bg-gray-200 rounded" />
                <div className="h-4 w-3/4 bg-gray-200 rounded" />
              </div>
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {request?.description || 'No description provided.'}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Work Orders Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Work Orders</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Track vendor assignments and progress
            </p>
          </div>
          <Button
            icon={Plus}
            size="sm"
            onClick={() => setShowWorkOrderModal(true)}
          >
            Add Work Order
          </Button>
        </div>

        {loadingWorkOrders ? (
          <div className="p-6">
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="h-4 flex-[2] bg-gray-200 rounded" />
                  <div className="h-4 flex-1 bg-gray-200 rounded" />
                  <div className="h-4 flex-1 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : workOrders.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900">No work orders yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Create a work order to assign a vendor to this request.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {workOrders.map((wo, index) => {
              const isCompleted = wo.status === 'completed'
              return (
                <motion.div
                  key={wo.id}
                  variants={item}
                  initial="hidden"
                  animate="show"
                  transition={{ delay: index * 0.04 }}
                  className="p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Top row: vendor + status */}
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-gray-100">
                          <User className="w-4 h-4 text-gray-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {wo.vendor}
                          </p>
                          <p className="text-xs text-gray-500">
                            {wo.created_at
                              ? `Created ${formatDate(wo.created_at)}`
                              : 'Work Order'}
                          </p>
                        </div>
                        <Badge
                          variant={isCompleted ? 'success' : 'info'}
                          dot
                        >
                          {isCompleted ? 'Completed' : 'Pending'}
                        </Badge>
                      </div>

                      {/* Details row */}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                          <span>
                            {formatCurrency(Number(wo.estimated_cost || 0))}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span>
                            Scheduled:{' '}
                            {wo.scheduled_date
                              ? formatDate(wo.scheduled_date)
                              : '-'}
                          </span>
                        </div>
                        {wo.completed_at && (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            <span>
                              Completed: {formatDate(wo.completed_at)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Notes */}
                      {wo.notes && (
                        <div className="flex items-start gap-1.5 text-sm text-gray-500">
                          <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                          <p className="whitespace-pre-wrap">{wo.notes}</p>
                        </div>
                      )}
                    </div>

                    {/* Complete button */}
                    {!isCompleted && (
                      <Button
                        variant="success"
                        size="sm"
                        icon={CheckCircle2}
                        onClick={() => completeWorkOrderMutation.mutate(wo.id)}
                        loading={completeWorkOrderMutation.isPending}
                      >
                        Mark Complete
                      </Button>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </motion.div>

      {/* Add Work Order Modal */}
      <Modal
        isOpen={showWorkOrderModal}
        onClose={() => {
          setShowWorkOrderModal(false)
          setWorkOrderForm({ vendor: '', estimated_cost: '', scheduled_date: '', notes: '' })
          setWorkOrderErrors({})
        }}
        title="Add Work Order"
        description="Assign a vendor and schedule the maintenance work"
        icon={ClipboardList}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Vendor"
            placeholder="Vendor or contractor name"
            value={workOrderForm.vendor}
            onChange={(e) =>
              setWorkOrderForm((prev) => ({ ...prev, vendor: e.target.value }))
            }
            error={workOrderErrors.vendor}
            required
            disabled={createWorkOrderMutation.isPending}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Estimated Cost"
              type="number"
              placeholder="0.00"
              value={workOrderForm.estimated_cost}
              onChange={(e) =>
                setWorkOrderForm((prev) => ({
                  ...prev,
                  estimated_cost: e.target.value,
                }))
              }
              error={workOrderErrors.estimated_cost}
              disabled={createWorkOrderMutation.isPending}
              icon={DollarSign}
            />

            <Input
              label="Scheduled Date"
              type="date"
              value={workOrderForm.scheduled_date}
              onChange={(e) =>
                setWorkOrderForm((prev) => ({
                  ...prev,
                  scheduled_date: e.target.value,
                }))
              }
              error={workOrderErrors.scheduled_date}
              required
              disabled={createWorkOrderMutation.isPending}
            />
          </div>

          <Textarea
            label="Notes"
            placeholder="Additional instructions or details..."
            value={workOrderForm.notes}
            onChange={(e) =>
              setWorkOrderForm((prev) => ({ ...prev, notes: e.target.value }))
            }
            rows={3}
            disabled={createWorkOrderMutation.isPending}
          />
        </div>

        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => {
              setShowWorkOrderModal(false)
              setWorkOrderForm({
                vendor: '',
                estimated_cost: '',
                scheduled_date: '',
                notes: '',
              })
              setWorkOrderErrors({})
            }}
            disabled={createWorkOrderMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleWorkOrderSubmit}
            loading={createWorkOrderMutation.isPending}
            icon={Plus}
          >
            Create Work Order
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
