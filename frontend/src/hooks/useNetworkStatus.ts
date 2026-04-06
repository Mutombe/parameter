import { useEffect, useRef } from 'react'
import { showToast } from '../lib/toast'

/**
 * Detects actual network connectivity using browser APIs only.
 * Does NOT confuse slow API responses with network issues.
 */
export function useNetworkStatus() {
  const wasOffline = useRef(false)
  const mountTime = useRef(Date.now())

  useEffect(() => {
    function handleOffline() {
      wasOffline.current = true
      showToast.warning("You're offline — changes may not save")
    }

    function handleOnline() {
      // Only show "restored" if we were actually offline (not on initial page load)
      if (wasOffline.current && Date.now() - mountTime.current > 3000) {
        wasOffline.current = false
        showToast.success('Connection restored')
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // If already offline on mount
    if (!navigator.onLine) {
      wasOffline.current = true
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])
}
