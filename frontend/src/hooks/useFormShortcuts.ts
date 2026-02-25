import { useEffect } from 'react'

interface UseFormShortcutsOptions {
  onSubmit: () => void
  enabled?: boolean
}

export function useFormShortcuts({ onSubmit, enabled = true }: UseFormShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        onSubmit()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSubmit, enabled])
}
