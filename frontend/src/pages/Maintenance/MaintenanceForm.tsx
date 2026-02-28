import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import { Input, Select, Textarea } from '../../components/ui'

interface MaintenanceFormData {
  property: string
  unit: string
  title: string
  description: string
  priority: string
}

interface MaintenanceFormProps {
  initialData?: Partial<MaintenanceFormData>
  onChange?: (data: MaintenanceFormData) => void
  errors?: Record<string, string>
  disabled?: boolean
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'emergency', label: 'Emergency' },
]

export function MaintenanceForm({
  initialData,
  onChange,
  errors = {},
  disabled = false,
}: MaintenanceFormProps) {
  const [formData, setFormData] = useState<MaintenanceFormData>({
    property: initialData?.property || '',
    unit: initialData?.unit || '',
    title: initialData?.title || '',
    description: initialData?.description || '',
    priority: initialData?.priority || 'medium',
  })

  // Fetch properties for the select
  const { data: propertiesData } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () => api.get('/properties/').then((r) => r.data),
  })

  const properties = propertiesData?.results || propertiesData || []

  // Fetch units filtered by selected property
  const { data: unitsData } = useQuery({
    queryKey: ['units-list', formData.property],
    queryFn: () =>
      api
        .get('/units/', { params: { property: formData.property } })
        .then((r) => r.data),
    enabled: !!formData.property,
  })

  const units = unitsData?.results || unitsData || []

  // Reset unit when property changes
  useEffect(() => {
    if (formData.property !== (initialData?.property || '')) {
      setFormData((prev) => ({ ...prev, unit: '' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.property])

  // Notify parent of changes
  useEffect(() => {
    onChange?.(formData)
  }, [formData, onChange])

  const handleChange = (field: keyof MaintenanceFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const propertyOptions = properties.map((p: any) => ({
    value: String(p.id),
    label: p.name,
  }))

  const unitOptions = units.map((u: any) => ({
    value: String(u.id),
    label: u.unit_number || u.name,
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Property"
          placeholder="Select property"
          options={propertyOptions}
          value={formData.property}
          onChange={(e) => handleChange('property', e.target.value)}
          error={errors.property}
          required
          disabled={disabled}
          searchable
        />

        <Select
          label="Unit"
          placeholder={formData.property ? 'Select unit' : 'Select a property first'}
          options={unitOptions}
          value={formData.unit}
          onChange={(e) => handleChange('unit', e.target.value)}
          error={errors.unit}
          disabled={disabled || !formData.property}
          searchable
        />
      </div>

      <Input
        label="Title"
        placeholder="Brief summary of the issue"
        value={formData.title}
        onChange={(e) => handleChange('title', e.target.value)}
        error={errors.title}
        required
        disabled={disabled}
      />

      <Textarea
        label="Description"
        placeholder="Provide details about the maintenance issue..."
        value={formData.description}
        onChange={(e) => handleChange('description', e.target.value)}
        error={errors.description}
        rows={4}
        required
        disabled={disabled}
      />

      <Select
        label="Priority"
        options={PRIORITY_OPTIONS}
        value={formData.priority}
        onChange={(e) => handleChange('priority', e.target.value)}
        error={errors.priority}
        required
        disabled={disabled}
      />
    </div>
  )
}

export default MaintenanceForm
