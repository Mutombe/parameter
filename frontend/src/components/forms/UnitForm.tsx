import { useState, useImperativeHandle, forwardRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bed, Bath, Square } from 'lucide-react'
import { Input, Select, Textarea } from '../ui'
import { AutocompleteInput } from '../ui/AutocompleteInput'
import { AsyncSelect } from '../ui/AsyncSelect'
import { propertyApi } from '../../services/api'

export interface UnitFormRef {
  submit: () => void
  getFormData: () => Record<string, any>
}

interface UnitFormProps {
  initialValues?: Record<string, any>
  onSubmit: (data: any) => void
  isSubmitting?: boolean
  showButtons?: boolean
  onCancel?: () => void
}

const UnitForm = forwardRef<UnitFormRef, UnitFormProps>(
  ({ initialValues, onSubmit, isSubmitting, showButtons = true, onCancel }, ref) => {
    const [form, setForm] = useState({
      unit_number: '',
      property: '',
      unit_type: 'apartment',
      rental_amount: '',
      deposit_amount: '',
      currency: 'USD',
      bedrooms: '1',
      bathrooms: '1',
      square_meters: '',
      floor_number: '0',
      description: '',
    })

    const { data: properties, isLoading: propertiesLoading } = useQuery({
      queryKey: ['properties-list'],
      queryFn: () => propertyApi.list().then((r) => r.data.results || r.data),
    })

    useEffect(() => {
      if (initialValues) {
        setForm((prev) => ({
          ...prev,
          ...initialValues,
          property: initialValues.property ? String(initialValues.property) : prev.property,
        }))
      }
    }, [initialValues])

    // Auto-calculate deposit as 2x rent when rental_amount changes and deposit is empty
    useEffect(() => {
      if (form.rental_amount && !form.deposit_amount) {
        const rent = parseFloat(form.rental_amount)
        if (rent > 0) {
          setForm(prev => prev.deposit_amount ? prev : { ...prev, deposit_amount: (rent * 2).toFixed(2) })
        }
      }
    }, [form.rental_amount])

    const handleSubmit = (e?: React.FormEvent) => {
      e?.preventDefault()
      const data = {
        ...form,
        property: parseInt(form.property),
        rental_amount: parseFloat(form.rental_amount),
        deposit_amount: form.deposit_amount ? parseFloat(form.deposit_amount) : null,
        bedrooms: parseInt(form.bedrooms),
        bathrooms: parseInt(form.bathrooms),
        square_meters: form.square_meters ? parseFloat(form.square_meters) : null,
        floor_number: parseInt(form.floor_number),
      }
      onSubmit(data)
    }

    useImperativeHandle(ref, () => ({
      submit: () => handleSubmit(),
      getFormData: () => form,
    }))

    return (
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <AutocompleteInput
            label="Unit Number"
            placeholder="A101"
            value={form.unit_number}
            onChange={(e) => setForm({ ...form, unit_number: e.target.value })}
            recentKey="unit_numbers"
            required
          />

          <AsyncSelect
            label="Property"
            placeholder="Select Property"
            value={form.property}
            onChange={(val) => setForm({ ...form, property: String(val) })}
            options={properties?.map((p: any) => ({ value: p.id, label: p.name })) || []}
            isLoading={propertiesLoading}
            required
            searchable
            emptyMessage="No properties found. Create a property first."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Unit Type"
            value={form.unit_type}
            onChange={(e) => setForm({ ...form, unit_type: e.target.value })}
            searchable
          >
            <option value="studio">Studio</option>
            <option value="apartment">Apartment</option>
            <option value="1bed">1 Bedroom</option>
            <option value="2bed">2 Bedroom</option>
            <option value="3bed">3 Bedroom</option>
            <option value="house">House</option>
            <option value="commercial">Commercial</option>
            <option value="office">Office</option>
          </Select>

          <Select
            label="Currency"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
          >
            <option value="USD">USD</option>
            <option value="ZiG">ZiG</option>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            type="number"
            label="Monthly Rent"
            placeholder="1000.00"
            step="0.01"
            min="0"
            value={form.rental_amount}
            onChange={(e) => setForm({ ...form, rental_amount: e.target.value })}
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
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="relative">
            <Input
              type="number"
              label="Bedrooms"
              min="0"
              value={form.bedrooms}
              onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
            />
            <Bed className="absolute right-3 top-9 w-4 h-4 text-gray-400" />
          </div>

          <div className="relative">
            <Input
              type="number"
              label="Bathrooms"
              min="0"
              value={form.bathrooms}
              onChange={(e) => setForm({ ...form, bathrooms: e.target.value })}
            />
            <Bath className="absolute right-3 top-9 w-4 h-4 text-gray-400" />
          </div>

          <div className="relative">
            <Input
              type="number"
              label="Size (m2)"
              min="0"
              value={form.square_meters}
              onChange={(e) => setForm({ ...form, square_meters: e.target.value })}
            />
            <Square className="absolute right-3 top-9 w-4 h-4 text-gray-400" />
          </div>
        </div>

        <Input
          type="number"
          label="Floor Number"
          min="0"
          value={form.floor_number}
          onChange={(e) => setForm({ ...form, floor_number: e.target.value })}
        />

        <Textarea
          label="Description"
          placeholder="Unit description..."
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
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

UnitForm.displayName = 'UnitForm'
export default UnitForm
