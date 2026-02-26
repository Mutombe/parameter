import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Receipt, Home, FileText, Menu } from 'lucide-react'
import { LiaUsersSolid } from 'react-icons/lia'
import { cn } from '../../lib/utils'
import { useUIStore } from '../../stores/uiStore'

const navItems = [
  { name: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Tenants', href: '/dashboard/tenants', icon: LiaUsersSolid },
  { name: 'Invoices', href: '/dashboard/invoices', icon: Receipt },
  { name: 'Receipts', href: '/dashboard/receipts', icon: FileText },
  { name: 'More', href: '#menu', icon: Menu },
]

export default function MobileBottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setMobileSidebarOpen } = useUIStore()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 lg:hidden safe-area-bottom"
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = item.href === '/dashboard'
            ? location.pathname === '/dashboard'
            : item.href !== '#menu' && location.pathname.startsWith(item.href)
          const isMenu = item.href === '#menu'

          return (
            <button
              key={item.name}
              onClick={() => {
                if (isMenu) {
                  setMobileSidebarOpen(true)
                } else {
                  navigate(item.href)
                }
              }}
              className={cn(
                'flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors relative min-w-[56px]',
                isActive ? 'text-primary-600' : 'text-gray-500'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="mobileNavIndicator"
                  className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary-600 rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <item.icon className={cn(
                'w-5 h-5',
                isActive ? 'text-primary-600' : 'text-gray-400'
              )} />
              <span className={cn(
                'text-[10px] font-medium',
                isActive ? 'text-primary-600' : 'text-gray-500'
              )}>
                {item.name}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
