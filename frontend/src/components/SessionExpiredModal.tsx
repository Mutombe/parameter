import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Eye, EyeOff, LogOut, Loader2 } from 'lucide-react'
import { useSessionStore } from '../stores/sessionStore'
import { useAuthStore } from '../stores/authStore'
import { authApi } from '../services/api'
import api from '../services/api'
import { showToast } from '../lib/toast'

export default function SessionExpiredModal() {
  const { isSessionExpired, setSessionExpired, drainQueue, clearQueue } = useSessionStore()
  const { user, setUser, logout } = useAuthStore()

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleReLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.email || !password.trim()) return

    setError('')
    setLoading(true)

    try {
      const response = await authApi.login({ email: user.email, password })
      setUser(response.data.user)
      setSessionExpired(false)
      setPassword('')

      // Drain and replay queued requests
      const queue = drainQueue()
      for (const { config, resolve, reject } of queue) {
        // FormData requests can't be reliably replayed (file streams are consumed)
        if (config.data instanceof FormData) {
          reject(new Error('Session expired during file upload'))
          showToast.warning('Please retry your file upload')
          continue
        }
        try {
          const result = await api.request(config)
          resolve(result)
        } catch (err) {
          reject(err)
        }
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string }; status?: number } }
      if (axiosErr.response?.status === 401) {
        setError('Incorrect password. Please try again.')
      } else if (axiosErr.response?.data?.detail) {
        setError(axiosErr.response.data.detail)
      } else {
        setError('Unable to sign in. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = () => {
    clearQueue()
    logout()
    setPassword('')
    setError('')
    setSessionExpired(false)
    window.location.href = '/login'
  }

  return (
    <AnimatePresence>
      {isSessionExpired && (
        <div className="fixed inset-0 z-[70] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            {/* Backdrop — no onClick (cannot dismiss) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="relative bg-white rounded-2xl shadow-xl w-full max-w-md"
            >
              {/* Header */}
              <div className="flex flex-col items-center pt-8 pb-2 px-6">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
                  <Lock className="w-7 h-7 text-amber-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">Session Expired</h2>
                <p className="mt-2 text-sm text-gray-500 text-center">
                  Your session has expired. Please sign in again to continue where you left off.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleReLogin} className="p-6 space-y-4">
                {/* Email (read-only) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    readOnly
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (error) setError('')
                      }}
                      placeholder="Enter your password"
                      autoFocus
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Inline error */}
                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                    {error}
                  </p>
                )}

                {/* Sign In button */}
                <button
                  type="submit"
                  disabled={loading || !password.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-xl hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>

                {/* Sign out link */}
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign out instead
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}
