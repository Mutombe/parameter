import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const RECONNECT_DELAY = 5000

export function useNotificationWebSocket() {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const connect = useCallback(() => {
    // Build WebSocket URL from current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.hostname
    // Backend runs on port 8000 in dev, same host in production
    const port = host === 'localhost' || host === '127.0.0.1' ? ':8000' : ''
    const wsUrl = `${protocol}//${host}${port}/ws/notifications/`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        // Connection established
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'new_notification') {
            // Invalidate notification queries to refetch
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
            queryClient.invalidateQueries({ queryKey: ['unread-count'] })
          }

          if (data.type === 'unread_count') {
            // Directly update the unread count cache
            queryClient.setQueryData(['unread-count'], { data: { count: data.count } })
          }
        } catch {
          // Ignore parse errors
        }
      }

      ws.onclose = () => {
        wsRef.current = null
        // Auto-reconnect after delay
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY)
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      // WebSocket connection failed, retry
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY)
    }
  }, [queryClient])

  const markRead = useCallback((notificationId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'mark_read',
        notification_id: notificationId,
      }))
    }
  }, [])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  return { markRead }
}
