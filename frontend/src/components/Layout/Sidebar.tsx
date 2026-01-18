import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Users,
  Building2,
  Home,
  UserCheck,
  FileText,
  Receipt,
  CreditCard,
  BookOpen,
  FileSpreadsheet,
  BarChart3,
  Shield,
  ChevronLeft,
  ChevronRight,
  UsersRound,
  ScanLine,
  Crown,
  Search,
} from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useAuthStore } from '../../stores/authStore'
import { cn } from '../../lib/utils'
import { SiFsecure } from "react-icons/si";
import { PiUsersFour } from "react-icons/pi";
import { LiaUsersSolid } from "react-icons/lia";
import { PiBuildingApartmentLight } from "react-icons/pi";
import { TbUserSquareRounded } from "react-icons/tb";
import { MdOutlineAdminPanelSettings } from "react-icons/md";


interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navigation: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Search', href: '/dashboard/search', icon: Search },
    ],
  },
  {
    title: 'Masterfile',
    items: [
      { name: 'Landlords', href: '/dashboard/landlords', icon: PiUsersFour },
      { name: 'Properties', href: '/dashboard/properties', icon: PiBuildingApartmentLight },
      { name: 'Units', href: '/dashboard/units', icon: Home },
      { name: 'Tenants', href: '/dashboard/tenants', icon: LiaUsersSolid },
      { name: 'Leases', href: '/dashboard/leases', icon: FileText },
    ],
  },
  {
    title: 'Billing',
    items: [
      { name: 'Invoices', href: '/dashboard/invoices', icon: Receipt },
      { name: 'Receipts', href: '/dashboard/receipts', icon: CreditCard },
    ],
  },
  {
    title: 'Accounting',
    items: [
      { name: 'Chart of Accounts', href: '/dashboard/chart-of-accounts', icon: BookOpen },
      { name: 'Journals', href: '/dashboard/journals', icon: FileSpreadsheet },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { name: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
    ],
  },
  {
    title: 'AI Tools',
    items: [
      { name: 'Document Scanner', href: '/dashboard/document-scanner', icon: ScanLine },
    ],
  },
  {
    title: 'Administration',
    items: [
      { name: 'Team', href: '/dashboard/team', icon: TbUserSquareRounded },
      { name: 'Audit Trail', href: '/dashboard/audit-trail', icon: SiFsecure },
    ],
  },
]

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUIStore()
  const { user } = useAuthStore()
  const location = useLocation()

  // Add Super Admin section for super_admin users
  const isSuperAdmin = user?.role === 'super_admin'

  // Build navigation with conditional Super Admin section
  const fullNavigation = isSuperAdmin
    ? [
        ...navigation,
        {
          title: 'Platform',
          items: [
            { name: 'Super Admin', href: '/dashboard/super-admin', icon: MdOutlineAdminPanelSettings },
          ],
        },
      ]
    : navigation

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarOpen ? 280 : 80 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="fixed left-0 top-0 h-screen bg-white border-r border-gray-200 z-40 flex flex-col"
    >
      {/* Logo Section */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100">
        <div className="flex items-center gap-3 overflow-hidden">
          <img
            src="/logo.png"
            alt="Parameter"
            className="w-10 h-10 rounded-xl flex-shrink-0 object-contain"
          />
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="overflow-hidden"
              >
                <h1 className="text-lg font-bold text-gray-900 whitespace-nowrap">
                  Parameter
                </h1>
                <p className="text-xs text-gray-500 whitespace-nowrap">
                  Real Estate Accounting
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6 no-scrollbar">
        {fullNavigation.map((section) => (
          <div key={section.title}>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.h3
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider"
                >
                  {section.title}
                </motion.h3>
              )}
            </AnimatePresence>

            {!sidebarOpen && section.title !== 'Overview' && (
              <div className="border-t border-gray-100 mx-3 mb-2" />
            )}

            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = location.pathname === item.href ||
                  (item.href !== '/dashboard' && location.pathname.startsWith(item.href))

                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative',
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeIndicator"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary-600 rounded-r-full"
                        transition={{ type: 'spring', duration: 0.3 }}
                      />
                    )}

                    <item.icon
                      className={cn(
                        'w-5 h-5 flex-shrink-0 transition-colors',
                        isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'
                      )}
                    />

                    <AnimatePresence>
                      {sidebarOpen && (
                        <motion.span
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          className="text-sm font-medium whitespace-nowrap"
                        >
                          {item.name}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse Toggle */}
      <div className="border-t border-gray-100 p-3">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
        >
          {sidebarOpen ? (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span>Collapse</span>
            </>
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </button>
      </div>
    </motion.aside>
  )
}
