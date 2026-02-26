import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'

interface MobileCardField {
  label: string
  value: ReactNode
  align?: 'left' | 'right'
}

interface MobileCardViewProps<T> {
  data: T[]
  rowKey: (item: T) => string | number
  /** Render the card title/primary line */
  title: (item: T) => ReactNode
  /** Render a subtitle/secondary line */
  subtitle?: (item: T) => ReactNode
  /** Additional fields shown in the card body */
  fields?: (item: T) => MobileCardField[]
  /** Badge/status shown on the right of the title */
  badge?: (item: T) => ReactNode
  /** Click handler for the card */
  onClick?: (item: T) => void
  /** Leading icon or avatar */
  avatar?: (item: T) => ReactNode
  loading?: boolean
  emptyMessage?: string
  className?: string
}

export function MobileCardView<T>({
  data,
  rowKey,
  title,
  subtitle,
  fields,
  badge,
  onClick,
  avatar,
  loading = false,
  emptyMessage = 'No items found',
  className,
}: MobileCardViewProps<T>) {
  if (loading) {
    return (
      <div className={cn('space-y-3', className)}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 bg-gray-200 rounded" />
                <div className="h-3 w-1/2 bg-gray-200 rounded" />
              </div>
              <div className="h-5 w-16 bg-gray-200 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {data.map((item, index) => (
        <motion.div
          key={rowKey(item)}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.03 }}
          onClick={() => onClick?.(item)}
          className={cn(
            'bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow',
            onClick && 'cursor-pointer active:bg-gray-50'
          )}
        >
          {/* Header row */}
          <div className="flex items-start gap-3">
            {avatar && (
              <div className="shrink-0">
                {avatar(item)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 truncate">
                  {title(item)}
                </h3>
                {badge && (
                  <div className="shrink-0">
                    {badge(item)}
                  </div>
                )}
              </div>
              {subtitle && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {subtitle(item)}
                </p>
              )}
            </div>
            {onClick && (
              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
            )}
          </div>

          {/* Fields grid */}
          {fields && (
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
              {fields(item).map((field, i) => (
                <div key={i} className={cn(field.align === 'right' && 'text-right')}>
                  <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">{field.label}</p>
                  <p className="text-sm text-gray-700 tabular-nums">{field.value}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  )
}
