import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Search, X, Building2, Users, Home, FileText, CreditCard, Receipt,
  BarChart3, Settings, Plus, ArrowRight, Clock, Command,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn, useDebounce } from '../lib/utils'
import { useUIStore } from '../stores/uiStore'
import { useChainStore, type EntityType } from '../stores/chainStore'
import { searchApi } from '../services/api'

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  action: () => void
  group: string
}

// NLP: Parse natural language queries into navigation + filter actions
function parseNLPQuery(query: string): { route?: string; params?: Record<string, string>; label?: string } | null {
  const q = query.toLowerCase().trim()

  // "show/go to unpaid invoices" → invoices page with status filter
  if (/(?:show|list|view|go to|find)\s+(?:unpaid|outstanding|overdue)\s+invoices?/.test(q)) {
    return { route: '/dashboard/invoices?status=unpaid', label: 'View unpaid invoices' }
  }
  if (/(?:show|list|view)\s+(?:paid)\s+invoices?/.test(q)) {
    return { route: '/dashboard/invoices?status=paid', label: 'View paid invoices' }
  }
  // "unpaid invoices from january" or "invoices from jan"
  const monthMatch = q.match(/invoices?\s+(?:from|in|for)\s+(\w+)/)
  if (monthMatch) {
    return { route: `/dashboard/invoices?month=${monthMatch[1]}`, label: `Invoices from ${monthMatch[1]}` }
  }
  // "receipts this month"
  if (/receipts?\s+(?:this|current)\s+month/.test(q)) {
    return { route: '/dashboard/receipts', label: 'Receipts this month' }
  }
  // "vacant units" / "empty units"
  if (/(?:vacant|empty|available)\s+units?/.test(q)) {
    return { route: '/dashboard/units?status=vacant', label: 'View vacant units' }
  }
  // "expiring leases"
  if (/(?:expiring|ending)\s+leases?/.test(q)) {
    return { route: '/dashboard/leases?status=expiring', label: 'Expiring leases' }
  }
  // "aged analysis" / "aging report"
  if (/(?:aged|aging)\s+(?:analysis|report|receivable)/.test(q)) {
    return { route: '/dashboard/reports/aged-analysis', label: 'Aged analysis report' }
  }
  // "revenue report" / "income report"
  if (/(?:revenue|income|financial)\s+(?:report|summary)/.test(q)) {
    return { route: '/dashboard/reports?report=income-expenditure', label: 'Revenue report' }
  }
  // "expenses for [month]"
  const expenseMonth = q.match(/expenses?\s+(?:from|in|for)\s+(\w+)/)
  if (expenseMonth) {
    return { route: `/dashboard/expenses?month=${expenseMonth[1]}`, label: `Expenses for ${expenseMonth[1]}` }
  }
  // "add/create/new [entity]"
  if (/(?:add|create|new)\s+(?:a\s+)?landlord/.test(q)) {
    return { route: '#create-landlord', label: 'Create new landlord' }
  }
  if (/(?:add|create|new)\s+(?:a\s+)?tenant/.test(q)) {
    return { route: '#create-tenant', label: 'Create new tenant' }
  }
  if (/(?:add|create|new)\s+(?:a\s+)?property/.test(q)) {
    return { route: '#create-property', label: 'Create new property' }
  }

  return null
}

const RECENT_SEARCHES_KEY = 'command_palette_recent'

function getRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY)
    return stored ? JSON.parse(stored) : []
  } catch { return [] }
}

function addRecentSearch(query: string) {
  try {
    const recent = getRecentSearches().filter(s => s !== query)
    const next = [query, ...recent].slice(0, 5)
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next))
  } catch {}
}

export default function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore()
  const startChain = useChainStore(s => s.startChain)
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(query, 200)

  // Search API results
  const { data: searchResults } = useQuery({
    queryKey: ['command-palette-search', debouncedQuery],
    queryFn: () => searchApi.suggestions(debouncedQuery).then(r => r.data),
    enabled: commandPaletteOpen && debouncedQuery.length >= 2,
    staleTime: 10000,
  })

  // Focus input when opened
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setHighlightedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  const close = useCallback(() => {
    setCommandPaletteOpen(false)
    setQuery('')
  }, [setCommandPaletteOpen])

  // Build command items
  const buildItems = useCallback((): CommandItem[] => {
    const items: CommandItem[] = []
    const q = query.toLowerCase()

    // Quick actions (always shown, filtered by query)
    const quickActions: CommandItem[] = [
      {
        id: 'create-landlord',
        label: 'Create Landlord',
        description: 'Add a new landlord to the system',
        icon: <Plus className="w-4 h-4" />,
        action: () => { close(); startChain('landlord') },
        group: 'Quick Actions',
      },
      {
        id: 'create-tenant',
        label: 'Create Tenant',
        description: 'Add a new tenant',
        icon: <Plus className="w-4 h-4" />,
        action: () => { close(); startChain('tenant') },
        group: 'Quick Actions',
      },
      {
        id: 'create-property',
        label: 'Create Property',
        description: 'Add a new property',
        icon: <Plus className="w-4 h-4" />,
        action: () => { close(); startChain('property' as EntityType) },
        group: 'Quick Actions',
      },
    ]

    // Navigation items
    const navItems: CommandItem[] = [
      { id: 'nav-dashboard', label: 'Dashboard', icon: <BarChart3 className="w-4 h-4" />, action: () => { close(); navigate('/dashboard') }, group: 'Navigation' },
      { id: 'nav-landlords', label: 'Landlords', icon: <Building2 className="w-4 h-4" />, action: () => { close(); navigate('/dashboard/landlords') }, group: 'Navigation' },
      { id: 'nav-properties', label: 'Properties', icon: <Home className="w-4 h-4" />, action: () => { close(); navigate('/dashboard/properties') }, group: 'Navigation' },
      { id: 'nav-tenants', label: 'Tenants', icon: <Users className="w-4 h-4" />, action: () => { close(); navigate('/dashboard/tenants') }, group: 'Navigation' },
      { id: 'nav-leases', label: 'Leases', icon: <FileText className="w-4 h-4" />, action: () => { close(); navigate('/dashboard/leases') }, group: 'Navigation' },
      { id: 'nav-invoices', label: 'Invoices', icon: <FileText className="w-4 h-4" />, action: () => { close(); navigate('/dashboard/invoices') }, group: 'Navigation' },
      { id: 'nav-receipts', label: 'Receipts', icon: <CreditCard className="w-4 h-4" />, action: () => { close(); navigate('/dashboard/receipts') }, group: 'Navigation' },
      { id: 'nav-expenses', label: 'Expenses', icon: <Receipt className="w-4 h-4" />, action: () => { close(); navigate('/dashboard/expenses') }, group: 'Navigation' },
      { id: 'nav-reports', label: 'Reports', icon: <BarChart3 className="w-4 h-4" />, action: () => { close(); navigate('/dashboard/reports') }, group: 'Navigation' },
      { id: 'nav-settings', label: 'Settings', icon: <Settings className="w-4 h-4" />, action: () => { close(); navigate('/dashboard/settings') }, group: 'Navigation' },
    ]

    // Filter items by query
    if (q) {
      // NLP: Try to parse natural language first
      const nlpResult = parseNLPQuery(query)
      if (nlpResult) {
        items.push({
          id: 'nlp-result',
          label: nlpResult.label || query,
          description: nlpResult.route?.replace('/dashboard/', '') || '',
          icon: <Command className="w-4 h-4" />,
          action: () => {
            close()
            addRecentSearch(query)
            if (nlpResult.route?.startsWith('#create-')) {
              const entity = nlpResult.route.replace('#create-', '')
              startChain(entity as EntityType)
            } else if (nlpResult.route) {
              navigate(nlpResult.route)
            }
          },
          group: 'Suggested Action',
        })
      }

      const filtered = [...quickActions, ...navItems].filter(
        item => item.label.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)
      )
      items.push(...filtered)

      // Add search results from API
      if (searchResults?.results) {
        searchResults.results.slice(0, 5).forEach((result: any, i: number) => {
          items.push({
            id: `search-${i}`,
            label: result.title || result.name || result.text,
            description: result.type ? `${result.type}` : undefined,
            icon: <ArrowRight className="w-4 h-4" />,
            action: () => {
              close()
              addRecentSearch(query)
              if (result.url) navigate(result.url)
            },
            group: 'Search Results',
          })
        })
      }
    } else {
      // Show recent searches and quick actions when no query
      const recent = getRecentSearches()
      recent.forEach((term, i) => {
        items.push({
          id: `recent-${i}`,
          label: term,
          icon: <Clock className="w-4 h-4" />,
          action: () => setQuery(term),
          group: 'Recent Searches',
        })
      })
      items.push(...quickActions)
      items.push(...navItems)
    }

    return items
  }, [query, searchResults, close, navigate, startChain])

  const items = buildItems()

  // Group items
  const groups: { label: string; items: CommandItem[] }[] = []
  const groupOrder: string[] = []
  items.forEach(item => {
    if (!groupOrder.includes(item.group)) groupOrder.push(item.group)
    let group = groups.find(g => g.label === item.group)
    if (!group) {
      group = { label: item.group, items: [] }
      groups.push(group)
    }
    group.items.push(item)
  })
  groups.sort((a, b) => groupOrder.indexOf(a.label) - groupOrder.indexOf(b.label))

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev => prev < items.length - 1 ? prev + 1 : 0)
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : items.length - 1)
        break
      case 'Enter':
        e.preventDefault()
        if (items[highlightedIndex]) {
          items[highlightedIndex].action()
        }
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
    }
  }

  // Scroll highlighted into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const els = listRef.current.querySelectorAll('[data-command-item]')
      const el = els[highlightedIndex] as HTMLElement
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  // Reset highlight when items change
  useEffect(() => {
    setHighlightedIndex(0)
  }, [query])

  if (!commandPaletteOpen) return null

  let flatIndex = -1

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl z-[61]"
          >
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden dark:bg-slate-900 dark:border-slate-600">
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
                <Search className="w-5 h-5 text-gray-400 shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search or type a command..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 text-sm bg-transparent outline-none text-gray-900 placeholder:text-gray-400 dark:text-slate-200 dark:placeholder:text-slate-500"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="p-1 text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
                <kbd className="hidden sm:inline-flex px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded border border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-80 overflow-y-auto" ref={listRef}>
                {items.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500">
                    No results found for "{query}"
                  </div>
                ) : (
                  groups.map(group => (
                    <div key={group.label}>
                      <div className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-slate-800/50 dark:text-slate-500">
                        {group.label}
                      </div>
                      {group.items.map(item => {
                        flatIndex++
                        const idx = flatIndex
                        return (
                          <button
                            key={item.id}
                            data-command-item
                            onClick={item.action}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                            className={cn(
                              'w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                              idx === highlightedIndex
                                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                                : 'text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800'
                            )}
                          >
                            <span className="text-gray-400 shrink-0">{item.icon}</span>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{item.label}</span>
                              {item.description && (
                                <span className="ml-2 text-xs text-gray-400">{item.description}</span>
                              )}
                            </div>
                            {idx === highlightedIndex && (
                              <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500">
                <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white border rounded text-[10px] dark:bg-slate-700 dark:border-slate-600">↑↓</kbd> Navigate</span>
                <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white border rounded text-[10px] dark:bg-slate-700 dark:border-slate-600">↵</kbd> Select</span>
                <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white border rounded text-[10px] dark:bg-slate-700 dark:border-slate-600">esc</kbd> Close</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
