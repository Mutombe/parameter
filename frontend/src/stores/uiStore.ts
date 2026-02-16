import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface UIState {
  sidebarOpen: boolean
  mobileSidebarOpen: boolean
  askMeOpen: boolean
  isMobile: boolean
  theme: Theme
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleMobileSidebar: () => void
  setMobileSidebarOpen: (open: boolean) => void
  toggleAskMe: () => void
  setAskMeOpen: (open: boolean) => void
  setIsMobile: (isMobile: boolean) => void
  setTheme: (theme: Theme) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      mobileSidebarOpen: false,
      askMeOpen: false,
      isMobile: false,
      theme: 'system',
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleMobileSidebar: () => set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      toggleAskMe: () => set((state) => ({ askMeOpen: !state.askMeOpen })),
      setAskMeOpen: (open) => set({ askMeOpen: open }),
      setIsMobile: (isMobile) => set({ isMobile }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'ui-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ theme: state.theme }),
    }
  )
)
