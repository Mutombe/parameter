import { useQueryClient, QueryClient } from '@tanstack/react-query'
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
  incomeTypeApi,
  expenseCategoryApi,
  auditApi,
  subsidiaryApi,
} from '../services/api'
import api from '../services/api'

const PREFETCH_STALE_TIME = 10 * 60 * 1000 // 10 minutes

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
  '/dashboard/maintenance': () => [
    { queryKey: ['maintenance-requests', { page: 1, page_size: 25 }], queryFn: () => api.get('/maintenance/requests/', { params: { page: 1, page_size: 25 } }).then(r => r.data) },
  ],
  '/dashboard/audit-trail': () => [
    { queryKey: ['audit-trail'], queryFn: () => auditApi.list().then(r => r.data.results || r.data) },
  ],
  '/dashboard/income-types': () => [
    { queryKey: ['income-types'], queryFn: () => incomeTypeApi.list().then(r => r.data.results || r.data) },
  ],
  '/dashboard/expense-categories': () => [
    { queryKey: ['expense-categories'], queryFn: () => expenseCategoryApi.list().then(r => r.data.results || r.data) },
  ],
  '/dashboard/subsidiary-ledger': () => [
    { queryKey: ['subsidiary-accounts'], queryFn: () => subsidiaryApi.list().then(r => r.data.results || r.data) },
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

// Related queries to prefetch alongside each entity's detail page.
// These are the most important sub-queries that detail pages fire on mount.
const detailRelatedQueries: Record<string, (id: number) => { queryKey: unknown[]; queryFn: () => Promise<unknown> }[]> = {
  properties: (id) => [
    { queryKey: ['property-units', id], queryFn: () => unitApi.list({ property: id }).then(r => r.data) },
    { queryKey: ['property-lease-charges', id], queryFn: () => reportsApi.leaseCharges({ property_id: id }).then(r => r.data) },
  ],
  tenants: (id) => [
    { queryKey: ['tenant-detail-view', id], queryFn: () => tenantApi.detailView(id).then(r => r.data) },
    { queryKey: ['tenant-ledger', id], queryFn: () => tenantApi.ledger(id).then(r => r.data) },
  ],
  landlords: (id) => [
    { queryKey: ['landlord-statement', id], queryFn: () => landlordApi.statement(id).then(r => r.data) },
    { queryKey: ['landlord-financial', id], queryFn: () => reportsApi.landlordStatement({ landlord_id: id }).then(r => r.data) },
  ],
  leases: (id) => [
    { queryKey: ['lease-invoices', id], queryFn: () => invoiceApi.list({ lease: id }).then(r => r.data) },
  ],
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

          // Also prefetch the most important related queries for this detail page
          const relatedFn = detailRelatedQueries[entity]
          if (relatedFn) {
            for (const { queryKey, queryFn } of relatedFn(numericId)) {
              queryClient.prefetchQuery({ queryKey, queryFn, staleTime: PREFETCH_STALE_TIME })
            }
          }
        }
      }
    },
    [queryClient],
  )

  return prefetch
}

/**
 * Prefetch all core data endpoints in parallel.
 * Call on login success to warm the cache so pages load instantly.
 */
export function prefetchAllCoreData(queryClient: QueryClient) {
  const stale = PREFETCH_STALE_TIME

  // Dashboard
  queryClient.prefetchQuery({ queryKey: ['dashboard-stats'], queryFn: () => reportsApi.dashboard().then(r => r.data), staleTime: stale })

  // Masterfile
  queryClient.prefetchQuery({ queryKey: ['properties', '', 1], queryFn: () => propertyApi.list({ search: '', page: 1, page_size: 12 }).then(r => r.data), staleTime: stale })
  queryClient.prefetchQuery({ queryKey: ['landlords', '', 1], queryFn: () => landlordApi.list({ search: '', page: 1, page_size: 12 }).then(r => r.data), staleTime: stale })
  queryClient.prefetchQuery({ queryKey: ['tenants', '', 1, '', ''], queryFn: () => tenantApi.list({ search: '', page: 1, page_size: 12 }).then(r => r.data), staleTime: stale })
  queryClient.prefetchQuery({ queryKey: ['units', '', 'all'], queryFn: () => unitApi.list({ search: '' }).then(r => r.data.results || r.data), staleTime: stale })
  queryClient.prefetchQuery({ queryKey: ['leases', '', ''], queryFn: () => leaseApi.list({ search: '' }).then(r => r.data.results || r.data), staleTime: stale })

  // Billing
  queryClient.prefetchQuery({ queryKey: ['invoices', '', ''], queryFn: () => invoiceApi.list({}).then(r => r.data.results || r.data), staleTime: stale })
  queryClient.prefetchQuery({ queryKey: ['receipts', ''], queryFn: () => receiptApi.list({ search: '' }).then(r => r.data.results || r.data), staleTime: stale })
  queryClient.prefetchQuery({ queryKey: ['expenses', '', '', ''], queryFn: () => expenseApi.list({}).then(r => r.data.results || r.data), staleTime: stale })

  // Accounting
  queryClient.prefetchQuery({ queryKey: ['accounts'], queryFn: () => accountApi.list().then(r => r.data.results || r.data), staleTime: stale })
  queryClient.prefetchQuery({ queryKey: ['journals', '', ''], queryFn: () => journalApi.list({}).then(r => r.data.results || r.data), staleTime: stale })
  queryClient.prefetchQuery({ queryKey: ['bank-accounts'], queryFn: () => bankAccountApi.list().then(r => r.data.results || r.data), staleTime: stale })
  queryClient.prefetchQuery({ queryKey: ['income-types'], queryFn: () => incomeTypeApi.list().then(r => r.data.results || r.data), staleTime: stale })
  queryClient.prefetchQuery({ queryKey: ['expense-categories'], queryFn: () => expenseCategoryApi.list().then(r => r.data.results || r.data), staleTime: stale })

  // Reports
  queryClient.prefetchQuery({ queryKey: ['trial-balance'], queryFn: () => reportsApi.trialBalance().then(r => r.data), staleTime: stale })
}
