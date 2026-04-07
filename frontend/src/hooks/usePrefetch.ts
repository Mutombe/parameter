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
 * Prefetch ALL data on login + seed every item into detail cache.
 * When user clicks any item in any list, detail data is already there.
 */
export function prefetchAllCoreData(queryClient: QueryClient) {
  const s = PREFETCH_STALE

  // Helper: fetch list, cache list result, AND seed each item into detail cache
  const fetchAndSeed = async (
    listKey: unknown[],
    listFn: () => Promise<any>,
    detailPrefix: string,
  ) => {
    try {
      const data = await listFn()
      queryClient.setQueryData(listKey, data)
      // Seed individual items from results
      const items = data?.results || (Array.isArray(data) ? data : [])
      for (const item of items) {
        if (item.id) {
          queryClient.setQueryData([detailPrefix, item.id], item)
        }
      }
    } catch { /* silent */ }
  }

  // Helper: simple prefetch without seeding
  const pf = (queryKey: unknown[], queryFn: () => Promise<unknown>) =>
    queryClient.prefetchQuery({ queryKey, queryFn, staleTime: s })

  // ═══ DASHBOARD ═══
  pf(['dashboard-stats'], () => reportsApi.dashboard().then(r => r.data))

  // ═══ MASTERFILE — fetch + seed detail cache ═══
  fetchAndSeed(
    ['properties', '', 1],
    () => propertyApi.list({ search: '', page: 1, page_size: 25 }).then(r => r.data),
    'property',
  )
  fetchAndSeed(
    ['landlords', '', 1],
    () => landlordApi.list({ search: '', page: 1, page_size: 25 }).then(r => r.data),
    'landlord',
  )
  fetchAndSeed(
    ['tenants', '', 1, '', ''],
    () => tenantApi.list({ search: '', page: 1, page_size: 25 }).then(r => r.data),
    'tenant',
  )
  fetchAndSeed(
    ['leases', '', '', 1],
    () => leaseApi.list({ search: '', page: 1, page_size: 25 }).then(r => r.data),
    'lease',
  )
  fetchAndSeed(
    ['units', '', 'all'],
    () => unitApi.list({ search: '' }).then(r => r.data),
    'unit',
  )

  // ═══ BILLING — fetch + seed ═══
  fetchAndSeed(
    ['invoices', '', '', '', '', 1],
    () => invoiceApi.list({ page: 1, page_size: 25 }).then(r => r.data),
    'invoice',
  )
  fetchAndSeed(
    ['receipts', '', 1],
    () => receiptApi.list({ search: '', page: 1, page_size: 25 }).then(r => r.data),
    'receipt',
  )
  fetchAndSeed(
    ['expenses', '', '', '', 1],
    () => expenseApi.list({ page: 1, page_size: 25 }).then(r => r.data),
    'expense',
  )

  // ═══ ACCOUNTING ═══
  pf(['accounts'], () => accountApi.list().then(r => r.data))
  fetchAndSeed(
    ['journals', '', '', 1],
    () => journalApi.list({ page: 1, page_size: 25 }).then(r => r.data),
    'journal',
  )
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

  // ═══ FORM DROPDOWNS ═══
  pf(['tenants-select'], () => tenantApi.list({ page_size: 500 }).then(r => r.data.results || r.data))
  pf(['properties-list'], () => propertyApi.list().then(r => r.data.results || r.data))
  pf(['tenants-list'], () => tenantApi.list().then(r => r.data.results || r.data))
  pf(['units-all'], () => unitApi.list().then(r => r.data.results || r.data))

  // ═══ DASHBOARD SUB-ACCOUNTS ═══
  pf(['dashboard-landlord-sub-accounts'], () => subsidiaryApi.list({ entity_type: 'landlord' }).then(r => r.data))
  pf(['dashboard-tenant-sub-accounts'], () => subsidiaryApi.list({ entity_type: 'tenant' }).then(r => r.data))

  // ═══ DETAIL PAGE SUB-QUERIES ═══
  // After list data arrives, also prefetch detail sub-queries for the first few items
  setTimeout(() => {
    // Seed tenant detail views for visible tenants
    const tenantCache = queryClient.getQueryData(['tenants', '', 1, '', '']) as any
    const tenantItems = tenantCache?.results || (Array.isArray(tenantCache) ? tenantCache : [])
    for (const t of tenantItems.slice(0, 10)) {
      if (t.id) {
        pf(['tenant-detail-view', t.id], () => tenantApi.detailView(t.id).then(r => r.data))
        pf(['tenant-ledger', t.id, '', ''], () => tenantApi.ledger(t.id).then(r => r.data))
      }
    }

    // Seed landlord detail views
    const landlordCache = queryClient.getQueryData(['landlords', '', 1]) as any
    const landlordItems = landlordCache?.results || (Array.isArray(landlordCache) ? landlordCache : [])
    for (const l of landlordItems.slice(0, 10)) {
      if (l.id) {
        pf(['landlord-statement', l.id], () => landlordApi.statement(l.id).then(r => r.data))
      }
    }

    // Seed property detail views
    const propCache = queryClient.getQueryData(['properties', '', 1]) as any
    const propItems = propCache?.results || (Array.isArray(propCache) ? propCache : [])
    for (const p of propItems.slice(0, 10)) {
      if (p.id) {
        pf(['property-units', p.id], () => unitApi.list({ property: p.id }).then(r => r.data))
      }
    }
  }, 3000) // Wait 3s for list fetches to complete, then seed detail queries
}
