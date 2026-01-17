import { cn } from '../../lib/utils'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline'
type BadgeSize = 'sm' | 'md' | 'lg'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  size?: BadgeSize
  className?: string
  dot?: boolean
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200',
  danger: 'bg-red-50 text-red-700 border border-red-200',
  info: 'bg-blue-50 text-blue-700 border border-blue-200',
  purple: 'bg-purple-50 text-purple-700 border border-purple-200',
  outline: 'bg-white text-gray-700 border border-gray-300',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
}

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-gray-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  purple: 'bg-purple-500',
  outline: 'bg-gray-500',
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  className,
  dot = false,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[variant])} />
      )}
      {children}
    </span>
  )
}

// Pre-configured status badges
export function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { variant: BadgeVariant; label: string }> = {
    // Invoice/Receipt statuses
    draft: { variant: 'default', label: 'Draft' },
    sent: { variant: 'info', label: 'Sent' },
    partial: { variant: 'warning', label: 'Partial' },
    paid: { variant: 'success', label: 'Paid' },
    overdue: { variant: 'danger', label: 'Overdue' },
    cancelled: { variant: 'default', label: 'Cancelled' },

    // Lease statuses
    active: { variant: 'success', label: 'Active' },
    expired: { variant: 'warning', label: 'Expired' },
    terminated: { variant: 'danger', label: 'Terminated' },

    // Journal statuses
    posted: { variant: 'success', label: 'Posted' },
    reversed: { variant: 'default', label: 'Reversed' },

    // Expense statuses
    pending: { variant: 'warning', label: 'Pending' },
    approved: { variant: 'info', label: 'Approved' },

    // Unit statuses
    occupied: { variant: 'success', label: 'Occupied' },
    vacant: { variant: 'danger', label: 'Vacant' },
  }

  const config = statusConfig[status.toLowerCase()] || { variant: 'default', label: status }

  return (
    <Badge variant={config.variant} dot>
      {config.label}
    </Badge>
  )
}
