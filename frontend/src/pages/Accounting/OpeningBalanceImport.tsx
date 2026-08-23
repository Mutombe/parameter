import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2,
  RotateCcw, Building2, Users,
} from '@/lib/icons'
import { openingBalanceImportApi, propertyApi } from '../../services/api'
import { PageHeader, Button, Input, Select, Badge } from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'
import { formatDate, cn } from '../../lib/utils'

/* Mass Opening Balance Import
 *
 * Property is the operational aggregation unit; the individual Tenant /
 * Account Holder stays the accounting unit. The flow:
 *   select property + account type -> download a system template pre-filled
 *   with existing account codes -> enter amounts -> upload -> validate + preview
 *   -> post through the accounting engine -> (optionally) reverse the batch.
 *
 * The importer never creates an Account or Sub-Account and enforces the
 * payer-type category rules; a bad account/pocket is reported as a row error.
 */

const ACCOUNT_TYPES = [
  { value: 'tenant', label: 'Tenant', icon: Users },
  { value: 'account_holder', label: 'Account Holder', icon: Building2 },
]

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'default' | 'info'> = {
  posted: 'success', validated: 'info', reversed: 'default',
  failed: 'danger', partially_failed: 'warning', draft: 'default',
}

const todayYmd = () => new Date().toISOString().slice(0, 10)

function downloadBlob(data: BlobPart, filename: string) {
  const url = window.URL.createObjectURL(new Blob([data]))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

interface BatchPreview {
  id: number
  batch_number: string
  status: string
  record_count: number
  valid_count: number
  error_count: number
  totals: Record<string, { debit: string; credit: string }>
  errors: Array<{
    id: number; source_row: number; account_code: string; category: string
    currency: string; amount: string; error_message: string
  }>
}

export default function OpeningBalanceImport() {
  const queryClient = useQueryClient()

  const [propertyId, setPropertyId] = useState<number | ''>('')
  const [accountType, setAccountType] = useState('tenant')
  const [date, setDate] = useState(todayYmd())
  const [file, setFile] = useState<File | null>(null)
  const [batch, setBatch] = useState<BatchPreview | null>(null)
  const [allowPartial, setAllowPartial] = useState(false)

  const { data: propData } = useQuery({
    queryKey: ['properties', 'ob-import'],
    queryFn: () => propertyApi.list({ page_size: 500 }).then(r => r.data),
  })
  const properties: Array<{ id: number; name: string }> =
    propData?.results || (Array.isArray(propData) ? propData : [])

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['ob-import-batches'],
    queryFn: () => openingBalanceImportApi.list({ ordering: '-created_at' }).then(r => r.data),
  })
  const history: any[] = historyData?.results || (Array.isArray(historyData) ? historyData : [])

  const canConfigure = propertyId !== '' && !!date

  const downloadTemplate = async () => {
    if (!canConfigure) return
    try {
      const res = await openingBalanceImportApi.template(Number(propertyId), accountType)
      const propName = properties.find(p => p.id === Number(propertyId))?.name || 'property'
      downloadBlob(res.data, `opening_balances_${propName.replace(/\s+/g, '_')}_${accountType}.xlsx`)
    } catch (e) {
      showToast.error(parseApiError(e, 'Could not download template'))
    }
  }

  const uploadMutation = useMutation({
    mutationFn: () =>
      openingBalanceImportApi.upload({
        property: Number(propertyId), account_type: accountType, date, file: file!,
      }).then(r => r.data),
    onSuccess: (d: BatchPreview) => {
      setBatch(d)
      setAllowPartial(false)
      queryClient.invalidateQueries({ queryKey: ['ob-import-batches'] })
      showToast.success(`Validated: ${d.valid_count} valid, ${d.error_count} error(s)`)
    },
    onError: (e) => showToast.error(parseApiError(e, 'Upload failed')),
  })

  const postMutation = useMutation({
    mutationFn: () => openingBalanceImportApi.postBatch(batch!.id, allowPartial).then(r => r.data),
    onSuccess: (d: any) => {
      showToast.success(`Batch ${d.batch_number} posted`)
      setBatch(null); setFile(null)
      queryClient.invalidateQueries({ queryKey: ['ob-import-batches'] })
    },
    onError: (e) => showToast.error(parseApiError(e, 'Posting failed')),
  })

  const reverseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      openingBalanceImportApi.reverse(id, reason),
    onSuccess: () => {
      showToast.success('Batch reversed')
      queryClient.invalidateQueries({ queryKey: ['ob-import-batches'] })
    },
    onError: (e) => showToast.error(parseApiError(e, 'Reversal failed')),
  })

  const downloadErrorReport = async (id: number, batchNumber: string) => {
    try {
      const res = await openingBalanceImportApi.errorReport(id)
      downloadBlob(res.data, `${batchNumber}_errors.xlsx`)
    } catch (e) {
      showToast.error(parseApiError(e, 'Could not download error report'))
    }
  }

  const hasErrors = !!batch && batch.error_count > 0
  const canPost = !!batch && batch.valid_count > 0 && (!hasErrors || allowPartial)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mass Opening Balance Import"
        description="Upload opening balances for all Tenants or Account Holders under a property at once."
        icon={FileSpreadsheet}
      />

      {/* Step 1 — configure ------------------------------------------------ */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-sm flex items-center justify-center font-semibold">1</span>
          <h3 className="text-lg font-semibold text-gray-900">Select property &amp; account type</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select
            label="Property"
            value={propertyId === '' ? '' : String(propertyId)}
            placeholder="Select a property"
            options={properties.map(p => ({ value: String(p.id), label: p.name }))}
            onChange={(e) => { setPropertyId(e.target.value ? Number(e.target.value) : ''); setBatch(null) }}
            searchable
          />
          <Select
            label="Account Type"
            value={accountType}
            options={ACCOUNT_TYPES.map(a => ({ value: a.value, label: a.label }))}
            onChange={(e) => { setAccountType(e.target.value); setBatch(null) }}
          />
          <Input label="Opening Balance Date" type="date" value={date}
            onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {/* Step 2 — template ------------------------------------------------- */}
      <div className={cn('bg-white rounded-xl border border-gray-200 p-6', !canConfigure && 'opacity-60')}>
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-sm flex items-center justify-center font-semibold">2</span>
          <h3 className="text-lg font-semibold text-gray-900">Download template &amp; enter amounts</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          The template lists every eligible account with a column per permitted category. Fill in the
          amounts only — a positive figure is an opening arrear (debit), a negative figure an opening
          prepayment (credit). Add a second row for the same account with a different currency for a
          foreign-currency balance.
        </p>
        <Button variant="outline" icon={Download} disabled={!canConfigure} onClick={downloadTemplate}>
          Download Template
        </Button>
      </div>

      {/* Step 3 — upload --------------------------------------------------- */}
      <div className={cn('bg-white rounded-xl border border-gray-200 p-6', !canConfigure && 'opacity-60')}>
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-sm flex items-center justify-center font-semibold">3</span>
          <h3 className="text-lg font-semibold text-gray-900">Upload &amp; validate</h3>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file" accept=".xlsx,.xls"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setBatch(null) }}
            className="text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700 file:font-medium hover:file:bg-primary-100"
          />
          <Button icon={Upload} disabled={!canConfigure || !file || uploadMutation.isPending}
            loading={uploadMutation.isPending} onClick={() => uploadMutation.mutate()}>
            Upload &amp; Validate
          </Button>
        </div>
      </div>

      {/* Step 4 — preview + post ------------------------------------------ */}
      {batch && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-sm flex items-center justify-center font-semibold">4</span>
            <h3 className="text-lg font-semibold text-gray-900">Preview — {batch.batch_number}</h3>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Records" value={batch.record_count} tone="gray" />
            <Stat label="Valid" value={batch.valid_count} tone="green" />
            <Stat label="Errors" value={batch.error_count} tone={batch.error_count ? 'red' : 'gray'} />
          </div>

          {/* Totals per currency */}
          {Object.keys(batch.totals || {}).length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-gray-100 rounded-lg">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr><th className="px-4 py-2 text-left">Currency</th>
                    <th className="px-4 py-2 text-right">Total Debit</th>
                    <th className="px-4 py-2 text-right">Total Credit</th></tr>
                </thead>
                <tbody>
                  {Object.entries(batch.totals).map(([ccy, t]) => (
                    <tr key={ccy} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-medium">{ccy}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(t.debit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(t.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Errors */}
          {hasErrors && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
                  <AlertTriangle className="w-4 h-4" /> {batch.error_count} row(s) need attention
                </div>
                <Button size="sm" variant="outline" icon={Download}
                  onClick={() => downloadErrorReport(batch.id, batch.batch_number)}>
                  Error Report
                </Button>
              </div>
              <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0">
                    <tr><th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Account</th>
                      <th className="px-3 py-2 text-left">Category</th>
                      <th className="px-3 py-2 text-left">Problem</th></tr>
                  </thead>
                  <tbody>
                    {batch.errors.slice(0, 100).map(er => (
                      <tr key={er.id} className="border-t border-gray-100">
                        <td className="px-3 py-1.5">{er.source_row}</td>
                        <td className="px-3 py-1.5 font-medium">{er.account_code}</td>
                        <td className="px-3 py-1.5 capitalize">{er.category?.replace('_', ' ')}</td>
                        <td className="px-3 py-1.5 text-red-600">{er.error_message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={allowPartial}
                  onChange={(e) => setAllowPartial(e.target.checked)} />
                Post the {batch.valid_count} valid row(s) anyway and skip the errors
              </label>
              {!allowPartial && (
                <p className="text-xs text-gray-500">
                  By default nothing is posted until all errors are fixed — correct the file and re-upload,
                  or tick the box above to post only the valid rows.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="ghost" onClick={() => { setBatch(null); setFile(null) }}>Discard</Button>
            <Button variant="success" icon={CheckCircle2} disabled={!canPost}
              loading={postMutation.isPending} onClick={() => postMutation.mutate()}>
              Confirm &amp; Post
            </Button>
          </div>
        </div>
      )}

      {/* Batch history ----------------------------------------------------- */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Import History</h3>
        {historyLoading ? (
          <div className="flex items-center gap-2 text-gray-500 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No opening-balance imports yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-100">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Batch</th>
                  <th className="px-4 py-2 text-left">Property</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-right">Valid / Errors</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{b.batch_number}</td>
                    <td className="px-4 py-2 text-gray-600">{b.property_name}</td>
                    <td className="px-4 py-2 text-gray-600">{b.account_type_display}</td>
                    <td className="px-4 py-2 text-gray-600">{formatDate(b.date)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <span className="text-emerald-600">{b.valid_count}</span>
                      {' / '}
                      <span className={b.error_count ? 'text-red-600' : 'text-gray-400'}>{b.error_count}</span>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={STATUS_VARIANT[b.status] || 'default'}>{b.status_display}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2">
                        {b.error_count > 0 && (
                          <Button size="sm" variant="ghost" icon={Download}
                            title="Error report"
                            onClick={() => downloadErrorReport(b.id, b.batch_number)} />
                        )}
                        {(b.status === 'posted' || b.status === 'partially_failed') && (
                          <Button size="sm" variant="ghost" icon={RotateCcw}
                            className="text-red-600 hover:bg-red-50" title="Reverse batch"
                            loading={reverseMutation.isPending}
                            onClick={() => {
                              const reason = window.prompt(
                                `Reverse batch ${b.batch_number}? This reverses every journal it posted. Enter a reason:`)
                              if (reason && reason.trim()) reverseMutation.mutate({ id: b.id, reason: reason.trim() })
                            }} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'green' | 'red' | 'gray' }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    gray: 'bg-gray-50 text-gray-600',
  }
  return (
    <div className={cn('rounded-lg p-4 text-center', tones[tone])}>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wide mt-1">{label}</div>
    </div>
  )
}
