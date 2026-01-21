import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Loader2, Search, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Skeleton } from './Skeleton'

interface Option {
  value: string | number
  label: string
  description?: string
  icon?: React.ReactNode
}

interface AsyncSelectProps {
  label?: string
  placeholder?: string
  value: string | number
  onChange: (value: string | number) => void
  options: Option[]
  isLoading?: boolean
  error?: string
  required?: boolean
  disabled?: boolean
  searchable?: boolean
  className?: string
  emptyMessage?: string
}

export function AsyncSelect({
  label,
  placeholder = 'Select...',
  value,
  onChange,
  options,
  isLoading = false,
  error,
  required = false,
  disabled = false,
  searchable = false,
  className,
  emptyMessage = 'No options available',
}: AsyncSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen, searchable])

  const selectedOption = options.find(opt => String(opt.value) === String(value))

  const filteredOptions = searchTerm
    ? options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        opt.description?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options

  const handleSelect = (optionValue: string | number) => {
    onChange(optionValue)
    setIsOpen(false)
    setSearchTerm('')
  }

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2.5 text-left text-sm bg-white border rounded-xl transition-all',
          isOpen ? 'border-primary-500 ring-2 ring-primary-100' : 'border-gray-200 hover:border-gray-300',
          disabled && 'opacity-50 cursor-not-allowed bg-gray-50',
          error && 'border-red-300 focus:ring-red-100'
        )}
      >
        <span className={cn('truncate', !selectedOption && 'text-gray-400')}>
          {selectedOption ? (
            <span className="flex items-center gap-2">
              {selectedOption.icon}
              {selectedOption.label}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown className={cn(
          'w-4 h-4 text-gray-400 transition-transform',
          isOpen && 'rotate-180'
        )} />
      </button>

      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden animate-slide-up">
          {/* Search input */}
          {searchable && (
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Options list */}
          <div className="max-h-60 overflow-y-auto">
            {isLoading ? (
              // Loading skeleton
              <div className="p-2 space-y-1">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
                    <Skeleton className="w-5 h-5 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className={cn('h-4 rounded', i % 2 === 0 ? 'w-3/4' : 'w-1/2')} />
                      <Skeleton className="h-3 w-2/3 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredOptions.length === 0 ? (
              // Empty state
              <div className="p-4 text-center text-sm text-gray-500">
                {searchTerm ? 'No matching options' : emptyMessage}
              </div>
            ) : (
              // Options
              <div className="p-1">
                {filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm rounded-lg transition-colors',
                      String(option.value) === String(value)
                        ? 'bg-primary-50 text-primary-700'
                        : 'hover:bg-gray-50 text-gray-700'
                    )}
                  >
                    {option.icon && (
                      <span className="flex-shrink-0 text-gray-400">
                        {option.icon}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{option.label}</div>
                      {option.description && (
                        <div className="text-xs text-gray-500 truncate">{option.description}</div>
                      )}
                    </div>
                    {String(option.value) === String(value) && (
                      <div className="w-2 h-2 rounded-full bg-primary-500" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Simple loading select placeholder
export function SelectSkeleton({ label }: { label?: string }) {
  return (
    <div>
      {label && <Skeleton className="h-4 w-20 mb-1.5" />}
      <div className="relative">
        <Skeleton className="h-11 w-full rounded-xl" />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
        </div>
      </div>
    </div>
  )
}

export default AsyncSelect
