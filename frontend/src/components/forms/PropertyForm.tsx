import { useState, useImperativeHandle, forwardRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Percent } from 'lucide-react'
import { Input, Select } from '../ui'
import { AutocompleteInput } from '../ui/AutocompleteInput'
import { AsyncSelect } from '../ui/AsyncSelect'
import { landlordApi, propertyApi, propertyManagerApi } from '../../services/api'
import { useChainStore } from '../../stores/chainStore'
import { cn } from '../../lib/utils'

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
  // Compact JIT entry point — when provided, a "Commissions" button
  // sits beside the Total Units field. Click opens the parent's
  // commission modal (in draft mode pre-save, live mode for edits).
  onConfigureCommissions?: () => void
  pendingCommissionsCount?: number
}

const PropertyForm = forwardRef<PropertyFormRef, PropertyFormProps>(
  ({ initialValues, onSubmit, isSubmitting, showButtons = true, onCancel, onConfigureCommissions, pendingCommissionsCount = 0 }, ref) => {
    const [form, setForm] = useState({
      landlord: '',
      name: '',
      property_type: 'residential',
      management_type: 'rental',
      address: '',
      city: '',
      total_units: '',
      manager_user: '',
    })
    const [showJitManager, setShowJitManager] = useState(false)
    const [jitManager, setJitManager] = useState({ first_name: '', last_name: '', email: '' })
    const [jitSaving, setJitSaving] = useState(false)

    const { data: landlords, isLoading: landlordsLoading, error: landlordsError } = useQuery({
      queryKey: ['landlords-select'],
      queryFn: () => landlordApi.list({ page_size: 500 }).then((r) => r.data.results || r.data),
      placeholderData: [],
    })

    const { data: staffOptions, refetch: refetchStaff } = useQuery({
      queryKey: ['property-manager-staff-options'],
      queryFn: () => propertyManagerApi.staffOptions().then((r) => r.data),
      staleTime: 60_000,
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
          error={landlordsError ? 'Failed to load landlords. Please refresh.' : undefined}
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

          <Select
            label="Management Type"
            value={form.management_type}
            onChange={(e) => setForm({ ...form, management_type: e.target.value })}
          >
            <option value="rental">Rental</option>
            <option value="levy">Levy</option>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            type="number"
            label="Total Units"
            placeholder="0"
            min="0"
            value={form.total_units}
            onChange={(e) => setForm({ ...form, total_units: e.target.value })}
          />
          {onConfigureCommissions && (
            // Mirror Input's wrapper so the labels + fields line up
            // exactly with Total Units on the left.
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Commissions
              </label>
              <button
                type="button"
                onClick={onConfigureCommissions}
                className={cn(
                  // Match Input height (px-4 py-2.5 → ~42px) + rounded-xl
                  'w-full h-[42px] px-4 inline-flex items-center justify-center gap-2 rounded-xl',
                  'border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 hover:border-amber-400',
                  'text-sm font-semibold text-amber-900 transition-colors',
                )}
              >
                <Percent className="w-4 h-4 text-amber-600" />
                <span>Configure</span>
                {pendingCommissionsCount > 0 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
                    {pendingCommissionsCount}
                  </span>
                )}
              </button>
            </div>
          )}
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

        {/* Property Manager — the staff member managing this property for
            the landlord (management contract). Units are added later from
            the Units page or auto-created when leases specify unit numbers. */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Property Manager</label>
          <div className="flex items-center gap-2">
            <select
              value={form.manager_user}
              onChange={(e) => setForm({ ...form, manager_user: e.target.value })}
              className="flex-1 px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Select property manager…</option>
              {(staffOptions || []).map((u: any) => (
                <option key={u.id} value={u.id}>{u.name} · {u.role}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowJitManager(v => !v)}
              className="px-3 py-2.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-xl hover:bg-primary-50 whitespace-nowrap"
            >
              + New Manager
            </button>
          </div>
          {showJitManager && (
            <div className="mt-2 p-3 rounded-xl border border-primary-100 bg-primary-50/30 space-y-2">
              <p className="text-xs font-medium text-gray-700">Add New Property Manager</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="First name"
                  value={jitManager.first_name}
                  onChange={(e) => setJitManager({ ...jitManager, first_name: e.target.value })}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <input
                  placeholder="Last name"
                  value={jitManager.last_name}
                  onChange={(e) => setJitManager({ ...jitManager, last_name: e.target.value })}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <input
                type="email"
                placeholder="Email address"
                value={jitManager.email}
                onChange={(e) => setJitManager({ ...jitManager, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="button"
                disabled={jitSaving || !jitManager.first_name.trim() || !jitManager.email.trim()}
                onClick={async () => {
                  setJitSaving(true)
                  try {
                    const r = await propertyManagerApi.quickCreateUser(jitManager)
                    await refetchStaff()
                    setForm(prev => ({ ...prev, manager_user: String(r.data.id) }))
                    setShowJitManager(false)
                    setJitManager({ first_name: '', last_name: '', email: '' })
                  } catch (err: any) {
                    alert(err?.response?.data?.error || 'Failed to create manager')
                  } finally {
                    setJitSaving(false)
                  }
                }}
                className="w-full px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {jitSaving ? 'Creating…' : 'Create & Select'}
              </button>
            </div>
          )}
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
