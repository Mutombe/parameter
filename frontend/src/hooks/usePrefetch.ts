import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import {
  propertyApi,
  landlordApi,
  tenantApi,
  unitApi,
  leaseApi,
  invoiceApi,
  receiptApi,
  expenseApi,
  reportsApi,
  journalApi,
  accountApi,
  bankAccountApi,
} from '../services/api'

const PREFETCH_STALE_TIME = 5 * 60 * 1000 // 5 minutes

// Map of sidebar route paths to their primary query prefetch configs.
// Query keys must match the EXACT keys used in each page's useQuery call.
// List pages use ['entity', '', 1] for the default (empty search, page 1) view.
const prefetchMap: Record<string, () => { queryKey: unknown[]; queryFn: () => Promise<unknown> }[]> = {
  '/dashboard': () => [
    { queryKey: ['dashboard-stats'], queryFn: () => reportsApi.dashboard().then(r => r.data) },
  ],
  '/dashboard/properties': () => [
    { queryKey: ['properties', '', 1], queryFn: () => propertyApi.list({ search: '', page: 1, page_size: 12 }).then(r => r.data) },
  ],
  '/dashboard/landlords': () => [
    { queryKey: ['landlords', '', 1], queryFn: () => landlordApi.list({ search: '', page: 1, page_size: 12 }).then(r => r.data) },
  ],
  '/dashboard/tenants': () => [
    { queryKey: ['tenants', '', 1, '', ''], queryFn: () => tenantApi.list({ search: '', page: 1, page_size: 12 }).then(r => r.data) },
  ],
  '/dashboard/units': () => [
    { queryKey: ['units', '', 'all'], queryFn: () => unitApi.list({ search: '' }).then(r => r.data.results || r.data) },
  ],
  '/dashboard/leases': () => [
    { queryKey: ['leases', '', ''], queryFn: () => leaseApi.list({ search: '' }).then(r => r.data.results || r.data) },
  ],
  '/dashboard/invoices': () => [
    { queryKey: ['invoices', '', ''], queryFn: () => invoiceApi.list({}).then(r => r.data.results || r.data) },
  ],
  '/dashboard/receipts': () => [
    { queryKey: ['receipts', ''], queryFn: () => receiptApi.list({ search: '' }).then(r => r.data.results || r.data) },
  ],
  '/dashboard/expenses': () => [
    { queryKey: ['expenses', '', '', ''], queryFn: () => expenseApi.list({}).then(r => r.data.results || r.data) },
  ],
  '/dashboard/reports': () => [
    { queryKey: ['trial-balance'], queryFn: () => reportsApi.trialBalance().then(r => r.data) },
  ],
  '/dashboard/reports/aged-analysis': () => {
    const today = new Date().toISOString().split('T')[0]
    return [
      { queryKey: ['aged-analysis', today, '', ''], queryFn: () => reportsApi.agedAnalysis({ as_of_date: today }).then(r => r.data) },
    ]
  },
  '/dashboard/accounting/journals': () => [
    { queryKey: ['journals', '', ''], queryFn: () => journalApi.list({}).then(r => r.data.results || r.data) },
  ],
  '/dashboard/accounting/chart-of-accounts': () => [
    { queryKey: ['accounts'], queryFn: () => accountApi.list().then(r => r.data.results || r.data) },
  ],
  '/dashboard/accounting/bank-accounts': () => [
    { queryKey: ['bank-accounts'], queryFn: () => bankAccountApi.list().then(r => r.data.results || r.data) },
  ],
}

// Map of entity singular names to their API modules and detail query key prefix.
// Detail pages use ['entity-singular', numericId] as query keys.
const detailApiMap: Record<string, { api: { get: (id: number) => Promise<any> }; keyPrefix: string }> = {
  properties: { api: propertyApi, keyPrefix: 'property' },
  landlords: { api: landlordApi, keyPrefix: 'landlord' },
  tenants: { api: tenantApi, keyPrefix: 'tenant' },
  units: { api: unitApi, keyPrefix: 'unit' },
  leases: { api: leaseApi, keyPrefix: 'lease' },
  invoices: { api: invoiceApi, keyPrefix: 'invoice' },
  receipts: { api: receiptApi, keyPrefix: 'receipt' },
  expenses: { api: expenseApi, keyPrefix: 'expense' },
}

export function usePrefetch() {
  const queryClient = useQueryClient()

  const prefetch = useCallback(
    (path: string) => {
      // 1. Try exact path match for list pages
      const configs = prefetchMap[path]
      if (configs) {
        for (const { queryKey, queryFn } of configs()) {
          queryClient.prefetchQuery({ queryKey, queryFn, staleTime: PREFETCH_STALE_TIME })
        }
        return
      }

      // 2. Try detail page pattern:  /dashboard/<entity>/<id>
      const detailMatch = path.match(
        /\/dashboard\/(properties|landlords|tenants|units|leases|invoices|receipts|expenses)\/(\d+)/,
      )
      if (detailMatch) {
        const [, entity, id] = detailMatch
        const config = detailApiMap[entity]
        if (config) {
          const numericId = Number(id)
          queryClient.prefetchQuery({
            queryKey: [config.keyPrefix, numericId],
            queryFn: () => config.api.get(numericId).then((r: any) => r.data),
            staleTime: PREFETCH_STALE_TIME,
          })
        }
      }
    },
    [queryClient],
  )

  return prefetch
}
