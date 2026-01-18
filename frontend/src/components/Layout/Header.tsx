import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Search, User, LogOut, Settings, ChevronDown, Sparkles, HelpCircle, BookOpen, FileText } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { authApi } from '../../services/api'
import { getMediaUrl } from '../../lib/utils'
import toast from 'react-hot-toast'
import NotificationsPanel, { useUnreadNotifications } from '../Notifications/NotificationsPanel'

export default function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { toggleAskMe } = useUIStore()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  // Keyboard shortcut for search (Cmd/Ctrl + K) - navigates to search page
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        // Only navigate if not already on search page
        if (location.pathname !== '/dashboard/search') {
          navigate('/dashboard/search')
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate, location.pathname])

  const unreadCount = useUnreadNotifications()

  const handleLogout = async () => {
    try {
      await authApi.logout()
      logout()
      navigate('/login')
      toast.success('Logged out successfully')
    } catch {
      logout()
      navigate('/login')
    }
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Search - navigates to dedicated search page */}
      <div className="flex-1 max-w-xl">
        <button
          onClick={() => navigate('/dashboard/search')}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl hover:bg-white hover:border-gray-300 transition-all text-left group"
        >
          <Search className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors" />
          <span className="text-gray-400 flex-1 group-hover:text-gray-600 transition-colors">Search properties, tenants, invoices...</span>
          <div className="hidden sm:flex items-center gap-1 text-xs text-gray-400">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">⌘</kbd>
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">K</kbd>
          </div>
        </button>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* AI Assistant Button */}
        <button
          onClick={toggleAskMe}
          className="flex items-center gap-2 px-3 py-2 text-sm text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline font-medium">AI Assistant</span>
        </button>

        {/* Help */}
        <div className="relative">
          <button
            onClick={() => setHelpOpen(!helpOpen)}
            className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          <AnimatePresence>
            {helpOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setHelpOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-20"
                >
                  <div className="p-4 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-900">Help & Resources</h3>
                    <p className="text-xs text-gray-500 mt-1">Get support and learn more</p>
                  </div>

                  <div className="py-2">
                    <button
                      onClick={() => { toggleAskMe(); setHelpOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-purple-50 transition-colors"
                    >
                      <div className="p-1.5 bg-purple-100 rounded-lg">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">Ask AI Assistant</p>
                        <p className="text-xs text-gray-500">Get instant answers</p>
                      </div>
                    </button>
                    <button
                      onClick={() => { navigate('/dashboard/reports'); setHelpOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <div className="p-1.5 bg-blue-100 rounded-lg">
                        <FileText className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">View Reports</p>
                        <p className="text-xs text-gray-500">Financial statements & analytics</p>
                      </div>
                    </button>
                    <button
                      onClick={() => { setHelpOpen(false); toast.success('Documentation coming soon!'); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <div className="p-1.5 bg-emerald-100 rounded-lg">
                        <BookOpen className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">Documentation</p>
                        <p className="text-xs text-gray-500">Guides & tutorials</p>
                      </div>
                    </button>
                  </div>

                  <div className="p-3 bg-gray-50 border-t border-gray-100">
                    <p className="text-xs text-gray-500 text-center">
                      Press <kbd className="px-1.5 py-0.5 bg-white rounded border text-gray-600">⌘K</kbd> to search anytime
                    </p>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <NotificationsPanel
            open={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
          />
        </div>

        {/* Divider */}
        <div className="h-8 w-px bg-gray-200 mx-2" />

        {/* User Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-3 p-1.5 hover:bg-gray-100 rounded-xl transition-colors"
          >
            {user?.avatar ? (
              <img
                src={getMediaUrl(user.avatar) || ''}
                alt={user.first_name}
                className="w-9 h-9 rounded-xl object-cover"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-medium text-sm">
                {user?.first_name?.[0]}{user?.last_name?.[0]}
              </div>
            )}
            <div className="text-left hidden md:block">
              <p className="text-sm font-medium text-gray-900">
                {user?.first_name} {user?.last_name}
              </p>
              <p className="text-xs text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400 hidden md:block" />
          </button>

          <AnimatePresence>
            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setDropdownOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-20"
                >
                  <div className="p-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      {user?.avatar ? (
                        <img
                          src={getMediaUrl(user.avatar) || ''}
                          alt={user.first_name}
                          className="w-12 h-12 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-semibold">
                          {user?.first_name?.[0]}{user?.last_name?.[0]}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{user?.first_name} {user?.last_name}</p>
                        <p className="text-sm text-gray-500">{user?.email}</p>
                      </div>
                    </div>
                  </div>

                  <div className="py-2">
                    <button
                      onClick={() => { navigate('/dashboard/profile'); setDropdownOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <User className="w-4 h-4 text-gray-400" />
                      My Profile
                    </button>
                    <button
                      onClick={() => { navigate('/dashboard/settings'); setDropdownOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Settings className="w-4 h-4 text-gray-400" />
                      Settings
                    </button>
                  </div>

                  <div className="border-t border-gray-100 py-2">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
