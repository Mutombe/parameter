import { motion, AnimatePresence } from 'framer-motion'
import { X, Shield, Lock, Eye, Database, Mail, Clock } from 'lucide-react'

interface PrivacyPolicyModalProps {
  open: boolean
  onClose: () => void
}

export default function PrivacyPolicyModal({ open, onClose }: PrivacyPolicyModalProps) {
  if (!open) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden"
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-100 px-8 py-6 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Privacy Policy</h2>
                <p className="text-sm text-gray-500">Last updated: January 2026</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-8 py-6 overflow-y-auto max-h-[calc(85vh-100px)]">
            <div className="prose prose-gray max-w-none">
              {/* Introduction */}
              <section className="mb-8">
                <p className="text-gray-600 leading-relaxed">
                  Parameter ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy
                  explains how we collect, use, disclose, and safeguard your information when you use our
                  real estate accounting platform.
                </p>
              </section>

              {/* Information We Collect */}
              <section className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <Database className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-semibold text-gray-900 m-0">Information We Collect</h3>
                </div>
                <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Personal Information</h4>
                    <ul className="text-gray-600 text-sm space-y-1 list-disc list-inside">
                      <li>Name, email address, phone number</li>
                      <li>Company name and business address</li>
                      <li>Billing information and payment details</li>
                      <li>User account credentials</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Business Data</h4>
                    <ul className="text-gray-600 text-sm space-y-1 list-disc list-inside">
                      <li>Property and unit information</li>
                      <li>Tenant details and lease agreements</li>
                      <li>Financial transactions and accounting records</li>
                      <li>Documents uploaded to the platform</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Technical Data</h4>
                    <ul className="text-gray-600 text-sm space-y-1 list-disc list-inside">
                      <li>IP address and browser type</li>
                      <li>Device information and operating system</li>
                      <li>Usage patterns and feature interactions</li>
                      <li>Error logs and performance data</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* How We Use Your Information */}
              <section className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <Eye className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-semibold text-gray-900 m-0">How We Use Your Information</h3>
                </div>
                <div className="bg-gray-50 rounded-xl p-6">
                  <ul className="text-gray-600 text-sm space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-primary-600 mt-1">•</span>
                      <span>Provide, operate, and maintain our platform services</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-600 mt-1">•</span>
                      <span>Process transactions and send related information</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-600 mt-1">•</span>
                      <span>Send administrative information, updates, and security alerts</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-600 mt-1">•</span>
                      <span>Respond to inquiries and provide customer support</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-600 mt-1">•</span>
                      <span>Improve and personalize user experience</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-600 mt-1">•</span>
                      <span>Analyze usage patterns to enhance platform features</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-600 mt-1">•</span>
                      <span>Comply with legal obligations and enforce our terms</span>
                    </li>
                  </ul>
                </div>
              </section>

              {/* Data Security */}
              <section className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <Lock className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-semibold text-gray-900 m-0">Data Security</h3>
                </div>
                <div className="bg-gray-50 rounded-xl p-6">
                  <p className="text-gray-600 text-sm mb-4">
                    We implement industry-standard security measures to protect your data:
                  </p>
                  <ul className="text-gray-600 text-sm space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 mt-1">✓</span>
                      <span><strong>Multi-tenant isolation:</strong> Each company's data is stored in a separate database schema</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 mt-1">✓</span>
                      <span><strong>Encryption:</strong> All data is encrypted in transit (TLS/SSL) and at rest</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 mt-1">✓</span>
                      <span><strong>Access controls:</strong> Role-based access control (RBAC) limits data access</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 mt-1">✓</span>
                      <span><strong>Regular backups:</strong> Automated daily backups with point-in-time recovery</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 mt-1">✓</span>
                      <span><strong>Audit logging:</strong> Comprehensive logging of all system activities</span>
                    </li>
                  </ul>
                </div>
              </section>

              {/* Data Retention */}
              <section className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <Clock className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-semibold text-gray-900 m-0">Data Retention</h3>
                </div>
                <div className="bg-gray-50 rounded-xl p-6">
                  <p className="text-gray-600 text-sm">
                    We retain your personal and business data for as long as your account is active or as needed
                    to provide services. After account termination, we retain data for up to 7 years to comply
                    with legal and regulatory requirements. You may request data deletion, subject to our legal
                    obligations.
                  </p>
                </div>
              </section>

              {/* Your Rights */}
              <section className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Rights</h3>
                <div className="bg-gray-50 rounded-xl p-6">
                  <p className="text-gray-600 text-sm mb-4">You have the right to:</p>
                  <ul className="text-gray-600 text-sm space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-primary-600 mt-1">•</span>
                      <span>Access and receive a copy of your personal data</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-600 mt-1">•</span>
                      <span>Correct inaccurate or incomplete data</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-600 mt-1">•</span>
                      <span>Request deletion of your data (subject to legal requirements)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-600 mt-1">•</span>
                      <span>Object to processing of your data</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-600 mt-1">•</span>
                      <span>Export your data in a portable format</span>
                    </li>
                  </ul>
                </div>
              </section>

              {/* Contact Information */}
              <section className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <Mail className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-semibold text-gray-900 m-0">Contact Us</h3>
                </div>
                <div className="bg-primary-50 rounded-xl p-6">
                  <p className="text-gray-700 text-sm mb-4">
                    If you have questions about this Privacy Policy or wish to exercise your rights, please contact us:
                  </p>
                  <div className="space-y-2 text-sm">
                    <p className="text-gray-700">
                      <strong>Phone:</strong> <a href="tel:+263785948128" className="text-primary-600 hover:underline">+263 785 948 128</a>
                    </p>
                    <p className="text-gray-700">
                      <strong>Email (Parameter):</strong> <a href="mailto:admin@parameter.co.zw" className="text-primary-600 hover:underline">admin@parameter.co.zw</a>
                    </p>
                    <p className="text-gray-700">
                      <strong>Email (Bit Studio):</strong> <a href="mailto:admin@bitstudio.co.zw" className="text-primary-600 hover:underline">admin@bitstudio.co.zw</a>
                    </p>
                  </div>
                </div>
              </section>

              {/* Changes to Policy */}
              <section>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Changes to This Policy</h3>
                <p className="text-gray-600 text-sm">
                  We may update this Privacy Policy from time to time. We will notify you of any changes by
                  posting the new Privacy Policy on this page and updating the "Last updated" date. We encourage
                  you to review this Privacy Policy periodically for any changes.
                </p>
              </section>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-100 px-8 py-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors"
            >
              I Understand
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
