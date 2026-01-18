import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Users, Phone, Mail, Trash2, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { tenantApi } from '../../services/api'
import { useDebounce } from '../../lib/utils'
import { Pagination } from '../../components/ui'
import toast from 'react-hot-toast'
import { PiUsersFour } from "react-icons/pi";
import { TbUserSquareRounded } from "react-icons/tb";

const PAGE_SIZE = 12

export default function Tenants() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [currentPage, setCurrentPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    name: '',
    tenant_type: 'individual',
    email: '',
    phone: '',
    id_type: 'national_id',
    id_number: '',
  })

  // Reset to page 1 when search changes
  const handleSearchChange = (value: string) => {
    setSearch(value)
    setCurrentPage(1)
  }

  const { data: tenantsData, isLoading } = useQuery({
    queryKey: ['tenants', debouncedSearch, currentPage],
    queryFn: () => tenantApi.list({
      search: debouncedSearch,
      page: currentPage,
      page_size: PAGE_SIZE
    }).then(r => r.data),
  })

  // Handle both paginated and non-paginated responses
  const tenants = tenantsData?.results || tenantsData || []
  const totalCount = tenantsData?.count || tenants.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => tenantApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      toast.success('Tenant created')
      setShowForm(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tenantApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      toast.success('Tenant deleted')
      setDeletingId(null)
    },
    onError: () => {
      toast.error('Failed to delete tenant')
      setDeletingId(null)
    },
  })

  const handleDelete = (id: number) => {
    setDeletingId(id)
    deleteMutation.mutate(id)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="text-gray-500 mt-1">Manage rental tenants</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="w-4 h-4 mr-2" /> Add Tenant
        </button>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search tenants..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="input pl-10"
            />
          </div>
          <p className="text-sm text-gray-500 ml-4">
            {totalCount} tenant{totalCount !== 1 ? 's' : ''} total
          </p>
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
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }} className="space-y-4">
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
                  <label className="label">Type</label>
                  <select value={form.tenant_type} onChange={(e) => setForm({ ...form, tenant_type: e.target.value })} className="input">
                    <option value="individual">Individual</option>
                    <option value="company">Company</option>
                  </select>
                </div>
                <div>
                  <label className="label">ID Type</label>
                  <select value={form.id_type} onChange={(e) => setForm({ ...form, id_type: e.target.value })} className="input">
                    <option value="national_id">National ID</option>
                    <option value="passport">Passport</option>
                    <option value="company_reg">Company Reg</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">ID Number</label>
                <input type="text" value={form.id_number} onChange={(e) => setForm({ ...form, id_number: e.target.value })} className="input" required />
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
        ) : tenants?.map((tenant: any) => (
            <div key={tenant.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                    <TbUserSquareRounded className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{tenant.name}</h3>
                    <span className="text-xs text-gray-500">{tenant.code}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(tenant.id)}
                  disabled={deletingId === tenant.id}
                  className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                >
                  {deletingId === tenant.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="w-4 h-4" /> {tenant.email}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4" /> {tenant.phone}
                </div>
              </div>
              {tenant.active_leases?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm text-green-600">
                    {tenant.active_leases.length} active lease(s)
                  </p>
                </div>
              )}
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
    </div>
  )
}
