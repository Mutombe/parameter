import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
} from 'lucide-react'
import { propertyApi, landlordApi } from '../../services/api'
import { formatPercent, cn, useDebounce } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Badge, EmptyState, ConfirmDialog, Pagination } from '../../components/ui'
import toast from 'react-hot-toast'
import { PiBuildingApartmentLight } from "react-icons/pi"
import { TbUserSquareRounded } from "react-icons/tb"

const PAGE_SIZE = 12

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
    }).then(r => {
      console.log('Properties API response:', r.data)
      return r.data
    }),
  })

  // Log error if any
  if (error) {
    console.error('Properties fetch error:', error)
  }

  // Handle both paginated and non-paginated responses
  const properties = propertiesData?.results || propertiesData || []
  const totalCount = propertiesData?.count || properties.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // Debug logging
  console.log('Properties Debug:', {
    propertiesData,
    propertiesType: typeof propertiesData,
    isArray: Array.isArray(propertiesData),
    hasResults: !!propertiesData?.results,
    results: propertiesData?.results,
    properties,
    propertiesLength: properties.length,
    totalCount,
    isLoading,
    error
  })

  const { data: landlords } = useQuery({
    queryKey: ['landlords-select'],
    queryFn: () => landlordApi.list().then(r => r.data.results || r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: { landlord: number; name: string; property_type: string; address: string; city: string; total_units: number; unit_definition: string }) =>
      editingId ? propertyApi.update(editingId, data) : propertyApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      toast.success(editingId ? 'Property updated successfully' : 'Property created successfully')
      resetForm()
    },
    onError: (error: any) => {
      const message = error?.response?.data?.detail
        || error?.response?.data?.message
        || Object.values(error?.response?.data || {})[0]
        || 'Failed to save property'
      toast.error(Array.isArray(message) ? message[0] : message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => propertyApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      toast.success('Property deleted')
      setShowDeleteDialog(false)
      setSelectedProperty(null)
    },
    onError: () => toast.error('Failed to delete property'),
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
      toast.success(`Created ${response.data.created_count} units successfully`)
      setShowGenerateModal(false)
      setShowDetailsModal(false)
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to generate units'
      toast.error(message)
    },
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
    setSelectedProperty(property)
    setShowDetailsModal(true)
  }

  // Handle "view" query parameter from search navigation
  useEffect(() => {
    const viewId = searchParams.get('view')
    if (viewId && properties.length > 0) {
      const property = properties.find((p: Property) => String(p.id) === viewId)
      if (property) {
        setSelectedProperty(property)
        setShowDetailsModal(true)
        // Clear the view param from URL
        searchParams.delete('view')
        setSearchParams(searchParams, { replace: true })
      }
    }
  }, [searchParams, properties, setSearchParams])

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Properties"
        subtitle="Manage buildings and property portfolios"
        icon={PiBuildingApartmentLight}
        actions={
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Property
          </Button>
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
            type="text"
            placeholder="Search properties..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all"
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

        <div className="ml-auto text-sm text-gray-500">
          {isLoading ? (
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
          ) : (
            <>{filteredProperties.length} properties</>
          )}
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
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all group"
              >
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
                  <span className={cn(
                    'hidden sm:inline-flex px-2.5 py-1 rounded-full text-xs font-medium',
                    config.bgColor, config.color
                  )}>
                    {config.label}
                  </span>

                  {/* Landlord */}
                  <div className="hidden md:flex items-center gap-2 text-sm text-gray-600 min-w-[120px]">
                    <TbUserSquareRounded className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{property.landlord_name}</span>
                  </div>

                  {/* Units */}
                  <div className="hidden lg:flex items-center gap-4 text-sm">
                    <div className="text-center min-w-[60px]">
                      <span className="font-semibold text-gray-900">{property.unit_count || 0}</span>
                      <span className="text-gray-400 ml-1">units</span>
                    </div>
                  </div>

                  {/* Occupancy Bar */}
                  <div className="hidden xl:flex flex-col min-w-[100px]">
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
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <TbUserSquareRounded className="w-4 h-4 text-gray-400" />
                          <span>Owned by {selectedProperty.landlord_name}</span>
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
        <form onSubmit={handleSubmit} className="space-y-5">
          <Select
            label="Landlord"
            value={form.landlord}
            onChange={(e) => setForm({ ...form, landlord: e.target.value })}
            required
          >
            <option value="">Select a landlord</option>
            {landlords?.map((l: any) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>

          <Input
            label="Property Name"
            placeholder="e.g., Sunrise Apartments"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Property Type"
              value={form.property_type}
              onChange={(e) => setForm({ ...form, property_type: e.target.value })}
            >
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
              <option value="industrial">Industrial</option>
              <option value="mixed">Mixed Use</option>
            </Select>

            <Input
              type="number"
              label="Total Units"
              placeholder="1"
              min="1"
              value={form.total_units}
              onChange={(e) => setForm({ ...form, total_units: parseInt(e.target.value) || 1 })}
            />
          </div>

          <Input
            label="Address"
            placeholder="123 Main Street"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            required
          />

          <Input
            label="City"
            placeholder="Harare"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />

          <div>
            <Input
              label="Unit Definition"
              placeholder="e.g., 1-17 or A1-A20; B1-B15"
              value={form.unit_definition}
              onChange={(e) => setForm({ ...form, unit_definition: e.target.value })}
            />
            <p className="mt-1 text-xs text-gray-500">
              Define unit ranges using formats like "1-17" (numeric) or "A1-A20; B1-B15" (alphanumeric).
              Units can be auto-generated after property creation.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={resetForm}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving...' : editingId ? 'Update Property' : 'Add Property'}
            </Button>
          </div>
        </form>
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
    </div>
  )
}
