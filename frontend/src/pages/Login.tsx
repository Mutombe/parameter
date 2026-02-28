import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2, Building2, Shield, BarChart3, AlertTriangle } from 'lucide-react'
import { AxiosError } from 'axios'
import { useAuthStore } from '../stores/authStore'
import { authApi, reportsApi, propertyApi, landlordApi, tenantApi, invoiceApi, unitApi, leaseApi, receiptApi, expenseApi } from '../services/api'
import { useThemeEffect } from '../hooks/useThemeEffect'
import toast from 'react-hot-toast'
import { SiFsecure } from "react-icons/si";
import { PiBuildingApartmentLight } from "react-icons/pi";
import { PiUsersFour } from "react-icons/pi";
import { IoCheckmarkDoneCircleOutline } from "react-icons/io5";
import { TbChartInfographic } from "react-icons/tb";


const features = [
  { icon: PiBuildingApartmentLight, label: 'Property Management' },
  { icon: SiFsecure, label: 'Multi-tenant Security' },
  { icon: TbChartInfographic, label: 'Financial Reports' },
]

export default function Login() {
  useThemeEffect()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { setUser, isAuthenticated, user } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    email: '',
    password: '',
  })

  // Redirect authenticated users to their dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate(user?.role === 'tenant_portal' ? '/portal' : '/dashboard', { replace: true })
    }
  }, [isAuthenticated, user, navigate])

  // Check if redirected from demo expiry
  const demoExpired = location.state?.demoExpired

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await authApi.login(form)
      const loggedInUser = response.data.user
      setUser(loggedInUser)

      // Show demo warning if applicable
      if (response.data.demo_warning) {
        toast.success('Welcome! Your demo session is active.', { duration: 5000 })
      } else {
        toast.success('Welcome back!')
      }

      // Prefetch dashboard + core list data so pages load instantly after login
      if (loggedInUser?.role !== 'tenant_portal') {
        const PREFETCH_STALE = 5 * 60 * 1000
        queryClient.prefetchQuery({ queryKey: ['dashboard-stats'], queryFn: () => reportsApi.dashboard().then(r => r.data), staleTime: PREFETCH_STALE })
        queryClient.prefetchQuery({ queryKey: ['properties', '', 1], queryFn: () => propertyApi.list({ search: '', page: 1, page_size: 12 }).then(r => r.data), staleTime: PREFETCH_STALE })
        queryClient.prefetchQuery({ queryKey: ['landlords', '', 1], queryFn: () => landlordApi.list({ search: '', page: 1, page_size: 12 }).then(r => r.data), staleTime: PREFETCH_STALE })
        queryClient.prefetchQuery({ queryKey: ['tenants', '', 1, '', ''], queryFn: () => tenantApi.list({ search: '', page: 1, page_size: 12 }).then(r => r.data), staleTime: PREFETCH_STALE })
        queryClient.prefetchQuery({ queryKey: ['invoices', '', ''], queryFn: () => invoiceApi.list({}).then(r => r.data.results || r.data), staleTime: PREFETCH_STALE })
        queryClient.prefetchQuery({ queryKey: ['units', '', 'all'], queryFn: () => unitApi.list({ search: '' }).then(r => r.data.results || r.data), staleTime: PREFETCH_STALE })
        queryClient.prefetchQuery({ queryKey: ['leases', '', ''], queryFn: () => leaseApi.list({ search: '' }).then(r => r.data.results || r.data), staleTime: PREFETCH_STALE })
        queryClient.prefetchQuery({ queryKey: ['receipts', ''], queryFn: () => receiptApi.list({ search: '' }).then(r => r.data.results || r.data), staleTime: PREFETCH_STALE })
        queryClient.prefetchQuery({ queryKey: ['expenses', '', '', ''], queryFn: () => expenseApi.list({}).then(r => r.data.results || r.data), staleTime: PREFETCH_STALE })
      }

      // Redirect tenant portal users to /portal
      if (loggedInUser?.role === 'tenant_portal') {
        navigate('/portal')
      } else {
        navigate('/dashboard')
      }
    } catch (error) {
      const axiosErr = error as AxiosError<{ error?: string; demo_expired?: boolean }>
      // Handle different error cases with user-friendly messages
      const errorData = axiosErr.response?.data
      let errorMessage = 'Login failed. Please try again.'

      if (axiosErr.response?.status === 400) {
        // Validation errors
        errorMessage = errorData?.error || 'Invalid email or password'
      } else if (axiosErr.response?.status === 403) {
        // Check for demo expiry
        if (errorData?.demo_expired) {
          errorMessage = 'Your demo has expired. Please contact our sales team to activate your account.'
        } else {
          errorMessage = errorData?.error || 'Access denied. Please check your credentials.'
        }
      } else if (axiosErr.response?.status === 404) {
        errorMessage = 'Service unavailable. Please try again later.'
      } else if (axiosErr.response?.status && axiosErr.response.status >= 500) {
        errorMessage = 'Server error. Please try again later.'
      } else if (!axiosErr.response) {
        errorMessage = 'Network error. Please check your connection.'
      }

      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 p-12 flex-col justify-between relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full blur-3xl" style={{ backgroundColor: '#ffffff' }} />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full blur-3xl" style={{ backgroundColor: '#ffffff' }} />
        </div>
        <div className="absolute inset-0 opacity-10">
          <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
            <defs>
              <pattern
                id="grid"
                width="40"
                height="40"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="white"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Content */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Parameter"
              className="w-12 h-12 rounded-xl object-contain backdrop-blur p-1"
            />
            <div>
              <h1 className="text-2xl font-bold text-white">Parameter</h1>
              <p className="text-primary-200 text-sm">Real Estate Accounting</p>
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-4xl font-bold text-white leading-tight">
              Powerful accounting<br />
              for property managers
            </h2>
            <p className="text-primary-200 mt-4 text-lg max-w-md">
              Double-entry bookkeeping, multi-tenant isolation, and AI-powered insights for modern real estate businesses.
            </p>
          </motion.div>

          <div className="flex gap-6 mt-12">
            {features.map((feature, index) => (
              <motion.div
                key={feature.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className="flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center">
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-white/80 text-sm font-medium">{feature.label}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-primary-300 text-sm">
          © {new Date().getFullYear()} Parameter.co.zw. All rights reserved.
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 bg-gray-50 dark:bg-slate-900">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full max-w-md"
        >
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <img
              src="/logo.png"
              alt="Parameter"
              className="w-14 h-14 rounded-xl mx-auto mb-3 object-contain dark:brightness-0 dark:invert"
            />
            <h1 className="text-xl font-bold text-gray-900">Parameter</h1>
            <p className="text-gray-500 text-sm">Real Estate Accounting</p>
          </div>

          {/* Demo Expired Notice */}
          {demoExpired && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Demo Session Expired</p>
                <p className="text-sm text-amber-700">
                  Your demo session has ended. Contact our sales team to activate your account.
                </p>
              </div>
            </div>
          )}

          {/* Login Card */}
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 dark:shadow-black/30 p-8 border border-gray-100 dark:bg-slate-800 dark:border-slate-700">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
              <p className="text-gray-500 mt-1">Enter your credentials to access your account</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
                  placeholder="you@company.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all pr-12 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-600">Remember me</span>
                </label>
                <Link to="/forgot-password" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>

            {/* Try Demo CTA */}
            <div className="mt-6 p-4 bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl border border-primary-100">
              <p className="text-sm font-medium text-primary-800 mb-2">New to Parameter?</p>
              <p className="text-xs text-primary-600 mb-3">
                Try our platform free with sample data. No credit card required.
              </p>
              <Link
                to="/signup"
                className="inline-flex items-center justify-center w-full py-2 px-4 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
              >
                Start Free Demo
              </Link>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-8 space-y-2">
            <p className="text-gray-400 text-sm">
              Secured by enterprise-grade encryption
            </p>
            <div className="flex items-center justify-center gap-4 text-sm">
              <Link to="/" className="text-primary-600 hover:text-primary-700 font-medium">
                About Us
              </Link>
              <span className="text-gray-300">|</span>
              <Link to="/learn" className="text-primary-600 hover:text-primary-700 font-medium">
                Documentation
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
