import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation } from '@tanstack/react-query'
import {
  Eye, EyeOff, CheckCircle, XCircle, Loader2, Building2,
  User, ChevronRight, ChevronLeft, Clock, Sparkles, AlertCircle, RefreshCw
} from 'lucide-react'
import { tenantInvitationsApi, demoApi, tenantsApi } from '../services/api'
import { cn, getErrorMessage } from '../lib/utils'
import { useThemeEffect } from '../hooks/useThemeEffect'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import { PiUsersFour } from "react-icons/pi";
import { RiClaudeFill } from "react-icons/ri";
import { PiBuildingApartmentLight } from "react-icons/pi";

interface InvitationData {
  email: string
  company_name: string
  first_name: string
  last_name: string
  invitation_type: 'full' | 'demo'
  subscription_plan: string
  expires_at: string
}

interface DemoProgress {
  stage: 'submitting' | 'processing' | 'polling' | 'logging-in' | 'done' | 'error'
  message: string
  requestId?: string
  error?: string
}

const steps = [
  { id: 1, title: 'Company Setup', icon: Building2 },
  { id: 2, title: 'Admin Account', icon: User },
]

const POLL_INTERVAL = 3000
const MAX_POLL_ATTEMPTS = 120 // 6 minutes max

export default function Signup() {
  useThemeEffect()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const setUser = useAuthStore((s) => s.setUser)

  // State
  const [mode, setMode] = useState<'invited' | 'demo' | 'loading'>('loading')
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [showPassword, setShowPassword] = useState(false)
  const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [demoProgress, setDemoProgress] = useState<DemoProgress | null>(null)

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [formData, setFormData] = useState({
    // Company Info
    company_name: '',
    subdomain: '',
    company_email: '',
    company_phone: '',
    company_address: '',
    default_currency: 'USD',
    // Admin
    admin_email: '',
    admin_password: '',
    admin_password_confirm: '',
    admin_first_name: '',
    admin_last_name: '',
    admin_phone: '',
  })

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [])

  // Check for invitation token
  useEffect(() => {
    if (token) {
      validateInvitation()
    } else {
      setMode('demo')
    }
  }, [token])

  // Validate invitation token
  const validateInvitation = async () => {
    try {
      const response = await tenantInvitationsApi.validate(token!)
      setInvitation(response.data)
      setFormData(prev => ({
        ...prev,
        company_name: response.data.company_name,
        company_email: response.data.email,
        admin_email: response.data.email,
        admin_first_name: response.data.first_name || '',
        admin_last_name: response.data.last_name || '',
      }))
      setMode('invited')
    } catch (err) {
      setError(getErrorMessage(err, 'This invitation link is invalid or has expired.'))
      setMode('demo')
    }
  }

  // Check subdomain availability
  const [subdomainError, setSubdomainError] = useState<string | null>(null)
  const checkSubdomainMutation = useMutation({
    mutationFn: (subdomain: string) => tenantsApi.checkSubdomain(subdomain),
    onSuccess: (response) => {
      console.debug('[Signup] Subdomain check response:', response.data)
      setSubdomainError(null)
      setSubdomainStatus(response.data.available ? 'available' : 'taken')
    },
    onError: (error: any) => {
      console.debug('[Signup] Subdomain check failed:', error.response?.status, error.message)
      setSubdomainError('Could not check availability. Please try again.')
      setSubdomainStatus('idle')
    },
  })

  // Debounced subdomain check
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (formData.subdomain && formData.subdomain.length >= 3) {
        setSubdomainStatus('checking')
        checkSubdomainMutation.mutate(formData.subdomain)
      } else {
        setSubdomainStatus('idle')
      }
    }, 500)
    return () => clearTimeout(timeout)
  }, [formData.subdomain])

  // Accept invitation mutation
  const acceptInvitationMutation = useMutation({
    mutationFn: (data: any) => tenantInvitationsApi.accept(data),
    onSuccess: (response) => {
      const isDemo = invitation?.invitation_type === 'demo'
      if (isDemo) {
        toast.success('Demo account created! Your demo expires in 2 hours.')
      } else {
        toast.success('Company registered successfully!')
      }
      window.location.href = response.data.login_url || '/login'
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Registration failed')
    },
  })

  // --- Demo signup async flow ---
  const pollForCompletion = useCallback(async (requestId: string, attempt: number = 0) => {
    if (attempt >= MAX_POLL_ATTEMPTS) {
      setDemoProgress({
        stage: 'error',
        message: 'Account creation is taking longer than expected.',
        requestId,
        error: 'Timeout waiting for account creation. Please try again.',
      })
      return
    }

    try {
      const statusRes = await demoApi.checkStatus(requestId)
      const data = statusRes.data

      if (data.status === 'completed') {
        // Set tenant context in sessionStorage
        const subdomain = data.subdomain
        if (subdomain) {
          sessionStorage.setItem('tenant_subdomain', subdomain)
        }

        setDemoProgress({
          stage: 'logging-in',
          message: 'Logging you in...',
          requestId,
        })

        // Auto-login using the token
        if (data.auto_login_token && subdomain) {
          try {
            const loginRes = await demoApi.autoLogin(data.auto_login_token, subdomain)
            setUser(loginRes.data.user)

            setDemoProgress({
              stage: 'done',
              message: 'Welcome to your demo!',
              requestId,
            })

            toast.success('Demo account created! Your demo expires in 2 hours.')
            navigate('/dashboard')
            return
          } catch {
            // Auto-login failed, fall back to login page with context
            toast.success('Demo account created! Please log in with your credentials.')
            navigate('/login')
            return
          }
        }

        // No auto-login token available, redirect to login
        toast.success('Demo account created! Please log in with your credentials.')
        navigate('/login')
        return
      }

      if (data.status === 'failed') {
        setDemoProgress({
          stage: 'error',
          message: data.message || 'Account creation failed.',
          requestId,
          error: data.error || 'An unexpected error occurred.',
        })
        return
      }

      // Still processing or pending — update message and poll again
      const messages = [
        'Creating your demo company...',
        'Setting up your account...',
        'Configuring sample data...',
        'Almost ready...',
      ]
      const messageIndex = Math.min(Math.floor(attempt / 5), messages.length - 1)

      setDemoProgress({
        stage: 'polling',
        message: messages[messageIndex],
        requestId,
      })

      pollRef.current = setTimeout(() => pollForCompletion(requestId, attempt + 1), POLL_INTERVAL)
    } catch {
      // Network error during polling — retry
      if (attempt < MAX_POLL_ATTEMPTS) {
        pollRef.current = setTimeout(() => pollForCompletion(requestId, attempt + 1), POLL_INTERVAL)
      } else {
        setDemoProgress({
          stage: 'error',
          message: 'Lost connection while creating your account.',
          requestId,
          error: 'Network error. Please check your connection and try again.',
        })
      }
    }
  }, [navigate, setUser])

  const startDemoSignup = useCallback(async () => {
    setDemoProgress({
      stage: 'submitting',
      message: 'Submitting your request...',
    })

    try {
      // Step 1: Submit signup request
      const signupRes = await demoApi.signup({
        company_name: formData.company_name,
        subdomain: formData.subdomain,
        company_email: formData.company_email,
        company_phone: formData.company_phone,
        admin_email: formData.admin_email,
        admin_password: formData.admin_password,
        admin_password_confirm: formData.admin_password_confirm,
        admin_first_name: formData.admin_first_name,
        admin_last_name: formData.admin_last_name,
        admin_phone: formData.admin_phone,
        default_currency: formData.default_currency,
      })

      const requestId = signupRes.data.request_id

      setDemoProgress({
        stage: 'processing',
        message: 'Creating your demo company...',
        requestId,
      })

      // Step 2: Trigger processing
      await demoApi.process(requestId)

      // Step 3: Start polling for completion
      setDemoProgress({
        stage: 'polling',
        message: 'Creating your demo company...',
        requestId,
      })

      pollForCompletion(requestId)
    } catch (err: any) {
      const errorMsg = err.response?.data?.error
        || err.response?.data?.errors
          ? Object.values(err.response?.data?.errors || {}).flat().join(', ')
          : 'Demo signup failed. Please try again.'
      setDemoProgress({
        stage: 'error',
        message: 'Signup failed',
        error: typeof errorMsg === 'string' ? errorMsg : 'Demo signup failed. Please try again.',
      })
    }
  }, [formData, pollForCompletion])

  const handleRetry = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current)

    const requestId = demoProgress?.requestId
    if (requestId) {
      // Retry from processing step
      setDemoProgress({
        stage: 'processing',
        message: 'Retrying account creation...',
        requestId,
      })

      demoApi.process(requestId).then(() => {
        setDemoProgress({
          stage: 'polling',
          message: 'Creating your demo company...',
          requestId,
        })
        pollForCompletion(requestId)
      }).catch(() => {
        setDemoProgress({
          stage: 'error',
          message: 'Retry failed',
          requestId,
          error: 'Could not restart account creation. Please try again.',
        })
      })
    } else {
      // Start from scratch
      setDemoProgress(null)
    }
  }, [demoProgress, pollForCompletion])

  const updateForm = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value })
  }

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        if (mode === 'invited') {
          return !!(formData.subdomain && subdomainStatus === 'available')
        }
        return !!(
          formData.company_name &&
          formData.subdomain &&
          formData.company_email &&
          subdomainStatus === 'available'
        )
      case 2:
        return !!(
          formData.admin_email &&
          formData.admin_password &&
          formData.admin_password === formData.admin_password_confirm &&
          formData.admin_first_name &&
          formData.admin_last_name &&
          formData.admin_password.length >= 8
        )
      default:
        return false
    }
  }

  const handleNext = () => {
    if (currentStep < 2 && validateStep(currentStep)) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = () => {
    if (!validateStep(2)) {
      toast.error('Please fill in all required fields')
      return
    }

    if (mode === 'invited' && token) {
      acceptInvitationMutation.mutate({
        token,
        subdomain: formData.subdomain,
        company_phone: formData.company_phone,
        company_address: formData.company_address,
        admin_password: formData.admin_password,
        admin_password_confirm: formData.admin_password_confirm,
        admin_first_name: formData.admin_first_name,
        admin_last_name: formData.admin_last_name,
        admin_phone: formData.admin_phone,
        default_currency: formData.default_currency,
      })
    } else {
      startDemoSignup()
    }
  }

  const isLoading = mode === 'loading'
  const isPending = acceptInvitationMutation.isPending || demoProgress !== null
  const isDemo = mode === 'demo' || invitation?.invitation_type === 'demo'

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Validating invitation...</p>
        </motion.div>
      </div>
    )
  }

  // Demo progress screen
  if (demoProgress) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <a href="/" className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm border border-gray-200">
              <img
                src="/logo.png"
                alt="Parameter"
                className="w-8 h-8 rounded-lg object-contain dark:brightness-0 dark:invert"
              />
              <span className="font-bold text-xl text-gray-900">Parameter</span>
            </a>
          </div>

          <div className="bg-white rounded-2xl shadow-xl dark:shadow-black/30 border border-gray-200 p-8">
            {demoProgress.stage === 'error' ? (
              <div className="text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <XCircle className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  Something went wrong
                </h2>
                <p className="text-sm text-gray-600 mb-1">{demoProgress.message}</p>
                {demoProgress.error && (
                  <p className="text-sm text-red-600 mb-6">{demoProgress.error}</p>
                )}
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={handleRetry}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white text-sm font-medium rounded-xl hover:bg-primary-600 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Try Again
                  </button>
                  <button
                    onClick={() => { if (pollRef.current) clearTimeout(pollRef.current); setDemoProgress(null) }}
                    className="px-5 py-2.5 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    Start Over
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  Setting up your demo
                </h2>
                <p className="text-gray-600 font-medium mb-1">
                  {formData.company_name}
                </p>
                <motion.p
                  key={demoProgress.message}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-gray-500"
                >
                  {demoProgress.message}
                </motion.p>

                {/* Progress dots */}
                <div className="flex justify-center gap-2 mt-6">
                  {['submitting', 'processing', 'polling', 'logging-in'].map((stage, i) => {
                    const stages = ['submitting', 'processing', 'polling', 'logging-in']
                    const currentIndex = stages.indexOf(demoProgress.stage)
                    const isComplete = i < currentIndex
                    const isCurrent = i === currentIndex
                    return (
                      <div
                        key={stage}
                        className={cn(
                          'w-2.5 h-2.5 rounded-full transition-colors',
                          isComplete && 'bg-primary-500',
                          isCurrent && 'bg-primary-400 animate-pulse',
                          !isComplete && !isCurrent && 'bg-gray-200'
                        )}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-sm text-gray-500">
            This usually takes 1-2 minutes. Please don't close this page.
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm border border-gray-200">
            <img
              src="/logo.png"
              alt="Parameter"
              className="w-8 h-8 rounded-lg object-contain dark:brightness-0 dark:invert"
            />
            <span className="font-bold text-xl text-gray-900">Parameter</span>
          </a>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">
            {mode === 'invited' ? 'Complete Your Registration' : 'Start Your Free Demo'}
          </h1>
          <p className="mt-2 text-gray-600">
            {mode === 'invited'
              ? `You've been invited to set up ${invitation?.company_name}`
              : 'Try Parameter free for 2 hours with sample data'}
          </p>
        </div>

        {/* Demo Notice */}
        {isDemo && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">Demo Account</p>
              <p className="text-sm text-amber-700">
                Your demo account will be active for 2 hours. All data will be preserved for when you're ready to subscribe.
              </p>
            </div>
          </div>
        )}

        {/* Error from invalid invitation */}
        {error && token && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Invitation Error</p>
              <p className="text-sm text-red-700">{error}</p>
              <p className="text-sm text-red-700 mt-1">You can still create a demo account below.</p>
            </div>
          </div>
        )}

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          {steps.map((step, idx) => {
            const StepIcon = step.icon
            const isComplete = currentStep > step.id
            const isCurrent = currentStep === step.id
            return (
              <div key={step.id} className="flex items-center">
                <div className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl transition-colors',
                  isCurrent && 'bg-primary-100 text-primary-700',
                  isComplete && 'bg-emerald-100 text-emerald-700',
                  !isCurrent && !isComplete && 'text-gray-400'
                )}>
                  {isComplete ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <StepIcon className="w-5 h-5" />
                  )}
                  <span className="font-medium text-sm hidden sm:inline">{step.title}</span>
                </div>
                {idx < steps.length - 1 && (
                  <ChevronRight className="w-5 h-5 text-gray-300 mx-2" />
                )}
              </div>
            )
          })}
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl dark:shadow-black/30 border border-gray-200 overflow-hidden">
          <AnimatePresence mode="wait">
            {/* Step 1: Company Setup */}
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-5 sm:p-8"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Company Setup</h2>

                <div className="space-y-5">
                  {mode === 'demo' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Company Name *
                        </label>
                        <input
                          type="text"
                          value={formData.company_name}
                          onChange={(e) => updateForm('company_name', e.target.value)}
                          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
                          placeholder="Acme Real Estate"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Company Email *
                        </label>
                        <input
                          type="email"
                          value={formData.company_email}
                          onChange={(e) => updateForm('company_email', e.target.value)}
                          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
                          placeholder="info@acme.com"
                        />
                      </div>
                    </>
                  )}

                  {mode === 'invited' && (
                    <div className="bg-gray-50 rounded-xl p-4 mb-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Company</p>
                          <p className="font-medium text-gray-900">{invitation?.company_name}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Plan</p>
                          <p className="font-medium text-gray-900 capitalize">{invitation?.subscription_plan}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
    Subdomain * <span className="text-gray-400 font-normal">(your unique URL)</span>
  </label>
  <div className="flex flex-col sm:flex-row">
    <input
      type="text"
      value={formData.subdomain}
      onChange={(e) => updateForm('subdomain', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl sm:rounded-l-xl sm:rounded-r-none text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
      placeholder="acme"
    />
    <span className="px-4 py-2 sm:py-3 bg-gray-50 border border-t-0 sm:border-t sm:border-l-0 border-gray-200 rounded-b-xl sm:rounded-b-none sm:rounded-r-xl text-gray-500 text-sm flex items-center justify-center sm:justify-start">
      .parameter.co.zw
    </span>
  </div>
                    {subdomainStatus === 'checking' && (
                      <p className="mt-1 text-sm text-gray-500 flex items-center gap-1">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Checking availability...
                      </p>
                    )}
                    {subdomainStatus === 'available' && (
                      <p className="mt-1 text-sm text-emerald-600 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        Subdomain is available!
                      </p>
                    )}
                    {subdomainStatus === 'taken' && (
                      <p className="mt-1 text-sm text-rose-600 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        This subdomain is already taken
                      </p>
                    )}
                    {subdomainError && subdomainStatus === 'idle' && formData.subdomain.length >= 3 && (
                      <p className="mt-1 text-sm text-amber-600 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {subdomainError}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={formData.company_phone}
                        onChange={(e) => updateForm('company_phone', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
                        placeholder="+263 77 123 4567"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Currency
                      </label>
                      <select
                        value={formData.default_currency}
                        onChange={(e) => updateForm('default_currency', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
                      >
                        <option value="USD">USD - US Dollar</option>
                        <option value="ZiG">ZiG - Zimbabwe Gold</option>
                      </select>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Admin Account */}
            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-5 sm:p-8"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Create Admin Account</h2>

                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        First Name *
                      </label>
                      <input
                        type="text"
                        value={formData.admin_first_name}
                        onChange={(e) => updateForm('admin_first_name', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
                        placeholder="John"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Last Name *
                      </label>
                      <input
                        type="text"
                        value={formData.admin_last_name}
                        onChange={(e) => updateForm('admin_last_name', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
                        placeholder="Doe"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      value={formData.admin_email}
                      onChange={(e) => updateForm('admin_email', e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
                      placeholder="john@acme.com"
                      disabled={mode === 'invited'}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password * <span className="text-gray-400 font-normal">(min. 8 characters)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.admin_password}
                        onChange={(e) => updateForm('admin_password', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 pr-12 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
                        placeholder="Create a strong password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      value={formData.admin_password_confirm}
                      onChange={(e) => updateForm('admin_password_confirm', e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
                      placeholder="Confirm your password"
                    />
                    {formData.admin_password_confirm && formData.admin_password !== formData.admin_password_confirm && (
                      <p className="mt-1 text-sm text-rose-600 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        Passwords don't match
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer */}
          <div className="px-4 sm:px-8 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={currentStep === 1}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors',
                currentStep === 1
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              )}
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            {currentStep < 2 ? (
              <button
                onClick={handleNext}
                disabled={!validateStep(currentStep)}
                className={cn(
                  'flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-xl transition-colors',
                  validateStep(currentStep)
                    ? 'bg-primary-500 text-white hover:bg-primary-600'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                )}
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!validateStep(2) || isPending}
                className={cn(
                  'flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-xl transition-colors',
                  validateStep(2) && !isPending
                    ? 'bg-primary-500 text-white hover:bg-primary-600'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                )}
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {isDemo ? 'Start Demo' : 'Create Company'}
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Login Link */}
        <p className="mt-6 text-center text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-600 font-medium hover:text-primary-700">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
