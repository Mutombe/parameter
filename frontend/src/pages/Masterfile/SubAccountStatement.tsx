import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import { subsidiaryApi } from '../../services/api'
import { formatCurrency, cn } from '../../lib/utils'
import { Badge, SkeletonTable, DatePicker } from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'

const ENTITY_LABELS: Record<string, string> = {
  landlord: 'Landlord', tenant: 'Tenant', account_holder: 'Account Holder',
}

/**
 * Full-page sub-account statement — the per-account statement that used to
 * render inline below the sub-account cards on the Landlord/Property detail
 * pages, now a dedicated page reached by clicking a sub-account card.
 */
export default function SubAccountStatement() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const accountId = Number(id)

  const [range, setRange] = useState({
    // Default to the current year so historical activity shows on open;
    // the date pickers let the user widen or narrow.
    period_start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    period_end: new Date().toISOString().split('T')[0],
  })
  const [view, setView] = useState<'consolidated' | 'audit'>('consolidated')

  const { data: account } = useQuery({
    queryKey: ['subaccount', accountId],
    queryFn: () => subsidiaryApi.get(accountId).then(r => r.data),
    enabled: !!accountId,
  })

  const { data: statement, isLoading, isFetching } = useQuery({
    queryKey: ['subaccount-statement', accountId, range, view],
    queryFn: () => subsidiaryApi.statement(accountId, {
      period_start: range.period_start,
      period_end: range.period_end,
      view,
    }).then(r => r.data),
    enabled: !!accountId,
    placeholderData: keepPreviousData,
  })

  const txns: any[] = statement?.transactions || statement?.entries || []

  const exportStatement = async (fmt: 'csv' | 'pdf') => {
    try {
      const res = await subsidiaryApi.exportStatement(accountId, {
        period_start: range.period_start, period_end: range.period_end, view, format: fmt,
      })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `statement-${(account?.code || accountId).toString().replace(/\//g, '-')}.${fmt}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      let detail = ''
      try {
        const data = err?.response?.data
        if (data instanceof Blob) detail = (await data.text()).slice(0, 200)
      } catch { /* ignore */ }
      showToast.error(detail ? `Failed to export: ${detail}` : parseApiError(err, 'Failed to export statement'))
    }
  }

  const openingBalance = statement?.opening_balance ?? statement?.balance_bf ?? 0
  const closingBalance = statement?.closing_balance ?? statement?.balance_cf ?? 0

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => navigate('/dashboard')} className="hover:text-gray-900">Dashboard</button>
        <span>/</span>
        <button onClick={() => navigate('/dashboard/subsidiary-ledger')} className="hover:text-gray-900">Subsidiary Ledger</button>
        <span>/</span>
        <span className="text-gray-900 font-medium">{account?.name || '…'}</span>
      </nav>

      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{account?.name || 'Account Statement'}</h1>
              {account?.entity_type && (
                <Badge>{ENTITY_LABELS[account.entity_type] || account.entity_type}</Badge>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {account?.code}{account?.currency ? ` · ${account.currency}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <DatePicker value={range.period_start} onChange={(v) => setRange(r => ({ ...r, period_start: v }))} className="min-w-[150px]" />
            <span className="text-gray-400 text-sm">to</span>
            <DatePicker value={range.period_end} onChange={(v) => setRange(r => ({ ...r, period_end: v }))} className="min-w-[150px]" />
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(['consolidated', 'audit'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize',
                    view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg hidden group-hover:block z-10 min-w-[100px]">
                {(['csv', 'pdf'] as const).map(fmt => (
                  <button key={fmt} onClick={() => exportStatement(fmt)} className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left first:rounded-t-lg last:rounded-b-lg">
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Opening balance */}
        {statement && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">Opening Balance</span>
            <span className={cn('text-sm font-bold tabular-nums', Number(openingBalance) >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {formatCurrency(Number(openingBalance))}
            </span>
          </div>
        )}

        {/* Transactions */}
        <div className="overflow-x-auto relative">
          {isLoading ? (
            <div className="p-6"><SkeletonTable rows={6} /></div>
          ) : txns.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No transactions found for this period</div>
          ) : (
            <>
              {isFetching && (
                <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 shadow-sm text-xs text-gray-600">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-600" /> Loading {view}…
                  </div>
                </div>
              )}
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em] px-6 py-3">Date</th>
                    <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em] px-6 py-3">Ref</th>
                    <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em] px-6 py-3">Contra</th>
                    <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em] px-6 py-3">Description</th>
                    <th className="text-right text-[10px] font-semibold text-sky-700 uppercase tracking-[0.1em] px-6 py-3">Debit</th>
                    <th className="text-right text-[10px] font-semibold text-emerald-700 uppercase tracking-[0.1em] px-6 py-3">Credit</th>
                    <th className="text-right text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em] px-6 py-3">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {txns.map((txn: any, idx: number) => {
                    const dr = Number(txn.debit_amount ?? txn.debit ?? 0)
                    const cr = Number(txn.credit_amount ?? txn.credit ?? 0)
                    const bal = Number(txn.balance ?? txn.running_balance ?? 0)
                    return (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 text-sm text-gray-600 tabular-nums">{txn.date || '—'}</td>
                        <td className="px-6 py-3 text-xs text-gray-500 font-mono">{txn.reference || txn.ref || '—'}</td>
                        <td className="px-6 py-3 text-sm">
                          {/* Contra shows where an expenditure went; blank for income (credits). */}
                          {dr > 0 && txn.contra_display ? (
                            txn.contra_kind === 'supplier' ? (
                              <button onClick={() => navigate(`/dashboard/suppliers/${txn.contra_id}`)} className="text-primary-600 hover:underline text-left">{txn.contra_display}</button>
                            ) : txn.contra_kind === 'account' ? (
                              <button onClick={() => navigate(`/dashboard/global-accounts/${txn.contra_id}`)} className="text-primary-600 hover:underline text-left">{txn.contra_display}</button>
                            ) : (
                              <span className="text-gray-600">{txn.contra_display}</span>
                            )
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-900">
                          <span className="flex items-center gap-1.5">
                            {txn.description || txn.narration || '—'}
                            {txn.is_consolidated && (
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold" title="Consolidated entry">C</span>
                            )}
                          </span>
                        </td>
                        <td className={cn('px-6 py-3 text-sm text-right tabular-nums', dr > 0 ? 'text-sky-700 font-semibold' : 'text-gray-300')}>
                          {dr > 0 ? formatCurrency(dr) : '—'}
                        </td>
                        <td className={cn('px-6 py-3 text-sm text-right tabular-nums', cr > 0 ? 'text-emerald-700 font-semibold' : 'text-gray-300')}>
                          {cr > 0 ? formatCurrency(cr) : '—'}
                        </td>
                        <td className="px-6 py-3 text-sm font-medium text-right tabular-nums">
                          <span className={bal < 0 ? 'text-red-600' : 'text-gray-900'}>{formatCurrency(bal)}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  {/* Closing balance row — carries the debit/credit column
                      totals alongside the closing balance, all in green. */}
                  <tr className="bg-emerald-50 border-t-2 border-emerald-200 font-bold">
                    <td colSpan={4} className="px-6 py-3 text-sm text-gray-700">Closing Balance</td>
                    <td className="px-6 py-3 text-sm text-right tabular-nums text-emerald-700">
                      {formatCurrency(Number(statement?.total_debits || 0))}
                    </td>
                    <td className="px-6 py-3 text-sm text-right tabular-nums text-emerald-700">
                      {formatCurrency(Number(statement?.total_credits || 0))}
                    </td>
                    <td className={cn('px-6 py-3 text-sm text-right tabular-nums',
                      Number(closingBalance) >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                      {formatCurrency(Number(closingBalance))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
