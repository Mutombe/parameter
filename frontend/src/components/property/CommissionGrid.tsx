import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Percent, RotateCcw } from 'lucide-react'
import { Button } from '../ui'
import { cn } from '../../lib/utils'
import { propertyCommissionApi } from '../../services/api'

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
 */
export function CommissionGrid({
  propertyId,
  propertyName,
}: {
  propertyId: number
  propertyName: string
}) {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [savingId, setSavingId] = useState<number | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['property-commissions', propertyId],
    queryFn: () => propertyCommissionApi.grid(propertyId).then(r => r.data),
    enabled: !!propertyId,
    placeholderData: keepPreviousData,
  })

  const upsertMutation = useMutation({
    mutationFn: (vars: { income_type: number; rate: number | null }) =>
      propertyCommissionApi.upsert({ property: propertyId, ...vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-commissions', propertyId] })
      setSavingId(null)
    },
    onError: () => setSavingId(null),
  })

  const handleSave = (incomeTypeId: number, raw: string) => {
    setSavingId(incomeTypeId)
    const trimmed = raw.trim()
    const rate = trimmed === '' ? null : Number(trimmed)
    upsertMutation.mutate({ income_type: incomeTypeId, rate })
    setDrafts(prev => {
      const next = { ...prev }
      delete next[incomeTypeId]
      return next
    })
  }

  const handleReset = (incomeTypeId: number) => {
    setSavingId(incomeTypeId)
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
          Each income type has a default commission rate. Override below to set a different
          rate just for this property — e.g. <span className="font-medium text-gray-900">10% on rent</span>,
          <span className="font-medium text-gray-900"> 15% on maintenance</span>, <span className="font-medium text-gray-900">9% on parking</span>.
          Leave the override blank to use the default rate.
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
                  <th className="pb-3 px-2 font-semibold text-gray-700 text-right">Default Rate</th>
                  <th className="pb-3 px-2 font-semibold text-gray-700 text-right">Override</th>
                  <th className="pb-3 px-2 font-semibold text-gray-700 text-right">Effective</th>
                  <th className="pb-3 px-2 font-semibold text-gray-700 text-right w-32">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row: any) => {
                  const draft = drafts[row.income_type_id]
                  const overrideStr = row.override_rate !== null ? String(row.override_rate) : ''
                  const value = draft !== undefined ? draft : overrideStr
                  const isDirty = draft !== undefined && draft !== overrideStr
                  const isSaving = savingId === row.income_type_id
                  const hasOverride = row.override_rate !== null

                  return (
                    <tr key={row.income_type_id} className="hover:bg-gray-50/50 transition-colors">
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
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={value}
                            onChange={(e) =>
                              setDrafts(prev => ({ ...prev, [row.income_type_id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && isDirty) {
                                handleSave(row.income_type_id, value)
                              }
                            }}
                            placeholder={row.default_rate.toFixed(2)}
                            disabled={!row.is_commissionable || isSaving}
                            className="w-20 px-2 py-1 text-right tabular-nums border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                          />
                          <span className="text-gray-400 text-xs">%</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span
                          className={cn(
                            'tabular-nums font-semibold',
                            hasOverride ? 'text-amber-700' : 'text-gray-900',
                          )}
                        >
                          {row.is_commissionable ? `${row.effective_rate.toFixed(2)}%` : '—'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isDirty && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleSave(row.income_type_id, value)}
                              disabled={isSaving}
                            >
                              {isSaving ? '…' : 'Save'}
                            </Button>
                          )}
                          {!isDirty && hasOverride && (
                            <button
                              type="button"
                              onClick={() => handleReset(row.income_type_id)}
                              disabled={isSaving}
                              className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                              title="Reset to default rate"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Reset
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default CommissionGrid
