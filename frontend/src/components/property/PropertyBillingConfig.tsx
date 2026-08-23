import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, Eye, Play, Loader2, AlertTriangle, ShieldAlert, Layers,
} from '@/lib/icons'
import { propertyBillingConfigApi } from '../../services/api'
import { Modal, Button, Input, Select, DatePicker } from '../ui'
import { showToast, parseApiError } from '../../lib/toast'
import { formatDate, cn } from '../../lib/utils'

/* PropertyBillingConfig — configure a billing rule ONCE at property level and
 * apply it to every eligible lease under that property.
 *
 * A config carries a category (rent, levy, maintenance…), an amount + currency,
 * a frequency and an effective window. When you Generate, one invoice is raised
 * per eligible lease, honouring any lease-level override and payer-type
 * eligibility (a levy rule never bills a rental payer, and vice-versa).
 *
 * The bulk-delete panel removes generated billing for a period; anything paid
 * or already posted to the ledger is protected. Sub-accounts are never touched.
 */

const CATEGORY_OPTIONS = [
  { value: 'rent', label: 'Rent (rental only)' },
  { value: 'vat', label: 'VAT (rental only)' },
  { value: 'deposit', label: 'Deposit (rental only)' },
  { value: 'levy', label: 'Levy (levy only)' },
  { value: 'special_levy', label: 'Special Levy (levy only)' },
  { value: 'maintenance', label: 'Maintenance (both)' },
  { value: 'parking', label: 'Parking (both)' },
  { value: 'rates', label: 'Rates (both)' },
]
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map(o => [o.value, o.label.replace(/ \(.*\)$/, '')])
)
const FREQUENCY_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
  { value: 'once', label: 'Once' },
]
const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'ZWG', label: 'ZWG' },
]

interface BillingConfig {
  id: number
  property: number
  category: string
  category_display?: string
  amount: string
  currency: string
  frequency: string
  frequency_display?: string
  effective_from: string
  effective_to: string | null
  is_active: boolean
  notes?: string
}

interface AffectedRow {
  lease_number: string
  tenant: string
  account_type: string
  amount?: string | null
  currency?: string
  source?: string | null
  reason?: string
}

interface AffectedPreview {
  applies_on_period: boolean
  counts: { eligible: number; overrides: number; excluded: number; billable: number }
  eligible: AffectedRow[]
  overrides: AffectedRow[]
  excluded: AffectedRow[]
}

const todayYmd = () => new Date().toISOString().slice(0, 10)
const plusDaysYmd = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const EMPTY_FORM = {
  category: 'levy',
  amount: '',
  currency: 'USD',
  frequency: 'monthly',
  effective_from: todayYmd(),
  effective_to: '',
  is_active: true,
  notes: '',
}

export function PropertyBillingConfig({ propertyId }: { propertyId: number }) {
  const queryClient = useQueryClient()
  const queryKey = ['property-billing-configs', propertyId]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      propertyBillingConfigApi.list({ property: propertyId }).then(r => r.data),
    enabled: !!propertyId,
  })
  const configs: BillingConfig[] = data?.results || (Array.isArray(data) ? data : [])

  // -- create / edit form --------------------------------------------------
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<BillingConfig | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setShowForm(true)
  }
  const openEdit = (c: BillingConfig) => {
    setEditing(c)
    setForm({
      category: c.category,
      amount: String(c.amount ?? ''),
      currency: c.currency,
      frequency: c.frequency,
      effective_from: c.effective_from,
      effective_to: c.effective_to || '',
      is_active: c.is_active,
      notes: c.notes || '',
    })
    setShowForm(true)
  }

  const saveMutation = useMutation({
    mutationFn: (payload: object) =>
      editing
        ? propertyBillingConfigApi.update(editing.id, payload)
        : propertyBillingConfigApi.create(payload),
    onSuccess: () => {
      showToast.success(editing ? 'Billing rule updated' : 'Billing rule created')
      queryClient.invalidateQueries({ queryKey })
      setShowForm(false)
    },
    onError: (e) => showToast.error(parseApiError(e, 'Could not save billing rule')),
  })

  const handleSave = () => {
    if (!form.amount || Number(form.amount) <= 0) {
      showToast.error('Amount must be greater than zero')
      return
    }
    if (!form.effective_from) {
      showToast.error('Effective from date is required')
      return
    }
    saveMutation.mutate({
      property: propertyId,
      category: form.category,
      amount: form.amount,
      currency: form.currency,
      frequency: form.frequency,
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
      is_active: form.is_active,
      notes: form.notes,
    })
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => propertyBillingConfigApi.delete(id),
    onSuccess: () => {
      showToast.success('Billing rule removed')
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (e) => showToast.error(parseApiError(e, 'Could not delete billing rule')),
  })

  // -- preview -------------------------------------------------------------
  const [previewFor, setPreviewFor] = useState<BillingConfig | null>(null)
  const { data: preview, isFetching: previewLoading } = useQuery<AffectedPreview>({
    queryKey: ['billing-config-affected', previewFor?.id],
    queryFn: () =>
      propertyBillingConfigApi.affectedLeases(previewFor!.id).then(r => r.data),
    enabled: !!previewFor,
  })

  // -- generate ------------------------------------------------------------
  const [generateFor, setGenerateFor] = useState<BillingConfig | null>(null)
  const [genForm, setGenForm] = useState({ date: todayYmd(), due_date: plusDaysYmd(14) })
  const generateMutation = useMutation({
    mutationFn: (payload: { id: number; date: string; due_date: string }) =>
      propertyBillingConfigApi.generate(payload.id, {
        date: payload.date, due_date: payload.due_date,
      }),
    onSuccess: (res) => {
      const d = res.data
      showToast.success(
        `${d.created} invoice(s) created` +
        (d.overrides_applied ? `, ${d.overrides_applied} override(s) applied` : '') +
        (d.skipped_count ? `, ${d.skipped_count} skipped` : '')
      )
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      setGenerateFor(null)
    },
    onError: (e) => showToast.error(parseApiError(e, 'Could not generate billing')),
  })

  return (
    <div className="space-y-8">
      {/* Configured rules ---------------------------------------------- */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Billing Rules</h3>
            <p className="text-sm text-gray-500">
              Configure a charge once — it applies to every eligible lease in this property.
            </p>
          </div>
          <Button icon={Plus} onClick={openCreate}>Add Rule</Button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading rules…
          </div>
        ) : configs.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
            <Layers className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No billing rules configured for this property yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Frequency</th>
                  <th className="px-4 py-3">Effective</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {configs.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {c.category_display || CATEGORY_LABEL[c.category] || c.category}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      {Number(c.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {c.currency}
                    </td>
                    <td className="px-4 py-3 text-gray-600 capitalize">
                      {c.frequency_display || c.frequency}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(c.effective_from)}
                      {c.effective_to ? ` → ${formatDate(c.effective_to)}` : ' → open'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                        c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      )}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" icon={Eye} title="Preview affected leases"
                          onClick={() => setPreviewFor(c)} />
                        <Button size="icon" variant="ghost" icon={Play} title="Generate billing"
                          onClick={() => { setGenForm({ date: todayYmd(), due_date: plusDaysYmd(14) }); setGenerateFor(c) }} />
                        <Button size="icon" variant="ghost" icon={Pencil} title="Edit"
                          onClick={() => openEdit(c)} />
                        <Button size="icon" variant="ghost" icon={Trash2} title="Delete"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => { if (confirm('Delete this billing rule? Existing invoices are not affected.')) deleteMutation.mutate(c.id) }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk deletion panel ------------------------------------------- */}
      <BulkDeletePanel propertyId={propertyId} />

      {/* Create / edit modal ------------------------------------------- */}
      <Modal open={showForm} onClose={() => setShowForm(false)} size="lg"
        title={editing ? 'Edit Billing Rule' : 'New Billing Rule'}>
        <div className="space-y-4">
          <Select label="Category" value={form.category} options={CATEGORY_OPTIONS}
            onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Amount" type="number" min="0" step="0.01" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <Select label="Currency" value={form.currency} options={CURRENCY_OPTIONS}
              onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </div>
          <Select label="Frequency" value={form.frequency} options={FREQUENCY_OPTIONS}
            onChange={(e) => setForm({ ...form, frequency: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <DatePicker label="Effective From" value={form.effective_from}
              onChange={(v) => setForm({ ...form, effective_from: v })} />
            <DatePicker label="Effective To (optional)" value={form.effective_to} clearable
              onChange={(v) => setForm({ ...form, effective_to: v })} />
          </div>
          <Input label="Notes (optional)" value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Active
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button loading={saveMutation.isPending} onClick={handleSave}>
              {editing ? 'Save Changes' : 'Create Rule'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Preview modal ------------------------------------------------- */}
      <Modal open={!!previewFor} onClose={() => setPreviewFor(null)} size="3xl"
        title={`Affected Leases — ${previewFor ? (CATEGORY_LABEL[previewFor.category] || previewFor.category) : ''}`}>
        {previewLoading ? (
          <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Resolving…
          </div>
        ) : preview ? (
          <div className="space-y-4">
            {!preview.applies_on_period && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                This rule is not effective for today's date. Generation for a date outside the
                effective window will be rejected.
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Eligible" value={preview.counts.eligible} tone="emerald" />
              <StatCard label="Overrides" value={preview.counts.overrides} tone="blue" />
              <StatCard label="Excluded" value={preview.counts.excluded} tone="gray" />
            </div>
            <PreviewList title="Eligible (property rate)" rows={preview.eligible} />
            <PreviewList title="Overridden (lease-level rate)" rows={preview.overrides} />
            <PreviewList title="Excluded" rows={preview.excluded} showReason />
          </div>
        ) : null}
      </Modal>

      {/* Generate modal ------------------------------------------------ */}
      <Modal open={!!generateFor} onClose={() => setGenerateFor(null)} size="md"
        title="Generate Billing">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Raise one invoice per eligible lease for the{' '}
            <span className="font-medium">
              {generateFor ? (CATEGORY_LABEL[generateFor.category] || generateFor.category) : ''}
            </span>{' '}
            rule. Lease-level overrides take precedence over the property rate.
          </p>
          <DatePicker label="Billing Date" value={genForm.date}
            onChange={(v) => setGenForm({ ...genForm, date: v })} />
          <DatePicker label="Due Date" value={genForm.due_date}
            onChange={(v) => setGenForm({ ...genForm, due_date: v })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setGenerateFor(null)}>Cancel</Button>
            <Button variant="success" loading={generateMutation.isPending}
              onClick={() => generateFor && generateMutation.mutate({
                id: generateFor.id, date: genForm.date, due_date: genForm.due_date,
              })}>
              Generate
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'blue' | 'gray' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    gray: 'bg-gray-50 text-gray-600',
  }
  return (
    <div className={cn('rounded-lg p-3 text-center', tones[tone])}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wide">{label}</div>
    </div>
  )
}

function PreviewList({ title, rows, showReason }: { title: string; rows: AffectedRow[]; showReason?: boolean }) {
  if (!rows || rows.length === 0) return null
  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-1">{title} ({rows.length})</h4>
      <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
            <span className="text-gray-700">
              {r.tenant} <span className="text-gray-400">· {r.lease_number}</span>
            </span>
            <span className="text-gray-500 text-xs">
              {showReason ? r.reason : `${r.amount} ${r.currency}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Bulk deletion --------------------------------------------------------
interface BulkPreviewRow {
  invoice_number: string
  tenant: string
  invoice_type: string
  amount: string
  currency: string
  date: string
  status: string
  reason?: string
}
interface BulkPreview {
  period: { from: string; to: string }
  counts: { deletable: number; protected: number }
  deletable: BulkPreviewRow[]
  protected: BulkPreviewRow[]
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function BulkDeletePanel({ propertyId }: { propertyId: number }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [category, setCategory] = useState('')
  const [preview, setPreview] = useState<BulkPreview | null>(null)

  const basePayload = () => ({
    property_id: propertyId,
    month,
    year,
    ...(category ? { category } : {}),
  })

  const previewMutation = useMutation({
    mutationFn: () => propertyBillingConfigApi.bulkDeletePreview(basePayload()).then(r => r.data),
    onSuccess: (d: BulkPreview) => setPreview(d),
    onError: (e) => showToast.error(parseApiError(e, 'Could not preview deletion')),
  })

  const deleteMutation = useMutation({
    mutationFn: () => propertyBillingConfigApi.bulkDelete({ ...basePayload(), confirm: true }).then(r => r.data),
    onSuccess: (d: { deleted: number; protected: number }) => {
      showToast.success(`${d.deleted} invoice(s) deleted, ${d.protected} protected`)
      setPreview(null)
    },
    onError: (e) => showToast.error(parseApiError(e, 'Could not delete billing')),
  })

  const yearOptions = Array.from({ length: 7 }, (_, i) => now.getFullYear() - 5 + i)
    .map(y => ({ value: String(y), label: String(y) }))

  return (
    <div className="border border-red-100 bg-red-50/40 rounded-xl p-5">
      <div className="flex items-start gap-2 mb-4">
        <ShieldAlert className="w-5 h-5 text-red-500 mt-0.5" />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Bulk Delete Billing</h3>
          <p className="text-sm text-gray-500">
            Remove generated invoices for a period. Paid or posted invoices are protected and skipped;
            sub-accounts are never deleted.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        <Select label="Month" value={month} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
          onChange={(e) => { setMonth(Number(e.target.value)); setPreview(null) }} />
        <Select label="Year" value={year} options={yearOptions}
          onChange={(e) => { setYear(Number(e.target.value)); setPreview(null) }} />
        <Select label="Category" value={category}
          options={[{ value: '', label: 'All categories' }, ...CATEGORY_OPTIONS]}
          onChange={(e) => { setCategory(e.target.value); setPreview(null) }} />
        <div className="flex items-end">
          <Button variant="outline" className="w-full" loading={previewMutation.isPending}
            onClick={() => previewMutation.mutate()}>
            Preview
          </Button>
        </div>
      </div>

      {preview && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Deletable" value={preview.counts.deletable} tone="gray" />
            <StatCard label="Protected" value={preview.counts.protected} tone="blue" />
          </div>
          {preview.protected.length > 0 && (
            <div className="text-xs text-gray-500">
              Protected: {preview.protected.slice(0, 8).map(p => `${p.invoice_number} (${p.reason})`).join(', ')}
              {preview.protected.length > 8 ? ` +${preview.protected.length - 8} more` : ''}
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="danger" loading={deleteMutation.isPending}
              disabled={preview.counts.deletable === 0}
              onClick={() => {
                if (confirm(`Delete ${preview.counts.deletable} unpaid invoice(s) for ${MONTHS[month - 1]} ${year}? This cannot be undone.`)) {
                  deleteMutation.mutate()
                }
              }}>
              Delete {preview.counts.deletable} Invoice(s)
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
