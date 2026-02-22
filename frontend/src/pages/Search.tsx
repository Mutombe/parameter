import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Search as SearchIcon,
  Building2,
  Users,
  Home,
  FileText,
  Receipt,
  X,
  ChevronRight,
  Sparkles,
  Clock,
  TrendingUp,
} from 'lucide-react'
import { searchApi, landlordApi, propertyApi, tenantApi, invoiceApi, leaseApi, unitApi } from '../services/api'
import { cn, useDebounce } from '../lib/utils'
import { PiUsersFour } from "react-icons/pi";
import { RiClaudeFill } from "react-icons/ri";
import { TbUserSquareRounded } from "react-icons/tb";
import { LiaUsersSolid } from "react-icons/lia";
import { PiBuildingApartmentLight } from "react-icons/pi";

interface SearchResult {
  id: number
  type: 'landlord' | 'property' | 'unit' | 'tenant' | 'invoice' | 'lease'
  title: string
  subtitle: string
  meta?: string
  href: string
  score?: number
}

const typeConfig = {
  landlord: { icon: PiUsersFour, color: 'bg-blue-100 text-blue-600', label: 'Landlord' },
  property: { icon: PiBuildingApartmentLight, color: 'bg-emerald-100 text-emerald-600', label: 'Property' },
  unit: { icon: Home, color: 'bg-purple-100 text-purple-600', label: 'Unit' },
  tenant: { icon: LiaUsersSolid, color: 'bg-orange-100 text-orange-600', label: 'Tenant' },
  invoice: { icon: Receipt, color: 'bg-cyan-100 text-cyan-600', label: 'Invoice' },
  lease: { icon: FileText, color: 'bg-rose-100 text-rose-600', label: 'Lease' },
}

// Get recent searches from localStorage
function getRecentSearches(): string[] {
  try {
    const saved = localStorage.getItem('recentSearches')
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

// Save search to recent searches
function saveRecentSearch(query: string) {
  try {
    const recent = getRecentSearches()
    const updated = [query, ...recent.filter(s => s !== query)].slice(0, 10)
    localStorage.setItem('recentSearches', JSON.stringify(updated))
  } catch {
    // Ignore localStorage errors
  }
}

// Remove a search from history
function removeRecentSearch(query: string): string[] {
  try {
    const recent = getRecentSearches()
    const updated = recent.filter(s => s !== query)
    localStorage.setItem('recentSearches', JSON.stringify(updated))
    return updated
  } catch {
    return []
  }
}

// Clear all search history
function clearAllSearchHistory(): void {
  try {
    localStorage.removeItem('recentSearches')
  } catch {
    // Ignore localStorage errors
  }
}

export default function Search() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [activeFilter, setActiveFilter] = useState<string | null>(searchParams.get('type') || null)
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches())

  // Debounce search query to avoid firing on every keystroke
  const debouncedQuery = useDebounce(query, 400)

  // Update URL when debounced query changes
  useEffect(() => {
    if (debouncedQuery) {
      setSearchParams({ q: debouncedQuery, ...(activeFilter && { type: activeFilter }) })
      saveRecentSearch(debouncedQuery)
      setRecentSearches(getRecentSearches())
    } else {
      setSearchParams({})
    }
  }, [debouncedQuery, activeFilter])

  // Use unified search API (with fallback to client-side search)
  const { data: searchData, isLoading: apiLoading, error: apiError } = useQuery({
    queryKey: ['unified-search', debouncedQuery, activeFilter],
    queryFn: () => searchApi.search({
      q: debouncedQuery,
      type: activeFilter || undefined,
      limit: 20
    }).then(r => r.data),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
    retry: 1, // Only retry once
  })

  // Fetch data for client-side search fallback when API fails
  const useClientSearch = apiError || (!apiLoading && !searchData && debouncedQuery.length >= 2)

  const { data: landlords } = useQuery({
    queryKey: ['search-landlords-fallback'],
    queryFn: () => landlordApi.list({ page_size: 100 }).then(r => r.data.results || r.data || []),
    enabled: useClientSearch && (!activeFilter || activeFilter === 'landlord'),
    staleTime: 60000,
  })

  const { data: properties } = useQuery({
    queryKey: ['search-properties-fallback'],
    queryFn: () => propertyApi.list({ page_size: 100 }).then(r => r.data.results || r.data || []),
    enabled: useClientSearch && (!activeFilter || activeFilter === 'property'),
    staleTime: 60000,
  })

  const { data: tenants } = useQuery({
    queryKey: ['search-tenants-fallback'],
    queryFn: () => tenantApi.list({ page_size: 100 }).then(r => r.data.results || r.data || []),
    enabled: useClientSearch && (!activeFilter || activeFilter === 'tenant'),
    staleTime: 60000,
  })

  const { data: invoices } = useQuery({
    queryKey: ['search-invoices-fallback'],
    queryFn: () => invoiceApi.list({ page_size: 100 }).then(r => r.data.results || r.data || []),
    enabled: useClientSearch && (!activeFilter || activeFilter === 'invoice'),
    staleTime: 60000,
  })

  // Client-side search results
  const clientResults = useMemo(() => {
    if (!useClientSearch || debouncedQuery.length < 2) return []

    const results: SearchResult[] = []
    const lowerQuery = debouncedQuery.toLowerCase()

    // Search landlords
    if (!activeFilter || activeFilter === 'landlord') {
      (landlords || []).forEach((item: any) => {
        if (
          item.name?.toLowerCase().includes(lowerQuery) ||
          item.email?.toLowerCase().includes(lowerQuery) ||
          item.phone?.includes(lowerQuery)
        ) {
          results.push({
            id: item.id,
            type: 'landlord',
            title: item.name,
            subtitle: item.email || item.phone || 'No contact',
            meta: item.landlord_type,
            href: `/dashboard/landlords?view=${item.id}`,
            score: item.name?.toLowerCase().startsWith(lowerQuery) ? 100 : 50,
          })
        }
      })
    }

    // Search properties
    if (!activeFilter || activeFilter === 'property') {
      (properties || []).forEach((item: any) => {
        if (
          item.name?.toLowerCase().includes(lowerQuery) ||
          item.address?.toLowerCase().includes(lowerQuery) ||
          item.city?.toLowerCase().includes(lowerQuery)
        ) {
          results.push({
            id: item.id,
            type: 'property',
            title: item.name,
            subtitle: item.address || item.city || '',
            meta: `${item.total_units || 0} units`,
            href: `/dashboard/properties?view=${item.id}`,
            score: item.name?.toLowerCase().startsWith(lowerQuery) ? 100 : 50,
          })
        }
      })
    }

    // Search tenants
    if (!activeFilter || activeFilter === 'tenant') {
      (tenants || []).forEach((item: any) => {
        if (
          item.name?.toLowerCase().includes(lowerQuery) ||
          item.email?.toLowerCase().includes(lowerQuery) ||
          item.phone?.includes(lowerQuery)
        ) {
          results.push({
            id: item.id,
            type: 'tenant',
            title: item.name,
            subtitle: item.email || item.phone || 'No contact',
            meta: item.is_active ? 'Active' : 'Inactive',
            href: `/dashboard/tenants?view=${item.id}`,
            score: item.name?.toLowerCase().startsWith(lowerQuery) ? 100 : 50,
          })
        }
      })
    }

    // Search invoices
    if (!activeFilter || activeFilter === 'invoice') {
      (invoices || []).forEach((item: any) => {
        if (
          item.invoice_number?.toLowerCase().includes(lowerQuery) ||
          item.tenant_name?.toLowerCase().includes(lowerQuery)
        ) {
          results.push({
            id: item.id,
            type: 'invoice',
            title: item.invoice_number,
            subtitle: item.tenant_name || 'Unknown tenant',
            meta: `$${item.total_amount || item.amount || 0}`,
            href: `/dashboard/invoices?view=${item.id}`,
            score: item.invoice_number?.toLowerCase().startsWith(lowerQuery) ? 100 : 50,
          })
        }
      })
    }

    // Sort by score
    results.sort((a, b) => (b.score || 0) - (a.score || 0))
    return results.slice(0, 20)
  }, [useClientSearch, debouncedQuery, activeFilter, landlords, properties, tenants, invoices])

  // Get suggestions for autocomplete (uses debounced query to avoid per-keystroke calls)
  const { data: suggestionsData } = useQuery({
    queryKey: ['search-suggestions', debouncedQuery],
    queryFn: () => searchApi.suggestions(debouncedQuery).then(r => r.data),
    enabled: debouncedQuery.length >= 1 && debouncedQuery.length < 3 && !useClientSearch,
    staleTime: 10000,
  })

  // Use API results if available, otherwise use client-side results
  const results: SearchResult[] = useClientSearch
    ? clientResults
    : (searchData?.results?.map((r: any) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        subtitle: r.subtitle,
        meta: r.meta,
        href: r.href,
        score: r.score,
      })) || [])

  const totalCount = useClientSearch ? clientResults.length : (searchData?.total || 0)
  const isLoading = apiLoading && !useClientSearch
  const error = apiError && clientResults.length === 0

  const filters = [
    { key: null, label: 'All', count: totalCount },
    { key: 'landlord', label: 'Landlords' },
    { key: 'property', label: 'Properties' },
    { key: 'unit', label: 'Units' },
    { key: 'tenant', label: 'Tenants' },
    { key: 'invoice', label: 'Invoices' },
    { key: 'lease', label: 'Leases' },
  ]

  const handleResultClick = (result: SearchResult) => {
    navigate(result.href)
  }

  const handleFilterChange = (filter: string | null) => {
    setActiveFilter(filter)
    if (query) {
      setSearchParams({ q: query, ...(filter && { type: filter }) })
    }
  }

  const handleRecentSearchClick = (searchTerm: string) => {
    setQuery(searchTerm)
  }

  const handleClearSearch = () => {
    setQuery('')
    setSearchParams({})
  }

  const handleRemoveFromHistory = (searchTerm: string) => {
    const updated = removeRecentSearch(searchTerm)
    setRecentSearches(updated)
  }

  const handleClearAllHistory = () => {
    clearAllSearchHistory()
    setRecentSearches([])
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <button onClick={() => navigate('/dashboard')} className="hover:text-gray-900 transition-colors">Dashboard</button>
        <span>/</span>
        <span className="text-gray-900 font-medium">Search</span>
      </nav>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Search</h1>
          <p className="text-gray-500 mt-1">
            Find anything across your property management system
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <span>Powered by intelligent search</span>
        </div>
      </div>

      {/* Search Box */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-6">
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for properties, tenants, invoices, units, leases..."
              className="w-full pl-12 pr-12 py-4 text-lg bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:placeholder:text-slate-500"
              autoFocus
            />
            {query && (
              <button
                onClick={handleClearSearch}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="mt-4 flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.key || 'all'}
                onClick={() => handleFilterChange(filter.key)}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-lg transition-all',
                  activeFilter === filter.key
                    ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {filter.label}
                {filter.key === null && totalCount > 0 && (
                  <span className="ml-1.5 text-xs opacity-70">({totalCount})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Recent Searches (shown when no query) */}
        {!query && recentSearches.length > 0 && (
          <div className="px-6 pb-6 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Clock className="w-4 h-4" />
                <span>Recent searches</span>
              </div>
              <button
                onClick={handleClearAllHistory}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((search, idx) => (
                <div
                  key={idx}
                  className="group flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <button
                    onClick={() => handleRecentSearchClick(search)}
                    className="hover:text-primary-600"
                  >
                    {search}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveFromHistory(search)
                    }}
                    className="ml-1 p-0.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div>
            {/* Results Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary-500" />
                <span className="text-sm font-medium text-gray-700">Searching...</span>
              </div>
            </div>

            {/* Skeleton Results */}
            <div className="divide-y divide-gray-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-4 animate-pulse">
                  <div className="w-10 h-10 rounded-lg bg-gray-200 flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="h-4 w-48 bg-gray-200 rounded" />
                    <div className="h-3 w-32 bg-gray-200 rounded" />
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="h-4 w-16 bg-gray-200 rounded hidden sm:block" />
                    <div className="h-6 w-16 bg-gray-200 rounded-lg" />
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <X className="w-6 h-6 text-red-500" />
            </div>
            <p className="text-gray-900 font-medium mt-3">Search Error</p>
            <p className="text-gray-500 mt-1">Unable to complete search. Please try again.</p>
          </div>
        ) : debouncedQuery.length < 2 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
              <SearchIcon className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-900 font-medium mt-4">Start typing to search</p>
            <p className="text-gray-500 mt-1">Enter at least 2 characters to search across all records</p>

            {/* Quick Actions */}
            <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
              {[
                { label: 'View Landlords', href: '/dashboard/landlords', icon: PiUsersFour, color: 'text-blue-500' },
                { label: 'View Properties', href: '/dashboard/properties', icon: PiBuildingApartmentLight, color: 'text-emerald-500' },
                { label: 'View Tenants', href: '/dashboard/tenants', icon: LiaUsersSolid, color: 'text-orange-500' },
              ].map((action) => (
                <button
                  key={action.href}
                  onClick={() => navigate(action.href)}
                  className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <action.icon className={cn('w-5 h-5', action.color)} />
                  <span className="text-sm font-medium text-gray-700">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : results.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
              <SearchIcon className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-900 font-medium mt-4">No results found</p>
            <p className="text-gray-500 mt-1">
              No matches for "{debouncedQuery}". Try a different search term or filter.
            </p>
          </div>
        ) : (
          <div>
            {/* Results Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary-500" />
                <span className="text-sm font-medium text-gray-700">
                  {totalCount} result{totalCount !== 1 && 's'} found
                </span>
              </div>
              <span className="text-xs text-gray-500">
                Sorted by relevance
              </span>
            </div>

            {/* Results List */}
            <div className="divide-y divide-gray-100">
              {results.map((result, index) => {
                const config = typeConfig[result.type]
                const Icon = config?.icon || SearchIcon
                return (
                  <motion.button
                    key={`${result.type}-${result.id}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => handleResultClick(result)}
                    className="w-full px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left group"
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                      config?.color || 'bg-gray-100 text-gray-600'
                    )}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{result.title}</p>
                      <p className="text-sm text-gray-500 truncate">{result.subtitle}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {result.meta && (
                        <span className="text-sm text-gray-500 hidden sm:block">{result.meta}</span>
                      )}
                      <span className={cn(
                        'px-2.5 py-1 text-xs font-medium rounded-lg',
                        config?.color || 'bg-gray-100 text-gray-600'
                      )}>
                        {config?.label || result.type}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </motion.button>
                )
              })}
            </div>

            {/* Load More (if needed) */}
            {results.length < totalCount && (
              <div className="px-6 py-4 border-t border-gray-100 text-center">
                <p className="text-sm text-gray-500">
                  Showing {results.length} of {totalCount} results
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
