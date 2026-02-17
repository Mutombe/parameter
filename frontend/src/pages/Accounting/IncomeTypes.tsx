import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  DollarSign,
  MoreVertical,
  Edit2,
  Trash2,
  Check,
  X,
  Loader2,
  Sprout,
  Download,
} from 'lucide-react'
import { incomeTypeApi, accountApi } from '../../services/api'
import { cn } from '../../lib/utils'
import { showToast, parseApiError } from '../../lib/toast'
import { Modal, ModalFooter, SelectionCheckbox, BulkActionsBar } from '../../components/ui'
import { AsyncSelect } from '../../components/ui/AsyncSelect'
import { exportTableData } from '../../lib/export'
import { useSelection } from '../../hooks/useSelection'

interface IncomeType {
  id: number
  code: string
  name: string
  description: string
  gl_account: number | null
  gl_account_name: string
  is_commissionable: boolean
  default_commission_rate: string
  is_vatable: boolean
  vat_rate: string
  is_taxable: boolean
  default_rate: string
  is_active: boolean
  display_order: number
}

interface GLAccount {
  id: number
  code: string
  name: string
  account_type: string
}

const emptyForm = {
  name: '',
  description: '',
  gl_account: '' as string | number,
  is_commissionable: false,
  default_commission_rate: '0.00',
  is_vatable: false,
  vat_rate: '15.00',
  is_active: true,
  display_order: 0,
}

export default function IncomeTypes() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingType, setEditingType] = useState<IncomeType | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<IncomeType | null>(null)
  const [form, setForm] = useState(emptyForm)

  const selection = useSelection<number>({ clearOnChange: [searchQuery] })

  const { data, isLoading } = useQuery({
    queryKey: ['income-types'],
    queryFn: () => incomeTypeApi.list().then(r => r.data.results || r.data),
  })

  const { data: glAccounts } = useQuery({
    queryKey: ['gl-accounts-revenue'],
    queryFn: () => accountApi.list({ account_type: 'revenue' }).then(r => r.data.results || r.data),
  })

  const incomeTypes: IncomeType[] = data || []
  const revenueAccounts: GLAccount[] = glAccounts || []

  const filteredTypes = incomeTypes.filter(type =>
    type.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    type.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Reset form when modal opens/closes
  useEffect(() => {
    if (editingType) {
      setForm({
        name: editingType.name,
        description: editingType.description || '',
        gl_account: editingType.gl_account || '',
        is_commissionable: editingType.is_commissionable,
        default_commission_rate: editingType.default_commission_rate || '0.00',
        is_vatable: editingType.is_vatable,
        vat_rate: editingType.vat_rate || '15.00',
        is_active: editingType.is_active,
        display_order: editingType.display_order || 0,
      })
    } else if (showModal) {
      setForm(emptyForm)
    }
  }, [editingType, showModal])

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = {
        ...data,
        gl_account: data.gl_account || null,
        default_commission_rate: data.is_commissionable ? data.default_commission_rate : '0.00',
        vat_rate: data.is_vatable ? data.vat_rate : '0.00',
      }
      return editingType
        ? incomeTypeApi.update(editingType.id, payload)
        : incomeTypeApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['income-types'] })
      showToast.success(editingType ? 'Income type updated' : 'Income type created')
      closeModal()
    },
    onError: (error) => {
      showToast.error(parseApiError(error))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => incomeTypeApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['income-types'] })
      showToast.success('Income type deleted')
      setDeleteConfirm(null)
    },
    onError: (error) => {
      showToast.error(parseApiError(error))
      setDeleteConfirm(null)
    },
  })

  const seedMutation = useMutation({
    mutationFn: () => incomeTypeApi.seedDefaults(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['income-types'] })
      showToast.success('Default income types created')
    },
    onError: (error) => {
      showToast.error(parseApiError(error))
    },
  })

  const closeModal = () => {
    setShowModal(false)
    setEditingType(null)
    setForm(emptyForm)
  }

  const openEdit = (type: IncomeType) => {
    setEditingType(type)
    setShowModal(true)
    setDropdownOpen(null)
  }

  const openDelete = (type: IncomeType) => {
    setDeleteConfirm(type)
    setDropdownOpen(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      showToast.error('Name is required')
      return
    }
    saveMutation.mutate(form)
  }

  const getTypeColor = (code: string) => {
    const colors: Record<string, string> = {
      'RENT': 'bg-blue-100 text-blue-600',
      'LEVY': 'bg-purple-100 text-purple-600',
      'SPECIAL_LEVY': 'bg-indigo-100 text-indigo-600',
      'RATES': 'bg-amber-100 text-amber-600',
      'PARKING': 'bg-green-100 text-green-600',
      'VAT': 'bg-red-100 text-red-600',
    }
    return colors[code] || 'bg-gray-100 text-gray-600'
  }

  const selectableItems = (incomeTypes || []).filter((t: any) => !t._isOptimistic)
  const pageIds = selectableItems.map((t: any) => t.id)

  const handleBulkExport = () => {
    const selected = selectableItems.filter((t: any) => selection.isSelected(t.id))
    exportTableData(selected, [
      { key: 'name', header: 'Name' },
      { key: 'code', header: 'Code' },
      { key: 'description', header: 'Description' },
    ], 'income_types_export')
    showToast.success(`Exported ${selected.length} income types`)
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selection.selectedIds)
    for (const id of ids) { try { await incomeTypeApi.delete(id) } catch {} }
    selection.clearSelection()
    queryClient.invalidateQueries({ queryKey: ['income-types'] })
    showToast.success(`Deleted ${ids.length} income types`)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Income Types</h1>
          <p className="text-gray-500 mt-1">Manage income categories for billing</p>
        </div>
        <button
          onClick={() => { setEditingType(null); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          Add Income Type
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search income types..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
            />
          </div>
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
        </div>
      </div>

      {/* Types Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-10 w-10 bg-gray-200 rounded-lg mb-4" />
              <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-24 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      ) : filteredTypes.length === 0 && incomeTypes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No income types</h3>
          <p className="text-gray-500 mb-4">Add income types to categorize your billing.</p>
          <button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50"
          >
            {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sprout className="w-4 h-4" />}
            Seed Defaults
          </button>
        </div>
      ) : filteredTypes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No results</h3>
          <p className="text-gray-500">No income types match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTypes.map((type) => (
            <motion.div
              key={type.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "relative bg-white rounded-xl border p-6 pl-12 hover:shadow-lg transition-shadow",
                selection.isSelected(type.id)
                  ? "border-primary-400 ring-2 ring-primary-100"
                  : "border-gray-200"
              )}
            >
              <div
                className="absolute top-3 left-3 z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <SelectionCheckbox
                  checked={selection.isSelected(type.id)}
                  onChange={() => selection.toggle(type.id)}
                />
              </div>
              <div className="flex items-start justify-between mb-4">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", getTypeColor(type.code))}>
                  <DollarSign className="w-5 h-5" />
                </div>
                <div className="relative">
                  <button
                    onClick={() => setDropdownOpen(dropdownOpen === type.id ? null : type.id)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  <AnimatePresence>
                    {dropdownOpen === type.id && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute right-0 top-10 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10"
                      >
                        <button
                          onClick={() => openEdit(type)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => openDelete(type)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <h3 className="font-semibold text-gray-900">{type.name}</h3>
              <p className="text-sm text-gray-500">{type.code}</p>
              {type.description && (
                <p className="text-xs text-gray-400 mt-1">{type.description}</p>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Commissionable</span>
                  {type.is_commissionable ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <X className="w-4 h-4 text-gray-300" />
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">VATable</span>
                  {type.is_vatable || type.is_taxable ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <X className="w-4 h-4 text-gray-300" />
                  )}
                </div>
                {type.gl_account_name && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">GL Account</span>
                    <span className="text-gray-700 font-medium text-xs">{type.gl_account_name}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span className={cn(
                  "px-2 py-0.5 text-xs rounded-full",
                  type.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                )}>
                  {type.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Click-outside handler for dropdown */}
      {dropdownOpen !== null && (
        <div className="fixed inset-0 z-0" onClick={() => setDropdownOpen(null)} />
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingType ? 'Edit Income Type' : 'Add Income Type'}
        description={editingType ? 'Update this income type' : 'Create a new income type for billing'}
        icon={DollarSign}
        size="lg"
      >
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Monthly Rent"
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
                rows={2}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <AsyncSelect
              label="GL Account (Revenue)"
              placeholder="— Select GL Account —"
              value={form.gl_account}
              onChange={(val) => setForm({ ...form, gl_account: val ? Number(val) : '' })}
              options={revenueAccounts.map((acc) => ({ value: acc.id, label: `${acc.code} — ${acc.name}` }))}
              searchable
              clearable
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                <input
                  type="number"
                  value={form.display_order}
                  onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                </label>
                <span className="text-sm text-gray-700">Active</span>
              </div>
            </div>

            {/* Commissionable */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_commissionable}
                    onChange={(e) => setForm({ ...form, is_commissionable: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                </label>
                <span className="text-sm font-medium text-gray-700">Commissionable</span>
              </div>
              {form.is_commissionable && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Default Commission Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={form.default_commission_rate}
                    onChange={(e) => setForm({ ...form, default_commission_rate: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              )}
            </div>

            {/* VATable */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_vatable}
                    onChange={(e) => setForm({ ...form, is_vatable: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                </label>
                <span className="text-sm font-medium text-gray-700">VATable</span>
              </div>
              {form.is_vatable && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">VAT Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={form.vat_rate}
                    onChange={(e) => setForm({ ...form, vat_rate: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              )}
            </div>
          </div>

          <ModalFooter>
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingType ? 'Update' : 'Create'}
            </button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Income Type"
        description={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        icon={Trash2}
        size="sm"
      >
        <ModalFooter>
          <button
            onClick={() => setDeleteConfirm(null)}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
            disabled={deleteMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Delete
          </button>
        </ModalFooter>
      </Modal>

      <BulkActionsBar
        selectedCount={selection.selectedCount}
        onClearSelection={selection.clearSelection}
        entityName="income types"
        actions={[
          { label: 'Export', icon: Download, onClick: handleBulkExport, variant: 'outline' },
          { label: 'Delete', icon: Trash2, onClick: handleBulkDelete, variant: 'danger' },
        ]}
      />
    </div>
  )
}
