import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Percent, RotateCcw, Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import { propertyCommissionApi } from '../../services/api'
import { showToast } from '../../lib/toast'

/* CommissionGrid — per-(property, income_type) commission rate editor.
 *
 * The agency commission varies by income source — e.g. 10% rent, 15%
 * maintenance, 9% parking. Each landlord can negotiate different rates per
 * property. This grid surfaces every commissionable IncomeType for a single
 * property as one editable row.
 *
 * Resolution chain (backend mirrors this):
 *   1. PropertyIncomeCommission(property, income_type)  — override
 *   2. IncomeType.default_commission_rate               — fallback
 *   3. 0%                                                — never reached if (1) or (2) is set
 *
 * Edits are optimistic: on blur (or Enter / Reset) the cached grid is
 * patched immediately and the row's effective rate updates in real time.
 * If the server rejects the change, the row reverts to its pre-edit value
 * and an error toast surfaces.
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
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  // After a successful save, briefly flash a green check next to the row
  // to acknowledge — fades after 1.2s.
  const [recentlySaved, setRecentlySaved] = useState<Record<number, number>>({})
  // Tracks which rows have an in-flight mutation so we can show a subtle
  // saving cue without locking out further edits.
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set())

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => propertyCommissionApi.grid(propertyId).then(r => r.data),
    enabled: !!propertyId,
    placeholderData: keepPreviousData,
  })

  // --- Optimistic upsert ---------------------------------------------------
  // onMutate patches the cached grid so the user sees the new override and
  // recomputed effective rate the moment they commit the edit. The mutation
  // returns the snapshot via context so onError can roll it back.
  const upsertMutation = useMutation({
    mutationFn: (vars: { income_type: number; rate: number | null }) =>
      propertyCommissionApi.upsert({ property: propertyId, ...vars }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey })
      const snapshot = queryClient.getQueryData<any>(queryKey)
      setSavingIds(prev => new Set(prev).add(vars.income_type))

      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old?.rows) return old
        return {
          ...old,
          rows: old.rows.map((row: any) => {
            if (row.income_type_id !== vars.income_type) return row
            const override = vars.rate
            return {
              ...row,
              override_rate: override,
              effective_rate: override !== null ? override : row.default_rate,
              // override_id stays as-is; the actual id comes back on refetch.
            }
          }),
        }
      })
      return { snapshot, income_type: vars.income_type }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot)
      showToast.error('Could not save commission rate. Reverted.')
    },
    onSuccess: (_data, vars) => {
      setRecentlySaved(prev => ({ ...prev, [vars.income_type]: Date.now() }))
    },
    onSettled: (_data, _err, vars) => {
      setSavingIds(prev => {
        const next = new Set(prev)
        next.delete(vars.income_type)
        return next
      })
      // Refetch so override_id and any server-derived fields stay accurate.
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // Auto-clear the green-check flash after 1.2s.
  useEffect(() => {
    if (Object.keys(recentlySaved).length === 0) return
    const t = setTimeout(() => {
      const cutoff = Date.now() - 1200
      setRecentlySaved(prev => {
        const next: Record<number, number> = {}
        for (const [k, v] of Object.entries(prev)) {
          if (v >= cutoff) next[Number(k)] = v
        }
        return next
      })
    }, 250)
    return () => clearTimeout(t)
  }, [recentlySaved])

  // --- Edit commit logic ---------------------------------------------------
  const commit = (incomeTypeId: number, raw: string, currentOverrideStr: string) => {
    const trimmed = raw.trim()
    // Nothing changed → no-op.
    if (trimmed === currentOverrideStr) {
      setDrafts(prev => {
        const next = { ...prev }
        delete next[incomeTypeId]
        return next
      })
      return
    }
    const rate = trimmed === '' ? null : Number(trimmed)
    if (rate !== null && (Number.isNaN(rate) || rate < 0 || rate > 100)) {
      showToast.error('Rate must be a number between 0 and 100.')
      return
    }
    upsertMutation.mutate({ income_type: incomeTypeId, rate })
    setDrafts(prev => {
      const next = { ...prev }
      delete next[incomeTypeId]
      return next
    })
  }

  const handleReset = (incomeTypeId: number) => {
    upsertMutation.mutate({ income_type: incomeTypeId, rate: null })
    setDrafts(prev => {
      const next = { ...prev }
      delete next[incomeTypeId]
      return next
    })
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
              Per-income-type commission rates for {propertyName || 'this property'}
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
          E.g. <span className="font-medium text-gray-900">10% on rent</span>,
          <span className="font-medium text-gray-900"> 15% on maintenance</span>,
          <span className="font-medium text-gray-900"> 9% on parking</span>.
          Leave blank to use the income type default.
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
                  <CommissionGridRow
                    key={row.income_type_id}
                    row={row}
                    draft={drafts[row.income_type_id]}
                    saving={savingIds.has(row.income_type_id)}
                    flashing={!!recentlySaved[row.income_type_id]}
                    onChange={(v) =>
                      setDrafts(prev => ({ ...prev, [row.income_type_id]: v }))
                    }
                    onCommit={(currentOverrideStr) => {
                      const draftVal = drafts[row.income_type_id]
                      if (draftVal === undefined) return
                      commit(row.income_type_id, draftVal, currentOverrideStr)
                    }}
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

interface CommissionGridRowProps {
  row: any
  draft: string | undefined
  saving: boolean
  flashing: boolean
  onChange: (v: string) => void
  onCommit: (currentOverrideStr: string) => void
  onReset: () => void
}

function CommissionGridRow({
  row,
  draft,
  saving,
  flashing,
  onChange,
  onCommit,
  onReset,
}: CommissionGridRowProps) {
  const overrideStr = row.override_rate !== null ? String(row.override_rate) : ''
  const value = draft !== undefined ? draft : overrideStr
  const hasOverride = row.override_rate !== null
  // Avoid double-firing commit when blur and Enter both fire.
  const committedRef = useRef(false)

  return (
    <tr className={cn(
      'transition-colors',
      flashing ? 'bg-emerald-50/60' : 'hover:bg-gray-50/50',
    )}>
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
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={value}
            onChange={(e) => {
              committedRef.current = false
              onChange(e.target.value)
            }}
            onBlur={() => {
              if (committedRef.current) return
              committedRef.current = true
              onCommit(overrideStr)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                committedRef.current = true
                onCommit(overrideStr)
                ;(e.target as HTMLInputElement).blur()
              } else if (e.key === 'Escape') {
                committedRef.current = true
                onChange(overrideStr)
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            placeholder={row.default_rate.toFixed(2)}
            disabled={!row.is_commissionable}
            className={cn(
              'w-20 px-2 py-1 text-right tabular-nums border rounded-lg text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
              'disabled:bg-gray-50 disabled:text-gray-400',
              saving ? 'border-amber-300 bg-amber-50/40' : 'border-gray-300',
            )}
          />
          <span className="text-gray-400 text-xs">%</span>
        </div>
      </td>
      <td className="py-3 px-2 text-right">
        <div className="inline-flex items-center justify-end gap-1.5">
          {flashing && <Check className="w-3.5 h-3.5 text-emerald-600" />}
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
        {hasOverride && (
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
