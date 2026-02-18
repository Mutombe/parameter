import { create } from 'zustand'

export type EntityType = 'landlord' | 'property' | 'unit' | 'tenant' | 'lease'

export interface ChainStep {
  entity: EntityType
  createdId: number
  createdName: string
}

interface ChainState {
  isOpen: boolean
  currentEntity: EntityType | null
  completedSteps: ChainStep[]
  prefill: Record<string, string | number>
  transition: 'idle' | 'saving' | 'sliding'
  formKey: number

  startChain: (entity: EntityType) => void
  advanceChain: (created: { id: number; name: string }) => void
  saveAndAddMore: () => void
  saveOnly: () => void
  closeChain: () => void
  setTransition: (t: 'idle' | 'saving' | 'sliding') => void
}

const CHAIN_MAP: Record<EntityType, { next: EntityType | null; prefillField: string | null }> = {
  landlord: { next: 'property', prefillField: 'landlord' },
  property: { next: 'unit', prefillField: 'property' },
  unit: { next: null, prefillField: null },
  tenant: { next: 'lease', prefillField: 'tenant' },
  lease: { next: null, prefillField: null },
}

export const CHAIN_LABELS: Record<EntityType, string> = {
  landlord: 'Landlord',
  property: 'Property',
  unit: 'Unit',
  tenant: 'Tenant',
  lease: 'Lease',
}

export function getNextEntity(entity: EntityType): EntityType | null {
  return CHAIN_MAP[entity].next
}

export function getChainSequence(start: EntityType): EntityType[] {
  const seq: EntityType[] = [start]
  let current = start
  while (CHAIN_MAP[current].next) {
    current = CHAIN_MAP[current].next!
    seq.push(current)
  }
  return seq
}

export const useChainStore = create<ChainState>((set, get) => ({
  isOpen: false,
  currentEntity: null,
  completedSteps: [],
  prefill: {},
  transition: 'idle',
  formKey: 0,

  startChain: (entity) =>
    set({
      isOpen: true,
      currentEntity: entity,
      completedSteps: [],
      prefill: {},
      transition: 'idle',
      formKey: 0,
    }),

  advanceChain: (created) => {
    const { currentEntity, completedSteps, prefill } = get()
    if (!currentEntity) return

    const chainInfo = CHAIN_MAP[currentEntity]
    if (!chainInfo.next || !chainInfo.prefillField) return

    const newStep: ChainStep = {
      entity: currentEntity,
      createdId: created.id,
      createdName: created.name,
    }

    set({
      completedSteps: [...completedSteps, newStep],
      currentEntity: chainInfo.next,
      prefill: { ...prefill, [chainInfo.prefillField]: created.id },
      transition: 'sliding',
      formKey: get().formKey + 1,
    })

    // Reset transition after animation
    setTimeout(() => set({ transition: 'idle' }), 400)
  },

  saveAndAddMore: () => {
    set((s) => ({
      transition: 'idle',
      formKey: s.formKey + 1,
    }))
  },

  saveOnly: () => {
    set({
      isOpen: false,
      currentEntity: null,
      completedSteps: [],
      prefill: {},
      transition: 'idle',
      formKey: 0,
    })
  },

  closeChain: () => {
    set({
      isOpen: false,
      currentEntity: null,
      completedSteps: [],
      prefill: {},
      transition: 'idle',
      formKey: 0,
    })
  },

  setTransition: (t) => set({ transition: t }),
}))
