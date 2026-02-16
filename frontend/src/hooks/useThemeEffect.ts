import { useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'

export function useThemeEffect() {
  const theme = useUIStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement

    const apply = (dark: boolean) => {
      root.classList.toggle('dark', dark)
    }

    if (theme !== 'system') {
      apply(theme === 'dark')
      return
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    apply(mq.matches)

    const handler = (e: MediaQueryListEvent) => apply(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])
}
