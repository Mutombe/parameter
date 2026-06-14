import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { ArrowLeft, Landmark, Scale } from 'lucide-react'
import { bankAccountApi } from '../../services/api'
import { formatCurrency, cn } from '../../lib/utils'
import { Badge, Skeleton, EmptyState, DatePicker, Button } from '../../components/ui'

/**
 * Bank Account detail — pulls every book movement through the account
 * (receipts deposited in, expenses paid out) from across the system, with
 * a running balance and totals. Feeds the Bank Reconciliation workflow.
 */
export default function BankAccountDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const accountId = Number(id)

  const [range, setRange] = useState({ start_date: '', end_date: '' })

  const { data: account } = useQuery({
    queryKey: ['bank-account', accountId],
    queryFn: () => bankAccountApi.get(accountId).then(r => r.data),
    enabled: !!accountId,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['bank-account-transactions', accountId, range],
    queryFn: () => bankAccountApi.transactions(accountId, {
      ...(range.start_date ? { start_date: range.start_date } : {}),
      ...(range.end_date ? { end_date: range.end_date } : {}),
    }).then(r => r.data),
    enabled: !!accountId,
    placeholderData: keepPreviousData,
  })

  const rows: any[] = data?.transactions || []
  const summary = data?.summary || {}

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => navigate('/dashboard')} className="hover:text-gray-900">Dashboard</button>
        <span>/</span>
        <button onClick={() => navigate('/dashboard/bank-accounts')} className="hover:text-gray-900">Bank Accounts</button>
        <span>/</span>
        <span className="text-gray-900 font-medium">{account?.name || '…'}</span>
      </nav>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => navigate('/dashboard/bank-accounts')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back to Bank Accounts
        </button>
        <Button variant="outline" onClick={() => navigate('/dashboard/bank-reconciliation')} className="gap-2">
          <Scale className="w-4 h-4" /> Reconcile
        </Button>
      </div>

      {/* Account header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-sky-50"><Landmark className="w-6 h-6 text-sky-600" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{account?.name || 'Bank Account'}</h1>
              {account?.currency && <Badge>{account.currency}</Badge>}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {[account?.bank_name, account?.account_number, account?.code].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <Info label="Book Balance" value={formatCurrency(Number(account?.book_balance || 0))} />
          <Info label="Bank Balance" value={formatCurrency(Number(account?.bank_balance || 0))} />
          <Info label="Deposits In" value={formatCurrency(Number(summary.total_inflow || 0))} />
          <Info label="Payments Out" value={formatCurrency(Number(summary.total_outflow || 0))} />
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Transactions through this account</h2>
            <span className="text-xs text-gray-400">({rows.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <DatePicker value={range.start_date} onChange={(v) => setRange(r => ({ ...r, start_date: v }))} className="min-w-[150px]" />
            <span className="text-gray-400 text-sm">to</span>
            <DatePicker value={range.end_date} onChange={(v) => setRange(r => ({ ...r, end_date: v }))} className="min-w-[150px]" />
          </div>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Landmark} title="No transactions" description="No receipts or expenses have used this bank account in this period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ref</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Party</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-emerald-700 uppercase">Deposit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-rose-700 uppercase">Payment</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((t, idx) => (
                  <tr
                    key={`${t.type}-${t.id}-${idx}`}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(t.type === 'receipt' ? `/dashboard/receipts/${t.id}` : `/dashboard/expenses/${t.id}`)}
                  >
                    <td className="px-4 py-3 text-gray-600 tabular-nums whitespace-nowrap">{t.date}</td>
                    <td className="px-4 py-3 font-mono text-xs text-primary-600">{t.reference || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[260px] truncate" title={t.description}>{t.description}</td>
                    <td className="px-4 py-3 text-gray-500">{t.party || '—'}</td>
                    <td className={cn('px-4 py-3 text-right tabular-nums', t.inflow ? 'text-emerald-700 font-semibold' : 'text-gray-300')}>{t.inflow ? formatCurrency(t.inflow) : '—'}</td>
                    <td className={cn('px-4 py-3 text-right tabular-nums', t.outflow ? 'text-rose-700 font-semibold' : 'text-gray-300')}>{t.outflow ? formatCurrency(t.outflow) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">{formatCurrency(Number(t.balance || 0))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr className="font-bold">
                  <td colSpan={4} className="px-4 py-3 text-gray-900">Totals</td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{formatCurrency(Number(summary.total_inflow || 0))}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-rose-700">{formatCurrency(Number(summary.total_outflow || 0))}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatCurrency(Number(summary.net || 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-gray-900 tabular-nums">{value}</p>
    </div>
  )
}
