import { create } from 'zustand'

interface UIState {
  sidebarOpen: boolean
  mobileSidebarOpen: boolean
  askMeOpen: boolean
  isMobile: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleMobileSidebar: () => void
  setMobileSidebarOpen: (open: boolean) => void
  toggleAskMe: () => void
  setAskMeOpen: (open: boolean) => void
  setIsMobile: (isMobile: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  mobileSidebarOpen: false,
  askMeOpen: false,
  isMobile: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleMobileSidebar: () => set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  toggleAskMe: () => set((state) => ({ askMeOpen: !state.askMeOpen })),
  setAskMeOpen: (open) => set({ askMeOpen: open }),
  setIsMobile: (isMobile) => set({ isMobile }),
}))
