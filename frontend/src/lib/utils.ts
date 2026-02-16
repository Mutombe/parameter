import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useState, useEffect } from 'react'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

export function formatDistanceToNow(date: string | Date): string {
  const now = new Date()
  const target = new Date(date)
  const diffMs = now.getTime() - target.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)
  const diffMonth = Math.floor(diffDay / 30)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`
  if (diffWeek < 4) return `${diffWeek} week${diffWeek > 1 ? 's' : ''} ago`
  if (diffMonth < 12) return `${diffMonth} month${diffMonth > 1 ? 's' : ''} ago`
  return formatDate(date)
}

// Get full URL for media files (avatars, documents, etc.)
const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export function getMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null
  // If already absolute URL (S3/DO Spaces), return as is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    console.debug('[getMediaUrl] Absolute URL, returning as-is:', path)
    return path
  }
  // For relative paths, prepend API base URL
  // If VITE_API_URL is not set, use current origin as fallback (works in production)
  const baseUrl = API_BASE_URL || window.location.origin
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const fullUrl = `${baseUrl}${cleanPath}`
  console.debug('[getMediaUrl] Built URL:', { path, baseUrl, fullUrl, VITE_API_URL: import.meta.env.VITE_API_URL })
  return fullUrl
}

// Extract error message from Axios errors or unknown errors
export function getErrorMessage(error: unknown, fallback: string = 'An unexpected error occurred'): string {
  if (error && typeof error === 'object') {
    const axiosError = error as { response?: { data?: { error?: string; detail?: string; message?: string } } }
    if (axiosError.response?.data) {
      const data = axiosError.response.data
      return data.error || data.detail || data.message || fallback
    }
    if ('message' in error && typeof (error as { message: unknown }).message === 'string') {
      return (error as { message: string }).message
    }
  }
  return fallback
}

// Debounce hook for search inputs
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}
