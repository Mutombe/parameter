import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  Building2,
  Plus,
  Search,
  Home,
  MapPin,
  Edit2,
  Trash2,
  Eye,
  Briefcase,
  Factory,
  Layers,
  DoorOpen,
  TrendingUp,
  TrendingDown,
  X,
  Wand2,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  Shield,
  Users,
  Download,
} from 'lucide-react'
import { Upload, FileSpreadsheet } from 'lucide-react'
import { propertyApi, landlordApi, propertyManagerApi, usersApi, importsApi } from '../../services/api'
import { formatPercent, cn, useDebounce } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Badge, EmptyState, ConfirmDialog, Pagination, SelectionCheckbox, BulkActionsBar, SplitButton, Tooltip } from '../../components/ui'
import { AsyncSelect } from '../../components/ui/AsyncSelect'
import { showToast, parseApiError } from '../../lib/toast'
import { useChainStore } from '../../stores/chainStore'
import PropertyForm from '../../components/forms/PropertyForm'
import { exportTableData } from '../../lib/export'
import { useSelection } from '../../hooks/useSelection'
import { useHotkeys } from '../../hooks/useHotkeys'
import { usePrefetch } from '../../hooks/usePrefetch'
import { PiBuildingApartmentLight } from "react-icons/pi"
import { TbUserSquareRounded } from "react-icons/tb"

const PAGE_SIZE = 12

interface PropertyManager {
  id: number
  user_id: number
  name: string
  is_primary?: boolean
}

interface Property {
  id: number
  name: string
  landlord: number
  landlord_name: string
  property_type: 'residential' | 'commercial' | 'industrial' | 'mixed'
  address: string
  city: string
  total_units: number
  unit_count: number
  unit_definition?: string
  defined_unit_count?: number
  vacancy_rate: number
  primary_manager?: PropertyManager | null
  managers_list?: PropertyManager[]
  created_at: string
}

const propertyTypeConfig = {
  residential: {
    icon: Home,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    label: 'Residential',
  },
  commercial: {
    icon: Briefcase,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    label: 'Commercial',
  },
  industrial: {
    icon: Factory,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    label: 'Industrial',
  },
  mixed: {
    icon: Layers,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    label: 'Mixed Use',
  },
}

export default function Properties() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    landlord: '',
    name: '',
    property_type: 'residential',
    address: '',
    city: 'Harare',
    total_units: 1,
    unit_definition: '',
  })
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [generateForm, setGenerateForm] = useState({
    default_rent: '0',
    currency: 'USD',
    unit_type: 'apartment',
  })

  const selection = useSelection<number>({ clearOnChange: [debouncedSearch, typeFilter] })
  const prefetch = usePrefetch()

  const searchInputRef = useRef<HTMLInputElement>(null)
  useHotkeys([
    { key: 'c', handler: () => setShowForm(true) },
    { key: '/', handler: (e) => { e.preventDefault(); searchInputRef.current?.focus() } },
  ])

  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} })

  // Reset page when search/filter changes
  const handleSearchChange = (value: string) => {
    setSearch(value)
    setCurrentPage(1)
  }

  const { data: propertiesData, isLoading, error } = useQuery({
    queryKey: ['properties', debouncedSearch, currentPage],
    queryFn: () => propertyApi.list({
      search: debouncedSearch,
      page: currentPage,
      page_size: PAGE_SIZE
    }).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  // Handle both paginated and non-paginated responses
  const properties = propertiesData?.results || propertiesData || []
  const totalCount = propertiesData?.count || properties.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const { data: landlords, isLoading: landlordsLoading } = useQuery({
    queryKey: ['landlords-select'],
    queryFn: () => landlordApi.list().then(r => r.data.results || r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: { landlord: number; name: string; property_type: string; address: string; city: string; total_units: number; unit_definition: string }) =>
      editingId ? propertyApi.update(editingId, data) : propertyApi.create(data),
    onMutate: async (newData) => {
      const isUpdating = !!editingId
      resetForm()
      await queryClient.cancelQueries({ queryKey: ['properties'] })
      const previousData = queryClient.getQueryData(['properties', debouncedSearch, currentPage])

      if (!isUpdating) {
        const optimistic = {
          id: `temp-${Date.now()}`,
          name: newData.name,
          landlord: newData.landlord,
          landlord_name: landlords?.find((l: any) => l.id === newData.landlord)?.name || '',
          property_type: newData.property_type,
          address: newData.address,
          city: newData.city,
          total_units: newData.total_units,
          unit_count: 0,
          vacancy_rate: 0,
          unit_definition: newData.unit_definition,
          created_at: new Date().toISOString(),
          _isOptimistic: true,
        }
        queryClient.setQueryData(['properties', debouncedSearch, currentPage], (old: any) => {
          const items = old?.results || old || []
          return old?.results ? { ...old, results: [optimistic, ...items] } : [optimistic, ...items]
        })
      } else {
        queryClient.setQueryData(['properties', debouncedSearch, currentPage], (old: any) => {
          const items = old?.results || old || []
          const updated = items.map((item: any) =>
            item.id === editingId ? { ...item, ...newData, _isOptimistic: true } : item
          )
          return old?.results ? { ...old, results: updated } : updated
        })
      }
      return { previousData, isUpdating }
    },
    onSuccess: (_, __, context) => {
      showToast.success(context?.isUpdating ? 'Property updated successfully' : 'Property created successfully')
      queryClient.invalidateQueries({ queryKey: ['properties'] })
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['properties', debouncedSearch, currentPage], context.previousData)
      }
      showToast.error(parseApiError(error, 'Failed to save property'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => propertyApi.delete(id),
    onMutate: async (id) => {
      setShowDeleteDialog(false)
      await queryClient.cancelQueries({ queryKey: ['properties'] })
      const previousData = queryClient.getQueryData(['properties', debouncedSearch, currentPage])
      queryClient.setQueryData(['properties', debouncedSearch, currentPage], (old: any) => {
        const items = old?.results || old || []
        const filtered = items.filter((item: any) => item.id !== id)
        return old?.results ? { ...old, results: filtered } : filtered
      })
      return { previousData }
    },
    onSuccess: () => {
      showToast.success('Property deleted')
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      setSelectedProperty(null)
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['properties', debouncedSearch, currentPage], context.previousData)
      }
      showToast.error(parseApiError(error, 'Failed to delete property'))
    },
  })

  // Preview units query (only fetch when generate modal is open)
  const { data: previewData, isLoading: previewLoading, refetch: refetchPreview } = useQuery({
    queryKey: ['preview-units', selectedProperty?.id],
    queryFn: () => selectedProperty ? propertyApi.previewUnits(selectedProperty.id).then(r => r.data) : null,
    enabled: showGenerateModal && !!selectedProperty?.id && !!selectedProperty?.unit_definition,
  })

  // Generate units mutation
  const generateUnitsMutation = useMutation({
    mutationFn: (data: { propertyId: number; default_rent: string; currency: string; unit_type: string }) =>
      propertyApi.generateUnits(data.propertyId, {
        default_rent: data.default_rent,
        currency: data.currency,
        unit_type: data.unit_type,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      showToast.success(`Created ${response.data.created_count} units successfully`)
      setShowGenerateModal(false)
      setShowDetailsModal(false)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to generate units')),
  })

  // Manager assignment state
  const [showManagerModal, setShowManagerModal] = useState(false)
  const [selectedManagerUserId, setSelectedManagerUserId] = useState('')
  const [managerIsPrimary, setManagerIsPrimary] = useState(false)

  // Fetch staff users for manager assignment
  const { data: staffUsers, isLoading: staffLoading } = useQuery({
    queryKey: ['staff-users'],
    queryFn: () => usersApi.list().then(r => {
      const users = r.data.results || r.data
      return users.filter((u: any) => u.role !== 'tenant_portal' && u.is_active)
    }),
    enabled: showManagerModal,
  })

  // Fetch managers for selected property
  const { data: propertyManagers, refetch: refetchManagers } = useQuery({
    queryKey: ['property-managers', selectedProperty?.id],
    queryFn: () => propertyManagerApi.list({ property: selectedProperty?.id }).then(r => r.data.results || r.data),
    enabled: showManagerModal && !!selectedProperty?.id,
  })

  const assignManagerMutation = useMutation({
    mutationFn: (data: { user: number; property: number; is_primary: boolean }) =>
      propertyManagerApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      queryClient.invalidateQueries({ queryKey: ['property-managers'] })
      showToast.success('Manager assigned successfully')
      setSelectedManagerUserId('')
      setManagerIsPrimary(false)
      refetchManagers()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to assign manager')),
  })

  const removeManagerMutation = useMutation({
    mutationFn: (id: number) => propertyManagerApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      queryClient.invalidateQueries({ queryKey: ['property-managers'] })
      showToast.success('Manager removed')
      refetchManagers()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to remove manager')),
  })

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm({
      landlord: '',
      name: '',
      property_type: 'residential',
      address: '',
      city: 'Harare',
      total_units: 1,
      unit_definition: '',
    })
  }

  const handleEdit = (property: Property) => {
    setEditingId(property.id)
    setForm({
      landlord: String(property.landlord),
      name: property.name,
      property_type: property.property_type,
      address: property.address,
      city: property.city,
      total_units: property.total_units,
      unit_definition: property.unit_definition || '',
    })
    setShowForm(true)
  }

  const handleGenerateUnits = () => {
    if (!selectedProperty) return
    generateUnitsMutation.mutate({
      propertyId: selectedProperty.id,
      ...generateForm,
    })
  }

  const handleDelete = (property: Property) => {
    setSelectedProperty(property)
    setShowDeleteDialog(true)
  }

  const handleViewDetails = (property: Property) => {
    navigate(`/dashboard/properties/${property.id}`)
  }

  // Handle "view" query parameter from search navigation
  useEffect(() => {
    const viewId = searchParams.get('view')
    if (viewId) {
      searchParams.delete('view')
      setSearchParams(searchParams, { replace: true })
      navigate(`/dashboard/properties/${viewId}`, { replace: true })
    }
  }, [searchParams, setSearchParams, navigate])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Convert landlord to integer for the API
    createMutation.mutate({
      ...form,
      landlord: parseInt(form.landlord, 10),
    })
  }

  const filteredProperties = typeFilter
    ? properties.filter((p: Property) => p.property_type === typeFilter)
    : properties

  // Stats
  const totalUnits = properties?.reduce((sum: number, p: Property) => sum + (p.unit_count || 0), 0) || 0
  const totalVacant = properties?.reduce((sum: number, p: Property) => {
    return sum + Math.round((p.unit_count || 0) * (p.vacancy_rate || 0) / 100)
  }, 0) || 0
  const avgVacancy = properties?.length
    ? properties.reduce((sum: number, p: Property) => sum + (p.vacancy_rate || 0), 0) / properties.length
    : 0

  const stats = {
    total: totalCount || 0,
    residential: properties?.filter((p: Property) => p.property_type === 'residential').length || 0,
    commercial: properties?.filter((p: Property) => p.property_type === 'commercial').length || 0,
    industrial: properties?.filter((p: Property) => p.property_type === 'industrial').length || 0,
    mixed: properties?.filter((p: Property) => p.property_type === 'mixed').length || 0,
  }

  const selectableItems = (filteredProperties || []).filter((p: any) => !p._isOptimistic)
  const pageIds = selectableItems.map((p: any) => p.id)

  const handleBulkExport = () => {
    const selected = selectableItems.filter((p: any) => selection.isSelected(p.id))
    exportTableData(selected, [
      { key: 'name', header: 'Name' },
      { key: 'code', header: 'Code' },
      { key: 'property_type', header: 'Type' },
      { key: 'city', header: 'City' },
      { key: 'landlord_name', header: 'Landlord' },
      { key: 'total_units', header: 'Total Units' },
    ], 'properties_export')
    showToast.success(`Exported ${selected.length} properties`)
  }

  const handleBulkDelete = () => {
    setBulkDeleteConfirm({
      open: true,
      title: `Delete ${selection.selectedCount} properties?`,
      message: 'This action cannot be undone.',
      onConfirm: async () => {
        const ids = Array.from(selection.selectedIds)
        for (const id of ids) { try { await propertyApi.delete(id) } catch {} }
        selection.clearSelection()
        queryClient.invalidateQueries({ queryKey: ['properties'] })
        showToast.success(`Deleted ${ids.length} properties`)
        setBulkDeleteConfirm(d => ({ ...d, open: false }))
      },
    })
  }

  const handleDownloadTemplate = async () => {
    try {
      const response = await importsApi.downloadTemplate('properties')
      const blob = response.data as Blob
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'import_template_properties.xlsx'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      showToast.error('Failed to download template')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Properties"
        subtitle="Manage buildings and property portfolios"
        icon={PiBuildingApartmentLight}
        actions={
          <SplitButton
            onClick={() => setShowForm(true)}
            menuItems={[
              { label: 'Chain Add', icon: Wand2, onClick: () => useChainStore.getState().startChain('property') },
              { label: 'Import from File', icon: Upload, onClick: () => navigate('/dashboard/data-import') },
              { label: 'Download Template', icon: FileSpreadsheet, onClick: handleDownloadTemplate },
            ]}
          >
            <Plus className="w-4 h-4" />
            Add Property
          </SplitButton>
        }
      />

      {/* Stats Row - Compact */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary-50 flex items-center justify-center">
              <PiBuildingApartmentLight className="w-4 h-4 sm:w-5 sm:h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-gray-500">Total</p>
              <p className="text-lg sm:text-xl font-bold text-gray-900">{isLoading ? '-' : stats.total}</p>
            </div>
          </div>
        </div>

        {Object.entries(propertyTypeConfig).map(([type, config]) => {
          const TypeIcon = config.icon
          const count = stats[type as keyof typeof stats] || 0
          return (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
              className={cn(
                'bg-white rounded-xl border p-3 sm:p-4 text-left transition-all',
                typeFilter === type
                  ? 'border-primary-300 ring-1 ring-primary-300'
                  : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={cn('w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center', config.bgColor)}>
                  <TypeIcon className={cn('w-4 h-4 sm:w-5 sm:h-5', config.color)} />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-gray-500">{config.label}</p>
                  <p className={cn('text-lg sm:text-xl font-bold', config.color)}>{isLoading ? '-' : count}</p>
                </div>
              </div>
            </button>
          )
        })}

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-3 sm:p-4 text-white">
          <div className="flex items-center gap-2 sm:gap-3">
            <DoorOpen className="w-5 h-5 sm:w-6 sm:h-6 text-white/80" />
            <div>
              <p className="text-emerald-100 text-[10px] sm:text-xs">Units</p>
              <p className="text-lg sm:text-xl font-bold">{isLoading ? '-' : totalUnits}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl p-3 sm:p-4 text-white">
          <div className="flex items-center gap-2 sm:gap-3">
            <TrendingDown className="w-5 h-5 sm:w-6 sm:h-6 text-white/80" />
            <div>
              <p className="text-rose-100 text-[10px] sm:text-xs">Vacancy</p>
              <p className="text-lg sm:text-xl font-bold">{isLoading ? '-' : formatPercent(avgVacancy)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search properties..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
          />
        </div>

        {typeFilter && (
          <Badge
            variant="default"
            className="gap-1 cursor-pointer"
            onClick={() => setTypeFilter('')}
          >
            {propertyTypeConfig[typeFilter as keyof typeof propertyTypeConfig]?.label}
            <span className="text-xs">×</span>
          </Badge>
        )}

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
            {isLoading ? (
              <span className="inline-block h-4 w-24 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>{filteredProperties.length} properties</>
            )}
          </p>
        </div>
      </div>

      {/* Properties List - Compact Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-gray-200 rounded" />
                  <div className="h-3 w-32 bg-gray-100 rounded" />
                </div>
                <div className="h-6 w-20 bg-gray-200 rounded-full" />
                <div className="h-4 w-16 bg-gray-200 rounded" />
                <div className="h-4 w-16 bg-gray-200 rounded" />
                <div className="flex gap-1">
                  <div className="w-8 h-8 rounded-lg bg-gray-200" />
                  <div className="w-8 h-8 rounded-lg bg-gray-200" />
                  <div className="w-8 h-8 rounded-lg bg-gray-200" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredProperties.length === 0 ? (
        <EmptyState
          icon={PiBuildingApartmentLight}
          title="No properties found"
          description="Add your first property to start managing your real estate portfolio."
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Property
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {filteredProperties.map((property: Property, index: number) => {
            const config = propertyTypeConfig[property.property_type] || propertyTypeConfig.residential
            const TypeIcon = config.icon
            const occupancyRate = 100 - (property.vacancy_rate || 0)
            const occupiedUnits = Math.round((property.unit_count || 0) * occupancyRate / 100)

            return (
              <motion.div
                key={property.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                className={cn(
                  'relative bg-white rounded-xl border border-gray-200 p-4 pl-10 hover:shadow-md hover:border-gray-300 transition-all group',
                  selection.isSelected(property.id) && 'ring-2 ring-primary-500 bg-primary-50/30'
                )}
              >
                {/* Selection checkbox */}
                <div className="absolute left-3 top-1/2 -translate-y-1/2" onClick={(e) => e.stopPropagation()}>
                  <SelectionCheckbox
                    checked={selection.isSelected(property.id)}
                    onChange={() => selection.toggle(property.id)}
                  />
                </div>

                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                    config.bgColor
                  )}>
                    <TypeIcon className={cn('w-5 h-5', config.color)} />
                  </div>

                  {/* Name & Address */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{property.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{property.address || property.city}</span>
                    </div>
                  </div>

                  {/* Type Badge */}
                  <Tooltip content={config.label}>
                    <span className={cn(
                      'hidden sm:inline-flex px-2.5 py-1 rounded-full text-xs font-medium',
                      config.bgColor, config.color
                    )}>
                      {config.label}
                    </span>
                  </Tooltip>

                  {/* Landlord */}
                  <div className="hidden md:flex items-center gap-2 text-sm min-w-[120px]">
                    <TbUserSquareRounded className="w-4 h-4 text-gray-400" />
                    {property.landlord ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/landlords/${property.landlord}`) }}
                        onMouseEnter={() => prefetch(`/dashboard/landlords/${property.landlord}`)}
                        className="text-primary-600 hover:text-primary-700 hover:underline truncate"
                      >
                        {property.landlord_name}
                      </button>
                    ) : (
                      <span className="text-gray-600 truncate">{property.landlord_name}</span>
                    )}
                  </div>

                  {/* Manager */}
                  {property.primary_manager && (
                    <Tooltip content={property.primary_manager.name}>
                      <div className="hidden lg:flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">
                        <Shield className="w-3 h-3" />
                        <span className="truncate max-w-[80px]">{property.primary_manager.name}</span>
                      </div>
                    </Tooltip>
                  )}

                  {/* Units */}
                  <Tooltip content={`${property.unit_count || 0} units in this property`}>
                    <div className="hidden lg:flex items-center gap-4 text-sm">
                      <div className="text-center min-w-[60px]">
                        <span className="font-semibold text-gray-900">{property.unit_count || 0}</span>
                        <span className="text-gray-400 ml-1">units</span>
                      </div>
                    </div>
                  </Tooltip>

                  {/* Occupancy Bar */}
                  <div className="hidden xl:flex flex-col min-w-[100px]" title={`${occupancyRate}% occupied`}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">Occupancy</span>
                      <span className={cn(
                        'font-medium',
                        occupancyRate >= 80 ? 'text-emerald-600' :
                        occupancyRate >= 50 ? 'text-amber-600' : 'text-rose-600'
                      )}>{formatPercent(occupancyRate)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          occupancyRate >= 80 ? 'bg-emerald-500' :
                          occupancyRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                        )}
                        style={{ width: `${occupancyRate}%` }}
                      />
                    </div>
                  </div>

                  {/* Actions - always visible on mobile, hover on desktop */}
                  <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleViewDetails(property)}
                      onMouseEnter={() => prefetch(`/dashboard/properties/${property.id}`)}
                      className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title="View details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEdit(property)}
                      className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(property)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

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

      {/* Details Modal */}
      <AnimatePresence>
        {showDetailsModal && selectedProperty && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
            >
              {/* Header Banner */}
              {(() => {
                const config = propertyTypeConfig[selectedProperty.property_type] || propertyTypeConfig.residential
                const TypeIcon = config.icon
                const occupancyRate = 100 - (selectedProperty.vacancy_rate || 0)
                const occupiedUnits = Math.round((selectedProperty.unit_count || 0) * occupancyRate / 100)

                return (
                  <>
                    <div className={cn(
                      'h-32 relative flex items-center justify-center',
                      config.bgColor
                    )}>
                      <TypeIcon className={cn('w-16 h-16 opacity-20', config.color)} />
                      <button
                        onClick={() => setShowDetailsModal(false)}
                        className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <div className="absolute bottom-4 left-4">
                        <span className={cn(
                          'px-3 py-1.5 rounded-lg text-sm font-medium bg-white/80 backdrop-blur',
                          config.color
                        )}>
                          {config.label}
                        </span>
                      </div>
                    </div>

                    <div className="p-6">
                      <h2 className="text-xl font-bold text-gray-900">{selectedProperty.name}</h2>

                      <div className="mt-4 space-y-3">
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          <span>{selectedProperty.address || selectedProperty.city}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <TbUserSquareRounded className="w-4 h-4 text-gray-400" />
                          {selectedProperty.landlord ? (
                            <button
                              onClick={() => navigate(`/dashboard/landlords/${selectedProperty.landlord}`)}
                              onMouseEnter={() => prefetch(`/dashboard/landlords/${selectedProperty.landlord}`)}
                              className="text-primary-600 hover:text-primary-700 hover:underline"
                            >
                              Owned by {selectedProperty.landlord_name}
                            </button>
                          ) : (
                            <span className="text-gray-600">Owned by {selectedProperty.landlord_name}</span>
                          )}
                        </div>
                      </div>

                      {/* Unit Definition Section */}
                      {selectedProperty.unit_definition && (
                        <div className="mt-6 p-4 bg-primary-50 rounded-xl border border-primary-100">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-sm font-medium text-primary-700">Unit Definition</span>
                            <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                              {selectedProperty.defined_unit_count || 0} units defined
                            </span>
                          </div>
                          <code className="text-sm text-gray-700 font-mono bg-white px-2 py-1 rounded">
                            {selectedProperty.unit_definition}
                          </code>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 w-full gap-2"
                            onClick={() => setShowGenerateModal(true)}
                          >
                            <Wand2 className="w-4 h-4" />
                            Generate Units from Definition
                          </Button>
                        </div>
                      )}

                      {/* Occupancy Section */}
                      <div className="mt-6 p-4 bg-gray-50 rounded-xl">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-sm font-medium text-gray-600">Occupancy Rate</span>
                          <span className={cn(
                            'text-lg font-bold',
                            occupancyRate >= 80 ? 'text-emerald-600' :
                            occupancyRate >= 50 ? 'text-amber-600' : 'text-rose-600'
                          )}>{formatPercent(occupancyRate)}</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${occupancyRate}%` }}
                            transition={{ duration: 0.5 }}
                            className={cn(
                              'h-full rounded-full',
                              occupancyRate >= 80 ? 'bg-emerald-500' :
                              occupancyRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                            )}
                          />
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-2xl font-bold text-gray-900">{selectedProperty.unit_count || 0}</p>
                            <p className="text-xs text-gray-500">Created Units</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-emerald-600">{occupiedUnits}</p>
                            <p className="text-xs text-gray-500">Occupied</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-rose-500">{(selectedProperty.unit_count || 0) - occupiedUnits}</p>
                            <p className="text-xs text-gray-500">Vacant</p>
                          </div>
                        </div>
                      </div>

                      {/* Managers Section */}
                      <div className="mt-6 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-sm font-medium text-indigo-700 flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Property Managers
                          </span>
                          <button
                            onClick={() => setShowManagerModal(true)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Manage
                          </button>
                        </div>
                        {selectedProperty.managers_list && selectedProperty.managers_list.length > 0 ? (
                          <div className="space-y-2">
                            {selectedProperty.managers_list.map((mgr: PropertyManager) => (
                              <div key={mgr.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center">
                                    <span className="text-xs font-medium text-indigo-600">
                                      {mgr.name.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                  <span className="text-sm text-gray-700">{mgr.name}</span>
                                </div>
                                {mgr.is_primary && (
                                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Primary</span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500">No managers assigned yet</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="mt-6 flex gap-3">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => setShowDetailsModal(false)}
                        >
                          Close
                        </Button>
                        <Button
                          className="flex-1"
                          onClick={() => {
                            setShowDetailsModal(false)
                            handleEdit(selectedProperty)
                          }}
                        >
                          <Edit2 className="w-4 h-4 mr-2" />
                          Edit Property
                        </Button>
                      </div>
                    </div>
                  </>
                )
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create/Edit Modal */}
      <Modal
        open={showForm}
        onClose={resetForm}
        title={editingId ? 'Edit Property' : 'Add New Property'}
        icon={editingId ? Edit2 : Plus}
      >
        <PropertyForm
          initialValues={form}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isPending}
          onCancel={resetForm}
        />
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false)
          setSelectedProperty(null)
        }}
        onConfirm={() => selectedProperty && deleteMutation.mutate(selectedProperty.id)}
        title="Delete Property"
        description={`Are you sure you want to delete "${selectedProperty?.name}"? This will also remove all associated units and lease data.`}
        confirmText="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />

      {/* Generate Units Modal */}
      <Modal
        open={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        title="Generate Units"
        icon={Wand2}
      >
        <div className="space-y-4">
          {/* Preview Section */}
          {previewLoading ? (
            <div className="p-4 bg-gray-50 rounded-xl animate-pulse">
              <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
              <div className="h-20 bg-gray-200 rounded" />
            </div>
          ) : previewData ? (
            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">Unit Preview</span>
                <span className="text-xs text-gray-500">
                  Definition: <code className="bg-white px-1 rounded">{previewData.unit_definition}</code>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="text-center p-3 bg-white rounded-lg">
                  <p className="text-2xl font-bold text-primary-600">{previewData.create_count}</p>
                  <p className="text-xs text-gray-500">Units to Create</p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg">
                  <p className="text-2xl font-bold text-gray-400">{previewData.existing_count}</p>
                  <p className="text-xs text-gray-500">Already Exist</p>
                </div>
              </div>

              {previewData.create_count > 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Ready to generate {previewData.create_count} new units</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>All {previewData.total_defined} units already exist</span>
                </div>
              )}

              {previewData.to_create.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Units to be created:</p>
                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                    {previewData.to_create.slice(0, 30).map((unit: string) => (
                      <span key={unit} className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded">
                        {unit}
                      </span>
                    ))}
                    {previewData.to_create.length > 30 && (
                      <span className="text-xs text-gray-400">+{previewData.to_create.length - 30} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
              <div className="flex items-center gap-2 text-amber-700">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">No unit definition set for this property</span>
              </div>
            </div>
          )}

          {/* Configuration */}
          {previewData && previewData.create_count > 0 && (
            <>
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Default Unit Settings</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Default Rent"
                    type="number"
                    placeholder="0"
                    value={generateForm.default_rent}
                    onChange={(e) => setGenerateForm({ ...generateForm, default_rent: e.target.value })}
                  />
                  <Select
                    label="Currency"
                    value={generateForm.currency}
                    onChange={(e) => setGenerateForm({ ...generateForm, currency: e.target.value })}
                  >
                    <option value="USD">USD</option>
                    <option value="ZWL">ZWL</option>
                    <option value="ZAR">ZAR</option>
                  </Select>
                </div>
                <Select
                  label="Unit Type"
                  value={generateForm.unit_type}
                  onChange={(e) => setGenerateForm({ ...generateForm, unit_type: e.target.value })}
                  className="mt-3"
                >
                  <option value="apartment">Apartment</option>
                  <option value="office">Office</option>
                  <option value="shop">Shop</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="parking">Parking Bay</option>
                  <option value="storage">Storage Unit</option>
                </Select>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setShowGenerateModal(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={!previewData || previewData.create_count === 0 || generateUnitsMutation.isPending}
              onClick={handleGenerateUnits}
            >
              {generateUnitsMutation.isPending ? 'Generating...' : `Generate ${previewData?.create_count || 0} Units`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Manager Assignment Modal */}
      <Modal
        open={showManagerModal}
        onClose={() => {
          setShowManagerModal(false)
          setSelectedManagerUserId('')
          setManagerIsPrimary(false)
        }}
        title="Manage Property Managers"
        icon={Users}
      >
        <div className="space-y-4">
          {/* Current Managers */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Current Managers</h4>
            {propertyManagers && propertyManagers.length > 0 ? (
              <div className="space-y-2">
                {propertyManagers.map((mgr: any) => (
                  <div key={mgr.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                        <span className="text-sm font-medium text-indigo-600">
                          {(mgr.user_name || mgr.user_email || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{mgr.user_name || mgr.user_email}</p>
                        {mgr.user_email && <p className="text-xs text-gray-500">{mgr.user_email}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {mgr.is_primary && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Primary</span>
                      )}
                      <button
                        onClick={() => removeManagerMutation.mutate(mgr.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove manager"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-2">No managers assigned</p>
            )}
          </div>

          {/* Assign New Manager */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Assign New Manager</h4>
            <AsyncSelect
              label="Staff Member"
              placeholder="Select a staff member"
              value={selectedManagerUserId}
              onChange={(val) => setSelectedManagerUserId(String(val))}
              options={staffUsers?.filter((u: any) => {
                const assignedIds = propertyManagers?.map((m: any) => m.user) || []
                return !assignedIds.includes(u.id)
              }).map((u: any) => ({
                value: u.id,
                label: `${u.first_name} ${u.last_name} (${u.email})`,
                description: u.role,
              })) || []}
              isLoading={staffLoading}
              searchable
              emptyMessage="No staff members available"
            />

            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={managerIsPrimary}
                onChange={(e) => setManagerIsPrimary(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Set as primary manager</span>
            </label>

            <Button
              className="w-full mt-3 gap-2"
              disabled={!selectedManagerUserId || assignManagerMutation.isPending}
              onClick={() => {
                if (selectedProperty && selectedManagerUserId) {
                  assignManagerMutation.mutate({
                    user: parseInt(selectedManagerUserId, 10),
                    property: selectedProperty.id,
                    is_primary: managerIsPrimary,
                  })
                }
              }}
            >
              <UserPlus className="w-4 h-4" />
              {assignManagerMutation.isPending ? 'Assigning...' : 'Assign Manager'}
            </Button>
          </div>

          <div className="flex pt-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowManagerModal(false)
                setSelectedManagerUserId('')
                setManagerIsPrimary(false)
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selection.selectedCount}
        onClearSelection={selection.clearSelection}
        entityName="properties"
        actions={[
          { label: 'Export', icon: Download, onClick: handleBulkExport, variant: 'outline' },
          { label: 'Delete', icon: Trash2, onClick: handleBulkDelete, variant: 'danger' },
        ]}
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={bulkDeleteConfirm.open}
        onClose={() => setBulkDeleteConfirm(d => ({ ...d, open: false }))}
        onConfirm={bulkDeleteConfirm.onConfirm}
        title={bulkDeleteConfirm.title}
        message={bulkDeleteConfirm.message}
        type="danger"
        confirmText="Confirm"
      />
    </div>
  )
}
