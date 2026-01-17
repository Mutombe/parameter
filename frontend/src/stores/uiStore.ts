import { create } from 'zustand'

interface UIState {
  sidebarOpen: boolean
  askMeOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleAskMe: () => void
  setAskMeOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  askMeOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleAskMe: () => set((state) => ({ askMeOpen: !state.askMeOpen })),
  setAskMeOpen: (open) => set({ askMeOpen: open }),
}))
