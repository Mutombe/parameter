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
 * Compact single-line payer cell for tables.
 *
 * Renders: name · code · Rental|Levy chip — all inline so each table row
 * stays at one line height. The chip uses sky for rental and violet for levy.
 *
 * The code + chip drop off below `md` to keep things readable on narrow
 * screens, but the name always shows.
 */
export function PayerCell({ name, code, payerType, onClick, onMouseEnter }: PayerCellProps) {
  const isLevy = payerType === 'levy'
  const typeLabel = isLevy ? 'Levy' : 'Rental'
  const typeColor = isLevy ? 'text-violet-600' : 'text-sky-600'

  if (!name && !code) {
    return <span className="text-gray-400">—</span>
  }

  return (
    <span className="flex items-center gap-2 min-w-0 w-full">
      <span className="flex-1 min-w-0 flex items-center">
        {onClick ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClick() }}
            onMouseEnter={onMouseEnter}
            className="font-medium text-sm text-gray-900 hover:text-primary-600 hover:underline truncate text-left"
            title={name || ''}
          >
            {name || '—'}
          </button>
        ) : (
          <span className="font-medium text-sm text-gray-900 truncate" title={name || ''}>{name || '—'}</span>
        )}
      </span>
      <span className="text-[11px] text-gray-400 font-mono hidden md:inline-block w-[70px] truncate flex-shrink-0">{code || ''}</span>
      <span className={cn('text-[11px] font-medium hidden md:inline-block w-[50px] flex-shrink-0', payerType ? typeColor : '')}>{payerType ? typeLabel : ''}</span>
    </span>
  )
}
