import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Building2, MapPin, DoorOpen, AlertCircle } from 'lucide-react'
import api from '../../services/api'
import { Card, CardContent, Badge } from '../../components/ui'
import { formatPercent, cn } from '../../lib/utils'

interface Property {
  id: number
  name: string
  address: string
  total_units: number
  vacant_units: number
  occupancy_rate: number
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
}

function getOccupancyBadge(rate: number) {
  if (rate >= 90) return { label: 'High', variant: 'default' as const, className: 'bg-green-100 text-green-800' }
  if (rate >= 70) return { label: 'Medium', variant: 'default' as const, className: 'bg-yellow-100 text-yellow-800' }
  return { label: 'Low', variant: 'default' as const, className: 'bg-red-100 text-red-800' }
}

function LandlordProperties() {
  const { data, isLoading, isError } = useQuery<Property[]>({
    queryKey: ['landlord-portal', 'properties'],
    queryFn: async () => {
      const response = await api.get('/masterfile/landlord-portal/properties/')
      return response.data
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            My Properties
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Loading your properties...
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="mb-6">
                <div className="h-5 w-40 rounded bg-gray-200" />
              </div>
              <CardContent>
                <div className="space-y-3">
                  <div className="h-4 w-56 rounded bg-gray-200" />
                  <div className="h-4 w-32 rounded bg-gray-200" />
                  <div className="h-4 w-24 rounded bg-gray-200" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            My Properties
          </h1>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-12 text-center">
          <AlertCircle className="mb-3 h-10 w-10 text-red-400" />
          <p className="text-lg font-medium text-red-800">
            Failed to load properties
          </p>
          <p className="mt-1 text-sm text-red-600">
            Please try refreshing the page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            My Properties
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {data.length} {data.length === 1 ? 'property' : 'properties'} in
            your portfolio
          </p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <Building2 className="mb-3 h-10 w-10 text-gray-400" />
          <p className="text-lg font-medium text-gray-600">
            No properties found
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Your properties will appear here once they are set up.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {data.map((property, index) => {
            const occupiedUnits = property.total_units - property.vacant_units
            const badge = getOccupancyBadge(property.occupancy_rate)

            return (
              <motion.div
                key={property.id}
                custom={index}
                initial="hidden"
                animate="visible"
                variants={cardVariants}
              >
                <Card className="h-full transition-shadow hover:shadow-md">
                  <div className="mb-4 pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-lg bg-blue-50 p-2">
                          <Building2 className="h-5 w-5 text-blue-600" />
                        </div>
                        <h3 className="text-base font-semibold text-gray-900">
                          {property.name}
                        </h3>
                      </div>
                      <Badge className={cn('text-xs', badge.className)}>
                        {badge.label}
                      </Badge>
                    </div>
                  </div>

                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-2 text-sm text-gray-500">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{property.address}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                        <p className="text-xs font-medium text-gray-500">
                          Total
                        </p>
                        <p className="mt-0.5 text-lg font-bold text-gray-900">
                          {property.total_units}
                        </p>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                        <p className="text-xs font-medium text-gray-500">
                          Vacant
                        </p>
                        <p
                          className={cn(
                            'mt-0.5 text-lg font-bold',
                            property.vacant_units > 0
                              ? 'text-amber-600'
                              : 'text-green-600'
                          )}
                        >
                          {property.vacant_units}
                        </p>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                        <p className="text-xs font-medium text-gray-500">
                          Occupied
                        </p>
                        <p className="mt-0.5 text-lg font-bold text-gray-900">
                          {occupiedUnits}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Occupancy</span>
                        <span className="font-semibold text-gray-900">
                          {formatPercent(property.occupancy_rate)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            property.occupancy_rate >= 90
                              ? 'bg-green-500'
                              : property.occupancy_rate >= 70
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                          )}
                          style={{ width: `${Math.min(property.occupancy_rate, 100)}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default LandlordProperties
