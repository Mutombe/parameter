import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Users, Phone, Mail, Trash2, Loader2, Eye, X, FileText, Receipt, Building2, Calendar, DollarSign, AlertCircle, Home, Download } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileSpreadsheet } from 'lucide-react'
import { tenantApi, unitApi, propertyApi, importsApi } from '../../services/api'
import { useDebounce, formatCurrency, formatDate, cn } from '../../lib/utils'
import { Pagination, EmptyState, Modal, SelectionCheckbox, BulkActionsBar, ConfirmDialog, SplitButton, Select } from '../../components/ui'
import { AsyncSelect } from '../../components/ui/AsyncSelect'
import { showToast, parseApiError } from '../../lib/toast'
import { exportTableData } from '../../lib/export'
import { useSelection } from '../../hooks/useSelection'
import { PiUsersFour } from "react-icons/pi";
import { TbUserSquareRounded } from "react-icons/tb";

const PAGE_SIZE = 12

// Filter options
const tenantTypeOptions = [
  { value: '', label: 'All Types' },
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
]

const leaseStatusOptions = [
  { value: '', label: 'All Lease Status' },
  { value: 'active', label: 'With Active Lease' },
  { value: 'inactive', label: 'No Active Lease' },
]

export default function Tenants() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [currentPage, setCurrentPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Filter state
  const [tenantTypeFilter, setTenantTypeFilter] = useState('')
  const [leaseStatusFilter, setLeaseStatusFilter] = useState('')

  const selection = useSelection<number>({ clearOnChange: [debouncedSearch, tenantTypeFilter, leaseStatusFilter] })
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} })

  // Detail modal state
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  const [form, setForm] = useState({
    name: '',
    tenant_type: 'individual',
    account_type: 'rental',
    email: '',
    phone: '',
    id_type: 'national_id',
    id_number: '',
    property: '' as string | number,
    unit: '' as string | number,
  })

  // Fetch properties for selection
  const { data: propertiesData } = useQuery({
    queryKey: ['properties-for-tenant'],
    queryFn: () => propertyApi.list().then(r => r.data),
    enabled: showForm,
  })
  const properties = propertiesData?.results || propertiesData || []

  // Fetch available units for selected property (unoccupied)
  const { data: unitsData } = useQuery({
    queryKey: ['available-units', form.property],
    queryFn: () => unitApi.list({
      property: form.property,
      is_occupied: false
    }).then(r => r.data),
    enabled: showForm && !!form.property,
  })
  const availableUnits = unitsData?.results || unitsData || []

  // Reset unit when property changes
  const handlePropertyChange = (propertyId: string | number) => {
    setForm({ ...form, property: propertyId, unit: '' })
  }

  // Reset to page 1 when search or filters change
  const handleSearchChange = (value: string) => {
    setSearch(value)
    setCurrentPage(1)
  }

  const handleFilterChange = (filter: 'tenantType' | 'leaseStatus', value: string) => {
    if (filter === 'tenantType') setTenantTypeFilter(value)
    if (filter === 'leaseStatus') setLeaseStatusFilter(value)
    setCurrentPage(1)
  }

  const { data: tenantsData, isLoading } = useQuery({
    queryKey: ['tenants', debouncedSearch, currentPage, tenantTypeFilter, leaseStatusFilter],
    queryFn: () => tenantApi.list({
      search: debouncedSearch,
      page: currentPage,
      page_size: PAGE_SIZE,
      ...(tenantTypeFilter && { tenant_type: tenantTypeFilter }),
      ...(leaseStatusFilter && { lease_status: leaseStatusFilter }),
    }).then(r => r.data),
  })

  // Query for tenant detail
  const { data: tenantDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['tenant-detail', selectedTenantId],
    queryFn: () => tenantApi.detailView(selectedTenantId!).then(r => r.data),
    enabled: !!selectedTenantId && showDetailModal,
  })

  const handleViewDetails = (tenantId: number) => {
    navigate(`/dashboard/tenants/${tenantId}`)
  }

  // Handle "view" query parameter from search navigation
  useEffect(() => {
    const viewId = searchParams.get('view')
    if (viewId) {
      searchParams.delete('view')
      setSearchParams(searchParams, { replace: true })
      navigate(`/dashboard/tenants/${viewId}`, { replace: true })
    }
  }, [searchParams, setSearchParams, navigate])

  // Handle both paginated and non-paginated responses
  const tenants = tenantsData?.results || tenantsData || []
  const totalCount = tenantsData?.count || tenants.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => tenantApi.create(data),
    onMutate: async (newData) => {
      setShowForm(false)
      await queryClient.cancelQueries({ queryKey: ['tenants'] })
      const previousData = queryClient.getQueryData(['tenants', debouncedSearch, currentPage, tenantTypeFilter, leaseStatusFilter])

      const optimistic = {
        id: `temp-${Date.now()}`,
        name: newData.name,
        tenant_type: newData.tenant_type,
        account_type: newData.account_type,
        email: newData.email,
        phone: newData.phone,
        has_active_lease: false,
        lease_count: 0,
        unit_name: '',
        created_at: new Date().toISOString(),
        _isOptimistic: true,
      }
      queryClient.setQueryData(['tenants', debouncedSearch, currentPage, tenantTypeFilter, leaseStatusFilter], (old: any) => {
        const items = old?.results || old || []
        return old?.results ? { ...old, results: [optimistic, ...items] } : [optimistic, ...items]
      })
      return { previousData }
    },
    onSuccess: () => {
      showToast.success('Tenant created')
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['tenants', debouncedSearch, currentPage, tenantTypeFilter, leaseStatusFilter], context.previousData)
      }
      showToast.error(parseApiError(error, 'Failed to create tenant'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tenantApi.delete(id),
    onMutate: async (id) => {
      setDeletingId(null)
      await queryClient.cancelQueries({ queryKey: ['tenants'] })
      const previousData = queryClient.getQueryData(['tenants', debouncedSearch, currentPage, tenantTypeFilter, leaseStatusFilter])
      queryClient.setQueryData(['tenants', debouncedSearch, currentPage, tenantTypeFilter, leaseStatusFilter], (old: any) => {
        const items = old?.results || old || []
        const filtered = items.filter((item: any) => item.id !== id)
        return old?.results ? { ...old, results: filtered } : filtered
      })
      return { previousData }
    },
    onSuccess: () => {
      showToast.success('Tenant deleted')
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['tenants', debouncedSearch, currentPage, tenantTypeFilter, leaseStatusFilter], context.previousData)
      }
      showToast.error(parseApiError(error, 'Failed to delete tenant'))
    },
  })

  const handleDelete = (id: number) => {
    setDeletingId(id)
    deleteMutation.mutate(id)
  }

  const selectableItems = (tenants || []).filter((t: any) => !t._isOptimistic)
  const pageIds = selectableItems.map((t: any) => t.id)

  const handleBulkExport = () => {
    const selected = selectableItems.filter((t: any) => selection.isSelected(t.id))
    exportTableData(selected, [
      { key: 'name', header: 'Name' },
      { key: 'code', header: 'Code' },
      { key: 'tenant_type', header: 'Type' },
      { key: 'email', header: 'Email' },
      { key: 'phone', header: 'Phone' },
    ], 'tenants_export')
    showToast.success(`Exported ${selected.length} tenants`)
  }

  const handleBulkDelete = () => {
    setConfirmDialog({
      open: true,
      title: `Delete ${selection.selectedCount} tenants?`,
      message: 'This action cannot be undone.',
      onConfirm: async () => {
        const ids = Array.from(selection.selectedIds)
        for (const id of ids) { try { await tenantApi.delete(id) } catch {} }
        selection.clearSelection()
        queryClient.invalidateQueries({ queryKey: ['tenants'] })
        showToast.success(`Deleted ${ids.length} tenants`)
        setConfirmDialog(d => ({ ...d, open: false }))
      },
    })
  }

  const handleDownloadTemplate = async () => {
    try {
      const response = await importsApi.downloadTemplate('tenants')
      const blob = response.data as Blob
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'import_template_tenants.xlsx'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      showToast.error('Failed to download template')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="text-gray-500 mt-1">Manage rental tenants</p>
        </div>
        <SplitButton
          onClick={() => setShowForm(true)}
          menuItems={[
            { label: 'Import from File', icon: Upload, onClick: () => navigate('/dashboard/data-import') },
            { label: 'Download Template', icon: FileSpreadsheet, onClick: handleDownloadTemplate },
          ]}
        >
          <Plus className="w-4 h-4" /> Add Tenant
        </SplitButton>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search tenants..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="input pl-10"
            />
          </div>
          <Select
            value={tenantTypeFilter}
            onChange={(e) => handleFilterChange('tenantType', e.target.value)}
            className="input min-w-[140px]"
            options={tenantTypeOptions}
          />
          <Select
            value={leaseStatusFilter}
            onChange={(e) => handleFilterChange('leaseStatus', e.target.value)}
            className="input min-w-[160px]"
            options={leaseStatusOptions}
          />
          <div className="flex items-center gap-3 ml-auto">
            {selectableItems.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-500">
                <SelectionCheckbox
                  checked={selection.isAllPageSelected(pageIds)}
                  indeterminate={selection.isPartialPageSelected(pageIds)}
                  onChange={() => selection.selectPage(pageIds)}
                />
                Select all
              </label>
            )}
            <p className="text-sm text-gray-500">
              {totalCount} tenant{totalCount !== 1 ? 's' : ''} total
            </p>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6"
          >
            <h2 className="text-lg font-semibold mb-4">Add New Tenant</h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              const submitData: Record<string, any> = {
                name: form.name,
                tenant_type: form.tenant_type,
                account_type: form.account_type,
                email: form.email,
                phone: form.phone,
                id_type: form.id_type,
                id_number: form.id_number,
                unit: form.unit || null,
              };
              createMutation.mutate(submitData as typeof form);
            }} className="space-y-4">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Tenant Type</label>
                  <Select
                    value={form.tenant_type}
                    onChange={(e) => setForm({ ...form, tenant_type: e.target.value })}
                    className="input"
                    options={[
                      { value: 'individual', label: 'Individual' },
                      { value: 'company', label: 'Company' },
                    ]}
                  />
                </div>
                <div>
                  <label className="label">Account Type</label>
                  <Select
                    value={form.account_type}
                    onChange={(e) => setForm({ ...form, account_type: e.target.value })}
                    className="input"
                    options={[
                      { value: 'rental', label: 'Rental Tenant' },
                      { value: 'levy', label: 'Levy Account Holder' },
                      { value: 'both', label: 'Both (Rental & Levy)' },
                    ]}
                  />
                </div>
              </div>

              {/* Property & Unit Allocation (Optional) */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-800">Unit Allocation</span>
                  </div>
                  <span className="text-xs text-blue-500">Optional - can be assigned via lease later</span>
                </div>

                {/* Property Selection */}
                <AsyncSelect
                  label="Select Property"
                  placeholder="-- No property (assign later) --"
                  value={form.property}
                  onChange={(val) => handlePropertyChange(val ? Number(val) : '')}
                  options={properties.map((property: any) => ({ value: property.id, label: `${property.name} (${property.city})` }))}
                  searchable
                  clearable
                />

                {/* Unit Selection - Only shown after property is selected */}
                {form.property && (
                  <div>
                    <AsyncSelect
                      label="Select Unit"
                      placeholder="-- No unit (assign later) --"
                      value={form.unit}
                      onChange={(val) => setForm({ ...form, unit: val ? Number(val) : '' })}
                      options={availableUnits.map((unit: any) => ({ value: unit.id, label: `Unit ${unit.unit_number} - ${unit.unit_type} (${unit.currency} ${unit.rental_amount}/mo)` }))}
                      searchable
                      clearable
                      emptyMessage="No available units. Units are auto-created when you create a lease."
                    />
                    {availableUnits.length > 0 && (
                      <p className="text-xs text-blue-600 mt-1">
                        {availableUnits.length} unit(s) available
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">ID Type</label>
                  <Select
                    value={form.id_type}
                    onChange={(e) => setForm({ ...form, id_type: e.target.value })}
                    className="input"
                    options={[
                      { value: 'national_id', label: 'National ID' },
                      { value: 'passport', label: 'Passport' },
                      { value: 'company_reg', label: 'Company Reg' },
                    ]}
                  />
                </div>
                <div>
                  <label className="label">ID Number</label>
                  <input type="text" value={form.id_number} onChange={(e) => setForm({ ...form, id_number: e.target.value })} className="input" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" required />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" required />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Save Tenant</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          // Skeleton cards - icons visible, only data text as skeleton
          [...Array(6)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                    <TbUserSquareRounded className="w-6 h-6 text-purple-600" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-gray-200 rounded" />
                    <div className="h-3 w-20 bg-gray-100 rounded" />
                  </div>
                </div>
                <Trash2 className="w-4 h-4 text-gray-200" />
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-gray-300" />
                  <div className="h-3 w-40 bg-gray-100 rounded" />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-gray-300" />
                  <div className="h-3 w-28 bg-gray-100 rounded" />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="h-3 w-24 bg-gray-100 rounded" />
              </div>
            </div>
          ))
        ) : !tenants?.length ? (
          <div className="col-span-full">
            <EmptyState
              icon={TbUserSquareRounded}
              title="No tenants yet"
              description="Add your first tenant to start managing lease agreements and billing."
              action={{
                label: 'Add Tenant',
                onClick: () => setShowForm(true)
              }}
            />
          </div>
        ) : tenants?.map((tenant: any) => (
            <div key={tenant.id} className={cn('card p-5 pl-10 hover:shadow-md transition-shadow relative', selection.isSelected(tenant.id) && 'ring-2 ring-primary-500 bg-primary-50/30')}>
              <div className="absolute top-3 left-3" onClick={(e) => e.stopPropagation()}>
                <SelectionCheckbox
                  checked={selection.isSelected(tenant.id)}
                  onChange={() => selection.toggle(tenant.id)}
                />
              </div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                    <TbUserSquareRounded className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{tenant.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{tenant.code}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        tenant.tenant_type === 'company'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {tenant.tenant_type === 'company' ? 'Company' : 'Individual'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewDetails(tenant.id)}
                    className="text-gray-400 hover:text-primary-600 transition-colors"
                    title="View details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(tenant.id)}
                    disabled={deletingId === tenant.id}
                    className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                    title="Delete tenant"
                  >
                    {deletingId === tenant.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="w-4 h-4" /> {tenant.email}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4" /> {tenant.phone}
                </div>
              </div>
              {/* Allocated Unit */}
              {tenant.unit_name && (
                <div className="mt-3 flex items-center gap-2 text-sm bg-blue-50 text-blue-700 px-2 py-1.5 rounded-lg">
                  <Home className="w-4 h-4" />
                  <span>{tenant.unit_name}</span>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                {tenant.has_active_lease ? (
                  <p className="text-sm text-green-600">
                    {tenant.active_leases?.length || 0} active lease(s)
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">No active lease</p>
                )}
                {tenant.lease_count > 0 && (
                  <p className="text-xs text-gray-400">{tenant.lease_count} total leases</p>
                )}
              </div>
            </div>
          ))}
      </div>

      {/* Pagination */}
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
        entityName="tenants"
        actions={[
          { label: 'Export', icon: Download, onClick: handleBulkExport, variant: 'outline' },
          { label: 'Delete', icon: Trash2, onClick: handleBulkDelete, variant: 'danger' },
        ]}
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog(d => ({ ...d, open: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type="danger"
        confirmText="Confirm"
      />

      {/* Tenant Detail Modal */}
      <AnimatePresence>
        {showDetailModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                    <TbUserSquareRounded className="w-6 h-6 text-purple-600" />
                  </div>
                  {detailLoading ? (
                    <div className="space-y-2">
                      <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
                      <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">
                        {tenantDetail?.tenant?.name}
                      </h2>
                      <p className="text-sm text-gray-500">{tenantDetail?.tenant?.code}</p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowDetailModal(false)
                    setSelectedTenantId(null)
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                {detailLoading ? (
                  <div className="space-y-6 animate-pulse">
                    <div className="grid grid-cols-2 gap-4">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="space-y-2">
                          <div className="h-3 w-20 bg-gray-200 rounded" />
                          <div className="h-4 w-32 bg-gray-100 rounded" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : tenantDetail && (
                  <div className="space-y-6">
                    {/* Contact Info */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        Contact Information
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-gray-500">Email</p>
                          <p className="text-sm font-medium">{tenantDetail.tenant.email}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Phone</p>
                          <p className="text-sm font-medium">{tenantDetail.tenant.phone}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Type</p>
                          <p className="text-sm font-medium capitalize">{tenantDetail.tenant.tenant_type}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">ID Number</p>
                          <p className="text-sm font-medium">{tenantDetail.tenant.id_number || '-'}</p>
                        </div>
                        {tenantDetail.tenant.employer_name && (
                          <div>
                            <p className="text-xs text-gray-500">Employer</p>
                            <p className="text-sm font-medium">{tenantDetail.tenant.employer_name}</p>
                          </div>
                        )}
                        {tenantDetail.tenant.occupation && (
                          <div>
                            <p className="text-xs text-gray-500">Occupation</p>
                            <p className="text-sm font-medium">{tenantDetail.tenant.occupation}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Billing Summary */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        Billing Summary
                      </h3>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">Total Invoiced</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {formatCurrency(tenantDetail.billing_summary?.total_invoiced || 0)}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">Total Paid</p>
                          <p className="text-lg font-semibold text-green-600">
                            {formatCurrency(tenantDetail.billing_summary?.total_paid || 0)}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">Balance Due</p>
                          <p className={`text-lg font-semibold ${
                            tenantDetail.billing_summary?.balance_due > 0 ? 'text-amber-600' : 'text-gray-900'
                          }`}>
                            {formatCurrency(tenantDetail.billing_summary?.balance_due || 0)}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">Overdue</p>
                          <p className={`text-lg font-semibold ${
                            tenantDetail.billing_summary?.overdue_amount > 0 ? 'text-red-600' : 'text-gray-900'
                          }`}>
                            {formatCurrency(tenantDetail.billing_summary?.overdue_amount || 0)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Active Leases */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        Active Leases ({tenantDetail.active_leases?.length || 0})
                      </h3>
                      {tenantDetail.active_leases?.length > 0 ? (
                        <div className="space-y-2">
                          {tenantDetail.active_leases.map((lease: any) => (
                            <div key={lease.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100">
                              <div className="flex items-center gap-3">
                                <Building2 className="w-5 h-5 text-green-600" />
                                <div>
                                  <p className="font-medium text-gray-900">{lease.unit}</p>
                                  <p className="text-xs text-gray-500">{lease.property} • {lease.lease_number}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-gray-900">
                                  {lease.currency} {lease.monthly_rent}/mo
                                </p>
                                <p className="text-xs text-gray-500">
                                  Ends: {formatDate(lease.end_date)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">No active leases</p>
                      )}
                    </div>

                    {/* Lease History */}
                    {tenantDetail.lease_history?.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                          Lease History ({tenantDetail.lease_history?.length || 0})
                        </h3>
                        <div className="space-y-2">
                          {tenantDetail.lease_history.map((lease: any) => (
                            <div key={lease.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <Building2 className="w-5 h-5 text-gray-400" />
                                <div>
                                  <p className="font-medium text-gray-700">{lease.unit}</p>
                                  <p className="text-xs text-gray-500">
                                    {lease.property} • {formatDate(lease.start_date)} - {formatDate(lease.end_date)}
                                  </p>
                                </div>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded ${
                                lease.status === 'terminated'
                                  ? 'bg-red-100 text-red-700'
                                  : lease.status === 'expired'
                                  ? 'bg-gray-100 text-gray-600'
                                  : 'bg-amber-100 text-amber-700'
                              }`}>
                                {lease.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recent Invoices */}
                    {tenantDetail.recent_invoices?.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                          Recent Invoices
                        </h3>
                        <div className="space-y-2">
                          {tenantDetail.recent_invoices.slice(0, 5).map((invoice: any) => (
                            <div key={invoice.id} className="flex items-center justify-between p-2 border border-gray-100 rounded-lg">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-gray-400" />
                                <span className="text-sm font-medium">{invoice.invoice_number}</span>
                                <span className="text-xs text-gray-500">{formatDate(invoice.date)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{formatCurrency(invoice.amount)}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  invoice.status === 'paid'
                                    ? 'bg-green-100 text-green-700'
                                    : invoice.status === 'overdue'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {invoice.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
