import { useState, useImperativeHandle, forwardRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { Input, Select } from '../ui'
import { AutocompleteInput } from '../ui/AutocompleteInput'
import { AsyncSelect } from '../ui/AsyncSelect'
import { propertyApi, unitApi, tenantApi } from '../../services/api'

export interface TenantFormRef {
  submit: () => void
  getFormData: () => Record<string, any>
}

interface TenantFormProps {
  initialValues?: Record<string, any>
  onSubmit: (data: any) => void
  isSubmitting?: boolean
  showButtons?: boolean
  onCancel?: () => void
}

const TenantForm = forwardRef<TenantFormRef, TenantFormProps>(
  ({ initialValues, onSubmit, isSubmitting, showButtons = true, onCancel }, ref) => {
    const [form, setForm] = useState({
      name: '',
      tenant_type: 'individual',
      account_type: 'rental',
      email: '',
      phone: '',
      id_type: 'national_id',
      id_number: '',
      property: '' as string | number,
      unit: '' as string | number,
    })

    // Fetch existing tenants for name duplicate detection
    const { data: existingTenants } = useQuery({
      queryKey: ['tenants-for-suggestions'],
      queryFn: () => tenantApi.list().then(r => r.data.results || r.data),
      staleTime: 30000,
    })

    const { data: propertiesData } = useQuery({
      queryKey: ['properties-for-tenant'],
      queryFn: () => propertyApi.list().then((r) => r.data),
    })
    const properties = propertiesData?.results || propertiesData || []

    const { data: unitsData } = useQuery({
      queryKey: ['available-units', form.property],
      queryFn: () =>
        unitApi.list({ property: form.property, is_occupied: false }).then((r) => r.data),
      enabled: !!form.property,
    })
    const availableUnits = unitsData?.results || unitsData || []

    const handlePropertyChange = (propertyId: string | number) => {
      setForm({ ...form, property: propertyId, unit: '' })
    }

    useEffect(() => {
      if (initialValues) {
        setForm((prev) => ({ ...prev, ...initialValues }))
      }
    }, [initialValues])

    const handleSubmit = (e?: React.FormEvent) => {
      e?.preventDefault()
      const submitData: Record<string, any> = {
        name: form.name,
        tenant_type: form.tenant_type,
        account_type: form.account_type,
        email: form.email,
        phone: form.phone,
        id_type: form.id_type,
        id_number: form.id_number,
        unit: form.unit || null,
      }
      onSubmit(submitData)
    }

    useImperativeHandle(ref, () => ({
      submit: () => handleSubmit(),
      getFormData: () => form,
    }))

    const fetchNameSuggestions = useCallback(async (query: string) => {
      if (!existingTenants) return []
      const q = query.toLowerCase()
      return existingTenants
        .filter((t: any) => t.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map((t: any) => ({ text: t.name, subtext: t.tenant_type }))
    }, [existingTenants])

    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <AutocompleteInput
          label="Name"
          placeholder="Tenant name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          onFetchSuggestions={fetchNameSuggestions}
          recentKey="tenant_names"
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Tenant Type"
            value={form.tenant_type}
            onChange={(e) => setForm({ ...form, tenant_type: e.target.value })}
            options={[
              { value: 'individual', label: 'Individual' },
              { value: 'company', label: 'Company' },
            ]}
          />
          <Select
            label="Account Type"
            value={form.account_type}
            onChange={(e) => setForm({ ...form, account_type: e.target.value })}
            options={[
              { value: 'rental', label: 'Rental Tenant' },
              { value: 'levy', label: 'Levy Account Holder' },
              { value: 'both', label: 'Both (Rental & Levy)' },
            ]}
          />
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Unit Allocation</span>
            </div>
            <span className="text-xs text-blue-500">Optional - can be assigned via lease later</span>
          </div>

          <AsyncSelect
            label="Select Property"
            placeholder="-- No property (assign later) --"
            value={form.property}
            onChange={(val) => handlePropertyChange(val ? Number(val) : '')}
            options={properties.map((property: any) => ({
              value: property.id,
              label: `${property.name} (${property.city})`,
            }))}
            searchable
            clearable
          />

          {form.property && (
            <div>
              <AsyncSelect
                label="Select Unit"
                placeholder="-- No unit (assign later) --"
                value={form.unit}
                onChange={(val) => setForm({ ...form, unit: val ? Number(val) : '' })}
                options={availableUnits.map((unit: any) => ({
                  value: unit.id,
                  label: `Unit ${unit.unit_number} - ${unit.unit_type} (${unit.currency} ${unit.rental_amount}/mo)`,
                }))}
                searchable
                clearable
                emptyMessage="No available units. Units are auto-created when you create a lease."
              />
              {availableUnits.length > 0 && (
                <p className="text-xs text-blue-600 mt-1">
                  {availableUnits.length} unit(s) available
                </p>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="ID Type"
            value={form.id_type}
            onChange={(e) => setForm({ ...form, id_type: e.target.value })}
            options={[
              { value: 'national_id', label: 'National ID' },
              { value: 'passport', label: 'Passport' },
              { value: 'company_reg', label: 'Company Reg' },
            ]}
          />
          <Input
            label="ID Number"
            value={form.id_number}
            onChange={(e) => setForm({ ...form, id_number: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <AutocompleteInput
            type="email"
            label="Email"
            placeholder="email@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            recentKey="tenant_emails"
            required
          />
          <AutocompleteInput
            label="Phone"
            placeholder="+263 77 123 4567"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            recentKey="tenant_phones"
            required
          />
        </div>

        {showButtons && (
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </form>
    )
  }
)

TenantForm.displayName = 'TenantForm'
export default TenantForm
