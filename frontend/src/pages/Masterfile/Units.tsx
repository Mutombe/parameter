import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DoorOpen,
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  Check,
  X,
  Building2,
  DollarSign,
  User,
  Bed,
  Bath,
  Square,
} from 'lucide-react'
import { unitApi, propertyApi } from '../../services/api'
import { formatCurrency, cn, useDebounce } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Textarea, Badge, EmptyState, Skeleton, ConfirmDialog } from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'
import { PiBuildingApartmentLight } from "react-icons/pi";
import { TbUserSquareRounded } from "react-icons/tb";

interface Unit {
  id: number
  unit_number: string
  property: number
  property_name: string
  unit_type: 'studio' | 'apartment' | '1bed' | '2bed' | '3bed' | 'house' | 'commercial' | 'office'
  rental_amount: number
  deposit_amount: number
  currency: string
  bedrooms: number
  bathrooms: number
  square_meters: number
  floor_number: number
  is_occupied: boolean
  is_active: boolean
  description: string
  current_tenant?: { id: number; name: string }
}

interface Property {
  id: number
  name: string
  code: string
}

const unitTypeConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  studio: { label: 'Studio', color: 'text-purple-600', bgColor: 'bg-purple-50' },
  apartment: { label: 'Apartment', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  '1bed': { label: '1 Bedroom', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  '2bed': { label: '2 Bedroom', color: 'text-cyan-600', bgColor: 'bg-cyan-50' },
  '3bed': { label: '3 Bedroom', color: 'text-amber-600', bgColor: 'bg-amber-50' },
  house: { label: 'House', color: 'text-rose-600', bgColor: 'bg-rose-50' },
  commercial: { label: 'Commercial', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  office: { label: 'Office', color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
}

// Skeleton row component for table - only data cells have skeletons
function SkeletonTableRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
            <DoorOpen className="w-5 h-5 text-primary-600" />
          </div>
          <span className="h-4 w-16 bg-gray-200 rounded" />
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-400" />
          <span className="h-4 w-24 bg-gray-200 rounded" />
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="h-5 w-20 bg-gray-200 rounded-full inline-block" />
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-1">
          <DollarSign className="w-4 h-4 text-gray-400" />
          <span className="h-4 w-16 bg-gray-200 rounded" />
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="h-5 w-20 bg-gray-200 rounded-full inline-block" />
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <TbUserSquareRounded className="w-4 h-4 text-gray-400" />
          <span className="h-4 w-24 bg-gray-200 rounded" />
        </div>
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <button className="p-2 text-gray-300 rounded-lg">
            <Edit2 className="w-4 h-4" />
          </button>
          <button className="p-2 text-gray-300 rounded-lg">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function Units() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [filter, setFilter] = useState<'all' | 'occupied' | 'vacant'>('all')
  const [showForm, setShowForm] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    unit_number: '',
    property: '',
    unit_type: 'apartment',
    rental_amount: '',
    deposit_amount: '',
    currency: 'USD',
    bedrooms: '1',
    bathrooms: '1',
    square_meters: '',
    floor_number: '0',
    description: '',
    is_active: true,
  })

  const { data: units, isLoading } = useQuery({
    queryKey: ['units', debouncedSearch, filter],
    queryFn: () => {
      const params: any = { search: debouncedSearch }
      if (filter === 'occupied') params.is_occupied = true
      if (filter === 'vacant') params.is_occupied = false
      return unitApi.list(params).then(r => r.data.results || r.data)
    },
  })

  const { data: properties } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () => propertyApi.list().then(r => r.data.results || r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      editingId ? unitApi.update(editingId, data) : unitApi.create(data),
    onMutate: async (newData) => {
      const isUpdating = !!editingId
      resetForm()
      await queryClient.cancelQueries({ queryKey: ['units'] })
      const previousData = queryClient.getQueryData(['units', debouncedSearch, filter])

      if (!isUpdating) {
        const optimistic = {
          id: `temp-${Date.now()}`,
          unit_number: newData.unit_number,
          property: newData.property,
          property_name: properties?.find((p: Property) => p.id === newData.property)?.name || '',
          unit_type: newData.unit_type,
          rental_amount: newData.rental_amount,
          deposit_amount: newData.deposit_amount || 0,
          currency: newData.currency,
          bedrooms: newData.bedrooms,
          bathrooms: newData.bathrooms,
          square_meters: newData.square_meters,
          floor_number: newData.floor_number,
          is_occupied: false,
          is_active: true,
          description: newData.description,
          _isOptimistic: true,
        }
        queryClient.setQueryData(['units', debouncedSearch, filter], (old: any) => {
          const items = old || []
          return [optimistic, ...items]
        })
      } else {
        queryClient.setQueryData(['units', debouncedSearch, filter], (old: any) => {
          const items = old || []
          return items.map((item: any) =>
            item.id === editingId ? { ...item, ...newData, _isOptimistic: true } : item
          )
        })
      }
      return { previousData, isUpdating }
    },
    onSuccess: (_, __, context) => {
      showToast.success(context?.isUpdating ? 'Unit updated successfully' : 'Unit created successfully')
      queryClient.invalidateQueries({ queryKey: ['units'] })
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['units', debouncedSearch, filter], context.previousData)
      }
      showToast.error(parseApiError(error, 'Failed to save unit'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => unitApi.delete(id),
    onMutate: async (id) => {
      setShowDeleteDialog(false)
      await queryClient.cancelQueries({ queryKey: ['units'] })
      const previousData = queryClient.getQueryData(['units', debouncedSearch, filter])
      queryClient.setQueryData(['units', debouncedSearch, filter], (old: any) => {
        const items = old || []
        return items.filter((item: any) => item.id !== id)
      })
      return { previousData }
    },
    onSuccess: () => {
      showToast.success('Unit deleted')
      queryClient.invalidateQueries({ queryKey: ['units'] })
      setSelectedUnit(null)
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['units', debouncedSearch, filter], context.previousData)
      }
      showToast.error(parseApiError(error, 'Failed to delete unit'))
    },
  })

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm({
      unit_number: '',
      property: '',
      unit_type: 'apartment',
      rental_amount: '',
      deposit_amount: '',
      currency: 'USD',
      bedrooms: '1',
      bathrooms: '1',
      square_meters: '',
      floor_number: '0',
      description: '',
      is_active: true,
    })
  }

  const handleEdit = (unit: Unit) => {
    setEditingId(unit.id)
    setForm({
      unit_number: unit.unit_number,
      property: String(unit.property),
      unit_type: unit.unit_type,
      rental_amount: String(unit.rental_amount),
      deposit_amount: String(unit.deposit_amount || ''),
      currency: unit.currency,
      bedrooms: String(unit.bedrooms),
      bathrooms: String(unit.bathrooms),
      square_meters: String(unit.square_meters || ''),
      floor_number: String(unit.floor_number || '0'),
      description: unit.description || '',
      is_active: unit.is_active,
    })
    setShowForm(true)
  }

  const handleDelete = (unit: Unit) => {
    setSelectedUnit(unit)
    setShowDeleteDialog(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      ...form,
      property: parseInt(form.property),
      rental_amount: parseFloat(form.rental_amount),
      deposit_amount: form.deposit_amount ? parseFloat(form.deposit_amount) : null,
      bedrooms: parseInt(form.bedrooms),
      bathrooms: parseInt(form.bathrooms),
      square_meters: form.square_meters ? parseFloat(form.square_meters) : null,
      floor_number: parseInt(form.floor_number),
    }
    createMutation.mutate(data)
  }

  // Stats
  const stats = {
    total: units?.length || 0,
    occupied: units?.filter((u: Unit) => u.is_occupied).length || 0,
    vacant: units?.filter((u: Unit) => !u.is_occupied).length || 0,
    occupancyRate: units?.length
      ? Math.round((units.filter((u: Unit) => u.is_occupied).length / units.length) * 100)
      : 0,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Units"
        subtitle="Manage rentable units across properties"
        icon={DoorOpen}
        actions={
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Unit
          </Button>
        }
      />

      {/* Stats Cards - icons and labels always visible, only numbers show skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div whileHover={{ y: -2 }} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
              <DoorOpen className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Units</p>
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
          onClick={() => !isLoading && setFilter(filter === 'occupied' ? 'all' : 'occupied')}
          className={cn(
            'bg-white rounded-xl border p-5 cursor-pointer transition-all',
            filter === 'occupied' ? 'border-emerald-300 ring-1 ring-emerald-300' : 'border-gray-200 hover:border-gray-300'
          )}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Occupied</p>
              {isLoading ? (
                <div className="h-8 w-10 bg-emerald-100 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-bold text-emerald-600">{stats.occupied}</p>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2 }}
          onClick={() => !isLoading && setFilter(filter === 'vacant' ? 'all' : 'vacant')}
          className={cn(
            'bg-white rounded-xl border p-5 cursor-pointer transition-all',
            filter === 'vacant' ? 'border-rose-300 ring-1 ring-rose-300' : 'border-gray-200 hover:border-gray-300'
          )}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center">
              <X className="w-6 h-6 text-rose-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Vacant</p>
              {isLoading ? (
                <div className="h-8 w-10 bg-rose-100 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-bold text-rose-600">{stats.vacant}</p>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div whileHover={{ y: -2 }} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Occupancy Rate</p>
              {isLoading ? (
                <div className="h-8 w-14 bg-blue-100 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-bold text-blue-600">{stats.occupancyRate}%</p>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search units..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="flex gap-2">
          {(['all', 'occupied', 'vacant'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                filter === f
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="ml-auto text-sm text-gray-500">
          {units?.length || 0} units
        </div>
      </div>

      {/* Units Table - headers always visible */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Property</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rent</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tenant</th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              // Skeleton rows - icons visible, only data positions have skeleton
              [...Array(5)].map((_, i) => <SkeletonTableRow key={i} />)
            ) : !units || units.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12">
                  <EmptyState
                    icon={DoorOpen}
                    title="No units found"
                    description="Add your first unit to start managing rentable spaces."
                    action={
                      <Button onClick={() => setShowForm(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Unit
                      </Button>
                    }
                  />
                </td>
              </tr>
            ) : units.map((unit: Unit, index: number) => {
                const typeConfig = unitTypeConfig[unit.unit_type] || unitTypeConfig.apartment
                return (
                  <motion.tr
                    key={unit.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.02 }}
                    className="hover:bg-gray-50 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                          <DoorOpen className="w-5 h-5 text-primary-600" />
                        </div>
                        <span className="font-semibold text-gray-900">{unit.unit_number}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <PiBuildingApartmentLight className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">{unit.property_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium',
                        typeConfig.bgColor, typeConfig.color
                      )}>
                        {typeConfig.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4 text-gray-400" />
                        <span className="font-semibold text-gray-900">{formatCurrency(unit.rental_amount)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {unit.is_occupied ? (
                        <Badge variant="success" className="gap-1">
                          <Check className="w-3 h-3" /> Occupied
                        </Badge>
                      ) : (
                        <Badge variant="danger" className="gap-1">
                          <X className="w-3 h-3" /> Vacant
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {unit.current_tenant ? (
                        <div className="flex items-center gap-2">
                          <TbUserSquareRounded className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">{unit.current_tenant.name}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => navigate(`/dashboard/units/${unit.id}`)}
                          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(unit)}
                          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(unit)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
        title={editingId ? 'Edit Unit' : 'Add New Unit'}
        icon={editingId ? Edit2 : Plus}
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Unit Number"
              placeholder="A101"
              value={form.unit_number}
              onChange={(e) => setForm({ ...form, unit_number: e.target.value })}
              required
            />

            <Select
              label="Property"
              value={form.property}
              onChange={(e) => setForm({ ...form, property: e.target.value })}
              required
            >
              <option value="">Select Property</option>
              {properties?.map((p: Property) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Unit Type"
              value={form.unit_type}
              onChange={(e) => setForm({ ...form, unit_type: e.target.value })}
            >
              <option value="studio">Studio</option>
              <option value="apartment">Apartment</option>
              <option value="1bed">1 Bedroom</option>
              <option value="2bed">2 Bedroom</option>
              <option value="3bed">3 Bedroom</option>
              <option value="house">House</option>
              <option value="commercial">Commercial</option>
              <option value="office">Office</option>
            </Select>

            <Select
              label="Currency"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              <option value="USD">USD</option>
              <option value="ZiG">ZiG</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              type="number"
              label="Monthly Rent"
              placeholder="1000.00"
              step="0.01"
              min="0"
              value={form.rental_amount}
              onChange={(e) => setForm({ ...form, rental_amount: e.target.value })}
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
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="relative">
              <Input
                type="number"
                label="Bedrooms"
                min="0"
                value={form.bedrooms}
                onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
              />
              <Bed className="absolute right-3 top-9 w-4 h-4 text-gray-400" />
            </div>

            <div className="relative">
              <Input
                type="number"
                label="Bathrooms"
                min="0"
                value={form.bathrooms}
                onChange={(e) => setForm({ ...form, bathrooms: e.target.value })}
              />
              <Bath className="absolute right-3 top-9 w-4 h-4 text-gray-400" />
            </div>

            <div className="relative">
              <Input
                type="number"
                label="Size (m2)"
                min="0"
                value={form.square_meters}
                onChange={(e) => setForm({ ...form, square_meters: e.target.value })}
              />
              <Square className="absolute right-3 top-9 w-4 h-4 text-gray-400" />
            </div>
          </div>

          <Input
            type="number"
            label="Floor Number"
            min="0"
            value={form.floor_number}
            onChange={(e) => setForm({ ...form, floor_number: e.target.value })}
          />

          <Textarea
            label="Description"
            placeholder="Unit description..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
          />

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={resetForm}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving...' : editingId ? 'Update Unit' : 'Add Unit'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false)
          setSelectedUnit(null)
        }}
        onConfirm={() => selectedUnit && deleteMutation.mutate(selectedUnit.id)}
        title="Delete Unit"
        description={`Are you sure you want to delete unit "${selectedUnit?.unit_number}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
