import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { tenantApi, accountHolderApi } from '../services/api'
import { AsyncSelect } from './ui/AsyncSelect'

interface PayerSelectProps {
  label?: string
  placeholder?: string
  value: string | number | null
  onChange: (value: string | number, payerType: 'rental' | 'levy') => void
  required?: boolean
  /** Optional bias — show only one side (e.g. when context is locked). */
  scope?: 'all' | 'rental' | 'levy'
  emptyMessage?: string
}

/**
 * Combined Tenant + Account Holder picker for billing flows.
 *
 * Shared payer surfaces (invoices, receipts) need to address both rental
 * tenants (TN/) and levy account holders (AC/). Separating into two pickers
 * forces users to know which kind they want before they type — the design
 * call is one combined search list with a colored type chip in each option.
 *
 * Selection emits the payer's id and account_type so callers can branch on
 * downstream logic (e.g. lease lookup) without a second round-trip.
 */
export function PayerSelect({
  label = 'Payer',
  placeholder = 'Select tenant or account holder',
  value,
  onChange,
  required,
  scope = 'all',
  emptyMessage,
}: PayerSelectProps) {
  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants-select-all'],
    queryFn: () => tenantApi.list({ page_size: 500 }).then(r => r.data.results || r.data),
    staleTime: 30000,
    enabled: scope !== 'levy',
  })

  const { data: accountHolders, isLoading: holdersLoading } = useQuery({
    queryKey: ['account-holders-select-all'],
    queryFn: () => accountHolderApi.list({ page_size: 500 }).then(r => r.data.results || r.data),
    staleTime: 30000,
    enabled: scope !== 'rental',
  })

  // Build a single list of options. A small colored dot in `icon` and the
  // code+chip in `description` give users two visual cues per row without
  // cluttering the label — the name stays the primary scannable content.
  const options = useMemo(() => {
    const out: { value: number; label: string; description: string; icon: any; _payerType: 'rental' | 'levy' }[] = []
    const pushAll = (rows: any[], payerType: 'rental' | 'levy') => {
      for (const r of rows) {
        out.push({
          value: r.id,
          label: r.name,
          description: `${r.code} · ${payerType === 'levy' ? 'Levy' : 'Rental'}`,
          icon: (
            <span
              className={
                'inline-block w-2 h-2 rounded-full ' +
                (payerType === 'levy' ? 'bg-violet-500' : 'bg-sky-500')
              }
            />
          ),
          _payerType: payerType,
        })
      }
    }
    if (scope !== 'levy') pushAll(tenants || [], 'rental')
    if (scope !== 'rental') pushAll(accountHolders || [], 'levy')
    return out
  }, [tenants, accountHolders, scope])

  // Map the AsyncSelect onChange (value-only) back to a typed onChange.
  const handleChange = (val: string | number) => {
    const picked = options.find(o => String(o.value) === String(val))
    onChange(val, picked?._payerType || 'rental')
  }

  return (
    <AsyncSelect
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      options={options}
      isLoading={tenantsLoading || holdersLoading}
      required={required}
      searchable
      emptyMessage={emptyMessage || 'No tenants or account holders found.'}
    />
  )
}
