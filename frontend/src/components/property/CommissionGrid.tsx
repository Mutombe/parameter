import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Percent, RotateCcw, Check, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { propertyCommissionApi } from '../../services/api'
import { showToast } from '../../lib/toast'

/* CommissionGrid — per-(property, income_type) commission rate editor.
 *
 * Each row carries its OWN input state — no parent-managed drafts dict
 * (which had a closure trap where blur could read a stale value).
 * Edits commit on blur or Enter, reset to default via the inline
 * Reset button, abandon via Escape.
 *
 * Mutations are optimistic: the cached grid is patched in onMutate so
 * the row's "Effective" column updates instantly, with a green check
 * to acknowledge. On error, the snapshot is restored and a toast
 * surfaces.
 */
export function CommissionGrid({
  propertyId,
  propertyName,
}: {
  propertyId: number
  propertyName: string
}) {
  const queryClient = useQueryClient()
  const queryKey = ['property-commissions', propertyId]
  // Per-row "saving" + "recently saved" cues, keyed by income_type_id.
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set())

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => propertyCommissionApi.grid(propertyId).then(r => r.data),
    enabled: !!propertyId,
    placeholderData: keepPreviousData,
  })

  const upsertMutation = useMutation({
    mutationFn: (vars: { income_type: number; rate: number | null }) =>
      propertyCommissionApi.upsert({ property: propertyId, ...vars }),

    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey })
      const snapshot = queryClient.getQueryData<any>(queryKey)
      setSavingIds(prev => new Set(prev).add(vars.income_type))

      // Optimistic patch — the row's override + effective rate update
      // immediately so the user sees the change without waiting for
      // the round trip.
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old?.rows) return old
        return {
          ...old,
          rows: old.rows.map((r: any) =>
            r.income_type_id === vars.income_type
              ? {
                  ...r,
                  override_rate: vars.rate,
                  effective_rate: vars.rate !== null ? vars.rate : r.default_rate,
                }
              : r
          ),
        }
      })
      return { snapshot }
    },

    onError: (_err, _vars, ctx: any) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot)
      showToast.error('Could not save commission rate. Reverted.')
    },

    onSuccess: (_resp, vars) => {
      // Brief green-check flash on the row.
      setSavedIds(prev => new Set(prev).add(vars.income_type))
      window.setTimeout(() => {
        setSavedIds(prev => {
          const next = new Set(prev)
          next.delete(vars.income_type)
          return next
        })
      }, 1500)
    },

    onSettled: (_resp, _err, vars) => {
      setSavingIds(prev => {
        const next = new Set(prev)
        next.delete(vars.income_type)
        return next
      })
      // Refetch to pull authoritative override_id and any server-side fields.
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const handleSave = (incomeTypeId: number, raw: string) => {
    const trimmed = raw.trim()
    const rate = trimmed === '' ? null : Number(trimmed)
    if (rate !== null && (Number.isNaN(rate) || rate < 0 || rate > 100)) {
      showToast.error('Commission must be between 0 and 100.')
      return
    }
    upsertMutation.mutate({ income_type: incomeTypeId, rate })
  }

  const handleReset = (incomeTypeId: number) => {
    upsertMutation.mutate({ income_type: incomeTypeId, rate: null })
  }

  const rows: any[] = data?.rows || []
  const overrideCount = rows.filter((r: any) => r.override_rate !== null).length

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
            <Percent className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Commission Settings</h3>
            <p className="text-sm text-gray-500">
              Per-income-type rates for {propertyName || 'this property'}
              {overrideCount > 0 && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                  {overrideCount} override{overrideCount === 1 ? '' : 's'}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <p className="text-sm text-gray-600 mb-5 leading-relaxed">
          Edit any rate and click away (or press Enter) — saves automatically.
          Leave blank to revert to the income type's default rate.
        </p>

        {error ? (
          <div className="p-4 bg-rose-50 rounded-lg text-rose-700 text-sm">
            Failed to load commission grid. Please refresh.
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">
            No active income types. Add some via Setup → Income Types.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200">
                  <th className="pb-3 px-2 font-semibold text-gray-700">Income Type</th>
                  <th className="pb-3 px-2 font-semibold text-gray-700">Code</th>
                  <th className="pb-3 px-2 font-semibold text-gray-700 text-right">Default</th>
                  <th className="pb-3 px-2 font-semibold text-gray-700 text-right">Override</th>
                  <th className="pb-3 px-2 font-semibold text-gray-700 text-right">Effective</th>
                  <th className="pb-3 px-2 font-semibold text-gray-700 text-right w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row: any) => (
                  <CommissionRow
                    key={row.income_type_id}
                    row={row}
                    saving={savingIds.has(row.income_type_id)}
                    saved={savedIds.has(row.income_type_id)}
                    onSave={(value) => handleSave(row.income_type_id, value)}
                    onReset={() => handleReset(row.income_type_id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

interface CommissionRowProps {
  row: any
  saving: boolean
  saved: boolean
  onSave: (value: string) => void
  onReset: () => void
}

function CommissionRow({ row, saving, saved, onSave, onReset }: CommissionRowProps) {
  const overrideStr = row.override_rate !== null ? String(row.override_rate) : ''
  // Each row owns its own input state — no parent-level drafts dict, no
  // closure traps. Re-sync when the row's data changes from the server.
  const [value, setValue] = useState(overrideStr)
  useEffect(() => { setValue(overrideStr) }, [overrideStr])

  const isDirty = value !== overrideStr
  const hasOverride = row.override_rate !== null

  const commit = () => {
    if (!isDirty) return
    onSave(value)
  }

  return (
    <tr className={cn('transition-colors', saved ? 'bg-emerald-50/60' : 'hover:bg-gray-50/50')}>
      <td className="py-3 px-2">
        <div className="font-medium text-gray-900">{row.income_type_name}</div>
        {!row.is_commissionable && (
          <div className="text-xs text-gray-400 mt-0.5">Non-commissionable</div>
        )}
      </td>
      <td className="py-3 px-2 font-mono text-xs text-gray-500">
        {row.income_type_code}
      </td>
      <td className="py-3 px-2 text-right tabular-nums text-gray-600">
        {row.is_commissionable ? `${row.default_rate.toFixed(2)}%` : '—'}
      </td>
      <td className="py-3 px-2 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {saving && <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />}
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
                ;(e.target as HTMLInputElement).blur()
              } else if (e.key === 'Escape') {
                setValue(overrideStr)
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            placeholder={row.default_rate.toFixed(2)}
            disabled={!row.is_commissionable}
            className={cn(
              'w-20 px-2 py-1 text-right tabular-nums border rounded-lg text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
              'disabled:bg-gray-50 disabled:text-gray-400',
              isDirty ? 'border-amber-400 bg-amber-50/40' : 'border-gray-300',
            )}
          />
          <span className="text-gray-400 text-xs">%</span>
        </div>
      </td>
      <td className="py-3 px-2 text-right">
        <div className="inline-flex items-center justify-end gap-1.5">
          {saved && <Check className="w-3.5 h-3.5 text-emerald-600" />}
          <span
            className={cn(
              'tabular-nums font-semibold transition-colors',
              hasOverride ? 'text-amber-700' : 'text-gray-900',
            )}
          >
            {row.is_commissionable ? `${row.effective_rate.toFixed(2)}%` : '—'}
          </span>
        </div>
      </td>
      <td className="py-3 px-2 text-right">
        {hasOverride && !isDirty && (
          <button
            type="button"
            onClick={onReset}
            disabled={saving}
            className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
            title="Reset to default rate"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        )}
      </td>
    </tr>
  )
}

export default CommissionGrid
