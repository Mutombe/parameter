import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, Users, FileText, BarChart3, Shield, Zap,
  CheckCircle, Check, ArrowRight, Phone, Mail, ChevronRight,
  Globe, DollarSign, PieChart, Clock, BookOpen, Lock,
  Menu, X, Sun, Moon, Monitor, LayoutDashboard
} from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { useAuthStore } from '../stores/authStore'
import { useThemeEffect } from '../hooks/useThemeEffect'
import PrivacyPolicyModal from '../components/PrivacyPolicyModal'
import HeroDashboard from '../components/HeroDashboard'
import { SiFsecure } from "react-icons/si";
import { PiUsersFour } from "react-icons/pi";
import { IoCheckmarkDoneCircleOutline } from "react-icons/io5";
import { TbChartInfographic } from "react-icons/tb";
import { PiBuildingApartmentLight } from "react-icons/pi";
import { LiaUsersSolid } from "react-icons/lia";
import { AiOutlineDollar } from "react-icons/ai";
import { MessageCircle } from 'lucide-react'
import { GiWorld } from "react-icons/gi";


const features = [
  {
    icon: PiBuildingApartmentLight,
    title: 'Property Management',
    description: 'Manage unlimited properties, units, and track occupancy rates in real-time.'
  },
  {
    icon: LiaUsersSolid,
    title: 'Tenant Management',
    description: 'Complete tenant lifecycle management from onboarding to lease renewals.'
  },
  {
    icon: FileText,
    title: 'Automated Billing',
    description: 'Generate monthly invoices automatically with late penalties, payment reminders, and tenant self-service.'
  },
  {
    icon: TbChartInfographic,
    title: 'Financial Reports',
    description: 'Trial balance, income statements, balance sheets, and cash flow reports with double-entry bookkeeping.'
  },
  {
    icon: Zap,
    title: 'Bulk Data Import',
    description: 'Onboard in an afternoon. Import landlords, tenants, properties and leases straight from CSV, Excel or scanned documents.'
  },
  {
    icon: SiFsecure,
    title: 'Multi-Tenant Security',
    description: 'Complete data isolation with schema-based multi-tenancy and role-based access control.'
  },
]

const onboardingSteps = [
  {
    step: 1,
    title: 'Sign Up',
    description: 'Create your company account with a unique subdomain. Choose your subscription plan or start with a free demo.'
  },
  {
    step: 2,
    title: 'Set Up Your Portfolio',
    description: 'Add your landlords, properties and units. Import existing data from CSV, Excel or scanned documents, or just start fresh.'
  },
  {
    step: 3,
    title: 'Add Tenants & Leases',
    description: 'Register tenants, create lease agreements, and set up billing preferences for automated invoicing.'
  },
  {
    step: 4,
    title: 'Start Managing',
    description: 'Generate invoices, record payments, track finances, and access powerful reports to grow your business.'
  },
]

const plans = [
  {
    name: 'Testing',
    price: 0,
    period: 'month',
    note: 'Kick the tyres. Free, forever.',
    features: ['Up to 5 properties', 'Up to 20 units', 'Basic reports', 'Email support'],
    cta: 'Start Free',
    popular: false
  },
  {
    name: 'Medium',
    price: 500,
    period: 'month',
    note: 'For the growing portfolio.',
    features: ['Up to 50 properties', 'Up to 200 units', 'All reports', 'AI insights', 'OCR scanning', 'Priority support'],
    cta: 'Get Started',
    popular: true
  },
  {
    name: 'Enterprise',
    price: 900,
    period: 'month',
    note: 'For the serious operator.',
    features: ['Unlimited properties', 'Unlimited units', 'Custom integrations', 'Dedicated support', 'SLA guarantee', 'Training included'],
    cta: 'Contact Sales',
    popular: false
  },
]

export default function Landing() {
  const { theme, setTheme } = useUIStore()
  const { isAuthenticated, user } = useAuthStore()
  useThemeEffect()
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Determine dashboard path based on user role
  const dashboardPath = user?.role === 'tenant_portal' ? '/portal' : '/dashboard'
  const [contactForm, setContactForm] = useState({
  firstName: '',
  lastName: '',
  email: '',
  company: '',
  message: ''
})

// ===========================================
// ADD THESE HELPER FUNCTIONS inside your component:
// ===========================================
const generateWhatsAppLink = () => {
  const fullName = `${contactForm.firstName} ${contactForm.lastName}`.trim()
  const text = `Hi, I'm ${fullName || 'interested in Parameter'}${contactForm.company ? ` from ${contactForm.company}` : ''}.${contactForm.email ? `\n\nEmail: ${contactForm.email}` : ''}\n\nMessage:\n${contactForm.message || 'I would like to learn more about Parameter.'}`
  return `https://wa.me/263785948128?text=${encodeURIComponent(text)}`
}

const generateEmailLink = () => {
  const fullName = `${contactForm.firstName} ${contactForm.lastName}`.trim()
  const subject = `Parameter Inquiry${contactForm.company ? ` - ${contactForm.company}` : ''}`
  const body = `Hi,\n\nI'm ${fullName || 'interested in Parameter'}${contactForm.company ? ` from ${contactForm.company}` : ''}.\n\n${contactForm.message || 'I would like to learn more about Parameter.'}\n\nBest regards,\n${fullName || 'A potential customer'}${contactForm.email ? `\n${contactForm.email}` : ''}`
  return `mailto:admin@bitstudio.co.zw?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 sm:gap-3">
              <img src="/logo.png" alt="Parameter" className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain dark:brightness-0 dark:invert" />
              <span className="font-bold text-lg sm:text-xl text-gray-900">Parameter</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</a>
              <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 transition-colors">How It Works</a>
              <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition-colors">Pricing</a>
              <Link to="/learn" className="text-gray-600 hover:text-gray-900 transition-colors">Learn</Link>
              <a href="#contact" className="text-gray-600 hover:text-gray-900 transition-colors">Contact</a>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                title={`Theme: ${theme}`}
              >
                {theme === 'dark' ? <Moon className="w-5 h-5" /> : theme === 'light' ? <Sun className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
              </button>
              {isAuthenticated ? (
                <Link
                  to={dashboardPath}
                  className="hidden sm:flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-primary-600 text-white text-sm sm:text-base font-medium rounded-xl hover:bg-primary-700 transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/login" className="hidden sm:block text-gray-600 hover:text-gray-900 font-medium transition-colors">
                    Sign In
                  </Link>
                  <Link
                    to="/signup"
                    className="hidden sm:block px-4 sm:px-5 py-2 sm:py-2.5 bg-primary-600 text-white text-sm sm:text-base font-medium rounded-xl hover:bg-primary-700 transition-colors"
                  >
                    Get Started
                  </Link>
                </>
              )}
              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-white border-t border-gray-100 overflow-hidden"
            >
              <div className="px-4 py-4 space-y-3">
                <a
                  href="#features"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Features
                </a>
                <a
                  href="#how-it-works"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  How It Works
                </a>
                <a
                  href="#pricing"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Pricing
                </a>
                <Link
                  to="/learn"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Learn
                </Link>
                <a
                  href="#contact"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Contact
                </a>
                <div className="pt-3 border-t border-gray-100 space-y-2">
                  <button
                    onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
                  >
                    {theme === 'dark' ? <Moon className="w-5 h-5" /> : theme === 'light' ? <Sun className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                    Theme: {theme.charAt(0).toUpperCase() + theme.slice(1)}
                  </button>
                  {isAuthenticated ? (
                    <Link
                      to={dashboardPath}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      Dashboard
                    </Link>
                  ) : (
                    <>
                      <Link
                        to="/login"
                        onClick={() => setMobileMenuOpen(false)}
                        className="block px-4 py-2.5 text-center text-gray-900 font-medium hover:bg-gray-50 rounded-xl transition-colors"
                      >
                        Sign In
                      </Link>
                      <Link
                        to="/signup"
                        onClick={() => setMobileMenuOpen(false)}
                        className="block px-4 py-2.5 text-center bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors"
                      >
                        Get Started
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero Section */}
<section className="relative pt-24 sm:pt-32 pb-12 sm:pb-20 px-4 sm:px-6 overflow-hidden">
        <div
          className="absolute top-[4.5rem] left-0 right-0 bottom-0 opacity-10"
          style={{
            backgroundImage: 'linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            backgroundPosition: 'right top',
          }}
        />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-ion/10 text-primary-700 ring-1 ring-ion/30 rounded-full text-xs sm:text-sm font-medium mb-4 sm:mb-6">
                <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-ion-deep" />
                AI-Powered Real Estate Accounting
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-4 sm:mb-6">
                Modern accounting for{' '}
                <span className="text-plasma">property managers</span>
              </h1>
              <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-6 sm:mb-8 leading-relaxed">
                Built in Zimbabwe, for the people who actually run buildings. Parameter keeps your
                double-entry books, sends the invoices on time, and lets AI do the data entry. So you
                can stop living in spreadsheets and close the month in an afternoon.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Link
                  to="/signup"
                  className="btn-spark px-6 sm:px-8 py-3 sm:py-4"
                >
                  Start Free Demo
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  to="/learn"
                  className="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-gray-100 text-gray-900 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  <BookOpen className="w-5 h-5" />
                  Learn More
                </Link>
              </div>
              {/* Trust line */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs sm:text-sm text-gray-500 sm:justify-start">
                {['No card required', 'Free demo', 'Live in minutes'].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-ion-deep" />
                    {t}
                  </span>
                ))}
              </div>

              {/* Trust stats */}
              <div className="mt-7 sm:mt-9 flex items-center justify-center gap-6 border-t border-gray-100 pt-6 sm:justify-start sm:gap-8 sm:pt-8">
                {[
                  { icon: Zap, value: '99.9%', label: 'Uptime' },
                  { icon: Shield, value: '256-bit', label: 'Encryption' },
                  { icon: Clock, value: '24/7', label: 'Support' },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ion/10 ring-1 ring-ion/20">
                      <s.icon className="h-4 w-4 text-ion-deep" />
                    </div>
                    <div>
                      <div className="text-base sm:text-lg font-bold leading-none text-gray-900 tabular-nums">{s.value}</div>
                      <div className="mt-1 text-[11px] text-gray-500 sm:text-xs">{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              {/* plasma bloom behind the diagram */}
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-6 rounded-[2rem] opacity-40 blur-3xl"
                style={{
                  background:
                    'radial-gradient(circle at 75% 25%, rgba(94,231,255,0.40), transparent 58%), radial-gradient(circle at 20% 85%, rgba(43,143,255,0.32), transparent 60%)',
                }}
              />
              {/* floating ion chip */}
              <motion.div
                aria-hidden
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -top-5 -right-5 hidden h-16 w-16 rounded-2xl border border-ion/40 bg-ion/5 backdrop-blur-sm sm:block"
              />

              <HeroDashboard />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-12 sm:py-20 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10 sm:mb-16"
          >
            <div className="inline-flex items-center gap-3 mb-5">
              <span className="h-px w-10 bg-ion" />
              <span className="eyebrow-mono text-ion-deep">Capabilities</span>
              <span className="h-px w-10 bg-ion" />
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
              Everything you need to <span className="text-plasma">manage properties</span>
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-600 max-w-3xl mx-auto px-2">
              From tenant management to financial reporting, Parameter provides all the tools
              you need to run a successful property management business.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="group bg-white rounded-xl sm:rounded-2xl p-5 sm:p-8 shadow-sm border border-transparent transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-ion/30"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-primary-100 rounded-xl sm:rounded-2xl flex items-center justify-center mb-4 sm:mb-6 transition-all duration-300 group-hover:bg-gradient-to-br group-hover:from-ion/20 group-hover:to-plasma/20 group-hover:shadow-[0_0_30px_-8px_#5ee7ff]">
                  <feature.icon className="w-6 h-6 sm:w-7 sm:h-7 text-primary-600 transition-colors duration-300 group-hover:text-ion-deep" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">{feature.title}</h3>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-12 sm:py-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10 sm:mb-16"
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
              Get started in minutes
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-600 max-w-3xl mx-auto px-2">
              Our streamlined onboarding process gets you up and running quickly.
              No complex setup, no technical expertise required.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
            {onboardingSteps.map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                <div className="bg-primary-600 text-white w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl font-bold mb-3 sm:mb-6">
                  {item.step}
                </div>
                {index < onboardingSteps.length - 1 && (
                  <div className="hidden lg:block absolute top-6 left-16 w-full h-0.5 bg-gray-200">
                    <ChevronRight className="absolute -right-2 -top-2.5 w-5 h-5 text-gray-300" />
                  </div>
                )}
                <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">{item.title}</h3>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mt-12"
          >
            <Link
              to="/signup"
              className="btn-spark px-8 py-4"
            >
              Start Your Free Demo
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Pricing Section — Ownership pattern, theme-aware (light <-> navy via html.dark overrides) */}
      <section id="pricing" className="relative overflow-hidden bg-gray-50 py-16 sm:py-28 px-4 sm:px-6">
        {/* ion bloom */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[460px] w-[460px] -translate-x-1/2 rounded-full opacity-20 blur-[130px]"
          style={{ background: 'radial-gradient(circle, #5ee7ff, transparent 60%)' }}
        />
        {/* faint grid — neutral slate so it reads on both light and navy */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(148,163,184,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.10) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12 sm:mb-16"
          >
            <div className="inline-flex items-center gap-3 mb-5">
              <span className="h-px w-10 bg-ion-deep dark:bg-ion" />
              <span className="eyebrow-mono text-ion-deep dark:text-ion">Pricing</span>
              <span className="h-px w-10 bg-ion-deep dark:bg-ion" />
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Three ways to <span className="text-plasma">run your books.</span>
            </h2>
            <p className="text-base sm:text-lg text-gray-500 max-w-2xl mx-auto px-2">
              Choose the plan that fits your portfolio. Every tier runs the full double-entry
              core, with no hidden fees and no lock-in.
            </p>
          </motion.div>

          <div className="flex flex-col items-stretch justify-center gap-6 lg:flex-row">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-10%' }}
                transition={{ type: 'spring', stiffness: 90, damping: 16, delay: index * 0.1 }}
                className={`relative flex w-full flex-col rounded-3xl border p-7 sm:p-8 transition-transform duration-300 hover:-translate-y-1.5 lg:w-80 ${
                  plan.popular
                    ? 'border-ion/60 bg-white glow-accent lg:-translate-y-4 lg:scale-[1.04]'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ion px-4 py-1 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[#04060a]">
                    Most Popular
                  </span>
                )}
                <p className="eyebrow-mono text-gray-500">{plan.name}</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900">${plan.price}</span>
                  <span className="mb-1.5 text-sm text-gray-400">/{plan.period}</span>
                </div>
                <p className="mt-3 min-h-[2.5rem] text-sm leading-relaxed text-gray-500">{plan.note}</p>

                <div className="my-7 h-px w-full bg-gray-200" />

                <ul className="flex-1 space-y-3.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          plan.popular ? 'bg-ion' : 'bg-gray-200'
                        }`}
                      >
                        <Check
                          className={`w-3 h-3 ${plan.popular ? 'text-[#04060a]' : 'text-gray-600 dark:text-white'}`}
                          strokeWidth={3}
                        />
                      </span>
                      <span className="text-[0.95rem] text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/signup"
                  className={
                    plan.popular
                      ? 'btn-spark mt-8 w-full py-3 text-sm'
                      : 'mt-8 block w-full rounded-xl border border-gray-300 py-3 text-center text-sm font-semibold text-gray-900 transition-all hover:border-ion-deep hover:text-ion-deep'
                  }
                >
                  {plan.cta}
                </Link>
              </motion.div>
            ))}
          </div>

          <p className="mt-10 text-center eyebrow-mono tracking-[0.2em] text-gray-400">
            Prices in USD · Demo free forever · Cancel anytime
          </p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
              Ready to transform your property management?
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-6 sm:mb-8 px-2">
              Join property managers across Zimbabwe who trust Parameter for their accounting needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <Link
                to="/signup"
                className="btn-spark px-6 sm:px-8 py-3 sm:py-4"
              >
                Start Free Demo
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="#contact"
                className="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-gray-100 text-gray-900 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Contact Sales
              </a>
            </div>
          </motion.div>
        </div>
      </section>

{/* Contact Section */}
      <section id="contact" className="relative overflow-hidden bg-gray-50 py-12 sm:py-20 px-4 sm:px-6">
        {/* ion top hairline */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, #5ee7ff, #2b8fff, transparent)' }}
        />
        {/* faint ion bloom */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full opacity-20 blur-[120px]"
          style={{ background: 'radial-gradient(circle, #5ee7ff, transparent 60%)' }}
        />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="inline-flex items-center gap-3 mb-5">
                <span className="h-px w-10 bg-ion-deep dark:bg-ion" />
                <span className="eyebrow-mono text-ion-deep dark:text-ion">Contact</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4 text-gray-900">
                Let's <span className="text-plasma">get in touch.</span>
              </h2>
              <p className="text-gray-400 text-base sm:text-lg mb-6 sm:mb-8">
                Tell us what you run and we'll show you exactly how Parameter fits. Real people,
                usually back to you the same day.
              </p>
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-ion/10 ring-1 ring-ion/20 rounded-xl flex items-center justify-center">
                    <Phone className="w-6 h-6 text-ion-deep dark:text-ion" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Phone</div>
                    <a href="tel:+263785948128" className="text-lg font-medium text-gray-900 hover:text-ion-deep dark:hover:text-ion transition-colors">
                      +263 785 948 128
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-ion/10 ring-1 ring-ion/20 rounded-xl flex items-center justify-center">
                    <Mail className="w-6 h-6 text-ion-deep dark:text-ion" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Email (Parameter)</div>
                    <a href="mailto:admin@parameter.co.zw" className="text-lg font-medium text-gray-900 hover:text-ion-deep dark:hover:text-ion transition-colors">
                      admin@parameter.co.zw
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-ion/10 ring-1 ring-ion/20 rounded-xl flex items-center justify-center">
                    <GiWorld className="w-6 h-6 text-ion-deep dark:text-ion" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Email (Bit Studio)</div>
                    <a href="mailto:admin@bitstudio.co.zw" className="text-lg font-medium text-gray-900 hover:text-ion-deep dark:hover:text-ion transition-colors">
                      admin@bitstudio.co.zw
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <div className="bg-white border border-gray-200 ring-1 ring-ion/10 rounded-xl sm:rounded-2xl p-5 sm:p-8">
                <h3 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6 text-gray-900">Send us a message</h3>
                <div className="space-y-3 sm:space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <input
                      type="text"
                      placeholder="First name"
                      value={contactForm.firstName}
                      onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })}
                      className="px-4 py-2.5 sm:py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-ion focus:border-transparent text-sm sm:text-base"
                    />
                    <input
                      type="text"
                      placeholder="Last name"
                      value={contactForm.lastName}
                      onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })}
                      className="px-4 py-2.5 sm:py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-ion focus:border-transparent text-sm sm:text-base"
                    />
                  </div>
                  <input
                    type="email"
                    placeholder="Email address"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className="w-full px-4 py-2.5 sm:py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-ion focus:border-transparent text-sm sm:text-base"
                  />
                  <input
                    type="text"
                    placeholder="Company name"
                    value={contactForm.company}
                    onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
                    className="w-full px-4 py-2.5 sm:py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-ion focus:border-transparent text-sm sm:text-base"
                  />
                  <textarea
                    rows={4}
                    placeholder="How can we help?"
                    value={contactForm.message}
                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                    className="w-full px-4 py-2.5 sm:py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-ion focus:border-transparent resize-none text-sm sm:text-base"
                  />
                  
                  {/* Send Options */}
                  <div className="space-y-3">
                    <p className="text-sm text-gray-400 text-center">Choose how to send your message:</p>
                    <div className="grid grid-cols-2 gap-3">
                      <a
                        href={generateWhatsAppLink()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 py-2.5 sm:py-3 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 transition-colors"
                      >
                        <MessageCircle className="w-5 h-5" />
                        WhatsApp
                      </a>
                      <a
                        href={generateEmailLink()}
                        className="btn-spark justify-center py-2.5 sm:py-3"
                      >
                        <Mail className="w-5 h-5" />
                        Email
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative overflow-hidden bg-gray-50 text-gray-500 py-8 sm:py-12 px-4 sm:px-6">
        {/* ion top hairline */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, #5ee7ff, #2b8fff, transparent)' }}
        />
        {/* faint plasma bloom */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[36rem] -translate-x-1/2 rounded-full opacity-20 blur-[100px]"
          style={{ background: 'radial-gradient(circle, #5ee7ff, transparent 60%)' }}
        />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8 sm:mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <img src="/logo.png" alt="Parameter" className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl object-contain dark:brightness-0 dark:invert" />
                <span className="font-bold text-lg sm:text-xl text-gray-900">Parameter</span>
              </div>
              <p className="text-xs sm:text-sm leading-relaxed">
                Modern real estate accounting platform for property managers in Zimbabwe.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 text-sm sm:text-base mb-3 sm:mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-ion-deep dark:hover:text-ion transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-ion-deep dark:hover:text-ion transition-colors">Pricing</a></li>
                <li><Link to="/learn" className="hover:text-ion-deep dark:hover:text-ion transition-colors">Documentation</Link></li>
                <li>
                  {isAuthenticated
                    ? <Link to={dashboardPath} className="hover:text-ion-deep dark:hover:text-ion transition-colors">Dashboard</Link>
                    : <Link to="/signup" className="hover:text-ion-deep dark:hover:text-ion transition-colors">Get Started</Link>
                  }
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#contact" className="hover:text-ion-deep dark:hover:text-ion transition-colors">Contact</a></li>
                <li><button onClick={() => setPrivacyOpen(true)} className="hover:text-ion-deep dark:hover:text-ion transition-colors">Privacy Policy</button></li>
                <li><button onClick={() => setPrivacyOpen(true)} className="hover:text-ion-deep dark:hover:text-ion transition-colors">Terms of Service</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Contact</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="tel:+263785948128" className="hover:text-ion-deep dark:hover:text-ion transition-colors">+263 785 948 128</a></li>
                <li><a href="mailto:admin@parameter.co.zw" className="hover:text-ion-deep dark:hover:text-ion transition-colors">admin@parameter.co.zw</a></li>
                <li><a href="mailto:admin@bitstudio.co.zw" className="hover:text-ion-deep dark:hover:text-ion transition-colors">admin@bitstudio.co.zw</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm">
              © {new Date().getFullYear()} Parameter. All rights reserved.
            </p>
            <p className="text-sm flex items-center gap-2">
              A product of <span className="font-semibold text-plasma">Bit Studio ZW</span>
            </p>
          </div>
        </div>
      </footer>

      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  )
}
