import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  Circle,
  Building2,
  Home,
  Users,
  FileText,
  Receipt,
  X,
  Sparkles,
} from 'lucide-react'
import { cn } from '../../lib/utils'

interface ChecklistItem {
  id: string
  label: string
  description: string
  href: string
  icon: React.ElementType
  completed: boolean
}

interface OnboardingChecklistProps {
  stats: {
    properties?: { total?: number }
    counts?: {
      landlords?: number
      tenants?: number
      active_leases?: number
    }
    monthly?: { total_invoices?: number }
  } | null
}

const STORAGE_KEY = 'onboarding_dismissed'

export function OnboardingChecklist({ stats }: OnboardingChecklistProps) {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  })

  if (dismissed || !stats) return null

  const items: ChecklistItem[] = [
    {
      id: 'property',
      label: 'Create a Property',
      description: 'Add your first building or complex',
      href: '/dashboard/properties?action=create',
      icon: Building2,
      completed: (stats.properties?.total || 0) > 0,
    },
    {
      id: 'units',
      label: 'Add Units',
      description: 'Define rentable units in your property',
      href: '/dashboard/units?action=create',
      icon: Home,
      completed: false, // We don't have unit count in stats directly, check property total_units
    },
    {
      id: 'tenant',
      label: 'Add a Tenant',
      description: 'Register your first tenant',
      href: '/dashboard/tenants?action=create',
      icon: Users,
      completed: (stats.counts?.tenants || 0) > 0,
    },
    {
      id: 'lease',
      label: 'Create a Lease',
      description: 'Link a tenant to a unit with a lease agreement',
      href: '/dashboard/leases?action=create',
      icon: FileText,
      completed: (stats.counts?.active_leases || 0) > 0,
    },
    {
      id: 'invoice',
      label: 'Generate an Invoice',
      description: 'Bill your first tenant',
      href: '/dashboard/invoices?action=create',
      icon: Receipt,
      completed: (stats.monthly?.total_invoices || 0) > 0,
    },
  ]

  const completedCount = items.filter(i => i.completed).length
  const allComplete = completedCount === items.length
  const isNewTenant = completedCount <= 1

  if (!isNewTenant && !allComplete) return null

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setDismissed(true)
  }

  const progress = (completedCount / items.length) * 100

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200 p-6 relative"
    >
      <button
        onClick={handleDismiss}
        className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
        title="Dismiss checklist"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary-50 rounded-lg">
          <Sparkles className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Getting Started</h3>
          <p className="text-sm text-gray-500">Complete these steps to set up your portfolio</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>{completedCount} of {items.length} completed</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="h-full bg-primary-500 rounded-full"
          />
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => (
          <motion.button
            key={item.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => !item.completed && navigate(item.href)}
            className={cn(
              'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors',
              item.completed
                ? 'bg-emerald-50/50'
                : 'hover:bg-gray-50 cursor-pointer'
            )}
          >
            {item.completed ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="w-5 h-5 text-gray-300 shrink-0" />
            )}
            <item.icon className={cn(
              'w-4 h-4 shrink-0',
              item.completed ? 'text-emerald-400' : 'text-gray-400'
            )} />
            <div className="flex-1 min-w-0">
              <p className={cn(
                'text-sm font-medium',
                item.completed ? 'text-gray-400 line-through' : 'text-gray-700'
              )}>
                {item.label}
              </p>
              <p className="text-xs text-gray-400 truncate">{item.description}</p>
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}
