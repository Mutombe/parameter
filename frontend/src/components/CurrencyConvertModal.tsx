import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from '@/lib/icons'
import { Modal, Button, Input, Select } from './ui'
import { AsyncSelect } from './ui/AsyncSelect'
import { conversionApi, propertyApi, landlordApi } from '../services/api'
import { showToast, parseApiError } from '../lib/toast'

/**
 * Currency Conversion (Partial) — converts a payer's secondary-currency
 * pocket credit balances into the primary currency, per category, touching
 * only the payer pockets + Unpaid accounts (Accounts Receivable follows
 * automatically). Scope: one payer, a whole property, or a whole landlord.
 * Rate: pre-filled from property rate / Currency Settings; editable here
 * to override for this conversion.
 */
export default function CurrencyConvertModal({
  open, onClose, tenantId, tenantName,
}: {
  open: boolean
  onClose: () => void
  tenantId?: number
  tenantName?: string
}) {
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<'tenant' | 'property' | 'landlord'>(tenantId ? 'tenant' : 'property')
  const [propertyId, setPropertyId] = useState('')
  const [landlordId, setLandlordId] = useState('')
  const [fromCcy, setFromCcy] = useState('ZWG')
  const [toCcy, setToCcy] = useState('USD')
  const [rate, setRate] = useState('')
  const [category, setCategory] = useState('')

  useEffect(() => {
    if (open) { setScope(tenantId ? 'tenant' : 'property'); setRate('') }
  }, [open, tenantId])

  const { data: props } = useQuery({
    queryKey: ['convert-properties'],
    queryFn: () => propertyApi.list({ page_size: 500 }).then((r: any) => r.data.results || r.data),
    enabled: open && scope === 'property',
    staleTime: 60_000,
  })
  const { data: landlords } = useQuery({
    queryKey: ['convert-landlords'],
    queryFn: () => landlordApi.list({ page_size: 500 }).then((r: any) => r.data.results || r.data),
    enabled: open && scope === 'landlord',
    staleTime: 60_000,
  })
  const { data: ratePreview } = useQuery({
    queryKey: ['convert-rate', propertyId],
    queryFn: () => conversionApi.ratePreview(propertyId ? Number(propertyId) : undefined).then(r => r.data),
    enabled: open,
    staleTime: 30_000,
  })
  const defaultRate = ratePreview?.rate || '25'

  const runMutation = useMutation({
    mutationFn: () => conversionApi.partial({
      ...(scope === 'tenant' ? { tenant_id: tenantId } : {}),
      ...(scope === 'property' ? { property_id: Number(propertyId) } : {}),
      ...(scope === 'landlord' ? { landlord_id: Number(landlordId) } : {}),
      from_currency: fromCcy,
      to_currency: toCcy,
      ...(rate ? { rate: Number(rate) } : {}),
      ...(category ? { category } : {}),
    }),
    onSuccess: (r) => {
      const n = r.data.converted
      if (n === 0) {
        showToast.info(`No ${fromCcy} credit balances found to convert`)
      } else {
        showToast.success(`${n} conversion journal(s) posted`)
      }
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = String(q.queryKey[0])
        return k.startsWith('tenant') || k.startsWith('account') || k.startsWith('rent-rollover') || k.startsWith('sub')
      }})
      onClose()
    },
    onError: (e) => showToast.error(parseApiError(e, 'Conversion failed')),
  })

  const canRun = scope === 'tenant' ? !!tenantId
    : scope === 'property' ? !!propertyId : !!landlordId

  return (
    <Modal open={open} onClose={onClose} title="Convert Currency" icon={RefreshCw}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Convert by</label>
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 w-full">
            {([['tenant', tenantName ? `This payer` : 'Payer'], ['property', 'Property'], ['landlord', 'Landlord']] as const)
              .filter(([v]) => v !== 'tenant' || tenantId)
              .map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setScope(v)}
                  className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    scope === v ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {l}
                </button>
              ))}
          </div>
          {scope === 'tenant' && tenantName && (
            <p className="mt-1 text-xs text-gray-500">Converting for <span className="font-medium">{tenantName}</span></p>
          )}
        </div>

        {scope === 'property' && (
          <AsyncSelect
            label="Property"
            placeholder="Select property"
            value={propertyId}
            onChange={(v) => setPropertyId(String(v))}
            options={(props || []).map((p: any) => ({ value: p.id, label: p.name }))}
            searchable
          />
        )}
        {scope === 'landlord' && (
          <AsyncSelect
            label="Landlord"
            placeholder="Select landlord"
            value={landlordId}
            onChange={(v) => setLandlordId(String(v))}
            options={(landlords || []).map((l: any) => ({ value: l.id, label: l.name }))}
            searchable
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <Select label="From" value={fromCcy} onChange={(e) => { setFromCcy(e.target.value); setToCcy(e.target.value === 'ZWG' ? 'USD' : 'ZWG') }}
            options={[{ value: 'ZWG', label: 'ZWG (secondary)' }, { value: 'USD', label: 'USD (primary)' }]}
            hint="Default: secondary → primary" />
          <Select label="To" value={toCcy} onChange={(e) => setToCcy(e.target.value)}
            options={[{ value: 'USD', label: 'USD' }, { value: 'ZWG', label: 'ZWG' }]} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            type="number" step="0.0001" min="0"
            label={`Rate (ZWG per USD)`}
            placeholder={String(defaultRate)}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            hint={`Leave empty for the configured rate: ${defaultRate}`}
          />
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}
            options={[
              { value: '', label: 'All categories with balances' },
              { value: 'rent', label: 'Rent' }, { value: 'levy', label: 'Levy' },
              { value: 'special_levy', label: 'Special Levy' }, { value: 'maintenance', label: 'Maintenance' },
              { value: 'parking', label: 'Parking' }, { value: 'rates', label: 'Rates' },
              { value: 'vat', label: 'VAT' }, { value: 'deposit', label: 'Deposit' },
            ]} />
        </div>

        <p className="text-xs text-gray-500">
          Converts every {fromCcy} pocket <span className="font-medium">credit balance</span> into {toCcy} for
          the chosen scope — payer pockets and Unpaid accounts only; landlord pockets, commission, VAT and
          bank accounts are untouched. Narration: “{fromCcy}500 converted to {toCcy}$20”.
        </p>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="button" className="flex-1" disabled={!canRun || runMutation.isPending}
            onClick={() => runMutation.mutate()}>
            {runMutation.isPending ? 'Converting…' : 'Convert'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
