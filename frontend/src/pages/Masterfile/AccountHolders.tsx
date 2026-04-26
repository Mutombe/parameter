import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Mail, Trash2, Loader2, Edit2, Building2,
} from 'lucide-react'
import { TbUserSquareRounded } from 'react-icons/tb'
import { accountHolderApi } from '../../services/api'
import { useDebounce, cn } from '../../lib/utils'
import {
  Pagination, EmptyState, Modal, SelectionCheckbox, BulkActionsBar,
  ConfirmDialog,
} from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'
import { undoToast } from '../../lib/undoToast'
import TenantForm from '../../components/forms/TenantForm'
import { useSelection } from '../../hooks/useSelection'
import { useHotkeys } from '../../hooks/useHotkeys'
import { usePrefetch } from '../../hooks/usePrefetch'

const PAGE_SIZE = 25

export default function AccountHolders() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const prefetch = usePrefetch()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [currentPage, setCurrentPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingValues, setEditingValues] = useState<Record<string, any> | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} })

  const selection = useSelection<number>({ clearOnChange: [debouncedSearch] })
  const searchInputRef = useRef<HTMLInputElement>(null)
  useHotkeys([
    { key: 'c', handler: () => setShowForm(true) },
    { key: '/', handler: (e) => { e.preventDefault(); searchInputRef.current?.focus() } },
  ])

  useEffect(() => { setCurrentPage(1) }, [debouncedSearch])

  const queryKey = ['account-holders', debouncedSearch, currentPage] as const

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => accountHolderApi.list({
      search: debouncedSearch,
      page: currentPage,
      page_size: PAGE_SIZE,
    }).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  const holders = data?.results || data || []
  const totalCount = data?.count || holders.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setEditingValues(null)
  }

  const handleEdit = (holder: any) => {
    setEditingId(typeof holder.id === 'number' ? holder.id : null)
    setEditingValues({
      name: holder.name || '',
      tenant_type: holder.tenant_type || 'individual',
      email: holder.email || '',
      phone: holder.phone || '',
      id_type: holder.id_type || 'national_id',
      id_number: holder.id_number || '',
    })
    setShowForm(true)
  }

  const saveMutation = useMutation({
    mutationFn: (data: any) => {
      const id = data._editingId
      const { _editingId, ...payload } = data
      return id ? accountHolderApi.update(id, payload) : accountHolderApi.create(payload)
    },
    onMutate: async (newData) => {
      const isUpdating = !!newData._editingId
      resetForm()
      await queryClient.cancelQueries({ queryKey: ['account-holders'] })
      const previousData = queryClient.getQueryData(queryKey)

      if (!isUpdating) {
        const optimistic = {
          id: `temp-${Date.now()}`,
          name: newData.name,
          tenant_type: newData.tenant_type,
          account_type: 'levy',
          email: newData.email,
          phone: newData.phone,
          has_active_lease: false,
          lease_count: 0,
          created_at: new Date().toISOString(),
          _isOptimistic: true,
        }
        queryClient.setQueryData(queryKey, (old: any) => {
          const items = old?.results || old || []
          return old?.results ? { ...old, results: [optimistic, ...items] } : [optimistic, ...items]
        })
      } else {
        queryClient.setQueryData(queryKey, (old: any) => {
          const items = old?.results || old || []
          const updated = items.map((item: any) =>
            item.id === newData._editingId ? { ...item, ...newData, _isUpdating: true } : item
          )
          return old?.results ? { ...old, results: updated } : updated
        })
      }
      return { previousData, isUpdating }
    },
    onSuccess: (_, __, context) => {
      showToast.success(context?.isUpdating ? 'Account holder updated' : 'Account holder created')
      queryClient.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey[0] as string
        return key === 'account-holders' || key.startsWith('account-holder')
      }})
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData)
      }
      showToast.error(parseApiError(error, context?.isUpdating ? 'Failed to update account holder' : 'Failed to create account holder'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => accountHolderApi.delete(id),
    onMutate: async (id) => {
      setDeletingId(id)
      await queryClient.cancelQueries({ queryKey: ['account-holders'] })
      const previousData = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (old: any) => {
        const items = old?.results || old || []
        const filtered = items.filter((item: any) => item.id !== id)
        return old?.results ? { ...old, results: filtered } : filtered
      })
      return { previousData }
    },
    onSuccess: () => {
      setDeletingId(null)
      showToast.success('Account holder deleted')
      queryClient.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey[0] as string
        return key === 'account-holders' || key.startsWith('account-holder')
      }})
    },
    onError: (error, _, context) => {
      setDeletingId(null)
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData)
      }
      showToast.error(parseApiError(error, 'Failed to delete account holder'))
    },
  })

  const handleDelete = (holder: any) => {
    if (holder.has_active_lease) {
      setConfirmDialog({
        open: true,
        title: `Delete ${holder.name}?`,
        message: 'This account holder has active leases. Deleting may fail if there are related records.',
        onConfirm: () => {
          setConfirmDialog(d => ({ ...d, open: false }))
          deleteMutation.mutate(holder.id)
        },
      })
    } else {
      undoToast({
        message: `Deleting "${holder.name}"...`,
        onConfirm: () => deleteMutation.mutate(holder.id),
      })
    }
  }

  const selectableItems = (holders || []).filter((h: any) => !h._isOptimistic)
  const pageIds = selectableItems.map((h: any) => h.id)

  const handleBulkDelete = () => {
    const ids = Array.from(selection.selectedIds)
    setConfirmDialog({
      open: true,
      title: `Delete ${ids.length} account holders?`,
      message: 'This will delete the selected account holders. Holders with active leases may fail.',
      onConfirm: async () => {
        setConfirmDialog(d => ({ ...d, open: false }))
        for (const id of ids) await deleteMutation.mutateAsync(id as number)
        selection.clearSelection()
      },
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Holders</h1>
          <p className="text-sm text-gray-500">Levy-side payers — pay levies, special levies, rates, maintenance, parking.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors">
          <Plus className="w-4 h-4" /> New Account Holder
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, code, email, phone..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <span className="text-xs text-gray-500">{totalCount} total</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
          </div>
        ) : holders.length === 0 ? (
          <EmptyState
            icon={TbUserSquareRounded}
            title="No account holders yet"
            description="Create the first account holder to start collecting levies."
            action={{ label: 'New Account Holder', onClick: () => setShowForm(true) }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-sm border-b-2 border-gray-100">
                <tr>
                  <th className="w-10 px-3 py-3.5">
                    <SelectionCheckbox
                      checked={selection.isAllPageSelected(pageIds)}
                      indeterminate={selection.isPartialPageSelected(pageIds)}
                      onChange={() => selection.selectPage(pageIds)}
                    />
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3.5">Account Holder</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3.5 hidden md:table-cell">Type</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3.5 hidden lg:table-cell">Email</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3.5 hidden xl:table-cell">Phone</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3.5">Property</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3.5 w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <AnimatePresence>
                  {holders.map((holder: any) => {
                    const isOptimistic = holder._isOptimistic
                    const isUpdating = holder._isUpdating
                    return (
                      <motion.tr
                        key={holder.id}
                        layout
                        initial={isOptimistic ? { opacity: 0, y: -6 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        onClick={() => !isOptimistic && navigate(`/dashboard/account-holders/${holder.id}`)}
                        onMouseEnter={() => !isOptimistic && prefetch(`/dashboard/account-holders/${holder.id}`)}
                        className={cn(
                          'group transition-colors',
                          isOptimistic || isUpdating ? 'bg-primary-50/50' : 'hover:bg-gray-50 cursor-pointer',
                          !isOptimistic && selection.isSelected(holder.id) && 'bg-primary-50/30'
                        )}
                      >
                        <td className="w-10 px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                          {!isOptimistic && !isUpdating && (
                            <SelectionCheckbox
                              checked={selection.isSelected(holder.id)}
                              onChange={() => selection.toggle(holder.id)}
                            />
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                              isOptimistic || isUpdating ? 'bg-primary-100' : 'bg-violet-100'
                            )}>
                              {isOptimistic || isUpdating ? (
                                <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                              ) : (
                                <TbUserSquareRounded className="w-4 h-4 text-violet-600" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="font-semibold text-gray-900 hover:text-primary-600 truncate block">
                                {holder.name}
                              </span>
                              <span className="text-xs text-gray-500">{holder.code}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-700 hidden md:table-cell capitalize">{holder.tenant_type || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-700 truncate max-w-[200px] hidden lg:table-cell">{holder.email || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-700 hidden xl:table-cell">{holder.phone || '—'}</td>
                        <td className="px-5 py-3.5 text-sm">
                          {holder.property_name ? (
                            <div className="flex items-center gap-1.5 text-gray-700">
                              <Building2 className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-xs">{holder.property_name}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleEdit(holder)}
                              disabled={isOptimistic}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                              aria-label="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(holder)}
                              disabled={isOptimistic || deletingId === holder.id}
                              className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600 disabled:opacity-40"
                              aria-label="Delete"
                            >
                              {deletingId === holder.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    )
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            showPageSize={false}
          />
        )}
      </div>

      <BulkActionsBar
        selectedCount={selection.selectedCount}
        onClearSelection={selection.clearSelection}
        entityName="account holders"
        actions={[
          { label: 'Delete', icon: Trash2, onClick: handleBulkDelete, variant: 'danger' },
        ]}
      />

      <Modal
        open={showForm}
        onClose={resetForm}
        title={editingId ? 'Edit Account Holder' : 'New Account Holder'}
        icon={Mail}
      >
        <TenantForm
          kind="account-holder"
          initialValues={editingValues || undefined}
          onSubmit={(formData) => saveMutation.mutate(editingId ? { ...formData, _editingId: editingId } : formData)}
          isSubmitting={saveMutation.isPending}
          onCancel={resetForm}
        />
      </Modal>

      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog(d => ({ ...d, open: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type="danger"
        confirmText="Confirm"
      />
    </div>
  )
}
