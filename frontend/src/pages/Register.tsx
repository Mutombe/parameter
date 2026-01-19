import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2,
  User,
  Check,
  ChevronRight,
  ChevronLeft,
  DollarSign,
  Sparkles,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'
import { tenantsApi } from '../services/api'
import { cn } from '../lib/utils'
import toast from 'react-hot-toast'
import { PiUsersFour } from "react-icons/pi";
import { PiBuildingApartmentLight } from "react-icons/pi";
import { RiClaudeFill } from "react-icons/ri";

const steps = [
  { id: 1, title: 'Company Info', icon: Building2 },
  { id: 2, title: 'Choose Plan', icon: DollarSign },
  { id: 3, title: 'Admin Account', icon: User },
]

export default function Register() {
  const [currentStep, setCurrentStep] = useState(1)
  const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')

  const [formData, setFormData] = useState({
    // Company Info
    company_name: '',
    subdomain: '',
    company_email: '',
    company_phone: '',
    company_address: '',
    default_currency: 'USD',
    // Plan
    subscription_plan: 'free',
    // Admin
    admin_email: '',
    admin_password: '',
    admin_confirm_password: '',
    admin_first_name: '',
    admin_last_name: '',
    admin_phone: '',
  })

  // Fetch plans
  const { data: plansData } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => tenantsApi.getPlans().then(r => r.data),
  })

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

  // Register company
  const registerMutation = useMutation({
    mutationFn: (data: any) => tenantsApi.register(data),
    onSuccess: (response) => {
      toast.success('Company registered successfully!')
      // Redirect to the new tenant's login
      window.location.href = response.data.login_url || '/login'
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Registration failed')
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

  const updateForm = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value })
  }

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(formData.company_name && formData.subdomain && formData.company_email && subdomainStatus === 'available')
      case 2:
        return !!formData.subscription_plan
      case 3:
        return !!(
          formData.admin_email &&
          formData.admin_password &&
          formData.admin_password === formData.admin_confirm_password &&
          formData.admin_first_name &&
          formData.admin_last_name &&
          formData.admin_password.length >= 8
        )
      default:
        return false
    }
  }

  const handleNext = () => {
    if (currentStep < 3 && validateStep(currentStep)) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = () => {
    if (!validateStep(3)) {
      toast.error('Please fill in all required fields')
      return
    }

    registerMutation.mutate({
      company_name: formData.company_name,
      subdomain: formData.subdomain,
      company_email: formData.company_email,
      company_phone: formData.company_phone,
      company_address: formData.company_address,
      subscription_plan: formData.subscription_plan,
      default_currency: formData.default_currency,
      admin_email: formData.admin_email,
      admin_password: formData.admin_password,
      admin_first_name: formData.admin_first_name,
      admin_last_name: formData.admin_last_name,
      admin_phone: formData.admin_phone,
    })
  }

  const plans = plansData?.plans || []

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
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl text-gray-900">Parameter</span>
          </div>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Register Your Company</h1>
          <p className="mt-2 text-gray-600">Start your 14-day free trial</p>
        </div>

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
                    <Check className="w-5 h-5" />
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
            {/* Step 1: Company Info */}
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Company Information</h2>

                <div className="space-y-5">
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
    Subdomain * <span className="text-gray-400 font-normal">(your unique URL)</span>
  </label>
  <div className="flex flex-col sm:flex-row">
    <input
      type="text"
      value={formData.subdomain}
      onChange={(e) => updateForm('subdomain', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
      className="w-full px-4 py-3 border border-gray-200 rounded-xl sm:rounded-l-xl sm:rounded-r-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
      placeholder="acme"
    />
    <span className="px-4 py-2 sm:py-3 bg-gray-50 border border-t-0 sm:border-t sm:border-l-0 border-gray-200 rounded-b-xl sm:rounded-b-none sm:rounded-r-xl text-gray-500 text-sm flex items-center justify-center sm:justify-start whitespace-nowrap">
      .parameter.co.zw
    </span>
  </div>
  {subdomainStatus === 'checking' && (
    <p className="mt-1 text-sm text-gray-500 flex items-center gap-1">
      <span className="w-4 h-4 border-2 border-gray-300 border-t-primary-500 rounded-full animate-spin" />
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

            {/* Step 2: Choose Plan */}
            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Choose Your Plan</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {plans.map((plan: any) => (
                    <button
                      key={plan.id}
                      onClick={() => updateForm('subscription_plan', plan.id)}
                      className={cn(
                        'p-5 border-2 rounded-xl text-left transition-all relative',
                        formData.subscription_plan === plan.id
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      {plan.recommended && (
                        <span className="absolute -top-3 left-4 px-2 py-0.5 bg-primary-500 text-white text-xs font-medium rounded-full">
                          Recommended
                        </span>
                      )}
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                        {formData.subscription_plan === plan.id && (
                          <CheckCircle className="w-5 h-5 text-primary-500" />
                        )}
                      </div>
                      <div className="mb-3">
                        <span className="text-3xl font-bold text-gray-900">${plan.price}</span>
                        <span className="text-gray-500">/{plan.period}</span>
                      </div>
                      <ul className="space-y-2">
                        {plan.features?.slice(0, 4).map((feature: string, idx: number) => (
                          <li key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                            <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 3: Admin Account */}
            {currentStep === 3 && (
              <motion.div
                key="step3"
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
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password * <span className="text-gray-400 font-normal">(min. 8 characters)</span>
                    </label>
                    <input
                      type="password"
                      value={formData.admin_password}
                      onChange={(e) => updateForm('admin_password', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Create a strong password"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      value={formData.admin_confirm_password}
                      onChange={(e) => updateForm('admin_confirm_password', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Confirm your password"
                    />
                    {formData.admin_confirm_password && formData.admin_password !== formData.admin_confirm_password && (
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

            {currentStep < 3 ? (
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
                disabled={!validateStep(3) || registerMutation.isPending}
                className={cn(
                  'flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-xl transition-colors',
                  validateStep(3) && !registerMutation.isPending
                    ? 'bg-primary-500 text-white hover:bg-primary-600'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                )}
              >
                {registerMutation.isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Create Company
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
