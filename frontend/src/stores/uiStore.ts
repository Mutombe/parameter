import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface UIState {
  sidebarOpen: boolean
  mobileSidebarOpen: boolean
  askMeOpen: boolean
  commandPaletteOpen: boolean
  shortcutsModalOpen: boolean
  isMobile: boolean
  theme: Theme
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleMobileSidebar: () => void
  setMobileSidebarOpen: (open: boolean) => void
  toggleAskMe: () => void
  setAskMeOpen: (open: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  setShortcutsModalOpen: (open: boolean) => void
  setIsMobile: (isMobile: boolean) => void
  setTheme: (theme: Theme) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      mobileSidebarOpen: false,
      askMeOpen: false,
      commandPaletteOpen: false,
      shortcutsModalOpen: false,
      isMobile: false,
      theme: 'system',
      toggleSidebar: () => set((state) => ({
        sidebarOpen: !state.sidebarOpen,
        ...(!state.sidebarOpen ? { askMeOpen: false } : {}),
      })),
      setSidebarOpen: (open) => set(open ? { sidebarOpen: true, askMeOpen: false } : { sidebarOpen: false }),
      toggleMobileSidebar: () => set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      toggleAskMe: () => set((state) => ({
        askMeOpen: !state.askMeOpen,
        ...(!state.askMeOpen ? { sidebarOpen: false } : {}),
      })),
      setAskMeOpen: (open) => set(open ? { askMeOpen: true, sidebarOpen: false } : { askMeOpen: false }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setShortcutsModalOpen: (open) => set({ shortcutsModalOpen: open }),
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
