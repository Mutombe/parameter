import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation } from '@tanstack/react-query'
import {
  Eye, EyeOff, CheckCircle, XCircle, Loader2, Building2,
  User, ChevronRight, ChevronLeft, Clock, Sparkles, AlertCircle
} from 'lucide-react'
import { tenantInvitationsApi, demoApi, tenantsApi } from '../services/api'
import { cn } from '../lib/utils'
import toast from 'react-hot-toast'

interface InvitationData {
  email: string
  company_name: string
  first_name: string
  last_name: string
  invitation_type: 'full' | 'demo'
  subscription_plan: string
  expires_at: string
}

const steps = [
  { id: 1, title: 'Company Setup', icon: Building2 },
  { id: 2, title: 'Admin Account', icon: User },
]

export default function Signup() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  // State
  const [mode, setMode] = useState<'invited' | 'demo' | 'loading'>('loading')
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [showPassword, setShowPassword] = useState(false)
  const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')

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
    } catch (err: any) {
      const message = err.response?.data?.error || 'This invitation link is invalid or has expired.'
      setError(message)
      setMode('demo')
    }
  }

  // Check subdomain availability
  const checkSubdomainMutation = useMutation({
    mutationFn: (subdomain: string) => tenantsApi.checkSubdomain(subdomain),
    onSuccess: (response) => {
      setSubdomainStatus(response.data.available ? 'available' : 'taken')
    },
    onError: () => {
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

  // Demo signup mutation
  const demoSignupMutation = useMutation({
    mutationFn: (data: any) => demoApi.signup(data),
    onSuccess: (response) => {
      toast.success('Demo account created! Your demo expires in 2 hours.')
      window.location.href = response.data.login_url || '/login'
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Demo signup failed')
    },
  })

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
      demoSignupMutation.mutate({
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
    }
  }

  const isLoading = mode === 'loading'
  const isPending = acceptInvitationMutation.isPending || demoSignupMutation.isPending
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm border border-gray-200">
            <img
              src="/logo.png"
              alt="Parameter"
              className="w-8 h-8 rounded-lg object-contain"
            />
            <span className="font-bold text-xl text-gray-900">Parameter</span>
          </div>
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
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <AnimatePresence mode="wait">
            {/* Step 1: Company Setup */}
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8"
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
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                    <div className="flex">
                      <input
                        type="text"
                        value={formData.subdomain}
                        onChange={(e) => updateForm('subdomain', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        className="flex-1 px-4 py-3 border border-gray-200 rounded-l-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        placeholder="acme"
                      />
                      <span className="px-4 py-3 bg-gray-50 border border-l-0 border-gray-200 rounded-r-xl text-gray-500 text-sm">
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
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={formData.company_phone}
                        onChange={(e) => updateForm('company_phone', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                className="p-8"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Create Admin Account</h2>

                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        First Name *
                      </label>
                      <input
                        type="text"
                        value={formData.admin_first_name}
                        onChange={(e) => updateForm('admin_first_name', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 pr-12"
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
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
          <div className="px-8 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
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
