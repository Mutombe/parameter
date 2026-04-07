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

const PREFETCH_STALE = 15 * 60 * 1000 // 15 minutes — keep prefetched data fresh long

// Detail page API map
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

// Related queries for detail pages
const detailRelatedQueries: Record<string, (id: number) => { queryKey: unknown[]; queryFn: () => Promise<unknown> }[]> = {
  properties: (id) => [
    { queryKey: ['property-units', id], queryFn: () => unitApi.list({ property: id }).then(r => r.data) },
  ],
  tenants: (id) => [
    { queryKey: ['tenant-detail-view', id], queryFn: () => tenantApi.detailView(id).then(r => r.data) },
    { queryKey: ['tenant-ledger', id, '', ''], queryFn: () => tenantApi.ledger(id).then(r => r.data) },
  ],
  landlords: (id) => [
    { queryKey: ['landlord-statement', id], queryFn: () => landlordApi.statement(id).then(r => r.data) },
  ],
  leases: (id) => [
    { queryKey: ['lease-invoices', id], queryFn: () => invoiceApi.list({ lease: id }).then(r => r.data) },
  ],
}

export function usePrefetch() {
  const queryClient = useQueryClient()

  const prefetch = useCallback(
    (path: string) => {
      // Try detail page pattern: /dashboard/<entity>/<id>
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
            staleTime: PREFETCH_STALE,
          })
          // Prefetch related queries
          const related = detailRelatedQueries[entity]
          if (related) {
            for (const { queryKey, queryFn } of related(numericId)) {
              queryClient.prefetchQuery({ queryKey, queryFn, staleTime: PREFETCH_STALE })
            }
          }
        }
      }

      // List pages are prefetched on login — no need to re-prefetch on hover
    },
    [queryClient],
  )

  return prefetch
}

/**
 * Prefetch ALL data on login. Every page's data loads in parallel.
 * Query keys MUST match exactly what each page uses.
 */
export function prefetchAllCoreData(queryClient: QueryClient) {
  const s = PREFETCH_STALE
  const pf = (queryKey: unknown[], queryFn: () => Promise<unknown>) =>
    queryClient.prefetchQuery({ queryKey, queryFn, staleTime: s })

  // ═══ DASHBOARD ═══
  pf(['dashboard-stats'], () => reportsApi.dashboard().then(r => r.data))

  // ═══ MASTERFILE LIST PAGES ═══
  // Keys match: ['entity', search, filter, page] with defaults
  pf(['properties', '', 1], () => propertyApi.list({ search: '', page: 1, page_size: 25 }).then(r => r.data))
  pf(['landlords', '', 1], () => landlordApi.list({ search: '', page: 1, page_size: 25 }).then(r => r.data))
  pf(['tenants', '', 1, '', ''], () => tenantApi.list({ search: '', page: 1, page_size: 25 }).then(r => r.data))
  pf(['leases', '', '', 1], () => leaseApi.list({ search: '', page: 1, page_size: 25 }).then(r => r.data))
  pf(['units', '', 'all'], () => unitApi.list({ search: '' }).then(r => r.data))

  // ═══ BILLING LIST PAGES ═══
  pf(['invoices', '', '', '', '', 1], () => invoiceApi.list({ page: 1, page_size: 25 }).then(r => r.data))
  pf(['receipts', '', 1], () => receiptApi.list({ search: '', page: 1, page_size: 25 }).then(r => r.data))
  pf(['expenses', '', '', '', 1], () => expenseApi.list({ page: 1, page_size: 25 }).then(r => r.data))

  // ═══ ACCOUNTING ═══
  pf(['accounts'], () => accountApi.list().then(r => r.data))
  pf(['journals', '', '', 1], () => journalApi.list({ page: 1, page_size: 25 }).then(r => r.data))
  pf(['bank-accounts'], () => bankAccountApi.list().then(r => r.data))
  pf(['income-types'], () => incomeTypeApi.list().then(r => r.data))
  pf(['expense-categories'], () => expenseCategoryApi.list().then(r => r.data))
  pf(['subsidiary-accounts'], () => subsidiaryApi.list().then(r => r.data))

  // ═══ ADMIN ═══
  pf(['audit-trail'], () => auditApi.list().then(r => r.data))
  pf(['maintenance-requests', { page: 1, page_size: 25 }], () =>
    api.get('/maintenance/requests/', { params: { page: 1, page_size: 25 } }).then(r => r.data))

  // ═══ REPORTS ═══
  pf(['trial-balance'], () => reportsApi.trialBalance().then(r => r.data))

  // ═══ FORM DROPDOWNS (pre-warm so forms open instantly) ═══
  pf(['tenants-select'], () => tenantApi.list({ page_size: 500 }).then(r => r.data.results || r.data))
  pf(['properties-list'], () => propertyApi.list().then(r => r.data.results || r.data))
  pf(['tenants-list'], () => tenantApi.list().then(r => r.data.results || r.data))
  pf(['units-all'], () => unitApi.list().then(r => r.data.results || r.data))

  // ═══ DASHBOARD SUB-ACCOUNTS ═══
  pf(['dashboard-landlord-sub-accounts'], () => subsidiaryApi.list({ entity_type: 'landlord' }).then(r => r.data))
  pf(['dashboard-tenant-sub-accounts'], () => subsidiaryApi.list({ entity_type: 'tenant' }).then(r => r.data))
}
