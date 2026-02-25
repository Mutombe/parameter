import { useEffect, useRef } from 'react'

type SmartDefaultRule = {
  watch: string[]
  compute: (values: Record<string, any>) => Record<string, any> | null
  onlyIfEmpty?: string[]
}

/**
 * Auto-fill form fields based on rules when watched values change.
 * Each rule has:
 *  - watch: field names to watch for changes
 *  - compute: function returning new field values (or null to skip)
 *  - onlyIfEmpty: only apply if these fields are currently empty
 */
export function useSmartDefaults(
  form: Record<string, any>,
  setForm: (updater: (prev: Record<string, any>) => Record<string, any>) => void,
  rules: SmartDefaultRule[]
) {
  const prevRef = useRef<Record<string, any>>({})

  useEffect(() => {
    const prev = prevRef.current

    for (const rule of rules) {
      // Check if any watched field actually changed
      const changed = rule.watch.some(key => form[key] !== prev[key])
      if (!changed) continue

      const computed = rule.compute(form)
      if (!computed) continue

      // Only apply if target fields are empty
      if (rule.onlyIfEmpty) {
        const allEmpty = rule.onlyIfEmpty.every(key => !form[key])
        if (!allEmpty) continue
      }

      setForm(current => ({ ...current, ...computed }))
    }

    prevRef.current = { ...form }
  }, [form, rules, setForm])
}

// Common date helpers
export function addMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ''
  date.setMonth(date.getMonth() + months)
  return date.toISOString().split('T')[0]
}

export function todayString(): string {
  return new Date().toISOString().split('T')[0]
}
