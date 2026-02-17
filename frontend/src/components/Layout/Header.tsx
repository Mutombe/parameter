import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Search, LogOut, Settings, ChevronDown, Sparkles, HelpCircle, BookOpen, FileText, Loader2, Menu, Sun, Moon, Monitor } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { authApi } from '../../services/api'
import { getMediaUrl, cn } from '../../lib/utils'
import toast from 'react-hot-toast'
import NotificationsPanel, { useUnreadNotifications } from '../Notifications/NotificationsPanel'
import { TbUserSquareRounded } from "react-icons/tb";
import { RiClaudeFill } from "react-icons/ri";


export default function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { toggleAskMe, toggleMobileSidebar, isMobile, theme, setTheme } = useUIStore()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [avatarLoaded, setAvatarLoaded] = useState(false)
  const [avatarError, setAvatarError] = useState(false)

  // Reset avatar loading state when user changes
  useEffect(() => {
    setAvatarLoaded(false)
    setAvatarError(false)
  }, [user?.avatar])

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
    setSigningOut(true)
    try {
      await authApi.logout()
      logout()
      navigate('/login')
      toast.success('Logged out successfully')
    } catch {
      logout()
      navigate('/login')
    } finally {
      setSigningOut(false)
    }
  }

  // Avatar component with loading state
  const AvatarDisplay = ({ size = 'sm' }: { size?: 'sm' | 'lg' }) => {
    const sizeClasses = size === 'sm' ? 'w-9 h-9' : 'w-12 h-12'
    const textSize = size === 'sm' ? 'text-sm' : 'text-base font-semibold'
    const avatarUrl = user?.avatar ? getMediaUrl(user.avatar) : null
    console.debug('[Avatar Header]', { raw: user?.avatar, resolved: avatarUrl, avatarError, avatarLoaded })

    // Show initials if no avatar or avatar failed to load
    if (!avatarUrl || avatarError) {
      return (
        <div className={cn(
          sizeClasses,
          "rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white transition-opacity flex-shrink-0",
          textSize,
          signingOut && "opacity-50"
        )}>
          {user?.first_name?.[0]}{user?.last_name?.[0]}
        </div>
      )
    }

    return (
      <div className={cn("relative flex-shrink-0", sizeClasses)}>
        {/* Skeleton while loading */}
        {!avatarLoaded && (
          <div className={cn(sizeClasses, "absolute inset-0 rounded-full bg-gray-200 animate-pulse")} />
        )}
        <img
          src={avatarUrl}
          alt={user?.first_name || 'User'}
          onLoad={() => { console.debug('[Avatar Header] Image loaded successfully:', avatarUrl); setAvatarLoaded(true) }}
          onError={(e) => { console.debug('[Avatar Header] Image FAILED to load:', avatarUrl, (e.target as HTMLImageElement).src); setAvatarError(true) }}
          className={cn(
            "rounded-full object-cover transition-opacity aspect-square",
            sizeClasses,
            !avatarLoaded && "opacity-0",
            avatarLoaded && "opacity-100",
            signingOut && "opacity-50"
          )}
        />
      </div>
    )
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6">
      {/* Left side - Hamburger + Search */}
      <div className="flex items-center gap-3 flex-1">
        {/* Mobile hamburger menu */}
        <button
          onClick={toggleMobileSidebar}
          className="lg:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Search - navigates to dedicated search page */}
        <div className="flex-1 max-w-xl">
          <button
            onClick={() => navigate('/dashboard/search')}
            className="w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl hover:bg-white hover:border-gray-300 transition-all text-left group"
          >
            <Search className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" />
            <span className="text-gray-400 flex-1 group-hover:text-gray-600 transition-colors truncate hidden sm:block">
              Search properties, tenants, invoices...
            </span>
            <span className="text-gray-400 flex-1 group-hover:text-gray-600 transition-colors truncate sm:hidden">
              Search...
            </span>
            <div className="hidden md:flex items-center gap-1 text-xs text-gray-400">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">⌘</kbd>
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">K</kbd>
            </div>
          </button>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 md:gap-2">
        {/* AI Assistant Button */}
        <button
          onClick={toggleAskMe}
          className="flex items-center gap-2 px-2 md:px-3 py-2 text-sm text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors"
        >
          <RiClaudeFill className="w-4 h-4" />
          <span className="hidden md:inline font-medium">AI Assistant</span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')}
          className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          title={`Theme: ${theme}`}
        >
          {theme === 'dark' ? (
            <Moon className="w-5 h-5" />
          ) : theme === 'light' ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Monitor className="w-5 h-5" />
          )}
        </button>

        {/* Help - hidden on mobile */}
        <div className="relative hidden md:block">
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
                  className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg dark:shadow-black/30 border border-gray-200 overflow-hidden z-20"
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
                      onClick={() => { navigate('/learn'); setHelpOpen(false); }}
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
            className="relative p-2 md:p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 md:top-1 md:right-1 w-4 h-4 md:w-5 md:h-5 bg-red-500 text-white text-[10px] md:text-xs font-medium rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <NotificationsPanel
            open={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
          />
        </div>

        {/* Divider - hidden on small mobile */}
        <div className="hidden sm:block h-8 w-px bg-gray-200 mx-1 md:mx-2" />

        {/* User Dropdown */}
        <div className="relative">
          <button
            onClick={() => !signingOut && setDropdownOpen(!dropdownOpen)}
            className={cn(
              "flex items-center gap-2 md:gap-3 p-1 md:p-1.5 rounded-xl transition-colors",
              signingOut ? "cursor-wait" : "hover:bg-gray-100"
            )}
            disabled={signingOut}
          >
            <div className="relative">
              <AvatarDisplay size="sm" />
              {signingOut && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-11 h-11 animate-spin" viewBox="0 0 44 44">
                    <circle
                      className="opacity-25"
                      cx="22"
                      cy="22"
                      r="20"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="round"
                    />
                    <circle
                      className="text-primary-600"
                      cx="22"
                      cy="22"
                      r="20"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray="80"
                      strokeDashoffset="60"
                    />
                  </svg>
                </div>
              )}
            </div>
            <div className="text-left hidden lg:block">
              <p className={cn(
                "text-sm font-medium transition-colors",
                signingOut ? "text-gray-400" : "text-gray-900"
              )}>
                {signingOut ? "Signing out..." : `${user?.first_name} ${user?.last_name}`}
              </p>
              <p className="text-xs text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
            <ChevronDown className={cn(
              "w-4 h-4 hidden lg:block transition-colors",
              signingOut ? "text-gray-300" : "text-gray-400"
            )} />
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
                  className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg dark:shadow-black/30 border border-gray-200 overflow-hidden z-20"
                >
                  <div className="p-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <AvatarDisplay size="lg" />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{user?.first_name} {user?.last_name}</p>
                        <p className="text-sm text-gray-500 truncate">{user?.email}</p>
                      </div>
                    </div>
                  </div>

                  <div className="py-2">
                    <button
                      onClick={() => { navigate('/dashboard/profile'); setDropdownOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <TbUserSquareRounded className="w-4 h-4 text-gray-400" />
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
                      disabled={signingOut}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                        signingOut
                          ? "text-gray-400 cursor-wait"
                          : "text-red-600 hover:bg-red-50"
                      )}
                    >
                      {signingOut ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Signing out...
                        </>
                      ) : (
                        <>
                          <LogOut className="w-4 h-4" />
                          Sign out
                        </>
                      )}
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
