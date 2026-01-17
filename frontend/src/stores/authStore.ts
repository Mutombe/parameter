import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TenantInfo {
  name: string
  is_demo: boolean
  demo_expires_at: string | null
  demo_time_remaining: number | null
  account_status: string
}

interface User {
  id: number
  email: string
  first_name: string
  last_name: string
  full_name: string
  role: string
  phone?: string
  avatar?: string
  is_demo_user?: boolean
  account_status?: string
  tenant_info?: TenantInfo
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isDemo: boolean
  demoExpiresAt: string | null
  setUser: (user: User | null) => void
  logout: () => void
  updateDemoStatus: (expiresAt: string | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isDemo: false,
      demoExpiresAt: null,
      setUser: (user) => {
        const isDemo = user?.is_demo_user || user?.tenant_info?.is_demo || false
        const demoExpiresAt = user?.tenant_info?.demo_expires_at || null
        set({ user, isAuthenticated: !!user, isDemo, demoExpiresAt })
      },
      logout: () => set({ user: null, isAuthenticated: false, isDemo: false, demoExpiresAt: null }),
      updateDemoStatus: (expiresAt) => set({ demoExpiresAt: expiresAt }),
    }),
    {
      name: 'auth-storage',
    }
  )
)
