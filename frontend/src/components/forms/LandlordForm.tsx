import { useState, useImperativeHandle, forwardRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input, Select, Textarea } from '../ui'
import { AutocompleteInput } from '../ui/AutocompleteInput'
import { landlordApi } from '../../services/api'

export interface LandlordFormRef {
  submit: () => void
  getFormData: () => Record<string, any>
}

interface LandlordFormProps {
  initialValues?: Record<string, any>
  onSubmit: (data: any) => void
  isSubmitting?: boolean
  showButtons?: boolean
  onCancel?: () => void
}

const LandlordForm = forwardRef<LandlordFormRef, LandlordFormProps>(
  ({ initialValues, onSubmit, isSubmitting, showButtons = true, onCancel }, ref) => {
    const [form, setForm] = useState({
      name: '',
      landlord_type: 'individual',
      email: '',
      phone: '',
      address: '',
      commission_rate: '10.00',
    })

    // Fetch existing landlords for name duplicate detection
    const { data: existingLandlords } = useQuery({
      queryKey: ['landlords-list'],
      queryFn: () => landlordApi.list().then(r => r.data.results || r.data),
      staleTime: 30000,
    })

    useEffect(() => {
      if (initialValues) {
        setForm((prev) => ({ ...prev, ...initialValues }))
      }
    }, [initialValues])

    const handleSubmit = (e?: React.FormEvent) => {
      e?.preventDefault()
      onSubmit(form)
    }

    useImperativeHandle(ref, () => ({
      submit: () => handleSubmit(),
      getFormData: () => form,
    }))

    const fetchNameSuggestions = useCallback(async (query: string) => {
      if (!existingLandlords) return []
      const q = query.toLowerCase()
      return existingLandlords
        .filter((l: any) => l.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map((l: any) => ({ text: l.name, subtext: l.landlord_type }))
    }, [existingLandlords])

    return (
      <form onSubmit={handleSubmit} className="space-y-5">
        <AutocompleteInput
          label="Full Name"
          placeholder="John Doe or Company Ltd"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          onFetchSuggestions={fetchNameSuggestions}
          recentKey="landlord_names"
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Type"
            value={form.landlord_type}
            onChange={(e) => setForm({ ...form, landlord_type: e.target.value })}
          >
            <option value="individual">Individual</option>
            <option value="company">Company</option>
            <option value="trust">Trust</option>
          </Select>

          <Input
            type="number"
            label="Commission Rate (%)"
            placeholder="10.00"
            step="0.01"
            min="0"
            max="100"
            value={form.commission_rate}
            onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
            hint="Standard commission is 10%"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <AutocompleteInput
            type="email"
            label="Email Address"
            placeholder="email@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            recentKey="landlord_emails"
            required
          />

          <AutocompleteInput
            label="Phone Number"
            placeholder="+263 77 123 4567"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            recentKey="landlord_phones"
            required
          />
        </div>

        <Textarea
          label="Address"
          placeholder="Physical address..."
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
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

LandlordForm.displayName = 'LandlordForm'
export default LandlordForm
