import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  FileText,
  Receipt,
  BookOpen,
  Home,
  Bell,
  LogOut,
  Menu,
  X,
  User,
  Eye,
  ArrowLeft,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { authApi } from '../services/api'
import { cn } from '../lib/utils'
import toast from 'react-hot-toast'

const navItems = [
  { name: 'Dashboard', href: '/portal', icon: LayoutDashboard },
  { name: 'Invoices', href: '/portal/invoices', icon: FileText },
  { name: 'Receipts', href: '/portal/receipts', icon: Receipt },
  { name: 'Statement', href: '/portal/statement', icon: BookOpen },
  { name: 'My Lease', href: '/portal/lease', icon: Home },
  { name: 'Notify Payment', href: '/portal/notify-payment', icon: Bell },
]

export default function TenantPortalLayout() {
  const navigate = useNavigate()
  const { user, logout, impersonation, stopImpersonation } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isImpersonating = !!impersonation

  const handleExitImpersonation = () => {
    stopImpersonation()
    navigate(`/dashboard/tenants/${impersonation?.tenantId}`)
  }

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // ignore
    }
    logout()
    navigate('/login')
    toast.success('Logged out successfully')
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
            <Home className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900">Tenant Portal</h1>
            <p className="text-xs text-gray-500">Property Management</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.href === '/portal'}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary-50 text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )
            }
          >
            <item.icon className="w-5 h-5" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* User Info */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center">
            <User className="w-4 h-4 text-primary-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors mt-1"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 flex-col bg-white border-r border-gray-200 fixed inset-y-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-y-0 left-0 w-64 bg-white z-50 lg:hidden shadow-xl"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        {/* Impersonation Banner */}
        {isImpersonating && (
          <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Eye className="w-4 h-4" />
              <span>Viewing portal as: <strong>{impersonation.tenantName}</strong></span>
            </div>
            <button
              onClick={handleExitImpersonation}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Exit
            </button>
          </div>
        )}

        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-gray-200">
          <button onClick={() => setMobileOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg">
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="font-bold text-gray-900">Tenant Portal</h1>
          <div className="w-9" /> {/* Spacer */}
        </div>

        {/* Page Content */}
        <main className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
