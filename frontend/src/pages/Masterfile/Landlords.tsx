import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  Edit2,
  Trash2,
  Eye,
  Briefcase,
  Shield,
  Home,
  Percent,
  X,
} from 'lucide-react'
import { landlordApi } from '../../services/api'
import { cn, useDebounce } from '../../lib/utils'
import { PageHeader, Modal, Button, Input, Select, Textarea, Badge, EmptyState, ConfirmDialog, Pagination } from '../../components/ui'
import toast from 'react-hot-toast'
import { TbUserSquareRounded } from "react-icons/tb"

const PAGE_SIZE = 12

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

export default function Landlords() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
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

  // Reset page when search/filter changes
  const handleSearchChange = (value: string) => {
    setSearch(value)
    setCurrentPage(1)
  }

  const { data: landlordsData, isLoading } = useQuery({
    queryKey: ['landlords', debouncedSearch, currentPage],
    queryFn: () => landlordApi.list({
      search: debouncedSearch,
      page: currentPage,
      page_size: PAGE_SIZE
    }).then(r => r.data),
  })

  // Handle both paginated and non-paginated responses
  const landlords = landlordsData?.results || landlordsData || []
  const totalCount = landlordsData?.count || landlords.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

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

  const handleViewDetails = (landlord: Landlord) => {
    setSelectedLandlord(landlord)
    setShowDetailsModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(form)
  }

  const filteredLandlords = typeFilter
    ? landlords.filter((l: Landlord) => l.landlord_type === typeFilter)
    : landlords

  // Stats
  const stats = {
    total: totalCount || 0,
    individuals: landlords?.filter((l: Landlord) => l.landlord_type === 'individual').length || 0,
    companies: landlords?.filter((l: Landlord) => l.landlord_type === 'company').length || 0,
    trusts: landlords?.filter((l: Landlord) => l.landlord_type === 'trust').length || 0,
    totalProperties: landlords?.reduce((sum: number, l: Landlord) => sum + (l.property_count || 0), 0) || 0,
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

      {/* Stats Row - Compact */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
              <TbUserSquareRounded className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-xl font-bold text-gray-900">{isLoading ? '-' : stats.total}</p>
            </div>
          </div>
        </div>

        {Object.entries(landlordTypeConfig).map(([type, config]) => {
          const TypeIcon = config.icon
          const countKey = type === 'individual' ? 'individuals' : type === 'company' ? 'companies' : 'trusts'
          const count = stats[countKey as keyof typeof stats] || 0
          return (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
              className={cn(
                'bg-white rounded-xl border p-4 text-left transition-all',
                typeFilter === type
                  ? 'border-primary-300 ring-1 ring-primary-300'
                  : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', config.bgColor)}>
                  <TypeIcon className={cn('w-5 h-5', config.color)} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{config.label}s</p>
                  <p className={cn('text-xl font-bold', config.color)}>{isLoading ? '-' : count}</p>
                </div>
              </div>
            </button>
          )
        })}

        <div className="bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl p-4 text-white">
          <div className="flex items-center gap-3">
            <Home className="w-6 h-6 text-white/80" />
            <div>
              <p className="text-primary-100 text-xs">Properties</p>
              <p className="text-xl font-bold">{isLoading ? '-' : stats.totalProperties}</p>
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
            placeholder="Search by name, email, or phone..."
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

      {/* Landlords List - Compact Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-gray-200 rounded" />
                  <div className="h-3 w-48 bg-gray-100 rounded" />
                </div>
                <div className="h-6 w-20 bg-gray-200 rounded-full" />
                <div className="h-4 w-24 bg-gray-200 rounded" />
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
        <div className="space-y-2">
          {filteredLandlords.map((landlord: Landlord, index: number) => {
            const config = landlordTypeConfig[landlord.landlord_type] || landlordTypeConfig.individual
            const TypeIcon = config.icon

            return (
              <motion.div
                key={landlord.id}
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

                  {/* Name & Email */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{landlord.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Mail className="w-3 h-3" />
                      <span className="truncate">{landlord.email}</span>
                    </div>
                  </div>

                  {/* Type Badge */}
                  <span className={cn(
                    'hidden sm:inline-flex px-2.5 py-1 rounded-full text-xs font-medium',
                    config.bgColor, config.color
                  )}>
                    {config.label}
                  </span>

                  {/* Phone */}
                  <div className="hidden md:flex items-center gap-2 text-sm text-gray-600 min-w-[130px]">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{landlord.phone}</span>
                  </div>

                  {/* Properties Count */}
                  <div className="hidden lg:flex items-center gap-2 text-sm min-w-[80px]">
                    <Home className="w-4 h-4 text-gray-400" />
                    <span className="font-semibold text-gray-900">{landlord.property_count || 0}</span>
                    <span className="text-gray-400">props</span>
                  </div>

                  {/* Commission Rate */}
                  <div className="hidden xl:flex items-center gap-1 min-w-[70px]">
                    <Percent className="w-4 h-4 text-primary-500" />
                    <span className="text-sm font-semibold text-primary-600">{landlord.commission_rate}%</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleViewDetails(landlord)}
                      className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title="View details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEdit(landlord)}
                      className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(landlord)}
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
        {showDetailsModal && selectedLandlord && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
            >
              {(() => {
                const config = landlordTypeConfig[selectedLandlord.landlord_type] || landlordTypeConfig.individual
                const TypeIcon = config.icon

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
                      <h2 className="text-xl font-bold text-gray-900">{selectedLandlord.name}</h2>

                      <div className="mt-4 space-y-3">
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                            <Mail className="w-4 h-4 text-gray-400" />
                          </div>
                          <span>{selectedLandlord.email}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                            <Phone className="w-4 h-4 text-gray-400" />
                          </div>
                          <span>{selectedLandlord.phone}</span>
                        </div>
                        {selectedLandlord.address && (
                          <div className="flex items-center gap-3 text-sm text-gray-600">
                            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                              <MapPin className="w-4 h-4 text-gray-400" />
                            </div>
                            <span>{selectedLandlord.address}</span>
                          </div>
                        )}
                      </div>

                      {/* Stats Section */}
                      <div className="mt-6 grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 rounded-xl text-center">
                          <p className="text-2xl font-bold text-gray-900">{selectedLandlord.property_count || 0}</p>
                          <p className="text-xs text-gray-500 mt-1">Properties</p>
                        </div>
                        <div className="p-4 bg-primary-50 rounded-xl text-center">
                          <p className="text-2xl font-bold text-primary-600">{selectedLandlord.commission_rate}%</p>
                          <p className="text-xs text-gray-500 mt-1">Commission Rate</p>
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
                            handleEdit(selectedLandlord)
                          }}
                        >
                          <Edit2 className="w-4 h-4 mr-2" />
                          Edit Landlord
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
