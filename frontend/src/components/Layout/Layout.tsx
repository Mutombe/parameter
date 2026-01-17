import { Outlet } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Sidebar from './Sidebar'
import Header from './Header'
import AskMeButton from '../AskMe/AskMeButton'
import AskMeModal from '../AskMe/AskMeModal'
import DemoExpiryBanner from '../DemoExpiryBanner'
import { useUIStore } from '../../stores/uiStore'

export default function Layout() {
  const { sidebarOpen, askMeOpen, setAskMeOpen } = useUIStore()

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <div className={`flex-1 flex flex-col transition-all duration-300 ${sidebarOpen ? 'ml-[280px]' : 'ml-20'}`}>
        <DemoExpiryBanner />
        <Header />

        <main className="flex-1 overflow-auto p-6">
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
