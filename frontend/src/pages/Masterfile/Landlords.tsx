import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  Plus,
  Search,
  Building2,
  Phone,
  Mail,
  MapPin,
  Edit2,
  Trash2,
  MoreVertical,
  User,
  Briefcase,
  Shield,
  DollarSign,
  TrendingUp,
  Eye,
  FileText,
  Home,
  Percent,
} from 'lucide-react'
import { landlordApi } from '../../services/api'
import { formatCurrency, cn, useDebounce } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Textarea, Badge, EmptyState, Skeleton, ConfirmDialog } from '../../components/ui'
import toast from 'react-hot-toast'
import { SiFsecure } from "react-icons/si";
import { PiUsersFour } from "react-icons/pi";
import { TbUserSquareRounded } from "react-icons/tb";
import { PiBuildingApartmentLight } from "react-icons/pi";

interface Landlord {
  id: number
  name: string
  landlord_type: 'individual' | 'company' | 'trust'
  email: string
  phone: string
  address: string
  commission_rate: string
  property_count: number
  total_balance?: number
  created_at: string
}

const landlordTypeConfig = {
  individual: {
    icon: TbUserSquareRounded,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Individual',
  },
  company: {
    icon: Briefcase,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    label: 'Company',
  },
  trust: {
    icon: Shield,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    label: 'Trust',
  },
}

function SkeletonLandlords() {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
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
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start gap-4">
              <Skeleton className="w-14 h-14 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <div className="mt-5 pt-5 border-t border-gray-100">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Landlords() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedLandlord, setSelectedLandlord] = useState<Landlord | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    name: '',
    landlord_type: 'individual',
    email: '',
    phone: '',
    address: '',
    commission_rate: '10.00',
  })

  const { data: landlords, isLoading } = useQuery({
    queryKey: ['landlords', debouncedSearch],
    queryFn: () => landlordApi.list({ search: debouncedSearch }).then(r => r.data.results || r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      editingId ? landlordApi.update(editingId, data) : landlordApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landlords'] })
      toast.success(editingId ? 'Landlord updated successfully' : 'Landlord created successfully')
      resetForm()
    },
    onError: () => toast.error('Failed to save landlord'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => landlordApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landlords'] })
      toast.success('Landlord deleted')
      setShowDeleteDialog(false)
      setSelectedLandlord(null)
    },
    onError: () => toast.error('Failed to delete landlord'),
  })

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm({
      name: '',
      landlord_type: 'individual',
      email: '',
      phone: '',
      address: '',
      commission_rate: '10.00',
    })
  }

  const handleEdit = (landlord: Landlord) => {
    setEditingId(landlord.id)
    setForm({
      name: landlord.name,
      landlord_type: landlord.landlord_type,
      email: landlord.email,
      phone: landlord.phone,
      address: landlord.address,
      commission_rate: landlord.commission_rate,
    })
    setShowForm(true)
  }

  const handleDelete = (landlord: Landlord) => {
    setSelectedLandlord(landlord)
    setShowDeleteDialog(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(form)
  }

  const filteredLandlords = landlords?.filter((landlord: Landlord) => {
    const matchesType = !typeFilter || landlord.landlord_type === typeFilter
    return matchesType
  }) || []

  // Stats
  const stats = {
    total: landlords?.length || 0,
    individuals: landlords?.filter((l: Landlord) => l.landlord_type === 'individual').length || 0,
    companies: landlords?.filter((l: Landlord) => l.landlord_type === 'company').length || 0,
    trusts: landlords?.filter((l: Landlord) => l.landlord_type === 'trust').length || 0,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Landlords"
        subtitle="Manage property owners and their portfolios"
        icon={TbUserSquareRounded}
        actions={
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Landlord
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          whileHover={{ y: -2 }}
          className="bg-white rounded-xl border border-gray-200 p-5"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
              <TbUserSquareRounded className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Landlords</p>
              {isLoading ? (
                <div className="h-8 w-12 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              )}
            </div>
          </div>
        </motion.div>

        {Object.entries(landlordTypeConfig).map(([type, config]) => {
          const TypeIcon = config.icon
          const count = stats[`${type}s` as keyof typeof stats] || stats[type as keyof typeof stats] || 0
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
                  <p className="text-sm text-gray-500">{config.label}s</p>
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

      {/* Search and Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
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
            {landlordTypeConfig[typeFilter as keyof typeof landlordTypeConfig]?.label}
            <span className="text-xs">×</span>
          </Badge>
        )}

        <div className="ml-auto text-sm text-gray-500">
          {isLoading ? (
            <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
          ) : (
            <>{filteredLandlords.length} landlords</>
          )}
        </div>
      </div>

      {/* Landlord Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center">
                    <TbUserSquareRounded className="w-7 h-7 text-blue-600" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
                    <div className="h-6 w-20 bg-gray-200 rounded-full animate-pulse" />
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-2 text-gray-300 rounded-lg">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-gray-300 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                    <Phone className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
                </div>
              </div>
              <div className="mt-5 pt-5 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Home className="w-4 h-4 text-gray-400" />
                  <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-primary-500" />
                  <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredLandlords.length === 0 ? (
        <EmptyState
          icon={TbUserSquareRounded}
          title="No landlords found"
          description="Add your first landlord to start managing property owners."
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Landlord
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLandlords.map((landlord: Landlord, index: number) => {
            const config = landlordTypeConfig[landlord.landlord_type] || landlordTypeConfig.individual
            const TypeIcon = config.icon

            return (
              <motion.div
                key={landlord.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-gray-300 transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      'w-14 h-14 rounded-xl flex items-center justify-center',
                      config.bgColor
                    )}>
                      <TypeIcon className={cn('w-7 h-7', config.color)} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-lg">{landlord.name}</h3>
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium mt-1',
                        config.bgColor, config.color
                      )}>
                        <TypeIcon className="w-3 h-3" />
                        {config.label}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEdit(landlord)}
                      className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(landlord)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                      <Mail className="w-4 h-4 text-gray-400" />
                    </div>
                    <span className="truncate">{landlord.email}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                      <Phone className="w-4 h-4 text-gray-400" />
                    </div>
                    <span>{landlord.phone}</span>
                  </div>
                  {landlord.address && (
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                        <MapPin className="w-4 h-4 text-gray-400" />
                      </div>
                      <span className="truncate">{landlord.address}</span>
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-5 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Home className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">
                      {landlord.property_count || 0} Properties
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Percent className="w-4 h-4 text-primary-500" />
                    <span className="text-sm font-semibold text-primary-600">
                      {landlord.commission_rate}%
                    </span>
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
        title={editingId ? 'Edit Landlord' : 'Add New Landlord'}
        icon={editingId ? Edit2 : Plus}
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Full Name"
            placeholder="John Doe or Company Ltd"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type"
              value={form.landlord_type}
              onChange={(e) => setForm({ ...form, landlord_type: e.target.value })}
            >
              <option value="individual">Individual</option>
              <option value="company">Company</option>
              <option value="trust">Trust</option>
            </Select>

            <Input
              type="number"
              label="Commission Rate (%)"
              placeholder="10.00"
              step="0.01"
              min="0"
              max="100"
              value={form.commission_rate}
              onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              type="email"
              label="Email Address"
              placeholder="email@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />

            <Input
              label="Phone Number"
              placeholder="+263 77 123 4567"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />
          </div>

          <Textarea
            label="Address"
            placeholder="Physical address..."
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            rows={2}
          />

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={resetForm}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving...' : editingId ? 'Update Landlord' : 'Add Landlord'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false)
          setSelectedLandlord(null)
        }}
        onConfirm={() => selectedLandlord && deleteMutation.mutate(selectedLandlord.id)}
        title="Delete Landlord"
        description={`Are you sure you want to delete "${selectedLandlord?.name}"? This action cannot be undone and will remove all associated data.`}
        confirmText="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
