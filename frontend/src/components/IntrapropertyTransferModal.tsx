import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight } from '@/lib/icons'
import { Modal, Button, Input, Select, Textarea } from './ui'
import { AsyncSelect } from './ui/AsyncSelect'
import {
  transferApi, tenantApi, accountHolderApi, leaseApi, landlordApi, propertyApi,
} from '../services/api'
import { showToast, parseApiError } from '../lib/toast'
import { cn } from '../lib/utils'

const CATEGORIES = [
  { value: 'rent', label: 'Rent' }, { value: 'levy', label: 'Levy' },
  { value: 'special_levy', label: 'Special Levy' }, { value: 'maintenance', label: 'Maintenance' },
  { value: 'parking', label: 'Parking' }, { value: 'rates', label: 'Rates' },
  { value: 'vat', label: 'VAT' }, { value: 'deposit', label: 'Deposit' },
]

/**
 * Intraproperty Transfer — moves value between two categories for the same
 * payer within the same property, WITHOUT reversing the original receipt.
 * You can find the payer three ways (spec): by Tenant/Account Holder, by
 * Property, or by Landlord. The transfer touches only the payer pockets,
 * the Unpaid accounts and the landlord pockets (via the Intraproperty
 * Transfers GL); commission is re-allocated for commissionable categories.
 * Bank/cash is untouched.
 */
export default function IntrapropertyTransferModal({
  open, onClose, tenantId, tenantName,
}: {
  open: boolean
  onClose: () => void
  tenantId?: number
  tenantName?: string
}) {
  const queryClient = useQueryClient()
  // When opened from a payer's page the payer is fixed (the "by Tenant"
  // path); otherwise the user picks how to find the payer.
  const [scope, setScope] = useState<'tenant' | 'property' | 'landlord'>('tenant')
  const [landlordId, setLandlordId] = useState('')
  const [payerId, setPayerId] = useState<string>(tenantId ? String(tenantId) : '')
  const [propertyId, setPropertyId] = useState('')
  const [fromCat, setFromCat] = useState('rates')
  const [toCat, setToCat] = useState('maintenance')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (open) {
      setScope('tenant')
      setLandlordId('')
      setPayerId(tenantId ? String(tenantId) : '')
      setPropertyId('')
    }
  }, [open, tenantId])

  // ── Payer directory (by Tenant scope) ──
  const { data: payers } = useQuery({
    queryKey: ['itf-payers'],
    queryFn: async () => {
      const [t, ah] = await Promise.all([
        tenantApi.list({ page_size: 500 }).then((r: any) => r.data.results || r.data),
        accountHolderApi.list({ page_size: 500 }).then((r: any) => r.data.results || r.data),
      ])
      return [...t, ...ah]
    },
    enabled: open && !tenantId && scope === 'tenant',
    staleTime: 60_000,
  })

  // ── By-Landlord scope: landlords, then their properties ──
  const { data: landlords } = useQuery({
    queryKey: ['itf-landlords'],
    queryFn: () => landlordApi.list({ page_size: 500 }).then((r: any) => r.data.results || r.data),
    enabled: open && scope === 'landlord',
    staleTime: 60_000,
  })

  // ── By-Property / By-Landlord scope: the property list to choose from ──
  const { data: scopeProperties } = useQuery({
    queryKey: ['itf-properties', scope, landlordId],
    queryFn: () => propertyApi.list({
      page_size: 500, ...(scope === 'landlord' && landlordId ? { landlord: Number(landlordId) } : {}),
    }).then((r: any) => r.data.results || r.data),
    enabled: open && (scope === 'property' || (scope === 'landlord' && !!landlordId)),
    staleTime: 60_000,
  })

  // ── By-Tenant scope: the payer's own properties (transfer stays within one) ──
  const { data: payerLeases } = useQuery({
    queryKey: ['itf-leases', payerId],
    queryFn: () => leaseApi.list({ tenant: payerId, page_size: 100 }).then((r: any) => r.data.results || r.data),
    enabled: open && !!payerId && scope === 'tenant',
    staleTime: 30_000,
  })
  const payerPropertyOptions = Array.from(new Map(
    (payerLeases || [])
      .map((l: any) => [l.property_id, { value: l.property_id, label: l.property_name }])
      .filter(([id]: any[]) => id)
  ).values())

  // ── By-Property / By-Landlord scope: payers with an active lease in the
  //    chosen property ──
  const { data: propertyLeases } = useQuery({
    queryKey: ['itf-property-leases', propertyId],
    queryFn: () => leaseApi.list({ property: propertyId, status: 'active', page_size: 200 })
      .then((r: any) => r.data.results || r.data),
    enabled: open && !!propertyId && scope !== 'tenant',
    staleTime: 30_000,
  })
  const propertyPayerOptions = Array.from(new Map(
    (propertyLeases || [])
      .map((l: any) => { const id = l.tenant_id ?? l.tenant; return [id, { value: id, label: l.tenant_name }] })
      .filter(([id]: any[]) => id)
  ).values())

  const { data: preview } = useQuery({
    queryKey: ['itf-preview', propertyId, fromCat, toCat, amount],
    queryFn: () => transferApi.preview({
      property_id: Number(propertyId), from_category: fromCat,
      to_category: toCat, amount: Number(amount),
    }).then(r => r.data),
    enabled: open && !!propertyId && Number(amount) > 0 && fromCat !== toCat,
    staleTime: 10_000,
  })

  const runMutation = useMutation({
    mutationFn: () => transferApi.execute({
      tenant_id: Number(payerId), property_id: Number(propertyId),
      from_category: fromCat, to_category: toCat,
      amount: Number(amount), currency,
      description: description.trim(),
    }),
    onSuccess: () => {
      showToast.success('Intraproperty transfer posted')
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = String(q.queryKey[0])
        return k.startsWith('tenant') || k.startsWith('account') || k.startsWith('sub') || k.startsWith('landlord')
      }})
      onClose()
    },
    onError: (e) => showToast.error(parseApiError(e, 'Transfer failed')),
  })

  const canRun = !!payerId && !!propertyId && Number(amount) > 0 && fromCat !== toCat

  return (
    <Modal open={open} onClose={onClose} title="Intraproperty Transfer" icon={ArrowLeftRight}>
      <div className="space-y-4">
        {tenantId ? (
          <p className="text-sm text-gray-600">
            Payer: <span className="font-semibold">{tenantName}</span>
          </p>
        ) : (
          <>
            {/* Find the payer by Tenant/Account Holder, Property, or Landlord */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Perform by</label>
              <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
                {([['tenant', 'Tenant / Account Holder'], ['property', 'Property'], ['landlord', 'Landlord']] as const)
                  .map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => { setScope(v); setLandlordId(''); setPayerId(''); setPropertyId('') }}
                      className={cn('px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                        scope === v ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
                    >
                      {l}
                    </button>
                  ))}
              </div>
            </div>

            {scope === 'landlord' && (
              <AsyncSelect
                label="Landlord"
                placeholder="Select landlord"
                value={landlordId}
                onChange={(v) => { setLandlordId(String(v)); setPropertyId(''); setPayerId('') }}
                options={(landlords || []).map((l: any) => ({ value: l.id, label: l.name }))}
                searchable
              />
            )}

            {scope === 'tenant' ? (
              <>
                <AsyncSelect
                  label="Tenant / Account Holder"
                  placeholder="Select payer"
                  value={payerId}
                  onChange={(v) => { setPayerId(String(v)); setPropertyId('') }}
                  options={(payers || []).map((p: any) => ({ value: p.id, label: p.name }))}
                  searchable
                />
                <AsyncSelect
                  label="Property"
                  placeholder={payerId ? 'Select the property' : 'Select payer first'}
                  value={propertyId}
                  onChange={(v) => setPropertyId(String(v))}
                  options={payerPropertyOptions as any[]}
                  disabled={!payerId}
                  searchable
                />
              </>
            ) : (
              <>
                <AsyncSelect
                  label="Property"
                  placeholder={scope === 'landlord' && !landlordId ? 'Select landlord first' : 'Select property'}
                  value={propertyId}
                  onChange={(v) => { setPropertyId(String(v)); setPayerId('') }}
                  options={(scopeProperties || []).map((p: any) => ({ value: p.id, label: p.name }))}
                  disabled={scope === 'landlord' && !landlordId}
                  searchable
                />
                <AsyncSelect
                  label="Tenant / Account Holder"
                  placeholder={propertyId ? 'Select payer in this property' : 'Select property first'}
                  value={payerId}
                  onChange={(v) => setPayerId(String(v))}
                  options={propertyPayerOptions as any[]}
                  disabled={!propertyId}
                  searchable
                />
              </>
            )}
          </>
        )}

        {/* When opened from a payer page we still need the property picked */}
        {tenantId && (
          <AsyncSelect
            label="Property"
            placeholder={payerId ? 'Select the property' : 'Select payer first'}
            value={propertyId}
            onChange={(v) => setPropertyId(String(v))}
            options={payerPropertyOptions as any[]}
            disabled={!payerId}
            searchable
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <Select label="Transfer From" value={fromCat} onChange={(e) => setFromCat(e.target.value)} options={CATEGORIES} />
          <Select label="Transfer To" value={toCat} onChange={(e) => setToCat(e.target.value)} options={CATEGORIES} />
        </div>
        {fromCat === toCat && (
          <p className="text-xs text-red-600">Choose two different categories.</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input type="number" step="0.01" min="0" label="Amount"
            value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <Select label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}
            options={[{ value: 'USD', label: 'USD' }, { value: 'ZWG', label: 'ZWG' }]} />
        </div>

        {preview && (
          <div className="rounded-xl border border-primary-100 bg-primary-50/30 p-3 text-xs space-y-1">
            <p className="font-semibold text-gray-700">Commission re-allocation preview</p>
            <p>Reversal at {preview.from_rate_pct}% ({fromCat}): gross {preview.commission_reversal.gross} = {preview.commission_reversal.net} commission + {preview.commission_reversal.vat} VAT</p>
            <p>Charge at {preview.to_rate_pct}% ({toCat}): gross {preview.commission_charge.gross} = {preview.commission_charge.net} commission + {preview.commission_charge.vat} VAT</p>
            <p className="text-gray-500">Bank/cash untouched · landlord pockets flow through the Intraproperty Transfers GL · Unpaid accounts stay true · income re-attributed to {toCat}.</p>
          </div>
        )}

        <Textarea label="Description (optional)" rows={2}
          value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Reason for the transfer…" />

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="button" className="flex-1" disabled={!canRun || runMutation.isPending}
            onClick={() => runMutation.mutate()}>
            {runMutation.isPending ? 'Posting…' : 'Post Transfer'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
