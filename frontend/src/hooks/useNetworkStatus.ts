import { useEffect, useRef } from 'react'
import { showToast } from '../lib/toast'
import { onSlowNetworkChange } from '../services/api'

const OFFLINE_DEBOUNCE_MS = 2000
const ONLINE_DEBOUNCE_MS = 1000
const COOLDOWN_MS = 30000
const PING_INTERVAL_MS = 30000
const PING_TIMEOUT_MS = 10000

type ToastType = 'offline' | 'online' | 'slow'

export function useNetworkStatus() {
  const lastToastTime = useRef<Record<ToastType, number>>({ offline: 0, online: 0, slow: 0 })
  const wasOffline = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>()
  const pingInterval = useRef<ReturnType<typeof setInterval>>()
  const isInitialMount = useRef(true)

  useEffect(() => {
    // Don't fire "online" toast on initial mount
    const mountTime = Date.now()

    function canShowToast(type: ToastType): boolean {
      const now = Date.now()
      if (now - lastToastTime.current[type] < COOLDOWN_MS) return false
      lastToastTime.current[type] = now
      return true
    }

    function handleOffline() {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        wasOffline.current = true
        if (canShowToast('offline')) {
          showToast.warning("You're offline — changes may not save")
        }
      }, OFFLINE_DEBOUNCE_MS)
    }

    function handleOnline() {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        // Only show "restored" toast if we were previously offline (not on initial load)
        if (wasOffline.current && Date.now() - mountTime > ONLINE_DEBOUNCE_MS * 2) {
          wasOffline.current = false
          if (canShowToast('online')) {
            showToast.success('Connection restored')
          }
        }
      }, ONLINE_DEBOUNCE_MS)
    }

    // A. Browser online/offline events
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initialize: if browser says offline on mount, treat as offline
    if (!navigator.onLine) {
      wasOffline.current = true
    }

    // B. Ping-based check (catches "WiFi connected but no internet")
    async function ping() {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)
        await fetch(`${import.meta.env.VITE_API_URL || ''}/api/tenants/health/`, {
          method: 'HEAD',
          signal: controller.signal,
          cache: 'no-store',
        })
        clearTimeout(timeout)
        // If we thought we were offline, we're back
        if (wasOffline.current) {
          handleOnline()
        }
      } catch {
        // Fetch failed — treat as offline if browser still says online
        if (navigator.onLine && !wasOffline.current) {
          handleOffline()
        }
      }
    }

    // Start pinging after a short delay (avoid pinging during initial page load)
    const startDelay = setTimeout(() => {
      isInitialMount.current = false
      pingInterval.current = setInterval(ping, PING_INTERVAL_MS)
    }, 5000)

    // C. Slow network detection (subscribe to api.ts rolling average)
    const unsubSlow = onSlowNetworkChange((isSlow) => {
      if (isSlow && canShowToast('slow')) {
        showToast.warning('Slow network detected — requests may take longer')
      }
    })

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearTimeout(debounceTimer.current)
      clearTimeout(startDelay)
      clearInterval(pingInterval.current)
      unsubSlow()
    }
  }, [])
}
