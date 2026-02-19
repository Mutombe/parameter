import { useNavigate } from 'react-router-dom'
import { usePrefetch } from '../../hooks/usePrefetch'

interface PrefetchLinkProps {
  /** The dashboard path to navigate to, e.g. "/dashboard/tenants/5" */
  to: string
  /** Content displayed inside the link */
  children: React.ReactNode
  /** Additional CSS classes */
  className?: string
  /** Stop click event propagation (useful inside table rows) */
  stopPropagation?: boolean
}

/**
 * A button styled as a link that prefetches data on hover and navigates on click.
 * Use this for cross-entity hyperlinks (e.g. clicking a tenant name on an invoice
 * detail page to go to the tenant detail page).
 */
export function PrefetchLink({ to, children, className, stopPropagation }: PrefetchLinkProps) {
  const navigate = useNavigate()
  const prefetch = usePrefetch()

  return (
    <button
      type="button"
      onMouseEnter={() => prefetch(to)}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation()
        navigate(to)
      }}
      className={className || 'text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline'}
    >
      {children}
    </button>
  )
}
