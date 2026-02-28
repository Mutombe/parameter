import { ReactNode } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { MobileCardView } from './MobileCardView'

interface MobileCardField {
  label: string
  value: ReactNode
  align?: 'left' | 'right'
}

interface CardConfig<T> {
  rowKey: (item: T) => string | number
  title: (item: T) => ReactNode
  subtitle?: (item: T) => ReactNode
  fields?: (item: T) => MobileCardField[]
  badge?: (item: T) => ReactNode
  avatar?: (item: T) => ReactNode
  onClick?: (item: T) => void
}

interface ResponsiveTableProps<T> {
  data: T[]
  cardConfig: CardConfig<T>
  loading?: boolean
  emptyMessage?: string
  children: ReactNode
}

export function ResponsiveTable<T>({
  data,
  cardConfig,
  loading = false,
  emptyMessage,
  children,
}: ResponsiveTableProps<T>) {
  const isMobile = useMediaQuery('(max-width: 768px)')

  if (isMobile) {
    return (
      <MobileCardView
        data={data}
        rowKey={cardConfig.rowKey}
        title={cardConfig.title}
        subtitle={cardConfig.subtitle}
        fields={cardConfig.fields}
        badge={cardConfig.badge}
        avatar={cardConfig.avatar}
        onClick={cardConfig.onClick}
        loading={loading}
        emptyMessage={emptyMessage}
      />
    )
  }

  return <>{children}</>
}
