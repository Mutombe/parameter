import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { BellRing, Plus, Send, XCircle, Trash2, CalendarClock } from 'lucide-react'
import { paymentReminderApi, propertyApi, tenantApi } from '../../services/api'
import { formatDate, cn } from '../../lib/utils'
import {
  PageHeader, Modal, Button, Input, Select, Textarea, Badge,
  EmptyState, Skeleton, DatePicker, MultiCheckList,
} from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'

const statusVariant: Record<string, any> = {
  scheduled: 'info', sent: 'success', cancelled: 'default',
}

const emptyForm = {
  send_date: new Date().toISOString().split('T')[0],
  mode: 'all' as 'all' | 'properties' | 'tenants',
  properties: [] as Array<number | string>,
  tenants: [] as Array<number | string>,
  excluded_properties: [] as Array<number | string>,
  subject: '',
  message: '',
}

/**
 * Payment Reminders — schedule arrears-reminder emails for a manually chosen
 * date. Scope: all tenants, specific properties, or specific tenants /
 * account holders — with properties that must NEVER receive reminders
 * excluded explicitly. A daily dispatcher sends due reminders; "Send now"
 * fires one immediately.
 */
export default function PaymentReminders() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const { data: remindersData, isLoading } = useQuery({
    queryKey: ['payment-reminders'],
    queryFn: () => paymentReminderApi.list({ page_size: 100 }).then(r => r.data),
    placeholderData: keepPreviousData,
  })
  const reminders: any[] = remindersData?.results || remindersData || []

  const { data: propertiesData } = useQuery({
    queryKey: ['reminder-properties'],
    queryFn: () => propertyApi.list({ page_size: 500 }).then((r: any) => r.data.results || r.data),
    enabled: showModal,
    staleTime: 60_000,
  })
  const { data: tenantsData } = useQuery({
    queryKey: ['reminder-tenants'],
    queryFn: () => tenantApi.list({ page_size: 500 }).then((r: any) => r.data.results || r.data),
    enabled: showModal && form.mode === 'tenants',
    staleTime: 60_000,
  })
  const properties: any[] = Array.isArray(propertiesData) ? propertiesData : []
  const tenants: any[] = Array.isArray(tenantsData) ? tenantsData : []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['payment-reminders'] })

  const createMutation = useMutation({
    mutationFn: (payload: any) => paymentReminderApi.create(payload),
    onSuccess: () => {
      showToast.success('Payment reminder scheduled')
      setShowModal(false)
      setForm(emptyForm)
      invalidate()
    },
    onError: (err) => showToast.error(parseApiError(err, 'Failed to schedule reminder')),
  })
  const sendNowMutation = useMutation({
    mutationFn: (id: number) => paymentReminderApi.sendNow(id),
    onSuccess: (r: any) => { showToast.success(r?.data?.message || 'Reminders sent'); invalidate() },
    onError: (err) => showToast.error(parseApiError(err, 'Failed to send')),
  })
  const cancelMutation = useMutation({
    mutationFn: (id: number) => paymentReminderApi.cancel(id),
    onSuccess: () => { showToast.success('Reminder cancelled'); invalidate() },
    onError: (err) => showToast.error(parseApiError(err, 'Failed to cancel')),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => paymentReminderApi.delete(id),
    onSuccess: () => { showToast.success('Reminder deleted'); invalidate() },
    onError: (err) => showToast.error(parseApiError(err, 'Failed to delete')),
  })

  const submit = () => {
    if (!form.send_date) { showToast.error('Pick the date to send reminders.'); return }
    if (form.mode === 'properties' && form.properties.length === 0) {
      showToast.error('Select at least one property.'); return
    }
    if (form.mode === 'tenants' && form.tenants.length === 0) {
      showToast.error('Select at least one tenant.'); return
    }
    createMutation.mutate({
      send_date: form.send_date,
      send_all: form.mode === 'all',
      properties: form.mode === 'properties' ? form.properties : [],
      tenants: form.mode === 'tenants' ? form.tenants : [],
      excluded_properties: form.excluded_properties,
      subject: form.subject,
      message: form.message,
    })
  }

  const scopeLabel = (r: any) => {
    if (r.send_all) return 'All tenants with arrears'
    const bits = []
    if ((r.property_names || []).length) bits.push(`Properties: ${r.property_names.join(', ')}`)
    if ((r.tenant_names || []).length) bits.push(`Tenants: ${r.tenant_names.join(', ')}`)
    return bits.join(' · ') || '—'
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Reminders"
        subtitle="Schedule arrears reminder emails — choose who gets them and when"
        icon={BellRing}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Payment Reminders' },
        ]}
        actions={
          <Button onClick={() => setShowModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Reminder
          </Button>
        }
      />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : reminders.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No payment reminders"
            description="Schedule a reminder run — pick the date and who should (and shouldn't) receive it."
            action={<Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4 mr-2" />New Reminder</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Send Date</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Scope</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Excluded</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Sent</th>
                  <th className="px-5 py-3 w-40"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reminders.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-800 font-medium whitespace-nowrap">{formatDate(r.send_date)}</td>
                    <td className="px-5 py-3 text-gray-600 max-w-xs">
                      <span className="break-words">{scopeLabel(r)}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs max-w-[200px]">
                      {(r.excluded_property_names || []).length
                        ? <span className="break-words">{r.excluded_property_names.join(', ')}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3"><Badge variant={statusVariant[r.status] || 'default'} className="capitalize">{r.status}</Badge></td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-700">
                      {r.status === 'sent' ? r.sent_count : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {r.status === 'scheduled' && (
                          <>
                            <button
                              onClick={() => sendNowMutation.mutate(r.id)}
                              disabled={sendNowMutation.isPending}
                              className="p-1.5 text-primary-600 hover:bg-primary-50 rounded-lg"
                              title="Send now"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => cancelMutation.mutate(r.id)}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"
                              title="Cancel"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => { if (window.confirm('Delete this reminder?')) deleteMutation.mutate(r.id) }}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Reminder Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Schedule Payment Reminder"
        size="2xl"
      >
        <form onSubmit={(e) => { e.preventDefault(); submit() }} className="space-y-4">
          <p className="text-sm text-gray-500">
            Emails every in-scope tenant who has an outstanding balance on the
            chosen date. Tenants of excluded properties are never emailed.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DatePicker
              label="Send on (date)"
              value={form.send_date}
              onChange={(v) => setForm({ ...form, send_date: v })}
              required
            />
            <Select
              label="Send to"
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value as any })}
              options={[
                { value: 'all', label: 'All tenants with arrears' },
                { value: 'properties', label: 'Specific properties' },
                { value: 'tenants', label: 'Specific tenants / account holders' },
              ]}
            />
          </div>

          {form.mode === 'properties' && (
            <MultiCheckList
              label="Properties to send reminders for"
              options={properties.map((p: any) => ({ value: p.id, label: p.name, description: p.address || '' }))}
              selected={form.properties}
              onChange={(next) => setForm({ ...form, properties: next })}
            />
          )}
          {form.mode === 'tenants' && (
            <MultiCheckList
              label="Tenants / account holders to remind"
              options={tenants.map((t: any) => ({
                value: t.id,
                label: t.name,
                description: `${t.code || ''}${t.account_type ? ` · ${t.account_type}` : ''}`,
              }))}
              selected={form.tenants}
              onChange={(next) => setForm({ ...form, tenants: next })}
            />
          )}

          <MultiCheckList
            label="Excluded properties (never send reminders to their tenants)"
            options={properties.map((p: any) => ({ value: p.id, label: p.name, description: p.address || '' }))}
            selected={form.excluded_properties}
            onChange={(next) => setForm({ ...form, excluded_properties: next })}
            height="max-h-36"
          />

          <Input
            label="Subject (optional)"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder="Payment Reminder — Outstanding Balance"
          />
          <Textarea
            label="Extra message (optional)"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            rows={3}
            placeholder="Added to the email alongside the outstanding balance details"
          />

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Scheduling…' : 'Schedule Reminder'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
