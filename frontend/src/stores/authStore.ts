import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TenantInfo {
  name: string
  email?: string
  phone?: string
  address?: string
  logo_url?: string | null
  is_demo: boolean
  demo_expires_at: string | null
  demo_time_remaining: number | null
  account_status: string
  default_currency?: string
  invoice_prefix?: string
  invoice_footer?: string
  paper_size?: string
  show_logo?: boolean
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
  is_staff?: boolean
  is_superuser?: boolean
  is_demo_user?: boolean
  account_status?: string
  tenant_info?: TenantInfo
}

interface ImpersonationInfo {
  tenantId: number
  tenantName: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isDemo: boolean
  demoExpiresAt: string | null
  impersonation: ImpersonationInfo | null
  setUser: (user: User | null) => void
  logout: () => void
  updateDemoStatus: (expiresAt: string | null) => void
  startImpersonation: (tenantId: number, tenantName: string) => void
  stopImpersonation: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isDemo: false,
      demoExpiresAt: null,
      impersonation: null,
      setUser: (user) => {
        const isDemo = user?.is_demo_user || user?.tenant_info?.is_demo || false
        const demoExpiresAt = user?.tenant_info?.demo_expires_at || null
        set({ user, isAuthenticated: !!user, isDemo, demoExpiresAt })
      },
      logout: () => set({ user: null, isAuthenticated: false, isDemo: false, demoExpiresAt: null, impersonation: null }),
      updateDemoStatus: (expiresAt) => set({ demoExpiresAt: expiresAt }),
      startImpersonation: (tenantId, tenantName) => set({ impersonation: { tenantId, tenantName } }),
      stopImpersonation: () => set({ impersonation: null }),
    }),
    {
      name: 'auth-storage',
    }
  )
)
