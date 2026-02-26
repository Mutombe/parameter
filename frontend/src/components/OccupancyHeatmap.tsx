import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import { Tooltip } from './ui/Tooltip'

interface PropertyOccupancy {
  id: number
  name: string
  units: { id: number; unit_number: string; is_occupied: boolean; tenant_name?: string }[]
}

interface OccupancyHeatmapProps {
  properties: PropertyOccupancy[]
  isLoading?: boolean
  className?: string
}

export function OccupancyHeatmap({ properties, isLoading, className }: OccupancyHeatmapProps) {
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse">
            <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
            <div className="flex gap-1.5 flex-wrap">
              {[...Array(8)].map((_, j) => (
                <div key={j} className="w-8 h-8 bg-gray-200 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!properties || properties.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No property data available
      </div>
    )
  }

  return (
    <div className={cn('space-y-5', className)}>
      {properties.map((property) => {
        const occupiedCount = property.units.filter(u => u.is_occupied).length
        const totalUnits = property.units.length
        const rate = totalUnits > 0 ? (occupiedCount / totalUnits) * 100 : 0

        return (
          <div key={property.id}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700 truncate">{property.name}</h4>
              <span className={cn(
                'text-xs font-semibold px-2 py-0.5 rounded-full',
                rate >= 90 ? 'bg-emerald-100 text-emerald-700' :
                rate >= 70 ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              )}>
                {occupiedCount}/{totalUnits} ({rate.toFixed(0)}%)
              </span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {property.units.map((unit) => (
                <Tooltip
                  key={unit.id}
                  content={
                    unit.is_occupied
                      ? `${unit.unit_number} — ${unit.tenant_name || 'Occupied'}`
                      : `${unit.unit_number} — Vacant`
                  }
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className={cn(
                      'w-8 h-8 rounded flex items-center justify-center text-[10px] font-medium cursor-default transition-colors',
                      unit.is_occupied
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                        : 'bg-red-100 text-red-600 hover:bg-red-200 border border-red-200'
                    )}
                  >
                    {unit.unit_number.length > 3 ? unit.unit_number.slice(-3) : unit.unit_number}
                  </motion.div>
                </Tooltip>
              ))}
            </div>
          </div>
        )
      })}
      {/* Legend */}
      <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-emerald-500" />
          <span className="text-xs text-gray-500">Occupied</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-100 border border-red-200" />
          <span className="text-xs text-gray-500">Vacant</span>
        </div>
      </div>
    </div>
  )
}
