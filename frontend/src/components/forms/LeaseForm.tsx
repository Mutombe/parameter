import { useState, useImperativeHandle, forwardRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Upload, XCircle } from 'lucide-react'
import { Input, Select, Textarea } from '../ui'
import { AutocompleteInput } from '../ui/AutocompleteInput'
import { AsyncSelect } from '../ui/AsyncSelect'
import { tenantApi, unitApi, propertyApi } from '../../services/api'
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
}

const LeaseForm = forwardRef<LeaseFormRef, LeaseFormProps>(
  ({ initialValues, onSubmit, isSubmitting, showButtons = true, onCancel }, ref) => {
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

    // Server-side search for tenants
    const [tenantSearch, setTenantSearch] = useState('')
    const debouncedTenantSearch = useDebounce(tenantSearch, 300)

    const { data: tenants, isLoading: tenantsLoading } = useQuery({
      queryKey: ['tenants-list', debouncedTenantSearch],
      queryFn: () => tenantApi.list(debouncedTenantSearch ? { search: debouncedTenantSearch } : {}).then((r) => r.data.results || r.data),
      staleTime: 30000,
    })

    const { data: allUnits, isLoading: unitsLoading } = useQuery({
      queryKey: ['units-all'],
      queryFn: () => unitApi.list().then((r) => r.data.results || r.data),
      staleTime: 30000,
    })

    const { data: properties, isLoading: propertiesLoading } = useQuery({
      queryKey: ['properties-list'],
      queryFn: () => propertyApi.list().then((r) => r.data.results || r.data),
      staleTime: 30000,
    })

    const selectedPropertyName = properties?.find(
      (p: any) => String(p.id) === form.property
    )?.name

    const units = allUnits?.filter(
      (u: any) =>
        (!form.property || u.property_name === selectedPropertyName) && !u.is_occupied
    )

    useEffect(() => {
      if (initialValues) {
        setForm((prev) => ({
          ...prev,
          ...initialValues,
          tenant: initialValues.tenant ? String(initialValues.tenant) : prev.tenant,
          property: initialValues.property ? String(initialValues.property) : prev.property,
          unit: initialValues.unit ? String(initialValues.unit) : prev.unit,
        }))
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

    // Auto-fill deposit as 2x rent when rent changes and deposit is empty
    useEffect(() => {
      if (form.monthly_rent && !form.deposit_amount) {
        const rent = parseFloat(form.monthly_rent)
        if (rent > 0) {
          setForm(prev => prev.deposit_amount ? prev : { ...prev, deposit_amount: (rent * 2).toFixed(2) })
        }
      }
    }, [form.monthly_rent])

    const handleSubmit = (e?: React.FormEvent) => {
      e?.preventDefault()
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
            label="Tenant"
            placeholder="Select Tenant"
            value={form.tenant}
            onChange={(val) => setForm({ ...form, tenant: String(val) })}
            options={tenants?.map((t: any) => ({ value: t.id, label: t.name })) || []}
            isLoading={tenantsLoading}
            required
            searchable
            onSearch={setTenantSearch}
            onCreateNew={() => startChain('tenant')}
            createNewLabel="+ Create new tenant"
          />

          <AsyncSelect
            label="Property"
            placeholder="Select Property"
            value={form.property}
            onChange={(val) =>
              setForm({ ...form, property: String(val), unit: '', unit_number: '' })
            }
            options={properties?.map((p: any) => ({ value: p.id, label: p.name })) || []}
            isLoading={propertiesLoading}
            required
            searchable
            onCreateNew={() => startChain('landlord')}
            createNewLabel="+ Create new property chain"
          />
        </div>

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

        {/* Auto-derived lease type from property */}
        {form.property && (() => {
          const selectedProp = properties?.find((p: any) => String(p.id) === form.property)
          const leaseType = selectedProp?.management_type || 'rental'
          return (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Lease Type</label>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  leaseType === 'levy' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'
                }`}>
                  {leaseType === 'levy' ? 'Levy Account' : 'Rental Lease'}
                </span>
                <span className="text-xs text-gray-500">Auto-set from property management type</span>
              </div>
            </div>
          )
        })()}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            placeholder="1000.00"
            step="0.01"
            min="0"
            value={form.deposit_amount}
            onChange={(e) => setForm({ ...form, deposit_amount: e.target.value })}
            hint="Typically 2x monthly rent"
          />

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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            type="date"
            label="Start Date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            required
          />

          <Input
            type="date"
            label="End Date"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
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
            <button type="submit" className="btn-primary flex-1" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </form>
    )
  }
)

LeaseForm.displayName = 'LeaseForm'
export default LeaseForm
