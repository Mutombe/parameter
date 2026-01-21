import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, X, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { cn } from '../lib/utils'

export default function DemoExpiryBanner() {
  const navigate = useNavigate()
  const { isDemo, demoExpiresAt, logout } = useAuthStore()
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!isDemo || !demoExpiresAt) return

    const updateTime = () => {
      const expiresAt = new Date(demoExpiresAt).getTime()
      const now = Date.now()
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000))
      setTimeRemaining(remaining)

      // Auto-logout when demo expires
      if (remaining <= 0) {
        logout()
        navigate('/login', { state: { demoExpired: true } })
      }
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)

    return () => clearInterval(interval)
  }, [isDemo, demoExpiresAt, logout, navigate])

  if (!isDemo || !demoExpiresAt || dismissed || timeRemaining === null) return null

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`
    }
    return `${secs}s`
  }

  const isUrgent = timeRemaining < 600 // Less than 10 minutes
  const isCritical = timeRemaining < 120 // Less than 2 minutes

  return (
    <div
      className={cn(
        'sticky top-0 z-50 px-4 py-2 flex items-center justify-center gap-3 text-sm transition-colors',
        isCritical && 'bg-red-600 text-white',
        isUrgent && !isCritical && 'bg-amber-500 text-white',
        !isUrgent && 'bg-amber-100 text-amber-800'
      )}
    >
      {isCritical ? (
        <AlertTriangle className="w-4 h-4" />
      ) : (
        <Clock className="w-4 h-4" />
      )}
      <span>
        <span className="font-medium">Demo Account:</span> Your session expires in{' '}
        <span className="font-bold">{formatTime(timeRemaining)}</span>
      </span>
      <a
        href="mailto:admin@bitstudio.co.zw"
        className={cn(
          'font-medium underline underline-offset-2',
          isCritical && 'hover:text-white/80',
          isUrgent && !isCritical && 'hover:text-white/80',
          !isUrgent && 'hover:text-amber-900'
        )}
      >
        Contact Sales
      </a>
      {!isUrgent && (
        <button
          onClick={() => setDismissed(true)}
          className="ml-2 p-1 hover:bg-amber-200 rounded-full transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
