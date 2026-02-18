import { useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Wand2,
} from 'lucide-react'
import { TbUserSquareRounded } from 'react-icons/tb'
import { PiBuildingApartmentLight } from 'react-icons/pi'
import { landlordApi, propertyApi, unitApi, tenantApi, leaseApi } from '../services/api'
import { showToast, parseApiError } from '../lib/toast'
import { Button } from './ui'
import {
  useChainStore,
  getNextEntity,
  getChainSequence,
  CHAIN_LABELS,
  type EntityType,
} from '../stores/chainStore'
import type { LandlordFormRef } from './forms/LandlordForm'
import type { PropertyFormRef } from './forms/PropertyForm'
import type { UnitFormRef } from './forms/UnitForm'
import type { TenantFormRef } from './forms/TenantForm'
import type { LeaseFormRef } from './forms/LeaseForm'
import LandlordForm from './forms/LandlordForm'
import PropertyForm from './forms/PropertyForm'
import UnitForm from './forms/UnitForm'
import TenantForm from './forms/TenantForm'
import LeaseForm from './forms/LeaseForm'

type SaveAction = 'save' | 'addMore' | 'addNext'

const ENTITY_ICONS: Record<EntityType, any> = {
  landlord: TbUserSquareRounded,
  property: PiBuildingApartmentLight,
  unit: PiBuildingApartmentLight,
  tenant: TbUserSquareRounded,
  lease: TbUserSquareRounded,
}

function createApiCall(entity: EntityType, data: any) {
  switch (entity) {
    case 'landlord':
      return landlordApi.create(data)
    case 'property':
      return propertyApi.create(data)
    case 'unit':
      return unitApi.create(data)
    case 'tenant':
      return tenantApi.create(data)
    case 'lease':
      return leaseApi.create(data)
  }
}

function getEntityName(entity: EntityType, data: any): string {
  switch (entity) {
    case 'landlord':
      return data.name || 'Landlord'
    case 'property':
      return data.name || 'Property'
    case 'unit':
      return data.unit_number || 'Unit'
    case 'tenant':
      return data.name || 'Tenant'
    case 'lease':
      return 'Lease'
  }
}

function getInvalidateKeys(entity: EntityType): string[][] {
  switch (entity) {
    case 'landlord':
      return [['landlords'], ['landlords-select']]
    case 'property':
      return [['properties'], ['properties-list']]
    case 'unit':
      return [['units'], ['units-all']]
    case 'tenant':
      return [['tenants'], ['tenants-list']]
    case 'lease':
      return [['leases'], ['units-all']]
  }
}

// Breadcrumb component
function ChainBreadcrumbs() {
  const { completedSteps, currentEntity } = useChainStore()

  if (!currentEntity) return null

  // Build the full chain from the first entity
  const startEntity = completedSteps.length > 0 ? completedSteps[0].entity : currentEntity
  const fullSequence = getChainSequence(startEntity)

  return (
    <div className="flex items-center gap-1.5 px-6 py-3 bg-gray-50 border-b border-gray-100 overflow-x-auto">
      {fullSequence.map((entity, idx) => {
        const completedStep = completedSteps.find((s) => s.entity === entity)
        const isCurrent = entity === currentEntity
        const isFuture = !completedStep && !isCurrent

        return (
          <div key={entity} className="flex items-center gap-1.5 flex-shrink-0">
            {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                completedStep
                  ? 'bg-emerald-100 text-emerald-700'
                  : isCurrent
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {completedStep ? (
                <Check className="w-3 h-3" />
              ) : isCurrent ? (
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
              ) : null}
              <span>{CHAIN_LABELS[entity]}</span>
              {completedStep && (
                <span className="text-emerald-600 max-w-[80px] truncate">
                  ({completedStep.createdName})
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Save split button
function SaveSplitButton({
  onSave,
  onSaveAndMore,
  onSaveAndNext,
  nextEntity,
  isPending,
}: {
  onSave: () => void
  onSaveAndMore: () => void
  onSaveAndNext: () => void
  nextEntity: EntityType | null
  isPending: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={menuRef} className="relative inline-flex">
      <Button
        onClick={onSave}
        disabled={isPending}
        className="rounded-r-none"
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </>
        ) : (
          'Save & Close'
        )}
      </Button>
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        disabled={isPending}
        className="inline-flex items-center px-2 rounded-r-lg bg-primary-600 text-white hover:bg-primary-700 border-l border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 bottom-full mb-1.5 z-50 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 overflow-hidden"
          >
            <button
              onClick={() => {
                setMenuOpen(false)
                onSave()
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Check className="w-4 h-4 text-gray-400" />
              Save & Close
            </button>
            <button
              onClick={() => {
                setMenuOpen(false)
                onSaveAndMore()
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Wand2 className="w-4 h-4 text-gray-400" />
              Save & Add Another
            </button>
            {nextEntity && (
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onSaveAndNext()
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-primary-700 hover:bg-primary-50 transition-colors font-medium"
              >
                <ChevronRight className="w-4 h-4 text-primary-400" />
                Save & Add {CHAIN_LABELS[nextEntity]}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Close confirmation dialog
function CloseConfirmDialog({
  open,
  onClose,
  onConfirm,
  createdCount,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  createdCount: number
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900">Close Chain?</h3>
        <p className="mt-2 text-sm text-gray-600">
          You've created {createdCount} entity(s) so far. They are already saved. Close without continuing the chain?
        </p>
        <div className="mt-4 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Continue
          </Button>
          <Button variant="danger" className="flex-1" onClick={onConfirm}>
            Close
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

export default function ChainedCreationModal() {
  const queryClient = useQueryClient()
  const {
    isOpen,
    currentEntity,
    completedSteps,
    prefill,
    transition,
    formKey,
    advanceChain,
    saveAndAddMore,
    saveOnly,
    closeChain,
    setTransition,
  } = useChainStore()

  const formRef = useRef<LandlordFormRef | PropertyFormRef | UnitFormRef | TenantFormRef | LeaseFormRef | null>(null)
  const saveActionRef = useRef<SaveAction>('save')
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [pendingFormData, setPendingFormData] = useState<any>(null)

  const nextEntity = currentEntity ? getNextEntity(currentEntity) : null

  const mutation = useMutation({
    mutationFn: (data: { entity: EntityType; formData: any }) =>
      createApiCall(data.entity, data.formData),
    onMutate: () => {
      setTransition('saving')
    },
    onSuccess: (response, variables) => {
      const entity = variables.entity
      const created = response.data
      const id = created.id
      const name = getEntityName(entity, variables.formData)

      // Invalidate relevant queries
      const keys = getInvalidateKeys(entity)
      keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }))

      const action = saveActionRef.current

      if (action === 'save') {
        showToast.success(`${CHAIN_LABELS[entity]} created successfully`)
        saveOnly()
      } else if (action === 'addMore') {
        showToast.success(`${CHAIN_LABELS[entity]} created - add another`)
        saveAndAddMore()
      } else if (action === 'addNext' && nextEntity) {
        showToast.success(`${CHAIN_LABELS[entity]} created - now add ${CHAIN_LABELS[nextEntity]}`)
        advanceChain({ id, name })
      }

      setTransition('idle')
      setPendingFormData(null)
    },
    onError: (error) => {
      setTransition('idle')
      showToast.error(parseApiError(error, 'Failed to save'))
    },
  })

  const handleSubmit = useCallback(
    (data: any) => {
      if (!currentEntity) return
      setPendingFormData(data)
      mutation.mutate({ entity: currentEntity, formData: data })
    },
    [currentEntity, mutation]
  )

  const handleLeaseSubmit = useCallback(
    (data: any, _documentFile?: File | null) => {
      // Lease form passes document file separately, but for chain we skip doc upload for simplicity
      handleSubmit(data)
    },
    [handleSubmit]
  )

  const triggerSave = (action: SaveAction) => {
    saveActionRef.current = action
    formRef.current?.submit()
  }

  const handleClose = () => {
    if (completedSteps.length > 0) {
      setShowCloseConfirm(true)
    } else {
      closeChain()
    }
  }

  const handleConfirmClose = () => {
    setShowCloseConfirm(false)
    closeChain()
  }

  if (!isOpen || !currentEntity) return null

  const EntityIcon = ENTITY_ICONS[currentEntity]

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                  <Wand2 className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Add {CHAIN_LABELS[currentEntity]}
                  </h2>
                  {completedSteps.length > 0 && (
                    <p className="text-sm text-gray-500">
                      Step {completedSteps.length + 1} of chain
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 -m-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Breadcrumbs */}
            {(completedSteps.length > 0 || nextEntity) && <ChainBreadcrumbs />}

            {/* Form content with animation */}
            <div className="p-6 overflow-y-auto max-h-[60vh] relative">
              {/* Saving overlay */}
              {transition === 'saving' && (
                <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center rounded-lg">
                  <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-lg shadow-sm border">
                    <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                    <span className="text-sm font-medium text-gray-600">Saving...</span>
                  </div>
                </div>
              )}

              <AnimatePresence mode="wait">
                <motion.div
                  key={`${currentEntity}-${formKey}`}
                  initial={{ x: 300, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -300, opacity: 0 }}
                  transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }}
                >
                  {currentEntity === 'landlord' && (
                    <LandlordForm
                      ref={formRef as any}
                      initialValues={prefill}
                      onSubmit={handleSubmit}
                      isSubmitting={mutation.isPending}
                      showButtons={false}
                    />
                  )}
                  {currentEntity === 'property' && (
                    <PropertyForm
                      ref={formRef as any}
                      initialValues={prefill}
                      onSubmit={handleSubmit}
                      isSubmitting={mutation.isPending}
                      showButtons={false}
                    />
                  )}
                  {currentEntity === 'unit' && (
                    <UnitForm
                      ref={formRef as any}
                      initialValues={prefill}
                      onSubmit={handleSubmit}
                      isSubmitting={mutation.isPending}
                      showButtons={false}
                    />
                  )}
                  {currentEntity === 'tenant' && (
                    <TenantForm
                      ref={formRef as any}
                      initialValues={prefill}
                      onSubmit={handleSubmit}
                      isSubmitting={mutation.isPending}
                      showButtons={false}
                    />
                  )}
                  {currentEntity === 'lease' && (
                    <LeaseForm
                      ref={formRef as any}
                      initialValues={prefill}
                      onSubmit={handleLeaseSubmit}
                      isSubmitting={mutation.isPending}
                      showButtons={false}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-6 border-t border-gray-100 bg-gray-50">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <SaveSplitButton
                onSave={() => triggerSave('save')}
                onSaveAndMore={() => triggerSave('addMore')}
                onSaveAndNext={() => triggerSave('addNext')}
                nextEntity={nextEntity}
                isPending={mutation.isPending}
              />
            </div>
          </motion.div>
        </div>
      </div>

      <CloseConfirmDialog
        open={showCloseConfirm}
        onClose={() => setShowCloseConfirm(false)}
        onConfirm={handleConfirmClose}
        createdCount={completedSteps.length}
      />
    </>
  )
}
