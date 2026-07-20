import { useState, useImperativeHandle, forwardRef, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Upload, XCircle } from 'lucide-react'
import { Input, Select, Textarea, DatePicker } from '../ui'
import { AutocompleteInput } from '../ui/AutocompleteInput'
import { AsyncSelect } from '../ui/AsyncSelect'
import { tenantApi, accountHolderApi, unitApi, propertyApi } from '../../services/api'
import { useDebounce } from '../../lib/utils'
import { useChainStore } from '../../stores/chainStore'

export interface LeaseFormRef {
  submit: () => void
  getFormData: () => Record<string, any>
  getDocumentFile: () => File | null
}

interface LeaseFormProps {
  initialValues?: Record<string, any>
  onSubmit: (data: any, documentFile?: File | null) => void
  isSubmitting?: boolean
  showButtons?: boolean
  onCancel?: () => void
  /** Set while the chained property is still being created server-side:
   *  the modal opens instantly and the Property field shows an animated
   *  "Adding…" state; once `id` arrives the field resolves itself. */
  pendingProperty?: { name: string; id?: number; management_type?: string } | null
}

const LeaseForm = forwardRef<LeaseFormRef, LeaseFormProps>(
  ({ initialValues, onSubmit, isSubmitting, showButtons = true, onCancel, pendingProperty }, ref) => {
    const [form, setForm] = useState({
      tenant: '',
      unit: '',
      property: '',
      unit_number: '',
      monthly_rent: '',
      deposit_amount: '',
      currency: 'USD',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      payment_day: '1',
      notes: '',
    })
    const [documentFile, setDocumentFile] = useState<File | null>(null)

    // Server-side search for tenants / account holders
    const [tenantSearch, setTenantSearch] = useState('')
    const debouncedTenantSearch = useDebounce(tenantSearch, 300)

    const { data: properties, isLoading: propertiesLoading } = useQuery({
      queryKey: ['properties-list'],
      queryFn: () => propertyApi.list().then((r) => r.data.results || r.data),
      staleTime: 30000,
    })

    const selectedProp = properties?.find((p: any) => String(p.id) === form.property)
      // Fall back to the just-created chained property until the cached
      // properties list refetches and contains it.
      || (pendingProperty?.id && String(pendingProperty.id) === form.property ? pendingProperty : undefined)
    const selectedPropertyName = selectedProp?.name
    const isLevy = selectedProp?.management_type === 'levy'

    // Levy properties pull from Account Holders; rental from Tenants.
    const { data: tenants, isLoading: tenantsLoading } = useQuery({
      queryKey: ['tenants-list', debouncedTenantSearch],
      queryFn: () => tenantApi.list(debouncedTenantSearch ? { search: debouncedTenantSearch } : {}).then((r) => r.data.results || r.data),
      staleTime: 30000,
      enabled: !isLevy,
    })

    const { data: accountHolders, isLoading: accountHoldersLoading } = useQuery({
      queryKey: ['account-holders-list', debouncedTenantSearch],
      queryFn: () => accountHolderApi.list(debouncedTenantSearch ? { search: debouncedTenantSearch } : {}).then((r) => r.data.results || r.data),
      staleTime: 30000,
      enabled: isLevy,
    })

    const payerOptions: any[] = isLevy ? (accountHolders || []) : (tenants || [])
    const payerLoading = isLevy ? accountHoldersLoading : tenantsLoading

    // When property changes management type, the previously-selected payer
    // (a tenant on the rental side, an account holder on the levy side) is
    // no longer in the list — clear it so the user picks a valid one.
    const lastIsLevyRef = useRef<boolean | null>(null)
    useEffect(() => {
      if (lastIsLevyRef.current === null) {
        lastIsLevyRef.current = isLevy
        return
      }
      if (lastIsLevyRef.current !== isLevy) {
        lastIsLevyRef.current = isLevy
        setForm(prev => ({ ...prev, tenant: '' }))
      }
    }, [isLevy])

    const { data: allUnits, isLoading: unitsLoading } = useQuery({
      queryKey: ['units-all'],
      queryFn: () => unitApi.list().then((r) => r.data.results || r.data),
      staleTime: 30000,
    })

    const units = allUnits?.filter(
      (u: any) =>
        (!form.property || u.property_name === selectedPropertyName) && !u.is_occupied
    )

    useEffect(() => {
      if (initialValues) {
        setForm((prev) => {
          const next = {
            ...prev,
            ...initialValues,
            tenant: initialValues.tenant ? String(initialValues.tenant) : prev.tenant,
            property: initialValues.property ? String(initialValues.property) : prev.property,
            unit: initialValues.unit ? String(initialValues.unit) : prev.unit,
          }
          // Callers often pass an inline object literal, giving this effect
          // a fresh dep every render — bail out when nothing changed so we
          // don't re-render the whole form in a loop.
          return Object.keys(next).every(k => (next as any)[k] === (prev as any)[k]) ? prev : next
        })
      }
    }, [initialValues])

    // Auto-fill end_date when start_date changes (12 months ahead)
    useEffect(() => {
      if (form.start_date && !form.end_date) {
        const start = new Date(form.start_date)
        if (!isNaN(start.getTime())) {
          start.setFullYear(start.getFullYear() + 1)
          setForm(prev => prev.end_date ? prev : { ...prev, end_date: start.toISOString().split('T')[0] })
        }
      }
    }, [form.start_date])

    // Auto-fill deposit to 100% of rent unless the user has manually edited it.
    const depositManuallyEdited = useRef(false)
    useEffect(() => {
      if (depositManuallyEdited.current) return
      if (!form.monthly_rent) return
      setForm(prev => ({ ...prev, deposit_amount: prev.monthly_rent }))
    }, [form.monthly_rent])

    const handleSubmit = (e?: React.FormEvent) => {
      e?.preventDefault()
      // The chained property hasn't returned its id yet — the submit
      // button is disabled in this state, but guard the ref path too.
      if (pendingProperty && !pendingProperty.id && !form.property) return

      const data: any = {
        tenant: parseInt(form.tenant),
        monthly_rent: parseFloat(form.monthly_rent),
        deposit_amount: form.deposit_amount ? parseFloat(form.deposit_amount) : null,
        payment_day: parseInt(form.payment_day),
        currency: form.currency,
        start_date: form.start_date,
        end_date: form.end_date,
        notes: form.notes,
      }

      if (form.unit) {
        data.unit = parseInt(form.unit)
      } else if (form.property) {
        data.property = parseInt(form.property)
        if (form.unit_number) {
          data.unit_number = form.unit_number
        }
      }

      onSubmit(data, documentFile)
    }

    useImperativeHandle(ref, () => ({
      submit: () => handleSubmit(),
      getFormData: () => form,
      getDocumentFile: () => documentFile,
    }))

    const startChain = useChainStore(s => s.startChain)

    const commonNotes = [
      'Standard 12-month lease agreement',
      'Month-to-month tenancy',
      'Includes parking bay',
      'Pet deposit required',
      'No subletting allowed',
    ]

    return (
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AsyncSelect
            label={isLevy ? 'Account Holder' : 'Tenant'}
            placeholder={isLevy ? 'Select Account Holder' : 'Select Tenant'}
            value={form.tenant}
            onChange={(val) => setForm({ ...form, tenant: String(val) })}
            options={payerOptions.map((t: any) => ({ value: t.id, label: t.name })) || []}
            isLoading={payerLoading}
            required
            searchable
            onSearch={setTenantSearch}
            onCreateNew={() => startChain(isLevy ? 'account-holder' : 'tenant')}
            createNewLabel={isLevy ? '+ Create new account holder' : '+ Create new tenant'}
          />

          {pendingProperty && !pendingProperty.id ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Property</label>
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-primary-200 bg-primary-50/50">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-500" />
                </span>
                <span className="text-sm text-primary-700 truncate">
                  Adding <span className="font-semibold">{pendingProperty.name}</span>…
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Fill in the lease while the property finishes saving — it will attach automatically.
              </p>
            </div>
          ) : (
            <AsyncSelect
              label="Property"
              placeholder="Select Property"
              value={form.property}
              onChange={(val) =>
                setForm({ ...form, property: String(val), unit: '', unit_number: '' })
              }
              options={(() => {
                const opts = properties?.map((p: any) => ({ value: p.id, label: p.name })) || []
                // A just-created property may not be in the cached list yet —
                // inject it so the field shows its name instead of a blank.
                if (pendingProperty?.id && !opts.some((o: any) => String(o.value) === String(pendingProperty.id))) {
                  opts.unshift({ value: pendingProperty.id, label: pendingProperty.name })
                }
                return opts
              })()}
              isLoading={propertiesLoading}
              required
              searchable
              onCreateNew={() => startChain('landlord')}
              createNewLabel="+ Create new property chain"
            />
          )}
        </div>

        {/* Detect management type from selected property */}
        {(() => {
          const selectedProp = properties?.find((p: any) => String(p.id) === form.property)
          const isLevy = selectedProp?.management_type === 'levy'

          return (
            <>
              {/* Unit selection — only for rental, not levy */}
              {!isLevy && (
                <>
                  <AsyncSelect
                    label="Existing Unit (optional)"
                    placeholder={form.property ? 'Select existing unit or leave empty' : 'Select a property first'}
                    value={form.unit}
                    onChange={(val) => setForm({ ...form, unit: String(val), unit_number: '' })}
                    options={
                      units?.map((u: any) => ({
                        value: u.id,
                        label: `${u.unit_number} - ${u.property_name}`,
                      })) || []
                    }
                    isLoading={unitsLoading}
                    searchable
                    clearable
                    disabled={!form.property}
                  />

                  {!form.unit && (
                    <div>
                      <Input
                        label="Unit Number"
                        placeholder="e.g. A101"
                        value={form.unit_number}
                        onChange={(e) => setForm({ ...form, unit_number: e.target.value, unit: '' })}
                      />
                      <p className="text-xs text-gray-500 mt-1">New unit will be auto-created</p>
                    </div>
                  )}
                </>
              )}

              {/* Lease type indicator */}
              {form.property && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Lease Type</label>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium ${
                      isLevy ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'
                    }`}>
                      {isLevy ? 'Levy Account' : 'Rental Lease'}
                    </span>
                    <span className="text-xs text-gray-500">Auto-set from property</span>
                  </div>
                </div>
              )}

              {/* Rent + Deposit — only for rental, not levy */}
              <div className={`grid grid-cols-1 gap-4 ${isLevy ? 'sm:grid-cols-1' : 'sm:grid-cols-3'}`}>
                {!isLevy && (
                  <>
                    <Input
                      type="number"
                      label="Monthly Rent"
                      placeholder="1000.00"
                      step="0.01"
                      min="0"
                      value={form.monthly_rent}
                      onChange={(e) => setForm({ ...form, monthly_rent: e.target.value })}
                      required
                    />

                    <Input
                      type="number"
                      label="Deposit Amount"
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      value={form.deposit_amount}
                      onChange={(e) => {
                        depositManuallyEdited.current = true
                        setForm({ ...form, deposit_amount: e.target.value })
                      }}
                      hint="Defaults to 100% of monthly rent"
                    />
                  </>
                )}

                {isLevy && (
                  <Input
                    type="number"
                    label="Monthly Levy"
                    placeholder="50.00"
                    step="0.01"
                    min="0"
                    value={form.monthly_rent}
                    onChange={(e) => setForm({ ...form, monthly_rent: e.target.value })}
                    required
                  />
                )}

                <Select
                  label="Currency"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  options={[
                    { value: 'USD', label: 'USD' },
                    { value: 'ZiG', label: 'ZiG' },
                  ]}
                />
              </div>
            </>
          )
        })()}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <DatePicker
            label="Start Date"
            value={form.start_date}
            onChange={(v) => setForm({ ...form, start_date: v })}
            required
          />

          <DatePicker
            label="End Date"
            value={form.end_date}
            onChange={(v) => setForm({ ...form, end_date: v })}
            required
          />

          <Select
            label="Payment Day"
            value={form.payment_day}
            onChange={(e) => setForm({ ...form, payment_day: e.target.value })}
            options={Array.from({ length: 28 }, (_, i) => ({
              value: String(i + 1),
              label: `Day ${i + 1}`,
            }))}
            searchable
            hint="Day of month rent is due"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Lease Document</label>
          <div className="flex items-center gap-3">
            <label className="flex-1 flex items-center gap-2 px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
              <Upload className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500 truncate">
                {documentFile ? documentFile.name : 'Choose PDF or Word document...'}
              </span>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
              />
            </label>
            {documentFile && (
              <button
                type="button"
                onClick={() => setDocumentFile(null)}
                className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <AutocompleteInput
          label="Notes"
          placeholder="Additional terms or notes..."
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          suggestions={commonNotes}
          recentKey="lease_notes"
        />

        {showButtons && (
          <div className="flex gap-3 pt-4">
            <button type="button" className="btn-secondary flex-1" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={isSubmitting || (!!pendingProperty && !pendingProperty.id && !form.property)}
            >
              {isSubmitting
                ? 'Saving...'
                : pendingProperty && !pendingProperty.id && !form.property
                  ? 'Waiting for property…'
                  : 'Save'}
            </button>
          </div>
        )}
      </form>
    )
  }
)

LeaseForm.displayName = 'LeaseForm'
export default LeaseForm
