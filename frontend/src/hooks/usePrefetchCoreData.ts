import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  tenantApi, unitApi, propertyApi, landlordApi, leaseApi,
  invoiceApi, receiptApi,
} from '../services/api'

const PAGE_SIZE = 25

/**
 * Warm the cache for every main list page the moment the dashboard shell
 * mounts, so the first click on Tenants / Leases / Units / Properties /
 * Landlords / Invoices / Receipts renders instantly from cache (global
 * staleTime keeps it fresh for 10 minutes; mutations invalidate their own
 * keys). The keys and params below mirror each page's default first-page
 * query EXACTLY — if a page's key shape changes, update it here too, or the
 * prefetch silently stops matching (harmless, but wasted).
 *
 * Also acts as a keep-warm: the burst of requests right after login wakes
 * the backend and its DB before the user starts navigating.
 */
export function usePrefetchCoreData() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const t = setTimeout(() => {
      const jobs: Array<{ key: any[]; fn: () => Promise<any> }> = [
        {
          key: ['tenants', '', 1, '', '', ''],
          fn: () => tenantApi.list({ account_type: 'rental', search: '', page: 1, page_size: PAGE_SIZE }).then(r => r.data),
        },
        {
          key: ['units', '', 'all', 1],
          fn: () => unitApi.list({ search: '', page: 1, page_size: PAGE_SIZE }).then(r => r.data),
        },
        {
          key: ['properties', '', 1],
          fn: () => propertyApi.list({ search: '', page: 1, page_size: PAGE_SIZE }).then(r => r.data),
        },
        {
          key: ['landlords', '', 1],
          fn: () => landlordApi.list({ search: '', page: 1, page_size: PAGE_SIZE }).then(r => r.data),
        },
        {
          key: ['leases', '', '', 1],
          fn: () => leaseApi.list({ search: '', page: 1, page_size: PAGE_SIZE }).then(r => r.data),
        },
        {
          key: ['invoices', '', '', '', '', 1],
          fn: () => invoiceApi.list({ page: 1, page_size: PAGE_SIZE }).then(r => r.data),
        },
        {
          key: ['receipts', '', 1],
          fn: () => receiptApi.list({ search: '', page: 1, page_size: PAGE_SIZE }).then(r => r.data),
        },
      ]
      for (const { key, fn } of jobs) {
        queryClient.prefetchQuery({ queryKey: key, queryFn: fn })
      }
    }, 800) // let the landing page's own queries go first
    return () => clearTimeout(t)
  }, [queryClient])
}
