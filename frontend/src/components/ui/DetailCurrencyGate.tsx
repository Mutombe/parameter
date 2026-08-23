import { cn } from '../../lib/utils'

/* DetailCurrencyGate — the mandatory currency selector shown on a sub-account
 * summary BEFORE the user can drill into a single-currency transaction detail.
 *
 * A sub-account summary may show balances in several currencies, but its
 * detail is always viewed in ONE explicitly-chosen currency. Nothing is
 * selected initially (no implicit USD), and there is deliberately no "All"
 * option — the whole point is to force a currency-specific accounting view.
 *
 * Shared across Landlord, Tenant and Account-Holder sub-account screens so the
 * gate behaves identically everywhere.
 */
export function DetailCurrencyGate({
  value,
  onChange,
  currencies = ['USD', 'ZWG'],
  label = 'Detail currency',
  hint = 'Select a currency before opening an account.',
  className,
}: {
  value: string
  onChange: (currency: string) => void
  currencies?: string[]
  label?: string
  hint?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">{label}</span>
      <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 dark:bg-slate-900 dark:border-slate-700">
        {currencies.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={value === c}
            onClick={() => onChange(c)}
            className={cn(
              'px-3 py-1 text-xs font-semibold rounded transition-colors',
              value === c
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            {c}
          </button>
        ))}
      </div>
      {!value && <span className="text-xs text-amber-600 dark:text-amber-400">{hint}</span>}
    </div>
  )
}
