import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { ShieldCheck, Loader2 } from '@/lib/icons'
import { reportsApi } from '../../../services/api'
import { formatCurrency, formatDate, cn } from '../../../lib/utils'
import { Select, DatePicker, Badge, EmptyState } from '../../../components/ui'
import { useReportFilters, reportDataStore } from '../shared'

/* Landlord Pocket Movement / Audit report.
 *
 * A landlord pocket is a controlled cashbook/trust position, so every movement
 * must be explainable. This lists each pocket movement with its transaction
 * type, GL extension (for a General Journal that touched the pocket), the
 * balancing/contra account, source and user — the audit trail for "why did
 * this landlord's pocket change?".
 */

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'rent', label: 'Rent' }, { value: 'levy', label: 'Levy' },
  { value: 'special_levy', label: 'Special Levy' }, { value: 'maintenance', label: 'Maintenance' },
  { value: 'parking', label: 'Parking' }, { value: 'rates', label: 'Rates' },
  { value: 'vat', label: 'VAT' }, { value: 'deposit', label: 'Deposit' }, { value: 'general', label: 'General' },
]
const CURRENCY_OPTIONS = [
  { value: '', label: 'All currencies' }, { value: 'USD', label: 'USD' }, { value: 'ZWG', label: 'ZWG' },
]

const TYPE_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'purple' | 'default'> = {
  RECEIPT: 'success', OWNER_CONTRIBUTION: 'success', OWNER_WITHDRAWAL: 'warning',
  CASH_EXPENDITURE: 'warning', COMMISSION: 'info', GENERAL_JOURNAL: 'purple',
  OPENING_BALANCE: 'info', ACCOUNT_TRANSFER: 'info', REVERSAL: 'danger', OTHER: 'default',
}

const startOfYear = () => `${new Date().getFullYear()}-01-01`
const today = () => new Date().toISOString().slice(0, 10)

export function LandlordPocketMovementsReport() {
  const { landlordId, propertyId } = useReportFilters()
  const [category, setCategory] = useState('')
  const [currency, setCurrency] = useState('')
  const [txnType, setTxnType] = useState('')
  const [startDate, setStartDate] = useState(startOfYear())
  const [endDate, setEndDate] = useState(today())

  const { data, isFetching } = useQuery({
    queryKey: ['landlord-pocket-movements', landlordId, propertyId, category, currency, txnType, startDate, endDate],
    queryFn: () => reportsApi.landlordPocketMovements({
      ...(landlordId ? { landlord_id: Number(landlordId) } : {}),
      ...(propertyId ? { property_id: Number(propertyId) } : {}),
      ...(category ? { category } : {}),
      ...(currency ? { currency } : {}),
      ...(txnType ? { transaction_type: txnType } : {}),
      start_date: startDate, end_date: endDate,
    }).then(r => r.data),
    placeholderData: keepPreviousData,
  })
  if (data) reportDataStore.data = data

  const rows: any[] = data?.rows || []
  const typeOptions = [{ code: '', label: 'All types' }, ...(data?.transaction_types || [])]
  const byCurrency: Record<string, any> = data?.summary?.by_currency || {}

  return (
    <div id="report-content" className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600"><ShieldCheck className="w-5 h-5" /></div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Landlord Pocket Movements</h2>
          <p className="text-sm text-gray-500">
            Every movement through the landlord trust pockets — with its transaction type, GL extension and source.
            Pick a landlord in the filter bar above to focus on one portfolio.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Select label="Transaction Type" value={txnType} options={typeOptions.map((t: any) => ({ value: t.code, label: t.label }))}
          onChange={(e) => setTxnType(e.target.value)} />
        <Select label="Pocket / Category" value={category} options={CATEGORY_OPTIONS}
          onChange={(e) => setCategory(e.target.value)} />
        <Select label="Currency" value={currency} options={CURRENCY_OPTIONS}
          onChange={(e) => setCurrency(e.target.value)} />
        <DatePicker label="From" value={startDate} onChange={(v) => setStartDate(v)} />
        <DatePicker label="To" value={endDate} onChange={(v) => setEndDate(v)} />
        <div className="flex items-end text-sm text-gray-500">
          {isFetching ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</span>
            : <span>{data?.summary?.count ?? 0} movement(s)</span>}
        </div>
      </div>

      {/* Per-currency summary */}
      {Object.keys(byCurrency).length > 0 && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(byCurrency).map(([ccy, v]: [string, any]) => (
            <div key={ccy} className="rounded-lg border border-gray-200 px-4 py-2 text-sm">
              <span className="font-medium text-gray-900">{ccy}</span>
              <span className="text-gray-500"> · in </span>
              <span className="text-emerald-600 tabular-nums">{formatCurrency(v.credit, ccy)}</span>
              <span className="text-gray-500"> · out </span>
              <span className="text-red-600 tabular-nums">{formatCurrency(v.debit, ccy)}</span>
              <span className="text-gray-500"> · net </span>
              <span className={cn('tabular-nums font-medium', v.net >= 0 ? 'text-emerald-600' : 'text-red-600')}>{formatCurrency(v.net, ccy)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Movements table */}
      {rows.length === 0 && !isFetching ? (
        <EmptyState title="No pocket movements" description="No landlord trust-pocket movements match these filters." />
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="min-w-full text-sm divide-y divide-gray-100">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Landlord · Pocket</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-left">GL Extension</th>
                <th className="px-3 py-2 text-left">Balancing / Contra</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.map((r) => (
                <tr key={r.id} className={cn('hover:bg-gray-50', r.is_reversal && 'bg-red-50/40')}>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDate(r.date)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={TYPE_VARIANT[r.transaction_type] || 'default'}>{r.transaction_label}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-gray-900">{r.landlord}</div>
                    <div className="text-xs text-gray-400">{r.pocket_code} · {r.category}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600">{r.debit ? formatCurrency(r.debit, r.currency) : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{r.credit ? formatCurrency(r.credit, r.currency) : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatCurrency(r.balance, r.currency)}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {r.gl_extension_code ? <span title={r.gl_extension_name}>{r.gl_extension_code} — {r.gl_extension_name}</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{r.contra_name || r.contra_account || <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {r.journal_number ? <span className="text-xs">{r.journal_number}</span> : null}
                    {r.reference ? <span className="text-xs text-gray-400"> · {r.reference}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.posted_by || <span className="text-gray-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
