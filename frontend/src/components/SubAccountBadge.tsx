import { cn } from '../lib/utils'

interface SubAccountBadgeProps {
  /** Sub-account category key — rent / levy / maintenance / etc. */
  category?: string | null
  /** Currency code shown after the dot. */
  currency?: string | null
  className?: string
}

const LABELS: Record<string, string> = {
  rent: 'Rent',
  levy: 'Levy',
  special_levy: 'Special Levy',
  maintenance: 'Maintenance',
  parking: 'Parking',
  rates: 'Rates',
  vat: 'VAT',
  deposit: 'Deposit',
  general: 'General',
}

// Each sub-account category gets its own subtle colour so dense tables
// stay scannable. Rental-side categories lean blue/green; levy-side
// categories lean violet/amber to mirror the existing payer-type accent.
const COLORS: Record<string, string> = {
  rent:         'bg-sky-50 text-sky-700 ring-sky-200',
  levy:         'bg-violet-50 text-violet-700 ring-violet-200',
  special_levy: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
  maintenance:  'bg-amber-50 text-amber-700 ring-amber-200',
  parking:      'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rates:        'bg-rose-50 text-rose-700 ring-rose-200',
  vat:          'bg-indigo-50 text-indigo-700 ring-indigo-200',
  deposit:      'bg-teal-50 text-teal-700 ring-teal-200',
  general:      'bg-gray-50 text-gray-600 ring-gray-200',
}

/**
 * Compact badge that names the landlord sub-account a row belongs to,
 * with the currency tucked in after a dot. Used in receipt and invoice
 * tables so users can categorize at a glance without expanding rows.
 */
export function SubAccountBadge({ category, currency, className }: SubAccountBadgeProps) {
  if (!category) return <span className="text-gray-400 text-xs">—</span>
  const label = LABELS[category] || category.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
  const colour = COLORS[category] || COLORS.general
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ring-1', colour, className)}>
      <span>{label}</span>
      {currency && (
        <>
          <span className="text-gray-300">·</span>
          <span className="font-mono text-[10px] opacity-80">{currency}</span>
        </>
      )}
    </span>
  )
}
