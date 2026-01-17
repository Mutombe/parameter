import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Building2, Users, FileText, BarChart3, Shield, Zap,
  CheckCircle, ArrowRight, Phone, Mail, ChevronRight,
  Globe, DollarSign, PieChart, Clock, BookOpen, Lock
} from 'lucide-react'
import PrivacyPolicyModal from '../components/PrivacyPolicyModal'

const features = [
  {
    icon: Building2,
    title: 'Property Management',
    description: 'Manage unlimited properties, units, and track occupancy rates in real-time.'
  },
  {
    icon: Users,
    title: 'Tenant Management',
    description: 'Complete tenant lifecycle management from onboarding to lease renewals.'
  },
  {
    icon: FileText,
    title: 'Automated Billing',
    description: 'Generate monthly invoices automatically with customizable billing cycles.'
  },
  {
    icon: BarChart3,
    title: 'Financial Reports',
    description: 'Trial balance, income statements, balance sheets, and cash flow reports.'
  },
  {
    icon: Shield,
    title: 'Multi-Tenant Security',
    description: 'Complete data isolation with schema-based multi-tenancy architecture.'
  },
  {
    icon: Zap,
    title: 'AI-Powered Insights',
    description: 'Smart reconciliation, document OCR, and intelligent financial suggestions.'
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
    description: 'Add your landlords, properties, and units. Import existing data or start fresh with our guided setup.'
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
    features: ['Up to 5 properties', 'Up to 20 units', 'Basic reports', 'Email support'],
    cta: 'Start Free',
    popular: false
  },
  {
    name: 'Medium',
    price: 500,
    period: 'month',
    features: ['Up to 50 properties', 'Up to 200 units', 'All reports', 'AI insights', 'OCR scanning', 'Priority support'],
    cta: 'Get Started',
    popular: true
  },
  {
    name: 'Enterprise',
    price: 900,
    period: 'month',
    features: ['Unlimited properties', 'Unlimited units', 'Custom integrations', 'Dedicated support', 'SLA guarantee', 'Training included'],
    cta: 'Contact Sales',
    popular: false
  },
]

export default function Landing() {
  const [privacyOpen, setPrivacyOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <img src="/logo.png" alt="Parameter" className="w-10 h-10 rounded-xl object-contain" />
              <span className="font-bold text-xl text-gray-900">Parameter</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</a>
              <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 transition-colors">How It Works</a>
              <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition-colors">Pricing</a>
              <Link to="/learn" className="text-gray-600 hover:text-gray-900 transition-colors">Learn</Link>
              <a href="#contact" className="text-gray-600 hover:text-gray-900 transition-colors">Contact</a>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/login" className="text-gray-600 hover:text-gray-900 font-medium transition-colors">
                Sign In
              </Link>
              <Link
                to="/signup"
                className="px-5 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-full text-sm font-medium mb-6">
                <Zap className="w-4 h-4" />
                AI-Powered Real Estate Accounting
              </div>
              <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                Modern accounting for{' '}
                <span className="text-primary-600">property managers</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                Parameter is a comprehensive real estate accounting platform built for Zimbabwe's property management industry.
                Double-entry bookkeeping, automated billing, and AI-powered insights — all in one place.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/25"
                >
                  Start Free Demo
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  to="/learn"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gray-100 text-gray-900 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  <BookOpen className="w-5 h-5" />
                  Learn More
                </Link>
              </div>
              <div className="flex items-center gap-6 mt-8 pt-8 border-t border-gray-100">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">500+</div>
                  <div className="text-sm text-gray-500">Properties Managed</div>
                </div>
                <div className="w-px h-12 bg-gray-200" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">$2M+</div>
                  <div className="text-sm text-gray-500">Rent Collected</div>
                </div>
                <div className="w-px h-12 bg-gray-200" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">99.9%</div>
                  <div className="text-sm text-gray-500">Uptime</div>
                </div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-3xl p-8 shadow-2xl">
                <div className="bg-white rounded-2xl p-6 shadow-lg">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-semibold text-gray-900">Dashboard Overview</h3>
                    <span className="text-xs text-gray-500">Live Demo</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-emerald-50 rounded-xl p-4">
                      <DollarSign className="w-6 h-6 text-emerald-600 mb-2" />
                      <div className="text-2xl font-bold text-gray-900">$48,250</div>
                      <div className="text-sm text-gray-500">Revenue MTD</div>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-4">
                      <Building2 className="w-6 h-6 text-blue-600 mb-2" />
                      <div className="text-2xl font-bold text-gray-900">156</div>
                      <div className="text-sm text-gray-500">Active Units</div>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4">
                      <PieChart className="w-6 h-6 text-purple-600 mb-2" />
                      <div className="text-2xl font-bold text-gray-900">94%</div>
                      <div className="text-sm text-gray-500">Occupancy Rate</div>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-4">
                      <Clock className="w-6 h-6 text-amber-600 mb-2" />
                      <div className="text-2xl font-bold text-gray-900">12</div>
                      <div className="text-sm text-gray-500">Pending Invoices</div>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full w-3/4 bg-gradient-to-r from-primary-500 to-primary-600 rounded-full" />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Collection rate: 75% of target</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Everything you need to manage properties
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              From tenant management to financial reporting, Parameter provides all the tools
              you need to run a successful property management business.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center mb-6">
                  <feature.icon className="w-7 h-7 text-primary-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Get started in minutes
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Our streamlined onboarding process gets you up and running quickly.
              No complex setup, no technical expertise required.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {onboardingSteps.map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                <div className="bg-primary-600 text-white w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold mb-6">
                  {item.step}
                </div>
                {index < onboardingSteps.length - 1 && (
                  <div className="hidden lg:block absolute top-6 left-16 w-full h-0.5 bg-gray-200">
                    <ChevronRight className="absolute -right-2 -top-2.5 w-5 h-5 text-gray-300" />
                  </div>
                )}
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600 leading-relaxed">{item.description}</p>
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
              className="inline-flex items-center gap-2 px-8 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/25"
            >
              Start Your Free Demo
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Choose the plan that fits your portfolio size. All plans include core features
              with no hidden fees.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`bg-white rounded-2xl p-8 ${
                  plan.popular ? 'ring-2 ring-primary-500 shadow-xl' : 'shadow-sm'
                } relative`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary-600 text-white text-sm font-medium rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{plan.name}</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                  <span className="text-gray-500">/{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-gray-600">
                      <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/signup"
                  className={`block w-full py-3 text-center font-medium rounded-xl transition-colors ${
                    plan.popular
                      ? 'bg-primary-600 text-white hover:bg-primary-700'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {plan.cta}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Ready to transform your property management?
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              Join property managers across Zimbabwe who trust Parameter for their accounting needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/25"
              >
                Start Free Demo
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="#contact"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gray-100 text-gray-900 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Contact Sales
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 px-6 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl font-bold mb-4">Get in touch</h2>
              <p className="text-gray-400 text-lg mb-8">
                Have questions about Parameter? Our team is here to help you find the
                right solution for your property management needs.
              </p>
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary-500/20 rounded-xl flex items-center justify-center">
                    <Phone className="w-6 h-6 text-primary-400" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Phone</div>
                    <a href="tel:+263785948128" className="text-lg font-medium hover:text-primary-400 transition-colors">
                      +263 785 948 128
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary-500/20 rounded-xl flex items-center justify-center">
                    <Mail className="w-6 h-6 text-primary-400" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Email (Parameter)</div>
                    <a href="mailto:admin@parameter.co.zw" className="text-lg font-medium hover:text-primary-400 transition-colors">
                      admin@parameter.co.zw
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary-500/20 rounded-xl flex items-center justify-center">
                    <Globe className="w-6 h-6 text-primary-400" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Email (Bit Studio)</div>
                    <a href="mailto:admin@bitstudio.co.zw" className="text-lg font-medium hover:text-primary-400 transition-colors">
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
              <div className="bg-gray-800 rounded-2xl p-8">
                <h3 className="text-xl font-semibold mb-6">Send us a message</h3>
                <form className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="First name"
                      className="px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <input
                      type="text"
                      placeholder="Last name"
                      className="px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <input
                    type="email"
                    placeholder="Email address"
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    placeholder="Company name"
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <textarea
                    rows={4}
                    placeholder="How can we help?"
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  />
                  <button
                    type="submit"
                    className="w-full py-3 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors"
                  >
                    Send Message
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-950 text-gray-400 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img src="/logo.png" alt="Parameter" className="w-10 h-10 rounded-xl object-contain" />
                <span className="font-bold text-xl text-white">Parameter</span>
              </div>
              <p className="text-sm leading-relaxed">
                Modern real estate accounting platform for property managers in Zimbabwe.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><Link to="/learn" className="hover:text-white transition-colors">Documentation</Link></li>
                <li><Link to="/signup" className="hover:text-white transition-colors">Get Started</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#contact" className="hover:text-white transition-colors">Contact</a></li>
                <li><button onClick={() => setPrivacyOpen(true)} className="hover:text-white transition-colors">Privacy Policy</button></li>
                <li><button onClick={() => setPrivacyOpen(true)} className="hover:text-white transition-colors">Terms of Service</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Contact</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="tel:+263785948128" className="hover:text-white transition-colors">+263 785 948 128</a></li>
                <li><a href="mailto:admin@parameter.co.zw" className="hover:text-white transition-colors">admin@parameter.co.zw</a></li>
                <li><a href="mailto:admin@bitstudio.co.zw" className="hover:text-white transition-colors">admin@bitstudio.co.zw</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm">
              © {new Date().getFullYear()} Parameter. All rights reserved.
            </p>
            <p className="text-sm flex items-center gap-2">
              A product of <span className="font-semibold text-white">Bit Studio ZW</span>
            </p>
          </div>
        </div>
      </footer>

      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  )
}
