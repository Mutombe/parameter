import { create } from 'zustand'

interface PrintState {
  html: string | null
  isOpen: boolean
  open: (html: string) => void
  close: () => void
}

export const usePrintStore = create<PrintState>()((set) => ({
  html: null,
  isOpen: false,
  open: (html) => set({ html, isOpen: true }),
  close: () => set({ html: null, isOpen: false }),
}))
