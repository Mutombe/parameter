import { useState, useRef, useEffect, useCallback, forwardRef, InputHTMLAttributes, ComponentType } from 'react'
import { Clock, X } from 'lucide-react'
import { cn, useDebounce } from '../../lib/utils'
import { useRecentValues } from '../../hooks/useRecentValues'

type IconComponent = ComponentType<{ className?: string }>

export interface SuggestionItem {
  text: string
  subtext?: string
}

interface AutocompleteInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string
  error?: string
  hint?: string
  icon?: IconComponent
  iconPosition?: 'left' | 'right'
  suggestions?: string[]
  onFetchSuggestions?: (query: string) => Promise<SuggestionItem[]>
  recentKey?: string
  showRecent?: boolean
  minChars?: number
  maxSuggestions?: number
  freeSolo?: boolean
  onChange?: (e: { target: { value: string; name?: string } }) => void
}

export const AutocompleteInput = forwardRef<HTMLInputElement, AutocompleteInputProps>(
  ({
    className,
    label,
    error,
    hint,
    icon: Icon,
    iconPosition = 'left',
    suggestions: staticSuggestions,
    onFetchSuggestions,
    recentKey,
    showRecent = true,
    minChars = 1,
    maxSuggestions = 8,
    freeSolo = true,
    onChange,
    value,
    name,
    ...props
  }, ref) => {
    const [inputValue, setInputValue] = useState(String(value ?? ''))
    const [isOpen, setIsOpen] = useState(false)
    const [items, setItems] = useState<SuggestionItem[]>([])
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    const [isLoading, setIsLoading] = useState(false)

    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)

    const recent = useRecentValues(recentKey || '', 5)
    const debouncedValue = useDebounce(inputValue, 300)

    // Sync external value
    useEffect(() => {
      if (value !== undefined && String(value) !== inputValue) {
        setInputValue(String(value))
      }
    }, [value])

    // Fetch suggestions on debounced value change
    useEffect(() => {
      if (!isOpen) return

      if (debouncedValue.length < minChars) {
        // Show recent values when input is empty
        if (showRecent && recentKey && debouncedValue.length === 0) {
          setItems(recent.values.map(v => ({ text: v })))
        } else {
          setItems([])
        }
        return
      }

      const query = debouncedValue.toLowerCase()

      if (onFetchSuggestions) {
        setIsLoading(true)
        onFetchSuggestions(debouncedValue)
          .then(results => {
            setItems(results.slice(0, maxSuggestions))
            setHighlightedIndex(-1)
          })
          .catch(() => setItems([]))
          .finally(() => setIsLoading(false))
      } else if (staticSuggestions) {
        const filtered = staticSuggestions
          .filter(s => s.toLowerCase().includes(query))
          .slice(0, maxSuggestions)
          .map(s => ({ text: s }))
        setItems(filtered)
        setHighlightedIndex(-1)
      }
    }, [debouncedValue, isOpen, minChars, maxSuggestions])

    // Show recent when focused with empty input
    useEffect(() => {
      if (isOpen && showRecent && recentKey && inputValue.length === 0) {
        setItems(recent.values.map(v => ({ text: v })))
      }
    }, [isOpen])

    // Click outside to close
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsOpen(false)
          setHighlightedIndex(-1)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Scroll highlighted into view
    useEffect(() => {
      if (highlightedIndex >= 0 && listRef.current) {
        const els = listRef.current.querySelectorAll('[data-autocomplete-item]')
        const el = els[highlightedIndex] as HTMLElement
        if (el) el.scrollIntoView({ block: 'nearest' })
      }
    }, [highlightedIndex])

    const fireChange = useCallback((val: string) => {
      setInputValue(val)
      if (onChange) {
        onChange({ target: { value: val, name } })
      }
    }, [onChange, name])

    const handleSelect = useCallback((item: SuggestionItem) => {
      fireChange(item.text)
      if (recentKey) recent.add(item.text)
      setIsOpen(false)
      setHighlightedIndex(-1)
      inputRef.current?.focus()
    }, [fireChange, recentKey, recent])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      setInputValue(val)
      if (onChange) {
        onChange({ target: { value: val, name } })
      }
      if (!isOpen) setIsOpen(true)
    }

    const handleFocus = () => {
      setIsOpen(true)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (!isOpen || items.length === 0) {
        if (e.key === 'ArrowDown' && items.length > 0) {
          e.preventDefault()
          setIsOpen(true)
        }
        return
      }

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
          if (highlightedIndex >= 0 && highlightedIndex < items.length) {
            handleSelect(items[highlightedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          setHighlightedIndex(-1)
          break
        case 'Tab':
          if (highlightedIndex >= 0 && highlightedIndex < items.length) {
            handleSelect(items[highlightedIndex])
          }
          setIsOpen(false)
          break
      }
    }

    const handleBlur = () => {
      if (recentKey && inputValue.trim()) {
        recent.add(inputValue.trim())
      }
    }

    const showDropdown = isOpen && (items.length > 0 || isLoading)
    const showRecentLabel = isOpen && showRecent && recentKey && inputValue.length === 0 && items.length > 0

    return (
      <div className="relative space-y-1.5" ref={containerRef}>
        {label && (
          <label className="block text-sm font-medium text-gray-700">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {Icon && iconPosition === 'left' && (
            <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          )}
          <input
            ref={(el) => {
              (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el
              if (typeof ref === 'function') ref(el)
              else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
            }}
            className={cn(
              'w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 transition-all duration-200',
              'placeholder:text-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
              'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed',
              'dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800',
              error && 'border-red-300 focus:ring-red-500',
              Icon && iconPosition === 'left' && 'pl-10',
              Icon && iconPosition === 'right' && 'pr-10',
              className
            )}
            value={inputValue}
            name={name}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            {...props}
          />
          {Icon && iconPosition === 'right' && (
            <Icon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          )}
        </div>

        {/* Dropdown */}
        {showDropdown && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden dark:bg-slate-900 dark:border-slate-600">
            {showRecentLabel && (
              <div className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1.5 border-b border-gray-100 dark:border-slate-700">
                <Clock className="w-3 h-3" />
                Recently used
              </div>
            )}
            <div className="max-h-48 overflow-y-auto p-1" ref={listRef}>
              {isLoading ? (
                <div className="px-3 py-2.5 text-sm text-gray-400">Loading...</div>
              ) : (
                items.map((item, index) => (
                  <button
                    key={`${item.text}-${index}`}
                    type="button"
                    data-autocomplete-item
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      'w-full flex flex-col px-3 py-2 text-left text-sm rounded-lg transition-colors',
                      index === highlightedIndex
                        ? 'bg-gray-100 text-gray-900 dark:bg-slate-700 dark:text-slate-200'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800'
                    )}
                  >
                    <span className="truncate">{item.text}</span>
                    {item.subtext && (
                      <span className="text-xs text-gray-400 truncate">{item.subtext}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {hint && !error && <p className="text-sm text-gray-500">{hint}</p>}
      </div>
    )
  }
)

AutocompleteInput.displayName = 'AutocompleteInput'
