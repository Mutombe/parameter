import { cn } from '../lib/utils'

interface PayerCellProps {
  name?: string | null
  code?: string | null
  payerType?: 'rental' | 'levy' | string | null
  /** Optional click handler — wraps the name in a link-styled button. */
  onClick?: () => void
  /** Optional hover handler — used for prefetching the destination. */
  onMouseEnter?: () => void
}

/**
 * Two-line payer cell for tables shared across tenants and account holders.
 *
 * Line 1: name (clickable when onClick is provided)
 * Line 2: code · Rental|Levy chip (sky for rental, violet for levy)
 *
 * The chip is text-only so dense tables don't get visually noisy.
 */
export function PayerCell({ name, code, payerType, onClick, onMouseEnter }: PayerCellProps) {
  const isLevy = payerType === 'levy'
  const typeLabel = isLevy ? 'Levy' : 'Rental'
  const typeColor = isLevy ? 'text-violet-600' : 'text-sky-600'

  if (!name && !code) {
    return <span className="text-gray-400">—</span>
  }

  return (
    <div className="min-w-0">
      {onClick ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick() }}
          onMouseEnter={onMouseEnter}
          className="font-medium text-sm text-gray-900 hover:text-primary-600 hover:underline truncate block text-left"
        >
          {name || '—'}
        </button>
      ) : (
        <span className="font-medium text-sm text-gray-900 truncate block">{name || '—'}</span>
      )}
      <div className="text-[11px] text-gray-500 truncate">
        {code && <span className="font-mono">{code}</span>}
        {code && payerType && <span className="mx-1 text-gray-300">·</span>}
        {payerType && <span className={cn('font-medium', typeColor)}>{typeLabel}</span>}
      </div>
    </div>
  )
}
