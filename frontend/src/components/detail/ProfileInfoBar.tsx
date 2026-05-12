import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

/** Profile Info Bar — the row of grouped facts that sits between a
 *  detail page's title and its KPI cards. Models the layout already
 *  proven on the Expense detail page:
 *
 *    [LABEL]                 [LABEL]                 [LABEL]
 *    primary value (icon)    primary value (icon)    primary value (icon)
 *    secondary muted         secondary muted         secondary muted
 *
 *  Each `<InfoColumn>` is one labelled section. Empty columns can be
 *  skipped — pass `hidden` so the grid collapses rather than rendering
 *  a "Not provided" placeholder. The bar adapts to however many
 *  columns are rendered (1 → 5).
 */

export function ProfileInfoBar({
  loading,
  skeletonCount = 4,
  className,
  delay = 0.05,
  children,
}: {
  loading?: boolean
  skeletonCount?: number
  className?: string
  delay?: number
  children: ReactNode
}) {
  // Count visible InfoColumn children so the grid sizes itself to the
  // actual content. Hidden columns are excluded so the remaining ones
  // share the available width evenly instead of leaving a gap.
  let visible = 0
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === 'object' && 'props' in (child as any)) {
        if (!(child as any).props?.hidden) visible++
      }
    }
  } else if (children && typeof children === 'object' && 'props' in (children as any)) {
    if (!(children as any).props?.hidden) visible = 1
  }
  const cols = Math.max(1, Math.min(5, visible))
  // Tailwind JIT cannot see interpolated class names — use a literal
  // lookup so the right `md:grid-cols-N` ends up in the generated CSS.
  const colsClass =
    cols === 1 ? 'md:grid-cols-1' :
    cols === 2 ? 'md:grid-cols-2' :
    cols === 3 ? 'md:grid-cols-3' :
    cols === 4 ? 'md:grid-cols-4' :
                 'md:grid-cols-5'
  const skelClass =
    skeletonCount <= 1 ? 'md:grid-cols-1' :
    skeletonCount === 2 ? 'md:grid-cols-2' :
    skeletonCount === 3 ? 'md:grid-cols-3' :
    skeletonCount === 4 ? 'md:grid-cols-4' :
                          'md:grid-cols-5'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cn('bg-white rounded-xl border border-gray-200 p-4 md:p-6', className)}
    >
      {loading ? (
        <div className={cn('grid gap-6 grid-cols-2', skelClass)}>
          {[...Array(skeletonCount)].map((_, i) => (
            <div key={i} className="space-y-2 animate-pulse">
              <div className="h-3 w-16 bg-gray-200 rounded" />
              <div className="h-4 w-32 bg-gray-200 rounded" />
              <div className="h-3 w-24 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className={cn('grid gap-6 grid-cols-2', colsClass)}>
          {children}
        </div>
      )}
    </motion.div>
  )
}

export function InfoColumn({
  label,
  hidden,
  children,
}: {
  label: string
  hidden?: boolean
  children: ReactNode
}) {
  if (hidden) return null
  return (
    <div className="space-y-2 min-w-0">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.1em]">{label}</p>
      <div className="space-y-1.5 min-w-0">{children}</div>
    </div>
  )
}

/** Single line inside an InfoColumn — icon + value, optional muted style. */
export function InfoLine({
  icon: Icon,
  children,
  muted,
  primary,
  title,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  children: ReactNode
  muted?: boolean
  primary?: boolean
  title?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 min-w-0',
        muted ? 'text-xs text-gray-500' : 'text-sm',
        primary && 'text-primary-600 hover:text-primary-700',
        !primary && !muted && 'text-gray-700',
        className,
      )}
      title={title}
    >
      {Icon && <Icon className={cn('shrink-0', muted ? 'w-3 h-3 text-gray-400' : 'w-3.5 h-3.5', !primary && !muted && 'text-gray-400')} />}
      <span className="truncate min-w-0">{children}</span>
    </div>
  )
}
