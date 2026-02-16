import { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings as SettingsIcon,
  Building2,
  DollarSign,
  Bell,
  Mail,
  Shield,
  Palette,
  Globe,
  Database,
  FileText,
  Printer,
  Clock,
  Check,
  ChevronRight,
  Loader2,
  Inbox,
  AlertTriangle,
  CreditCard,
  Home as HomeIcon,
  Monitor,
} from 'lucide-react'
import { PageHeader, Button, Input, Card, Badge } from '../components/ui'
import { useAuthStore } from '../stores/authStore'
import { notificationsApi } from '../services/api'
import toast from 'react-hot-toast'
import { cn } from '../lib/utils'
import { SiFsecure } from "react-icons/si";
import { PiBuildingApartmentLight } from "react-icons/pi";


interface SettingSection {
  id: string
  title: string
  description: string
  icon: React.ElementType
  color: string
}

const sections: SettingSection[] = [
  { id: 'company', title: 'Company', description: 'Business information and branding', icon: Building2, color: 'blue' },
  { id: 'currency', title: 'Currency', description: 'Default currency and exchange rates', icon: DollarSign, color: 'green' },
  { id: 'notifications', title: 'Notifications', description: 'Email and system notifications', icon: Bell, color: 'yellow' },
  { id: 'invoicing', title: 'Invoicing', description: 'Invoice templates and settings', icon: FileText, color: 'purple' },
  { id: 'printing', title: 'Printing', description: 'Print layouts and paper size', icon: Printer, color: 'gray' },
  { id: 'security', title: 'Security', description: 'Password and access settings', icon: Shield, color: 'red' },
]

interface NotificationPref {
  email_masterfile_changes: boolean
  email_invoice_alerts: boolean
  email_payment_received: boolean
  email_lease_alerts: boolean
  email_system_alerts: boolean
  push_masterfile_changes: boolean
  push_invoice_alerts: boolean
  push_payment_received: boolean
  push_lease_alerts: boolean
  push_system_alerts: boolean
  email_rental_due: boolean
  email_late_penalty: boolean
  push_rental_due: boolean
  push_late_penalty: boolean
  daily_digest: boolean
  digest_time: string
}

const emailPrefConfig = [
  { key: 'email_masterfile_changes', label: 'Masterfile Changes', description: 'Property, tenant, lease changes', icon: PiBuildingApartmentLight, color: 'bg-blue-100 text-blue-600' },
  { key: 'email_invoice_alerts', label: 'Invoice Alerts', description: 'New invoices, overdue reminders', icon: FileText, color: 'bg-amber-100 text-amber-600' },
  { key: 'email_payment_received', label: 'Payment Received', description: 'Receipt confirmations', icon: CreditCard, color: 'bg-emerald-100 text-emerald-600' },
  { key: 'email_lease_alerts', label: 'Lease Alerts', description: 'Expiring, activated, terminated leases', icon: HomeIcon, color: 'bg-purple-100 text-purple-600' },
  { key: 'email_rental_due', label: 'Rental Due Reminders', description: 'Upcoming rent due dates', icon: Clock, color: 'bg-orange-100 text-orange-600' },
  { key: 'email_late_penalty', label: 'Late Penalties', description: 'Auto-generated penalty invoices', icon: AlertTriangle, color: 'bg-red-100 text-red-600' },
  { key: 'email_system_alerts', label: 'System Alerts', description: 'User invitations, system events', icon: Monitor, color: 'bg-gray-100 text-gray-600' },
]

const pushPrefConfig = [
  { key: 'push_masterfile_changes', label: 'Masterfile Changes', description: 'Property, tenant, lease changes', icon: PiBuildingApartmentLight, color: 'bg-blue-100 text-blue-600' },
  { key: 'push_invoice_alerts', label: 'Invoice Alerts', description: 'New invoices, overdue reminders', icon: FileText, color: 'bg-amber-100 text-amber-600' },
  { key: 'push_payment_received', label: 'Payment Received', description: 'Receipt confirmations', icon: CreditCard, color: 'bg-emerald-100 text-emerald-600' },
  { key: 'push_lease_alerts', label: 'Lease Alerts', description: 'Expiring, activated, terminated leases', icon: HomeIcon, color: 'bg-purple-100 text-purple-600' },
  { key: 'push_rental_due', label: 'Rental Due Reminders', description: 'Upcoming rent due dates', icon: Clock, color: 'bg-orange-100 text-orange-600' },
  { key: 'push_late_penalty', label: 'Late Penalties', description: 'Auto-generated penalty invoices', icon: AlertTriangle, color: 'bg-red-100 text-red-600' },
  { key: 'push_system_alerts', label: 'System Alerts', description: 'User invitations, system events', icon: Monitor, color: 'bg-gray-100 text-gray-600' },
]

export default function Settings() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [activeSection, setActiveSection] = useState('company')
  const [settings, setSettings] = useState({
    company_name: 'Demo Real Estate Company',
    company_email: 'info@demo.com',
    company_phone: '+263 77 123 4567',
    company_address: '123 Main Street, Harare',
    default_currency: 'USD',
    secondary_currency: 'ZiG',
    exchange_rate: '25.00',
    invoice_prefix: 'INV-',
    invoice_footer: 'Thank you for your business!',
    paper_size: 'A4',
    show_logo: true,
    session_timeout: '30',
    two_factor: false,
  })

  // Notification preferences from API
  const { data: notifPrefs, isLoading: prefsLoading } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => notificationsApi.getPreferences().then(r => r.data),
  })

  const updatePrefMutation = useMutation({
    mutationFn: (data: Partial<NotificationPref>) => notificationsApi.updatePreferences(data),
    onSuccess: (response) => {
      queryClient.setQueryData(['notification-preferences'], response.data)
    },
    onError: () => {
      toast.error('Failed to update preference')
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] })
    },
  })

  const handlePrefToggle = (key: string, value: boolean) => {
    // Optimistic update
    queryClient.setQueryData(['notification-preferences'], (old: any) => ({
      ...old,
      [key]: value,
    }))
    updatePrefMutation.mutate({ [key]: value })
  }

  const handleDigestTimeChange = (time: string) => {
    queryClient.setQueryData(['notification-preferences'], (old: any) => ({
      ...old,
      digest_time: time,
    }))
    updatePrefMutation.mutate({ digest_time: time })
  }

  const handleSave = () => {
    toast.success('Settings saved successfully')
  }

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
    gray: 'bg-gray-100 text-gray-600',
    red: 'bg-red-50 text-red-600',
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Configure system preferences and business settings"
        icon={SettingsIcon}
        actions={
          <Button onClick={handleSave}>
            <Check className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl border border-gray-200 p-3"
          >
            <nav className="space-y-1">
              {sections.map((section) => {
                const Icon = section.icon
                const isActive = activeSection === section.id
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all text-left',
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', colorMap[section.color])}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium', isActive ? 'text-primary-700' : 'text-gray-900')}>
                        {section.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{section.description}</p>
                    </div>
                    <ChevronRight className={cn('w-4 h-4', isActive ? 'text-primary-500' : 'text-gray-300')} />
                  </button>
                )
              })}
            </nav>
          </motion.div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            {activeSection === 'company' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Company Information</h3>
                  <p className="text-sm text-gray-500">Update your business details and branding</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Company Name"
                    value={settings.company_name}
                    onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={settings.company_email}
                    onChange={(e) => setSettings({ ...settings, company_email: e.target.value })}
                  />
                  <Input
                    label="Phone"
                    value={settings.company_phone}
                    onChange={(e) => setSettings({ ...settings, company_phone: e.target.value })}
                  />
                  <Input
                    label="Address"
                    value={settings.company_address}
                    onChange={(e) => setSettings({ ...settings, company_address: e.target.value })}
                  />
                </div>
              </div>
            )}

            {activeSection === 'currency' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Currency Settings</h3>
                  <p className="text-sm text-gray-500">Configure your default and secondary currencies</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Primary Currency</label>
                    <select
                      value={settings.default_currency}
                      onChange={(e) => setSettings({ ...settings, default_currency: e.target.value })}
                      className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600"
                    >
                      <option value="USD">USD - US Dollar</option>
                      <option value="ZiG">ZiG - Zimbabwe Gold</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Secondary Currency</label>
                    <select
                      value={settings.secondary_currency}
                      onChange={(e) => setSettings({ ...settings, secondary_currency: e.target.value })}
                      className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600"
                    >
                      <option value="ZiG">ZiG - Zimbabwe Gold</option>
                      <option value="USD">USD - US Dollar</option>
                    </select>
                  </div>
                  <Input
                    label="Exchange Rate"
                    type="number"
                    step="0.01"
                    value={settings.exchange_rate}
                    onChange={(e) => setSettings({ ...settings, exchange_rate: e.target.value })}
                  />
                </div>
              </div>
            )}

            {activeSection === 'notifications' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Notification Preferences</h3>
                  <p className="text-sm text-gray-500">Choose how you want to receive notifications. Changes save automatically.</p>
                </div>

                {prefsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                    <span className="ml-2 text-sm text-gray-500">Loading preferences...</span>
                  </div>
                ) : (
                  <>
                    {/* Email Notifications */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Mail className="w-4 h-4 text-gray-500" />
                        <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Email Notifications</h4>
                      </div>
                      <div className="space-y-2">
                        {emailPrefConfig.map((pref) => {
                          const Icon = pref.icon
                          const checked = notifPrefs?.[pref.key as keyof NotificationPref] ?? true
                          return (
                            <label key={pref.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', pref.color)}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{pref.label}</p>
                                  <p className="text-xs text-gray-500">{pref.description}</p>
                                </div>
                              </div>
                              <input
                                type="checkbox"
                                checked={!!checked}
                                onChange={(e) => handlePrefToggle(pref.key, e.target.checked)}
                                className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500"
                              />
                            </label>
                          )
                        })}
                      </div>
                    </div>

                    {/* In-App Notifications */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Bell className="w-4 h-4 text-gray-500" />
                        <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">In-App Notifications</h4>
                      </div>
                      <div className="space-y-2">
                        {pushPrefConfig.map((pref) => {
                          const Icon = pref.icon
                          const checked = notifPrefs?.[pref.key as keyof NotificationPref] ?? true
                          return (
                            <label key={pref.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', pref.color)}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{pref.label}</p>
                                  <p className="text-xs text-gray-500">{pref.description}</p>
                                </div>
                              </div>
                              <input
                                type="checkbox"
                                checked={!!checked}
                                onChange={(e) => handlePrefToggle(pref.key, e.target.checked)}
                                className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500"
                              />
                            </label>
                          )
                        })}
                      </div>
                    </div>

                    {/* Daily Digest */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Inbox className="w-4 h-4 text-gray-500" />
                        <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Daily Digest</h4>
                      </div>
                      <div className="space-y-2">
                        <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-indigo-100 text-indigo-600">
                              <Inbox className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">Daily Digest Email</p>
                              <p className="text-xs text-gray-500">Receive a summary of all notifications once a day</p>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={!!notifPrefs?.daily_digest}
                            onChange={(e) => handlePrefToggle('daily_digest', e.target.checked)}
                            className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500"
                          />
                        </label>
                        {notifPrefs?.daily_digest && (
                          <div className="ml-12 p-3 bg-gray-50 rounded-xl">
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Delivery Time</label>
                            <input
                              type="time"
                              value={notifPrefs?.digest_time || '08:00'}
                              onChange={(e) => handleDigestTimeChange(e.target.value)}
                              className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeSection === 'invoicing' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Invoice Settings</h3>
                  <p className="text-sm text-gray-500">Customize your invoice templates</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Invoice Prefix"
                    value={settings.invoice_prefix}
                    onChange={(e) => setSettings({ ...settings, invoice_prefix: e.target.value })}
                    placeholder="INV-"
                  />
                  <Input
                    label="Invoice Footer"
                    value={settings.invoice_footer}
                    onChange={(e) => setSettings({ ...settings, invoice_footer: e.target.value })}
                    placeholder="Thank you message..."
                  />
                </div>
              </div>
            )}

            {activeSection === 'printing' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Print Settings</h3>
                  <p className="text-sm text-gray-500">Configure print layouts and paper size</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Paper Size</label>
                    <select
                      value={settings.paper_size}
                      onChange={(e) => setSettings({ ...settings, paper_size: e.target.value })}
                      className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600"
                    >
                      <option value="A4">A4</option>
                      <option value="Letter">Letter</option>
                      <option value="Legal">Legal</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.show_logo}
                      onChange={(e) => setSettings({ ...settings, show_logo: e.target.checked })}
                      className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Show Logo on Documents</p>
                      <p className="text-xs text-gray-500">Include company logo on printed documents</p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {activeSection === 'security' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Security Settings</h3>
                  <p className="text-sm text-gray-500">Manage your account security</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Session Timeout (minutes)</label>
                    <select
                      value={settings.session_timeout}
                      onChange={(e) => setSettings({ ...settings, session_timeout: e.target.value })}
                      className="w-full md:w-1/3 px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600"
                    >
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="60">1 hour</option>
                      <option value="120">2 hours</option>
                    </select>
                  </div>
                  <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Two-Factor Authentication</p>
                        <p className="text-xs text-gray-500">Add an extra layer of security</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.two_factor}
                      onChange={(e) => setSettings({ ...settings, two_factor: e.target.checked })}
                      className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500"
                    />
                  </label>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
