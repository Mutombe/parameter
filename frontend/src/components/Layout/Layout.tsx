import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Sidebar from './Sidebar'
import Header from './Header'
import AskMeButton from '../AskMe/AskMeButton'
import AskMeModal from '../AskMe/AskMeModal'
import DemoExpiryBanner from '../DemoExpiryBanner'
import { useUIStore } from '../../stores/uiStore'

const MOBILE_BREAKPOINT = 1024 // lg breakpoint

export default function Layout() {
  const {
    sidebarOpen,
    mobileSidebarOpen,
    askMeOpen,
    isMobile,
    setAskMeOpen,
    setIsMobile,
    setMobileSidebarOpen
  } = useUIStore()

  // Detect mobile/desktop and handle resize
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT
      setIsMobile(mobile)
      // Close mobile sidebar when switching to desktop
      if (!mobile) {
        setMobileSidebarOpen(false)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [setIsMobile, setMobileSidebarOpen])

  // Calculate main content margin based on device and sidebar state
  const getMainMargin = () => {
    if (isMobile) return 'ml-0' // No margin on mobile, sidebar is overlay
    return sidebarOpen ? 'lg:ml-[280px]' : 'lg:ml-20'
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobile && mobileSidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebarOpen(false)}
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            />
            {/* Sidebar Drawer */}
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-0 top-0 h-full z-50 lg:hidden"
            >
              <Sidebar isMobileDrawer onClose={() => setMobileSidebarOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className={`flex-1 flex flex-col transition-all duration-300 ${getMainMargin()}`}>
        <DemoExpiryBanner />
        <Header />

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AskMeButton />
      <AskMeModal open={askMeOpen} onClose={() => setAskMeOpen(false)} />
    </div>
  )
}
