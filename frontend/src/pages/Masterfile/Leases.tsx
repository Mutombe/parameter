import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  FileText,
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  Calendar,
  DollarSign,
  User,
  Home,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Play,
  Loader2,
  Paperclip,
  Upload,
  Download,
} from 'lucide-react'
import { leaseApi, tenantApi, unitApi, propertyApi } from '../../services/api'
import { formatCurrency, formatDate, cn, useDebounce } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Textarea, Badge, EmptyState, ConfirmDialog, Tooltip, Pagination } from '../../components/ui'
import { AsyncSelect } from '../../components/ui/AsyncSelect'
import { Skeleton } from '../../components/ui/Skeleton'
import { showToast, parseApiError } from '../../lib/toast'
import LeaseForm from '../../components/forms/LeaseForm'
import { TbUserSquareRounded } from "react-icons/tb";
import { SelectionCheckbox, BulkActionsBar } from '../../components/ui'
import { exportTableData } from '../../lib/export'
import { useSelection } from '../../hooks/useSelection'
import { useHotkeys } from '../../hooks/useHotkeys'
import { usePrefetch } from '../../hooks/usePrefetch'
interface Lease {
  id: number
  lease_number: string
  tenant: number
  tenant_name: string
  unit: number
  unit_display: string
  monthly_rent: number
  deposit_amount: number
  currency: string
  start_date: string
  end_date: string
  payment_day: number
  status: 'draft' | 'active' | 'expired' | 'terminated'
  notes: string
  document: string | null
  created_at: string
}

interface Tenant {
  id: number
  name: string
  email: string
}

interface Unit {
  id: number
  unit_number: string
  property_name: string
  is_occupied: boolean
}

interface Property {
  id: number
  name: string
}

const PAGE_SIZE = 25

const statusConfig: Record<string, { color: string; bgColor: string; icon: any; label: string }> = {
  draft: { color: 'text-gray-600', bgColor: 'bg-gray-100', icon: Clock, label: 'Draft' },
  active: { color: 'text-emerald-600', bgColor: 'bg-emerald-50', icon: CheckCircle, label: 'Active' },
  expired: { color: 'text-amber-600', bgColor: 'bg-amber-50', icon: AlertTriangle, label: 'Expired' },
  terminated: { color: 'text-rose-600', bgColor: 'bg-rose-50', icon: XCircle, label: 'Terminated' },
}

// Skeleton row for table - icons always visible, only data positions show skeleton
function SkeletonTableRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-4 w-10">
        <div className="w-4 h-4 bg-gray-200 rounded" />
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <span className="h-4 w-24 bg-gray-200 rounded" />
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <TbUserSquareRounded className="w-4 h-4 text-gray-400" />
          <span className="h-4 w-28 bg-gray-200 rounded" />
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <Home className="w-4 h-4 text-gray-400" />
          <span className="h-4 w-32 bg-gray-200 rounded" />
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-1">
          <DollarSign className="w-4 h-4 text-gray-400" />
          <span className="h-4 w-20 bg-gray-200 rounded" />
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className="h-4 w-36 bg-gray-200 rounded" />
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="h-6 w-20 bg-gray-200 rounded-full inline-block" />
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <button className="p-2 text-gray-300 rounded-lg"><Edit2 className="w-4 h-4" /></button>
        </div>
      </td>
    </tr>
  )
}

export default function Leases() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showActivateDialog, setShowActivateDialog] = useState(false)
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const selection = useSelection<number>({ clearOnChange: [debouncedSearch, statusFilter] })
  const prefetch = usePrefetch()

  const searchInputRef = useRef<HTMLInputElement>(null)
  useHotkeys([
    { key: 'c', handler: () => setShowForm(true) },
    { key: '/', handler: (e) => { e.preventDefault(); searchInputRef.current?.focus() } },
  ])
  const [bulkConfirm, setBulkConfirm] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} })

  const [form, setForm] = useState({
    tenant: '',
    unit: '',
    property: '',
    unit_number: '',
    monthly_rent: '',
    deposit_amount: '',
    currency: 'USD',
    start_date: '',
    end_date: '',
    payment_day: '1',
    notes: '',
  })

  const { data: leasesData, isLoading } = useQuery({
    queryKey: ['leases', debouncedSearch, statusFilter, currentPage],
    queryFn: () => {
      const params: any = { search: debouncedSearch, page: currentPage, page_size: PAGE_SIZE }
      if (statusFilter) params.status = statusFilter
      return leaseApi.list(params).then(r => r.data)
    },
    placeholderData: keepPreviousData,
  })

  const leases = leasesData?.results || leasesData || []
  const totalCount = leasesData?.count || leases.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // Reset to page 1 when search/filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, statusFilter])

  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants-list'],
    queryFn: () => tenantApi.list().then(r => r.data.results || r.data),
    enabled: showForm,
    staleTime: 30000,
  })

  // Fetch all units - filter for vacant ones in the dropdown display
  // This allows both creating new leases (vacant units) and editing existing ones (assigned unit)
  const { data: allUnits, isLoading: unitsLoading } = useQuery({
    queryKey: ['units-all'],
    queryFn: () => unitApi.list().then(r => r.data.results || r.data),
    enabled: showForm,
    staleTime: 30000,
  })

  const { data: properties, isLoading: propertiesLoading } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () => propertyApi.list().then(r => r.data.results || r.data),
    enabled: showForm,
    staleTime: 30000,
  })

  const selectedPropertyName = properties?.find(
    (p: Property) => String(p.id) === form.property
  )?.name

  // When editing, include the current unit even if occupied; for new leases, show only vacant
  // Also filter by selected property when one is chosen
  const units = allUnits?.filter((u: Unit) =>
    (!form.property || u.property_name === selectedPropertyName) &&
    (!u.is_occupied || (editingId && form.unit === String(u.id)))
  )

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      editingId ? leaseApi.update(editingId, data) : leaseApi.create(data),
    onMutate: async (newData) => {
      const isUpdating = !!editingId
      const savedDoc = documentFile
      resetForm()
      await queryClient.cancelQueries({ queryKey: ['leases'] })
      const previousData = queryClient.getQueryData(['leases', debouncedSearch, statusFilter, currentPage])

      if (!isUpdating) {
        const optimistic = {
          id: `temp-${Date.now()}`,
          lease_number: 'Creating...',
          tenant: Number(newData.tenant),
          tenant_name: tenants?.find((t: any) => t.id === Number(newData.tenant))?.name || '',
          unit: Number(newData.unit),
          unit_display: newData.unit
            ? allUnits?.find((u: any) => u.id === Number(newData.unit))?.unit_number || ''
            : newData.unit_number || '',
          monthly_rent: Number(newData.monthly_rent),
          deposit_amount: Number(newData.deposit_amount || 0),
          currency: newData.currency,
          start_date: newData.start_date,
          end_date: newData.end_date,
          payment_day: Number(newData.payment_day),
          status: 'draft' as const,
          notes: newData.notes || '',
          document: null,
          created_at: new Date().toISOString(),
          _isOptimistic: true,
        }
        queryClient.setQueryData(['leases', debouncedSearch, statusFilter, currentPage], (old: any) => {
          const items = old || []
          return [optimistic, ...items]
        })
      } else {
        queryClient.setQueryData(['leases', debouncedSearch, statusFilter, currentPage], (old: any) => {
          const items = old || []
          return items.map((item: any) =>
            item.id === editingId ? { ...item, ...newData, _isOptimistic: true } : item
          )
        })
      }
      // Preserve doc file ref for upload in onSuccess
      ;(createMutation as any)._pendingDoc = savedDoc
      return { previousData, isUpdating }
    },
    onSuccess: async (response, _, context) => {
      const leaseId = response.data?.id
      const doc = (createMutation as any)._pendingDoc
      if (doc && leaseId) {
        try {
          await leaseApi.uploadDocument(leaseId, doc)
          showToast.success(context?.isUpdating ? 'Lease updated with document' : 'Lease created with document')
        } catch {
          showToast.warning('Lease saved but document upload failed')
        }
      } else {
        showToast.success(context?.isUpdating ? 'Lease updated successfully' : 'Lease created successfully')
      }
      (createMutation as any)._pendingDoc = null
      queryClient.invalidateQueries({ queryKey: ['leases'] })
      queryClient.invalidateQueries({ queryKey: ['units-all'] })
    },
    onError: (error, _, context) => {
      (createMutation as any)._pendingDoc = null
      if (context?.previousData) {
        queryClient.setQueryData(['leases', debouncedSearch, statusFilter, currentPage], context.previousData)
      }
      showToast.error(parseApiError(error, 'Failed to save lease'))
    },
  })

  const activateMutation = useMutation({
    mutationFn: (id: number) => leaseApi.activate(id),
    onMutate: async (id) => {
      setShowActivateDialog(false)
      await queryClient.cancelQueries({ queryKey: ['leases'] })
      const previousData = queryClient.getQueryData(['leases', debouncedSearch, statusFilter, currentPage])
      queryClient.setQueryData(['leases', debouncedSearch, statusFilter, currentPage], (old: any) => {
        const items = old || []
        return items.map((item: any) =>
          item.id === id ? { ...item, status: 'active', _isOptimistic: true } : item
        )
      })
      return { previousData }
    },
    onSuccess: () => {
      showToast.success('Lease activated successfully')
      queryClient.invalidateQueries({ queryKey: ['leases'] })
      queryClient.invalidateQueries({ queryKey: ['units-all'] })
      setSelectedLease(null)
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['leases', debouncedSearch, statusFilter, currentPage], context.previousData)
      }
      showToast.error(parseApiError(error, 'Failed to activate lease'))
    },
  })

  const terminateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      leaseApi.terminate(id, reason),
    onMutate: async ({ id }) => {
      setShowDeleteDialog(false)
      await queryClient.cancelQueries({ queryKey: ['leases'] })
      const previousData = queryClient.getQueryData(['leases', debouncedSearch, statusFilter, currentPage])
      queryClient.setQueryData(['leases', debouncedSearch, statusFilter, currentPage], (old: any) => {
        const items = old || []
        return items.map((item: any) =>
          item.id === id ? { ...item, status: 'terminated', _isOptimistic: true } : item
        )
      })
      return { previousData }
    },
    onSuccess: () => {
      showToast.success('Lease terminated')
      queryClient.invalidateQueries({ queryKey: ['leases'] })
      queryClient.invalidateQueries({ queryKey: ['units-all'] })
      setSelectedLease(null)
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['leases', debouncedSearch, statusFilter, currentPage], context.previousData)
      }
      showToast.error(parseApiError(error, 'Failed to terminate lease'))
    },
  })

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setDocumentFile(null)
    setForm({
      tenant: '',
      unit: '',
      property: '',
      unit_number: '',
      monthly_rent: '',
      deposit_amount: '',
      currency: 'USD',
      start_date: '',
      end_date: '',
      payment_day: '1',
      notes: '',
    })
  }

  const handleEdit = (lease: Lease) => {
    setEditingId(lease.id)
    const editUnit = allUnits?.find((u: Unit) => u.id === lease.unit)
    const editProperty = properties?.find((p: Property) => p.name === editUnit?.property_name)
    setForm({
      tenant: String(lease.tenant),
      unit: String(lease.unit),
      property: editProperty ? String(editProperty.id) : '',
      unit_number: '',
      monthly_rent: String(lease.monthly_rent),
      deposit_amount: String(lease.deposit_amount || ''),
      currency: lease.currency,
      start_date: lease.start_date,
      end_date: lease.end_date,
      payment_day: String(lease.payment_day),
      notes: lease.notes || '',
    })
    setShowForm(true)
  }

  const handleActivate = (lease: Lease) => {
    setSelectedLease(lease)
    setShowActivateDialog(true)
  }

  const handleTerminate = (lease: Lease) => {
    setSelectedLease(lease)
    setShowDeleteDialog(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data: any = {
      tenant: parseInt(form.tenant),
      monthly_rent: parseFloat(form.monthly_rent),
      deposit_amount: form.deposit_amount ? parseFloat(form.deposit_amount) : null,
      payment_day: parseInt(form.payment_day),
      currency: form.currency,
      start_date: form.start_date,
      end_date: form.end_date,
      notes: form.notes,
    }

    if (form.unit) {
      data.unit = parseInt(form.unit)
    } else if (form.property && form.unit_number) {
      data.property = parseInt(form.property)
      data.unit_number = form.unit_number
    }

    createMutation.mutate(data)
  }

  // Stats
  const stats = {
    total: totalCount,
    active: leases?.filter((l: Lease) => l.status === 'active').length || 0,
    draft: leases?.filter((l: Lease) => l.status === 'draft').length || 0,
    expiringSoon: leases?.filter((l: Lease) => {
      if (l.status !== 'active') return false
      const endDate = new Date(l.end_date)
      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
      return endDate <= thirtyDaysFromNow
    }).length || 0,
  }

  const selectableItems = (leases || []).filter((l: any) => !l._isOptimistic)
  const pageIds = selectableItems.map((l: any) => l.id)

  const handleBulkExport = () => {
    const selected = selectableItems.filter((l: any) => selection.isSelected(l.id))
    exportTableData(selected, [
      { key: 'lease_number', header: 'Lease Number' },
      { key: 'tenant_name', header: 'Tenant' },
      { key: 'unit_display', header: 'Unit' },
      { key: 'monthly_rent', header: 'Monthly Rent' },
      { key: 'start_date', header: 'Start Date' },
      { key: 'end_date', header: 'End Date' },
      { key: 'status', header: 'Status' },
    ], 'leases_export')
    showToast.success(`Exported ${selected.length} leases`)
  }

  const handleBulkDelete = () => {
    setBulkConfirm({
      open: true,
      title: `Delete ${selection.selectedCount} leases?`,
      message: 'This action cannot be undone.',
      onConfirm: async () => {
        const ids = Array.from(selection.selectedIds)
        for (const id of ids) { try { await leaseApi.update(id, { status: 'terminated' }) } catch {} }
        selection.clearSelection()
        queryClient.invalidateQueries({ queryKey: ['leases'] })
        showToast.success(`Terminated ${ids.length} leases`)
        setBulkConfirm(d => ({ ...d, open: false }))
      },
    })
  }

  // Calculate total monthly rent (guard against null/undefined monthly_rent values)
  const totalMonthlyRent = leases
    ?.filter((l: Lease) => l.status === 'active')
    .reduce((sum: number, l: Lease) => sum + (Number(l.monthly_rent) || 0), 0) || 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lease Agreements"
        subtitle="Manage rental contracts and lease terms"
        icon={FileText}
        actions={
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Lease
          </Button>
        }
      />

      {/* Stats Cards - icons and labels always visible, only numbers show skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div whileHover={{ y: -2 }} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Leases</p>
              {isLoading ? (
                <div className="h-8 w-12 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2 }}
          onClick={() => !isLoading && setStatusFilter(statusFilter === 'active' ? '' : 'active')}
          className={cn(
            'bg-white rounded-xl border p-5 cursor-pointer transition-all',
            statusFilter === 'active' ? 'border-emerald-300 ring-1 ring-emerald-300' : 'border-gray-200 hover:border-gray-300'
          )}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              {isLoading ? (
                <div className="h-8 w-10 bg-emerald-100 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2 }}
          onClick={() => !isLoading && setStatusFilter(statusFilter === 'draft' ? '' : 'draft')}
          className={cn(
            'bg-white rounded-xl border p-5 cursor-pointer transition-all',
            statusFilter === 'draft' ? 'border-gray-400 ring-1 ring-gray-400' : 'border-gray-200 hover:border-gray-300'
          )}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
              <Clock className="w-6 h-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Draft</p>
              {isLoading ? (
                <div className="h-8 w-10 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-bold text-gray-600">{stats.draft}</p>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div whileHover={{ y: -2 }} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Expiring Soon</p>
              {isLoading ? (
                <div className="h-8 w-10 bg-amber-100 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-bold text-amber-600">{stats.expiringSoon}</p>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Total Monthly Rent Banner */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-primary-100">Total Active Monthly Rent</p>
            {isLoading ? (
              <div className="h-9 w-32 bg-primary-400/50 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-3xl font-bold mt-1">{formatCurrency(totalMonthlyRent)}</p>
            )}
          </div>
          <DollarSign className="w-12 h-12 text-primary-200" />
        </div>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search leases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
          />
        </div>

        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          placeholder="All Statuses"
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'draft', label: 'Draft' },
            { value: 'active', label: 'Active' },
            { value: 'expired', label: 'Expired' },
            { value: 'terminated', label: 'Terminated' },
          ]}
        />

        <div className="ml-auto text-sm text-gray-500">
          {totalCount} leases
        </div>
      </div>

      {/* Leases Table - headers always visible */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Lease</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tenant</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Monthly Rent</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Period</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              [...Array(5)].map((_, i) => <SkeletonTableRow key={i} />)
            ) : !leases || leases.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12">
                  <EmptyState
                    icon={FileText}
                    title="No leases found"
                    description="Create your first lease agreement to start managing tenancies."
                    action={
                      <Button onClick={() => setShowForm(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        New Lease
                      </Button>
                    }
                  />
                </td>
              </tr>
            ) : leases.map((lease: Lease, index: number) => {
                const config = statusConfig[lease.status] || statusConfig.draft
                const StatusIcon = config.icon
                const isExpiringSoon = lease.status === 'active' && new Date(lease.end_date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                const statusTooltips: Record<string, string> = {
                  draft: 'Not yet activated',
                  active: 'Currently in effect',
                  expired: 'Past end date',
                  terminated: 'Ended early',
                }
                const startMs = new Date(lease.start_date).getTime()
                const endMs = new Date(lease.end_date).getTime()
                const durationDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))
                const durationMonths = Math.round(durationDays / 30)

                return (
                  <motion.tr
                    key={lease.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.02 }}
                    className={cn('hover:bg-gray-50 transition-colors group', selection.isSelected(lease.id) && 'bg-primary-50/60')}
                  >
                    <td className="px-4 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                      <SelectionCheckbox
                        checked={selection.isSelected(lease.id)}
                        onChange={() => selection.toggle(lease.id)}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <span className="font-semibold text-gray-900">{lease.lease_number}</span>
                        {lease.document && <Paperclip className="w-3.5 h-3.5 text-gray-400" />}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <TbUserSquareRounded className="w-4 h-4 text-gray-400" />
                        {lease.tenant ? (
                          <button
                            onClick={() => navigate(`/dashboard/tenants/${lease.tenant}`)}
                            onMouseEnter={() => prefetch(`/dashboard/tenants/${lease.tenant}`)}
                            className="text-primary-600 hover:text-primary-700 hover:underline"
                          >
                            {lease.tenant_name}
                          </button>
                        ) : (
                          <span className="text-gray-700">{lease.tenant_name}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Home className="w-4 h-4 text-gray-400" />
                        {lease.unit ? (
                          <button
                            onClick={() => navigate(`/dashboard/units/${lease.unit}`)}
                            onMouseEnter={() => prefetch(`/dashboard/units/${lease.unit}`)}
                            className="text-primary-600 hover:text-primary-700 hover:underline"
                          >
                            {lease.unit_display}
                          </button>
                        ) : (
                          <span className="text-gray-600">{lease.unit_display}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4 text-gray-400" />
                        <span className="font-semibold text-gray-900" title={`Monthly rent: ${lease.monthly_rent}`}>{formatCurrency(lease.monthly_rent)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span
                          className={cn(
                            'text-sm',
                            isExpiringSoon ? 'text-amber-600 font-medium' : 'text-gray-600'
                          )}
                          title={`Duration: ${durationMonths} month${durationMonths !== 1 ? 's' : ''} (${durationDays} days)`}
                        >
                          {formatDate(lease.start_date)} - {formatDate(lease.end_date)}
                        </span>
                        {isExpiringSoon && (
                          <Tooltip content="Expires within 30 days">
                            <span><Badge variant="warning" className="text-xs">Expiring</Badge></span>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Tooltip content={statusTooltips[lease.status] || config.label}>
                        <span className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                          config.bgColor, config.color
                        )}>
                          <StatusIcon className="w-3 h-3" />
                          {config.label}
                        </span>
                      </Tooltip>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => navigate(`/dashboard/leases/${lease.id}`)}
                          onMouseEnter={() => prefetch(`/dashboard/leases/${lease.id}`)}
                          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {lease.status === 'draft' && (
                          <button
                            onClick={() => handleActivate(lease)}
                            className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Activate Lease"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(lease)}
                          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {lease.status === 'active' && (
                          <button
                            onClick={() => handleTerminate(lease)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Terminate Lease"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        open={showForm}
        onClose={resetForm}
        title={editingId ? 'Edit Lease' : 'New Lease Agreement'}
        icon={editingId ? Edit2 : Plus}
      >
        <LeaseForm
          initialValues={form}
          onSubmit={(data, docFile) => {
            if (docFile) setDocumentFile(docFile)
            createMutation.mutate(data)
          }}
          isSubmitting={createMutation.isPending}
          onCancel={resetForm}
        />
      </Modal>

      {/* Activate Confirmation */}
      <ConfirmDialog
        open={showActivateDialog}
        onClose={() => {
          setShowActivateDialog(false)
          setSelectedLease(null)
        }}
        onConfirm={() => selectedLease && activateMutation.mutate(selectedLease.id)}
        title="Activate Lease"
        description={`Are you sure you want to activate lease "${selectedLease?.lease_number}"? This will mark the unit as occupied and start the billing cycle.`}
        confirmText="Activate"
        variant="default"
        loading={activateMutation.isPending}
      />

      {/* Terminate Confirmation */}
      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false)
          setSelectedLease(null)
        }}
        onConfirm={() => selectedLease && terminateMutation.mutate({ id: selectedLease.id, reason: 'Terminated by user' })}
        title="Terminate Lease"
        description={`Are you sure you want to terminate lease "${selectedLease?.lease_number}"? This will end the tenancy and mark the unit as vacant.`}
        confirmText="Terminate"
        variant="danger"
        loading={terminateMutation.isPending}
      />

      {totalPages > 1 && (
        <div className="card overflow-hidden">
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

      <BulkActionsBar
        selectedCount={selection.selectedCount}
        onClearSelection={selection.clearSelection}
        entityName="leases"
        actions={[
          { label: 'Export', icon: Download, onClick: handleBulkExport, variant: 'outline' },
          { label: 'Delete', icon: Trash2, onClick: handleBulkDelete, variant: 'danger' },
        ]}
      />

      <ConfirmDialog
        open={bulkConfirm.open}
        onClose={() => setBulkConfirm(d => ({ ...d, open: false }))}
        onConfirm={bulkConfirm.onConfirm}
        title={bulkConfirm.title}
        message={bulkConfirm.message}
        type="danger"
        confirmText="Confirm"
      />
    </div>
  )
}
