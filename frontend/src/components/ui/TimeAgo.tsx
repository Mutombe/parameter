import { useState } from 'react'
import { formatDistanceToNow, formatDate } from '../../lib/utils'

interface TimeAgoProps {
  date: string | Date | null | undefined
  fallback?: string
  className?: string
  showTooltip?: boolean
}

export function TimeAgo({ date, fallback = '—', className, showTooltip = true }: TimeAgoProps) {
  const [showFull, setShowFull] = useState(false)

  if (!date) return <span className={className}>{fallback}</span>

  const relativeTime = formatDistanceToNow(date)
  const fullDate = formatDate(date)

  return (
    <span
      className={className}
      style={{ position: 'relative' }}
      onMouseEnter={() => showTooltip && setShowFull(true)}
      onMouseLeave={() => setShowFull(false)}
    >
      {relativeTime}
      {showFull && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg shadow-lg whitespace-nowrap pointer-events-none z-50"
        >
          {fullDate}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  )
}
