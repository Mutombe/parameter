import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  Wallet,
  MoreVertical,
  Edit2,
  Trash2,
  Check,
  X,
  Loader2,
  Sprout,
  Shield,
  Download,
} from 'lucide-react'
import { expenseCategoryApi, accountApi } from '../../services/api'
import { cn } from '../../lib/utils'
import { showToast, parseApiError } from '../../lib/toast'
import { Modal, ModalFooter, SelectionCheckbox, BulkActionsBar, Tooltip } from '../../components/ui'
import { AsyncSelect } from '../../components/ui/AsyncSelect'
import { exportTableData } from '../../lib/export'
import { useSelection } from '../../hooks/useSelection'

interface ExpenseCategory {
  id: number
  code: string
  name: string
  description: string
  gl_account: number | null
  gl_account_name: string
  is_deductible: boolean
  requires_approval: boolean
  approval_threshold: string
  is_active: boolean
  is_system: boolean
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
  is_deductible: false,
  requires_approval: false,
  approval_threshold: '0.00',
  is_active: true,
}

export default function ExpenseCategories() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<ExpenseCategory | null>(null)
  const [form, setForm] = useState(emptyForm)
  const selection = useSelection<number>({ clearOnChange: [searchQuery] })

  const { data, isLoading } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => expenseCategoryApi.list().then(r => r.data.results || r.data),
  })

  const { data: glAccounts } = useQuery({
    queryKey: ['gl-accounts-expense'],
    queryFn: () => accountApi.list({ account_type: 'expense' }).then(r => r.data.results || r.data),
  })

  const categories: ExpenseCategory[] = data || []
  const expenseAccounts: GLAccount[] = glAccounts || []

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    if (editingCategory) {
      setForm({
        name: editingCategory.name,
        description: editingCategory.description || '',
        gl_account: editingCategory.gl_account || '',
        is_deductible: editingCategory.is_deductible,
        requires_approval: editingCategory.requires_approval,
        approval_threshold: editingCategory.approval_threshold || '0.00',
        is_active: editingCategory.is_active,
      })
    } else if (showModal) {
      setForm(emptyForm)
    }
  }, [editingCategory, showModal])

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = {
        ...data,
        gl_account: data.gl_account || null,
        approval_threshold: data.requires_approval ? data.approval_threshold : '0.00',
      }
      return editingCategory
        ? expenseCategoryApi.update(editingCategory.id, payload)
        : expenseCategoryApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
      showToast.success(editingCategory ? 'Category updated' : 'Category created')
      closeModal()
    },
    onError: (error) => {
      showToast.error(parseApiError(error))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => expenseCategoryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
      showToast.success('Category deleted')
      setDeleteConfirm(null)
    },
    onError: (error) => {
      showToast.error(parseApiError(error))
      setDeleteConfirm(null)
    },
  })

  const seedMutation = useMutation({
    mutationFn: () => expenseCategoryApi.seedDefaults(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
      showToast.success('Default expense categories created')
    },
    onError: (error) => {
      showToast.error(parseApiError(error))
    },
  })

  const closeModal = () => {
    setShowModal(false)
    setEditingCategory(null)
    setForm(emptyForm)
  }

  const openEdit = (cat: ExpenseCategory) => {
    setEditingCategory(cat)
    setShowModal(true)
    setDropdownOpen(null)
  }

  const openDelete = (cat: ExpenseCategory) => {
    setDeleteConfirm(cat)
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

  const getCategoryColor = (code: string) => {
    const colors: Record<string, string> = {
      'MAINT': 'bg-orange-100 text-orange-600',
      'UTIL': 'bg-blue-100 text-blue-600',
      'MGMT': 'bg-purple-100 text-purple-600',
      'INSUR': 'bg-green-100 text-green-600',
      'LEGAL': 'bg-red-100 text-red-600',
    }
    return colors[code] || 'bg-gray-100 text-gray-600'
  }

  const selectableItems = (categories || []).filter((c: any) => !c._isOptimistic)
  const pageIds = selectableItems.map((c: any) => c.id)

  const handleBulkExport = () => {
    const selected = selectableItems.filter((c: any) => selection.isSelected(c.id))
    exportTableData(selected, [
      { key: 'name', header: 'Name' },
      { key: 'code', header: 'Code' },
      { key: 'description', header: 'Description' },
    ], 'expense_categories_export')
    showToast.success(`Exported ${selected.length} expense categories`)
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selection.selectedIds)
    for (const id of ids) { try { await expenseCategoryApi.delete(id) } catch {} }
    selection.clearSelection()
    queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
    showToast.success(`Deleted ${ids.length} expense categories`)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expense Categories</h1>
          <p className="text-gray-500 mt-1">Manage expense categories for tracking costs</p>
        </div>
        <button
          onClick={() => { setEditingCategory(null); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search categories..."
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

      {/* Categories Grid */}
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
      ) : filteredCategories.length === 0 && categories.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No expense categories</h3>
          <p className="text-gray-500 mb-4">Add expense categories to track your costs.</p>
          <button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50"
          >
            {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sprout className="w-4 h-4" />}
            Seed Defaults
          </button>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No results</h3>
          <p className="text-gray-500">No categories match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCategories.map((category) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "relative bg-white rounded-xl border p-6 pl-12 hover:shadow-lg transition-shadow",
                selection.isSelected(category.id)
                  ? "border-primary-400 ring-2 ring-primary-100"
                  : "border-gray-200"
              )}
            >
              {/* Selection checkbox */}
              <div
                className="absolute top-3 left-3 z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <SelectionCheckbox
                  checked={selection.isSelected(category.id)}
                  onChange={() => selection.toggle(category.id)}
                />
              </div>
              <div className="flex items-start justify-between mb-4">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", getCategoryColor(category.code))}>
                  <Wallet className="w-5 h-5" />
                </div>
                <div className="relative">
                  <button
                    onClick={() => setDropdownOpen(dropdownOpen === category.id ? null : category.id)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                    title="Category options"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  <AnimatePresence>
                    {dropdownOpen === category.id && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute right-0 top-10 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10"
                      >
                        <button
                          onClick={() => openEdit(category)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        {!category.is_system && (
                          <button
                            onClick={() => openDelete(category)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <h3 className="font-semibold text-gray-900">{category.name}</h3>
              <p className="text-sm text-gray-500">{category.code}</p>
              {category.description && (
                <p className="text-xs text-gray-400 mt-1">{category.description}</p>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                {category.gl_account_name && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">GL Account</span>
                    <span className="text-gray-700 font-medium text-xs">{category.gl_account_name}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Deductible</span>
                  {category.is_deductible ? (
                    <Tooltip content="Tax deductible">
                      <span><Check className="w-4 h-4 text-green-500" /></span>
                    </Tooltip>
                  ) : (
                    <Tooltip content="Not tax deductible">
                      <span><X className="w-4 h-4 text-gray-300" /></span>
                    </Tooltip>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Requires Approval</span>
                  {category.requires_approval ? (
                    <Tooltip content="Requires approval">
                      <span><Check className="w-4 h-4 text-green-500" /></span>
                    </Tooltip>
                  ) : (
                    <Tooltip content="No approval required">
                      <span><X className="w-4 h-4 text-gray-300" /></span>
                    </Tooltip>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span className={cn(
                  "px-2 py-0.5 text-xs rounded-full",
                  category.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                )}>
                  {category.is_active ? 'Active' : 'Inactive'}
                </span>
                {category.is_system && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    System
                  </span>
                )}
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
        title={editingCategory ? 'Edit Expense Category' : 'Add Expense Category'}
        description={editingCategory ? 'Update this expense category' : 'Create a new expense category'}
        icon={Wallet}
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
                placeholder="e.g. Maintenance"
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
              label="GL Account (Expense)"
              placeholder="— Select GL Account —"
              value={form.gl_account}
              onChange={(val) => setForm({ ...form, gl_account: val ? Number(val) : '' })}
              options={expenseAccounts.map((acc) => ({ value: acc.id, label: `${acc.code} — ${acc.name}` }))}
              searchable
              clearable
            />

            <div className="flex items-center gap-3">
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

            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_deductible}
                  onChange={(e) => setForm({ ...form, is_deductible: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
              </label>
              <span className="text-sm text-gray-700">Tax Deductible</span>
            </div>

            {/* Requires Approval */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.requires_approval}
                    onChange={(e) => setForm({ ...form, requires_approval: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                </label>
                <span className="text-sm font-medium text-gray-700">Requires Approval</span>
              </div>
              {form.requires_approval && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Approval Threshold Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.approval_threshold}
                    onChange={(e) => setForm({ ...form, approval_threshold: e.target.value })}
                    placeholder="Amounts above this require approval"
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
              {editingCategory ? 'Update' : 'Create'}
            </button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Expense Category"
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
        entityName="expense categories"
        actions={[
          { label: 'Export', icon: Download, onClick: handleBulkExport, variant: 'outline' as const },
          { label: 'Delete', icon: Trash2, onClick: handleBulkDelete, variant: 'danger' as const },
        ]}
      />
    </div>
  )
}
