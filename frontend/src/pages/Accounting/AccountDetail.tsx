import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { ArrowLeft, Wallet, BookOpen } from 'lucide-react'
import { accountApi, glApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { Skeleton, EmptyState, DatePicker } from '../../components/ui'

/**
 * Chart-of-Account ("Global Account") detail — the account's setup plus its
 * General Ledger movements with a running balance. Reached from the Global
 * Accounts list.
 */
export default function AccountDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const accountId = Number(id)

  const { data: account, isLoading } = useQuery({
    queryKey: ['account', accountId],
    queryFn: () => accountApi.get(accountId).then(r => r.data),
    enabled: !!accountId,
  })

  // Optional window — when a start date is set, the statement carries the
  // running opening balance brought forward from before the window.
  const [range, setRange] = useState({ start_date: '', end_date: '' })

  const { data: statement, isLoading: loadingLedger } = useQuery({
    queryKey: ['account-statement', accountId, range],
    queryFn: () => glApi.accountStatement({
      account: accountId,
      ...(range.start_date ? { start_date: range.start_date } : {}),
      ...(range.end_date ? { end_date: range.end_date } : {}),
    } as any).then(r => r.data),
    enabled: !!accountId,
    placeholderData: keepPreviousData,
  })

  const entries: any[] = statement?.entries || []
  const summary = statement?.summary || {}

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => navigate('/dashboard')} className="hover:text-gray-900">Dashboard</button>
        <span>/</span>
        <button onClick={() => navigate('/dashboard/chart-of-accounts')} className="hover:text-gray-900">Chart of Accounts</button>
        <span>/</span>
        <span className="text-gray-900 font-medium">{account?.name || '…'}</span>
      </nav>

      <button onClick={() => navigate('/dashboard/chart-of-accounts')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" /> Back to Chart of Accounts
      </button>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-violet-50"><Wallet className="w-6 h-6 text-violet-600" /></div>
          <div className="flex-1 min-w-0">
            {isLoading ? <Skeleton className="h-7 w-48" /> : (
              <>
                <h1 className="text-2xl font-bold text-gray-900">{account?.name}</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {account?.code} · {(account?.account_type || '').replace(/_/g, ' ')}
                  {account?.account_subtype ? ` · ${(account.account_subtype).replace(/_/g, ' ')}` : ''}
                </p>
              </>
            )}
          </div>
        </div>
        {!isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <Info label="Type" value={(account?.account_type || '—').replace(/_/g, ' ')} />
            <Info label="Currency" value={account?.currency || '—'} />
            <Info label="Normal Balance" value={account?.normal_balance || '—'} />
            <Info label="Current Balance" value={formatCurrency(Number(account?.current_balance || 0))} accent />
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <BookOpen className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">General Ledger</h2>
          <span className="text-xs text-gray-400">({entries.length})</span>
          <div className="ml-auto flex items-center gap-2">
            <DatePicker value={range.start_date} onChange={(v) => setRange(r => ({ ...r, start_date: v }))} placeholder="From date" className="min-w-[140px]" />
            <span className="text-gray-400 text-xs">to</span>
            <DatePicker value={range.end_date} onChange={(v) => setRange(r => ({ ...r, end_date: v }))} placeholder="To date" className="min-w-[140px]" />
          </div>
        </div>
        {loadingLedger ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : entries.length === 0 ? (
          <EmptyState icon={BookOpen} title="No transactions" description="This account has no ledger movements yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Journal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Credit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="bg-gray-50/60 font-medium">
                  <td colSpan={5} className="px-4 py-3 text-gray-600">Opening Balance{range.start_date ? ` (b/f as at ${range.start_date})` : ''}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatCurrency(Number(statement?.opening_balance ?? summary.opening_balance ?? 0))}</td>
                </tr>
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{e.date ? formatDate(e.date) : '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{e.journal_number || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[280px] truncate" title={e.description}>{e.description}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">{Number(e.debit_amount) ? formatCurrency(Number(e.debit_amount)) : ''}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">{Number(e.credit_amount) ? formatCurrency(Number(e.credit_amount)) : ''}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">{formatCurrency(Number(e.balance || 0))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr className="font-bold">
                  <td colSpan={3} className="px-4 py-3 text-gray-900">Closing Balance</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatCurrency(Number(summary.total_debits || 0))}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatCurrency(Number(summary.total_credits || 0))}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatCurrency(Number(summary.closing_balance ?? account?.current_balance ?? 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Info({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className={cn('mt-1 text-sm capitalize', accent ? 'font-bold text-gray-900 tabular-nums' : 'text-gray-700')}>{value}</p>
    </div>
  )
}
