import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { ArrowLeft, DollarSign, Receipt } from 'lucide-react'
import { incomeTypeApi, receiptApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { Badge, Skeleton, EmptyState } from '../../components/ui'

/**
 * Income Type detail — the income type's configuration (commission / VAT /
 * GL account) plus every receipt collected against it, with a total.
 */
export default function IncomeTypeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const incomeTypeId = Number(id)

  const { data: incomeType, isLoading } = useQuery({
    queryKey: ['income-type', incomeTypeId],
    queryFn: () => incomeTypeApi.get(incomeTypeId).then(r => r.data),
    enabled: !!incomeTypeId,
  })

  const { data: receiptsData, isLoading: loadingReceipts } = useQuery({
    queryKey: ['income-type-receipts', incomeTypeId],
    queryFn: () => receiptApi.list({ income_type: incomeTypeId, page_size: 500 }).then(r => r.data),
    enabled: !!incomeTypeId,
    placeholderData: keepPreviousData,
  })

  const receipts: any[] = receiptsData?.results || receiptsData || []
  const total = receipts.reduce((s, r) => s + Number(r.amount || 0), 0)

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => navigate('/dashboard')} className="hover:text-gray-900">Dashboard</button>
        <span>/</span>
        <button onClick={() => navigate('/dashboard/income-types')} className="hover:text-gray-900">Revenue</button>
        <span>/</span>
        <span className="text-gray-900 font-medium">{incomeType?.name || '…'}</span>
      </nav>

      <button onClick={() => navigate('/dashboard/income-types')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" /> Back to Revenue
      </button>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-teal-50"><DollarSign className="w-6 h-6 text-teal-600" /></div>
          <div className="flex-1 min-w-0">
            {isLoading ? <Skeleton className="h-7 w-48" /> : (
              <>
                <h1 className="text-2xl font-bold text-gray-900">{incomeType?.name}</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {incomeType?.code}
                  {incomeType?.management_type ? ` · ${incomeType.management_type}` : ''}
                  {incomeType?.description ? ` · ${incomeType.description}` : ''}
                </p>
              </>
            )}
          </div>
        </div>
        {!isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <Info label="GL Account" value={incomeType?.gl_account_code ? `${incomeType.gl_account_code} — ${incomeType.gl_account_name}` : '—'} />
            <Info label="Commission" value={incomeType?.is_commissionable ? `${incomeType.default_commission_rate}%` : 'Non-commissionable'} />
            <Info label="VAT" value={incomeType?.is_vatable ? `${incomeType.vat_rate}%` : 'Not VATable'} />
            <Info label="Total Collected" value={formatCurrency(total)} accent />
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Receipts for this income type</h2>
          <span className="text-xs text-gray-400">({receipts.length})</span>
        </div>
        {loadingReceipts ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : receipts.length === 0 ? (
          <EmptyState icon={Receipt} title="No receipts" description="No receipts have been recorded for this income type yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Receipt #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tenant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Method</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {receipts.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/dashboard/receipts/${r.id}`)}>
                    <td className="px-4 py-3 text-gray-600">{r.date ? formatDate(r.date) : '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-primary-600">{r.receipt_number}</td>
                    <td className="px-4 py-3 text-gray-700">{r.tenant_name || r.tenant_code || '—'}</td>
                    <td className="px-4 py-3"><Badge>{(r.payment_method || '').replace(/_/g, ' ')}</Badge></td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(Number(r.amount || 0))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr className="font-bold">
                  <td colSpan={4} className="px-4 py-3 text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatCurrency(total)}</td>
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
      <p className={cn('mt-1 text-sm', accent ? 'font-bold text-gray-900 tabular-nums' : 'text-gray-700')}>{value}</p>
    </div>
  )
}
