import { useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Option {
  value: number | string
  label: string
  description?: string
}

/** A searchable, scrollable checkbox list for picking many items —
 *  used by the Payment Reminders and Email Invoices scope pickers. */
export function MultiCheckList({
  label,
  options,
  selected,
  onChange,
  height = 'max-h-48',
  emptyMessage = 'Nothing to select',
}: {
  label?: string
  options: Option[]
  selected: Array<number | string>
  onChange: (next: Array<number | string>) => void
  height?: string
  emptyMessage?: string
}) {
  const [q, setQ] = useState('')
  const sel = new Set(selected.map(String))
  const shown = q
    ? options.filter(o =>
        o.label.toLowerCase().includes(q.toLowerCase()) ||
        (o.description || '').toLowerCase().includes(q.toLowerCase()))
    : options

  const toggle = (v: number | string) => {
    const key = String(v)
    onChange(sel.has(key)
      ? selected.filter(s => String(s) !== key)
      : [...selected, v])
  }

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-gray-700">{label}</label>
          <span className="text-xs text-gray-400">{selected.length} selected</span>
        </div>
      )}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="relative border-b border-gray-100">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full pl-8 pr-3 py-2 text-sm focus:outline-none"
          />
        </div>
        <div className={cn('overflow-y-auto divide-y divide-gray-50', height)}>
          {shown.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-gray-400">{emptyMessage}</p>
          ) : shown.map(o => (
            <label key={String(o.value)} className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={sel.has(String(o.value))}
                onChange={() => toggle(o.value)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="min-w-0">
                <span className="block text-sm text-gray-800 break-words">{o.label}</span>
                {o.description && <span className="block text-xs text-gray-400">{o.description}</span>}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
