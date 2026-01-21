import { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  Plus,
  Search,
  Edit2,
  Trash2,
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
} from 'lucide-react'
import { leaseApi, tenantApi, unitApi } from '../../services/api'
import { formatCurrency, formatDate, cn, useDebounce } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Textarea, Badge, EmptyState, ConfirmDialog } from '../../components/ui'
import { Skeleton } from '../../components/ui/Skeleton'
import { showToast, parseApiError } from '../../lib/toast'
import { TbUserSquareRounded } from "react-icons/tb";
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
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showActivateDialog, setShowActivateDialog] = useState(false)
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    tenant: '',
    unit: '',
    monthly_rent: '',
    deposit_amount: '',
    currency: 'USD',
    start_date: '',
    end_date: '',
    payment_day: '1',
    notes: '',
  })

  const { data: leases, isLoading } = useQuery({
    queryKey: ['leases', debouncedSearch, statusFilter],
    queryFn: () => {
      const params: any = { search: debouncedSearch }
      if (statusFilter) params.status = statusFilter
      return leaseApi.list(params).then(r => r.data.results || r.data)
    },
  })

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

  // When editing, include the current unit even if occupied; for new leases, show only vacant
  const units = allUnits?.filter((u: Unit) =>
    !u.is_occupied || (editingId && form.unit === String(u.id))
  )

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      editingId ? leaseApi.update(editingId, data) : leaseApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leases'] })
      queryClient.invalidateQueries({ queryKey: ['units-all'] })
      showToast.success(editingId ? 'Lease updated successfully' : 'Lease created successfully')
      resetForm()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to save lease')),
  })

  const activateMutation = useMutation({
    mutationFn: (id: number) => leaseApi.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leases'] })
      queryClient.invalidateQueries({ queryKey: ['units-all'] })
      showToast.success('Lease activated successfully')
      setShowActivateDialog(false)
      setSelectedLease(null)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to activate lease')),
  })

  const terminateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      leaseApi.terminate(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leases'] })
      queryClient.invalidateQueries({ queryKey: ['units-all'] })
      showToast.success('Lease terminated')
      setShowDeleteDialog(false)
      setSelectedLease(null)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to terminate lease')),
  })

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm({
      tenant: '',
      unit: '',
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
    setForm({
      tenant: String(lease.tenant),
      unit: String(lease.unit),
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
    const data = {
      ...form,
      tenant: parseInt(form.tenant),
      unit: parseInt(form.unit),
      monthly_rent: parseFloat(form.monthly_rent),
      deposit_amount: form.deposit_amount ? parseFloat(form.deposit_amount) : null,
      payment_day: parseInt(form.payment_day),
    }
    createMutation.mutate(data)
  }

  // Stats
  const stats = {
    total: leases?.length || 0,
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
            type="text"
            placeholder="Search leases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="terminated">Terminated</option>
        </select>

        <div className="ml-auto text-sm text-gray-500">
          {leases?.length || 0} leases
        </div>
      </div>

      {/* Leases Table - headers always visible */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
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
                <td colSpan={7} className="px-6 py-12">
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

                return (
                  <motion.tr
                    key={lease.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.02 }}
                    className="hover:bg-gray-50 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <span className="font-semibold text-gray-900">{lease.lease_number}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <TbUserSquareRounded className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-700">{lease.tenant_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Home className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">{lease.unit_display}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4 text-gray-400" />
                        <span className="font-semibold text-gray-900">{formatCurrency(lease.monthly_rent)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className={cn(
                          'text-sm',
                          isExpiringSoon ? 'text-amber-600 font-medium' : 'text-gray-600'
                        )}>
                          {formatDate(lease.start_date)} - {formatDate(lease.end_date)}
                        </span>
                        {isExpiringSoon && (
                          <Badge variant="warning" className="text-xs">Expiring</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                        config.bgColor, config.color
                      )}>
                        <StatusIcon className="w-3 h-3" />
                        {config.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            {/* Tenant Select with Loading */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Tenant <span className="text-red-500">*</span>
              </label>
              {tenantsLoading ? (
                <div className="relative">
                  <Skeleton className="h-11 w-full rounded-xl" />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  </div>
                </div>
              ) : (
                <select
                  value={form.tenant}
                  onChange={(e) => setForm({ ...form, tenant: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  required
                >
                  <option value="">Select Tenant</option>
                  {tenants?.map((t: Tenant) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Unit Select with Loading */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Unit <span className="text-red-500">*</span>
              </label>
              {unitsLoading ? (
                <div className="relative">
                  <Skeleton className="h-11 w-full rounded-xl" />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  </div>
                </div>
              ) : (
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  required
                >
                  <option value="">Select Unit</option>
                  {units?.map((u: Unit) => (
                    <option key={u.id} value={u.id}>
                      {u.unit_number} - {u.property_name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input
              type="number"
              label="Monthly Rent"
              placeholder="1000.00"
              step="0.01"
              min="0"
              value={form.monthly_rent}
              onChange={(e) => setForm({ ...form, monthly_rent: e.target.value })}
              required
            />

            <Input
              type="number"
              label="Deposit Amount"
              placeholder="1000.00"
              step="0.01"
              min="0"
              value={form.deposit_amount}
              onChange={(e) => setForm({ ...form, deposit_amount: e.target.value })}
            />

            <Select
              label="Currency"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              <option value="USD">USD</option>
              <option value="ZiG">ZiG</option>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input
              type="date"
              label="Start Date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              required
            />

            <Input
              type="date"
              label="End Date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              required
            />

            <Select
              label="Payment Day"
              value={form.payment_day}
              onChange={(e) => setForm({ ...form, payment_day: e.target.value })}
            >
              {Array.from({ length: 28 }, (_, i) => (
                <option key={i + 1} value={i + 1}>Day {i + 1}</option>
              ))}
            </Select>
          </div>

          <Textarea
            label="Notes"
            placeholder="Additional terms or notes..."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
          />

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={resetForm}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={createMutation.isPending || tenantsLoading || unitsLoading}>
              {createMutation.isPending ? 'Saving...' : editingId ? 'Update Lease' : 'Create Lease'}
            </Button>
          </div>
        </form>
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
    </div>
  )
}
