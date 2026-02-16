import { NavLink, useLocation, useNavigate } from 'react-router-dom'
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
  X,
  Landmark,
  DollarSign,
  Wallet,
  GitCompare,
  Upload,
  Bell,
  AlertTriangle,
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

interface SidebarProps {
  isMobileDrawer?: boolean
  onClose?: () => void
}

const navigation: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Notifications', href: '/dashboard/notifications', icon: Bell },
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
      { name: 'Expenses', href: '/dashboard/expenses', icon: Wallet },
      { name: 'Late Penalties', href: '/dashboard/late-penalties', icon: AlertTriangle },
    ],
  },
  {
    title: 'Accounting',
    items: [
      { name: 'Chart of Accounts', href: '/dashboard/chart-of-accounts', icon: BookOpen },
      { name: 'Journals', href: '/dashboard/journals', icon: FileSpreadsheet },
      { name: 'Bank Accounts', href: '/dashboard/bank-accounts', icon: Landmark },
      { name: 'Income Types', href: '/dashboard/income-types', icon: DollarSign },
      { name: 'Expense Categories', href: '/dashboard/expense-categories', icon: GitCompare },
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
      { name: 'Data Import', href: '/dashboard/data-import', icon: Upload },
      { name: 'Audit Trail', href: '/dashboard/audit-trail', icon: SiFsecure },
    ],
  },
]

export default function Sidebar({ isMobileDrawer = false, onClose }: SidebarProps) {
  const { sidebarOpen, toggleSidebar } = useUIStore()
  const { user } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()

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

  // On mobile drawer, always show expanded state
  const isExpanded = isMobileDrawer ? true : sidebarOpen

  // Handle navigation - close mobile sidebar after navigation
  const handleNavClick = (href: string) => {
    if (isMobileDrawer && onClose) {
      navigate(href)
      onClose()
    }
  }

  return (
    <motion.aside
      initial={false}
      animate={{ width: isExpanded ? 280 : 80 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className={cn(
        "h-screen bg-white border-r border-gray-200 flex flex-col",
        isMobileDrawer ? "w-[280px]" : "fixed left-0 top-0 z-40"
      )}
    >
      {/* Logo Section */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100">
        <div className="flex items-center gap-3 overflow-hidden">
          <img
            src="/logo.png"
            alt="Parameter"
            className="w-10 h-10 rounded-xl flex-shrink-0 object-contain dark:brightness-0 dark:invert"
          />
          <AnimatePresence>
            {isExpanded && (
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

        {/* Close button for mobile drawer */}
        {isMobileDrawer && onClose && (
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6 no-scrollbar">
        {fullNavigation.map((section) => (
          <div key={section.title}>
            <AnimatePresence>
              {isExpanded && (
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

            {!isExpanded && section.title !== 'Overview' && (
              <div className="border-t border-gray-100 mx-3 mb-2" />
            )}

            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = location.pathname === item.href ||
                  (item.href !== '/dashboard' && location.pathname.startsWith(item.href))

                return isMobileDrawer ? (
                  // Mobile: use button for navigation to handle close
                  <button
                    key={item.href}
                    onClick={() => handleNavClick(item.href)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative',
                      isActive
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="mobileActiveIndicator"
                        className="absolute -left-3 top-0 bottom-0 my-auto w-1 h-6 bg-primary-600 rounded-r-full"
                        transition={{ type: 'spring', duration: 0.3 }}
                      />
                    )}

                    <item.icon
                      className={cn(
                        'w-5 h-5 flex-shrink-0 transition-colors',
                        isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'
                      )}
                    />

                    <span className="text-sm font-medium whitespace-nowrap">
                      {item.name}
                    </span>
                  </button>
                ) : (
                  // Desktop: use NavLink
                  <NavLink
                    key={item.href}
                    to={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative',
                      isActive
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeIndicator"
                        className="absolute -left-3 top-0 bottom-0 my-auto w-1 h-6 bg-primary-600 rounded-r-full"
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
                      {isExpanded && (
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

      {/* Collapse Toggle - only show on desktop */}
      {!isMobileDrawer && (
        <div className="border-t border-gray-100 p-3">
          <button
            onClick={toggleSidebar}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronLeft className="w-5 h-5" />
                <span>Collapse</span>
              </>
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </button>
        </div>
      )}
    </motion.aside>
  )
}
