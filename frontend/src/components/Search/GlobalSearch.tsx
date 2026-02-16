import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  X,
  Building2,
  Users,
  UserCheck,
  Receipt,
  Home,
  ArrowRight,
  ExternalLink,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { landlordApi, propertyApi, tenantApi, invoiceApi } from '../../services/api'
import { cn } from '../../lib/utils'
import { PiUsersFour } from "react-icons/pi";
import { TbUserSquareRounded } from "react-icons/tb";
import { LiaUsersSolid } from "react-icons/lia";
import { PiBuildingApartmentLight } from "react-icons/pi";

interface SearchResult {
  id: number
  type: 'landlord' | 'property' | 'tenant' | 'invoice' | 'unit'
  title: string
  subtitle: string
  icon: React.ElementType
  href: string
}

interface GlobalSearchProps {
  open: boolean
  onClose: () => void
}

export default function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  // Fetch data for search — share cache with list views for instant results
  const { data: landlords } = useQuery({
    queryKey: ['landlords'],
    queryFn: () => landlordApi.list().then(r => r.data.results || r.data || []),
    enabled: open,
    staleTime: 5 * 60 * 1000, // 5 min — reuse cached data
  })

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => propertyApi.list().then(r => r.data.results || r.data || []),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const { data: tenants } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => tenantApi.list().then(r => r.data.results || r.data || []),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  // Build search results
  const results: SearchResult[] = []

  if (query.length >= 2) {
    const lowerQuery = query.toLowerCase()

    // Search landlords
    landlords?.forEach((item: any) => {
      if (item.name?.toLowerCase().includes(lowerQuery) || item.email?.toLowerCase().includes(lowerQuery)) {
        results.push({
          id: item.id,
          type: 'landlord',
          title: item.name,
          subtitle: item.email || item.phone,
          icon: PiUsersFour,
          href: `/dashboard/landlords?view=${item.id}`,
        })
      }
    })

    // Search properties
    properties?.forEach((item: any) => {
      if (item.name?.toLowerCase().includes(lowerQuery) || item.address?.toLowerCase().includes(lowerQuery)) {
        results.push({
          id: item.id,
          type: 'property',
          title: item.name,
          subtitle: item.address || `${item.total_units || 0} units`,
          icon: PiBuildingApartmentLight,
          href: `/dashboard/properties?view=${item.id}`,
        })
      }
    })

    // Search tenants
    tenants?.forEach((item: any) => {
      if (item.name?.toLowerCase().includes(lowerQuery) || item.email?.toLowerCase().includes(lowerQuery)) {
        results.push({
          id: item.id,
          type: 'tenant',
          title: item.name,
          subtitle: item.email || item.phone,
          icon: UserCheck,
          href: `/dashboard/tenants?view=${item.id}`,
        })
      }
    })
  }

  // Quick links when no query
  const quickLinks: SearchResult[] = [
    { id: 1, type: 'landlord', title: 'Landlords', subtitle: 'Manage property owners', icon: PiUsersFour, href: '/dashboard/landlords' },
    { id: 2, type: 'property', title: 'Properties', subtitle: 'View all properties', icon: PiBuildingApartmentLight, href: '/dashboard/properties' },
    { id: 3, type: 'tenant', title: 'Tenants', subtitle: 'Manage tenants', icon: LiaUsersSolid, href: '/dashboard/tenants' },
    { id: 4, type: 'invoice', title: 'Invoices', subtitle: 'Billing & invoices', icon: Receipt, href: '/dashboard/invoices' },
    { id: 5, type: 'unit', title: 'Units', subtitle: 'Property units', icon: Home, href: '/dashboard/units' },
  ]

  const displayResults = query.length >= 2 ? results : quickLinks

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((prev) => Math.min(prev + 1, displayResults.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && displayResults[activeIndex]) {
        e.preventDefault()
        handleSelect(displayResults[activeIndex])
      } else if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, activeIndex, displayResults])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      setQuery('')
      setActiveIndex(0)
    }
  }, [open])

  const handleSelect = (result: SearchResult) => {
    navigate(result.href)
    onClose()
  }

  const typeColors = {
    landlord: 'bg-blue-50 text-blue-600',
    property: 'bg-purple-50 text-purple-600',
    tenant: 'bg-green-50 text-green-600',
    invoice: 'bg-orange-50 text-orange-600',
    unit: 'bg-cyan-50 text-cyan-600',
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl bg-white rounded-2xl shadow-2xl dark:shadow-black/30 z-50 overflow-hidden"
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 border-b border-gray-100">
              <Search className="w-5 h-5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
                placeholder="Search properties, tenants, landlords..."
                className="flex-1 py-4 text-base outline-none bg-transparent placeholder:text-gray-400 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
              <div className="flex items-center gap-1 text-xs text-gray-400 border-l border-gray-200 pl-3">
                <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">esc</kbd>
                <span>to close</span>
              </div>
            </div>

            {/* Results */}
            <div className="max-h-[400px] overflow-y-auto p-2">
              {query.length >= 2 && results.length === 0 ? (
                <div className="py-12 text-center">
                  <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No results found for "{query}"</p>
                  <p className="text-sm text-gray-400 mt-1">Try searching for something else</p>
                </div>
              ) : (
                <>
                  {query.length < 2 && (
                    <p className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Quick Links
                    </p>
                  )}
                  {query.length >= 2 && results.length > 0 && (
                    <p className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      {results.length} Results
                    </p>
                  )}
                  {displayResults.map((result, index) => {
                    const Icon = result.icon
                    return (
                      <button
                        key={`${result.type}-${result.id}`}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all',
                          activeIndex === index ? 'bg-primary-50' : 'hover:bg-gray-50'
                        )}
                      >
                        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', typeColors[result.type])}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className={cn(
                            'text-sm font-medium',
                            activeIndex === index ? 'text-primary-700' : 'text-gray-900'
                          )}>
                            {result.title}
                          </p>
                          <p className="text-xs text-gray-500">{result.subtitle}</p>
                        </div>
                        {activeIndex === index && (
                          <ArrowRight className="w-4 h-4 text-primary-500" />
                        )}
                      </button>
                    )
                  })}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-500">↑</kbd>
                  <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-500">↓</kbd>
                  <span>to navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-500">↵</kbd>
                  <span>to select</span>
                </span>
              </div>
              <button
                onClick={() => { navigate(`/search${query ? `?q=${encodeURIComponent(query)}` : ''}`); onClose(); }}
                className="flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
              >
                <span>Advanced Search</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
