import { useState, useCallback } from 'react'

const STORAGE_PREFIX = 'recent_'

function getStoredValues(key: string): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + key)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
}

function setStoredValues(key: string, values: string[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(values))
  } catch {}
}

export function useRecentValues(key: string, max: number = 5) {
  const [values, setValues] = useState<string[]>(() => getStoredValues(key))

  const add = useCallback((value: string) => {
    if (!value.trim()) return
    setValues(prev => {
      const filtered = prev.filter(v => v !== value)
      const next = [value, ...filtered].slice(0, max)
      setStoredValues(key, next)
      return next
    })
  }, [key, max])

  const clear = useCallback(() => {
    setValues([])
    try { localStorage.removeItem(STORAGE_PREFIX + key) } catch {}
  }, [key])

  return { values, add, clear }
}
