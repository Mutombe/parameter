import { useState, useImperativeHandle, forwardRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input, Select } from '../ui'
import { AutocompleteInput } from '../ui/AutocompleteInput'
import { AsyncSelect } from '../ui/AsyncSelect'
import { landlordApi, propertyApi } from '../../services/api'
import { useChainStore } from '../../stores/chainStore'

export interface PropertyFormRef {
  submit: () => void
  getFormData: () => Record<string, any>
}

interface PropertyFormProps {
  initialValues?: Record<string, any>
  onSubmit: (data: any) => void
  isSubmitting?: boolean
  showButtons?: boolean
  onCancel?: () => void
}

const PropertyForm = forwardRef<PropertyFormRef, PropertyFormProps>(
  ({ initialValues, onSubmit, isSubmitting, showButtons = true, onCancel }, ref) => {
    const [form, setForm] = useState({
      landlord: '',
      name: '',
      property_type: 'residential',
      address: '',
      city: '',
      total_units: '',
      unit_definition: '',
    })

    const { data: landlords, isLoading: landlordsLoading } = useQuery({
      queryKey: ['landlords-select'],
      queryFn: () => landlordApi.list().then((r) => r.data.results || r.data),
    })

    // Fetch existing properties for address/city suggestions
    const { data: existingProperties } = useQuery({
      queryKey: ['properties-for-suggestions'],
      queryFn: () => propertyApi.list().then(r => r.data.results || r.data),
      staleTime: 30000,
    })

    useEffect(() => {
      if (initialValues) {
        setForm((prev) => ({
          ...prev,
          ...initialValues,
          landlord: initialValues.landlord ? String(initialValues.landlord) : prev.landlord,
        }))
      }
    }, [initialValues])

    const handleSubmit = (e?: React.FormEvent) => {
      e?.preventDefault()
      onSubmit({
        ...form,
        landlord: parseInt(form.landlord, 10),
        total_units: parseInt(String(form.total_units), 10) || 0,
      })
    }

    useImperativeHandle(ref, () => ({
      submit: () => handleSubmit(),
      getFormData: () => ({ ...form, landlord: parseInt(form.landlord, 10), total_units: parseInt(String(form.total_units), 10) || 0 }),
    }))

    const fetchAddressSuggestions = useCallback(async (query: string) => {
      if (!existingProperties) return []
      const q = query.toLowerCase()
      const seen = new Set<string>()
      return existingProperties
        .filter((p: any) => p.address && p.address.toLowerCase().includes(q))
        .filter((p: any) => { if (seen.has(p.address)) return false; seen.add(p.address); return true })
        .slice(0, 8)
        .map((p: any) => ({ text: p.address, subtext: p.city }))
    }, [existingProperties])

    const fetchCitySuggestions = useCallback(async (query: string) => {
      if (!existingProperties) return []
      const q = query.toLowerCase()
      const seen = new Set<string>()
      return existingProperties
        .filter((p: any) => p.city && p.city.toLowerCase().includes(q))
        .filter((p: any) => { if (seen.has(p.city)) return false; seen.add(p.city); return true })
        .slice(0, 8)
        .map((p: any) => ({ text: p.city }))
    }, [existingProperties])

    const startChain = useChainStore(s => s.startChain)

    return (
      <form onSubmit={handleSubmit} className="space-y-5">
        <AsyncSelect
          label="Landlord"
          placeholder="Select a landlord"
          value={form.landlord}
          onChange={(val) => setForm({ ...form, landlord: String(val) })}
          options={landlords?.map((l: any) => ({ value: l.id, label: l.name })) || []}
          isLoading={landlordsLoading}
          required
          searchable
          emptyMessage="No landlords found. Create a landlord first."
          onCreateNew={() => startChain('landlord')}
          createNewLabel="+ Create new landlord"
        />

        <AutocompleteInput
          label="Property Name"
          placeholder="e.g., Sunrise Apartments"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          recentKey="property_names"
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Property Type"
            value={form.property_type}
            onChange={(e) => setForm({ ...form, property_type: e.target.value })}
          >
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
            <option value="industrial">Industrial</option>
            <option value="mixed">Mixed Use</option>
          </Select>

          <Input
            type="number"
            label="Total Units"
            placeholder="0"
            min="0"
            value={form.total_units}
            onChange={(e) => setForm({ ...form, total_units: e.target.value })}
          />
        </div>

        <AutocompleteInput
          label="Address"
          placeholder="123 Main Street"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          onFetchSuggestions={fetchAddressSuggestions}
          recentKey="property_addresses"
          required
        />

        <AutocompleteInput
          label="City"
          placeholder="Harare"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          onFetchSuggestions={fetchCitySuggestions}
          recentKey="property_cities"
        />

        <div>
          <Input
            label="Unit Definition"
            placeholder="e.g., 1-17 or A1-A20; B1-B15"
            value={form.unit_definition}
            onChange={(e) => setForm({ ...form, unit_definition: e.target.value })}
          />
          <p className="mt-1 text-xs text-gray-500">
            Define unit ranges using formats like "1-17" (numeric) or "A1-A20; B1-B15" (alphanumeric).
            Units can be auto-generated after property creation.
          </p>
        </div>

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

PropertyForm.displayName = 'PropertyForm'
export default PropertyForm
