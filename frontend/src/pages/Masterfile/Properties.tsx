import { useState } from 'react'
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
  Users,
  Briefcase,
  Factory,
  Layers,
  DoorOpen,
  TrendingUp,
  TrendingDown,
  Eye,
  BarChart3,
} from 'lucide-react'
import { propertyApi, landlordApi } from '../../services/api'
import { formatPercent, cn, useDebounce } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Textarea, Badge, EmptyState, Skeleton, ConfirmDialog } from '../../components/ui'
import toast from 'react-hot-toast'

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
  vacancy_rate: number
  created_at: string
}

const propertyTypeConfig = {
  residential: {
    icon: Home,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    gradientFrom: 'from-blue-500',
    gradientTo: 'to-blue-600',
    label: 'Residential',
  },
  commercial: {
    icon: Briefcase,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    gradientFrom: 'from-purple-500',
    gradientTo: 'to-purple-600',
    label: 'Commercial',
  },
  industrial: {
    icon: Factory,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-amber-600',
    label: 'Industrial',
  },
  mixed: {
    icon: Layers,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-emerald-600',
    label: 'Mixed Use',
  },
}

function SkeletonProperties() {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <Skeleton className="h-36 w-full" />
            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-between">
                <Skeleton className="h-10 w-20" />
                <Skeleton className="h-10 w-20" />
                <Skeleton className="h-10 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Properties() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    landlord: '',
    name: '',
    property_type: 'residential',
    address: '',
    city: 'Harare',
    total_units: 1,
  })

  const { data: properties, isLoading } = useQuery({
    queryKey: ['properties', debouncedSearch],
    queryFn: () => propertyApi.list({ search: debouncedSearch }).then(r => r.data.results || r.data),
  })

  const { data: landlords } = useQuery({
    queryKey: ['landlords-select'],
    queryFn: () => landlordApi.list().then(r => r.data.results || r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      editingId ? propertyApi.update(editingId, data) : propertyApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      toast.success(editingId ? 'Property updated successfully' : 'Property created successfully')
      resetForm()
    },
    onError: () => toast.error('Failed to save property'),
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
    })
    setShowForm(true)
  }

  const handleDelete = (property: Property) => {
    setSelectedProperty(property)
    setShowDeleteDialog(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(form)
  }

  const filteredProperties = properties?.filter((property: Property) => {
    const matchesType = !typeFilter || property.property_type === typeFilter
    return matchesType
  }) || []

  // Stats
  const totalUnits = properties?.reduce((sum: number, p: Property) => sum + (p.unit_count || 0), 0) || 0
  const totalVacant = properties?.reduce((sum: number, p: Property) => {
    return sum + Math.round((p.unit_count || 0) * (p.vacancy_rate || 0) / 100)
  }, 0) || 0
  const avgVacancy = properties?.length
    ? properties.reduce((sum: number, p: Property) => sum + (p.vacancy_rate || 0), 0) / properties.length
    : 0

  const stats = {
    total: properties?.length || 0,
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
        icon={Building2}
        actions={
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Property
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <motion.div
          whileHover={{ y: -2 }}
          className="bg-white rounded-xl border border-gray-200 p-5"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Properties</p>
              {isLoading ? (
                <div className="h-8 w-12 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              )}
            </div>
          </div>
        </motion.div>

        {Object.entries(propertyTypeConfig).map(([type, config]) => {
          const TypeIcon = config.icon
          const count = stats[type as keyof typeof stats] || 0
          return (
            <motion.div
              key={type}
              whileHover={{ y: -2 }}
              onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
              className={cn(
                'bg-white rounded-xl border p-5 cursor-pointer transition-all',
                typeFilter === type ? 'border-primary-300 ring-1 ring-primary-300' : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <div className="flex items-center gap-4">
                <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', config.bgColor)}>
                  <TypeIcon className={cn('w-6 h-6', config.color)} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{config.label}</p>
                  {isLoading ? (
                    <div className="h-8 w-12 bg-gray-200 rounded animate-pulse mt-1" />
                  ) : (
                    <p className={cn('text-2xl font-bold', config.color)}>{count}</p>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white">
          <div className="flex items-center gap-3">
            <DoorOpen className="w-8 h-8 text-white/80" />
            <div>
              <p className="text-blue-100 text-sm">Total Units</p>
              {isLoading ? (
                <div className="h-9 w-16 bg-white/30 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-3xl font-bold">{totalUnits}</p>
              )}
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-5 text-white">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-white/80" />
            <div>
              <p className="text-emerald-100 text-sm">Occupied</p>
              {isLoading ? (
                <div className="h-9 w-16 bg-white/30 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-3xl font-bold">{totalUnits - totalVacant}</p>
              )}
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl p-5 text-white">
          <div className="flex items-center gap-3">
            <TrendingDown className="w-8 h-8 text-white/80" />
            <div>
              <p className="text-rose-100 text-sm">Avg. Vacancy Rate</p>
              {isLoading ? (
                <div className="h-9 w-16 bg-white/30 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-3xl font-bold">{formatPercent(avgVacancy)}</p>
              )}
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
            onChange={(e) => setSearch(e.target.value)}
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

      {/* Property Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="h-36 bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center relative">
                <Home className="w-16 h-16 text-white/30" />
                <div className="absolute top-4 left-4">
                  <span className="px-3 py-1.5 bg-white/20 backdrop-blur rounded-lg text-white text-xs font-medium">
                    Loading...
                  </span>
                </div>
                <div className="absolute top-4 right-4 flex gap-2">
                  <button className="p-2 bg-white/20 backdrop-blur rounded-lg text-white/50">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button className="p-2 bg-white/20 backdrop-blur rounded-lg text-white/50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-5">
                <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-500">Occupancy</span>
                    <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full w-0 bg-gray-300 rounded-full" />
                  </div>
                </div>
                <div className="mt-5 pt-5 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="h-7 w-8 bg-gray-200 rounded animate-pulse mx-auto" />
                    <p className="text-xs text-gray-500 mt-1">Total Units</p>
                  </div>
                  <div>
                    <div className="h-7 w-8 bg-gray-200 rounded animate-pulse mx-auto" />
                    <p className="text-xs text-gray-500 mt-1">Occupied</p>
                  </div>
                  <div>
                    <div className="h-7 w-8 bg-gray-200 rounded animate-pulse mx-auto" />
                    <p className="text-xs text-gray-500 mt-1">Vacant</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredProperties.length === 0 ? (
        <EmptyState
          icon={Building2}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProperties.map((property: Property, index: number) => {
            const config = propertyTypeConfig[property.property_type] || propertyTypeConfig.residential
            const TypeIcon = config.icon
            const occupancyRate = 100 - (property.vacancy_rate || 0)
            const occupiedUnits = Math.round((property.unit_count || 0) * occupancyRate / 100)

            return (
              <motion.div
                key={property.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-gray-300 transition-all group"
              >
                {/* Header Banner */}
                <div className={cn(
                  'h-36 bg-gradient-to-br flex items-center justify-center relative',
                  config.gradientFrom, config.gradientTo
                )}>
                  <TypeIcon className="w-16 h-16 text-white/30" />
                  <div className="absolute top-4 left-4">
                    <span className="px-3 py-1.5 bg-white/20 backdrop-blur rounded-lg text-white text-xs font-medium">
                      {config.label}
                    </span>
                  </div>
                  <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEdit(property)}
                      className="p-2 bg-white/20 backdrop-blur hover:bg-white/30 rounded-lg text-white transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(property)}
                      className="p-2 bg-white/20 backdrop-blur hover:bg-red-500/50 rounded-lg text-white transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5">
                  <h3 className="font-semibold text-gray-900 text-lg">{property.name}</h3>

                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span>{property.address || property.city}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span>{property.landlord_name}</span>
                    </div>
                  </div>

                  {/* Occupancy Bar */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-500">Occupancy</span>
                      <span className="font-semibold text-gray-900">{formatPercent(occupancyRate)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${occupancyRate}%` }}
                        transition={{ duration: 0.8, delay: index * 0.1 }}
                        className={cn(
                          'h-full rounded-full',
                          occupancyRate >= 80 ? 'bg-emerald-500' :
                          occupancyRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                        )}
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="mt-5 pt-5 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xl font-bold text-gray-900">{property.unit_count || 0}</p>
                      <p className="text-xs text-gray-500">Total Units</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-emerald-600">{occupiedUnits}</p>
                      <p className="text-xs text-gray-500">Occupied</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-rose-500">{(property.unit_count || 0) - occupiedUnits}</p>
                      <p className="text-xs text-gray-500">Vacant</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

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
    </div>
  )
}
