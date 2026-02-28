import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Building2,
  DoorOpen,
  PieChart,
  FileText,
  DollarSign,
  AlertCircle,
} from 'lucide-react'
import api from '../../services/api'
import { Card, CardHeader, CardContent } from '../../components/ui'
import { formatCurrency, formatPercent, cn } from '../../lib/utils'

interface DashboardData {
  total_properties: number
  total_units: number
  occupancy_rate: number
  active_leases: number
  total_income: number
  outstanding: number
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: 'easeOut' },
  }),
}

const summaryCards = [
  {
    key: 'total_properties',
    label: 'Total Properties',
    icon: Building2,
    format: (v: number) => v.toLocaleString(),
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    key: 'total_units',
    label: 'Total Units',
    icon: DoorOpen,
    format: (v: number) => v.toLocaleString(),
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
  },
  {
    key: 'occupancy_rate',
    label: 'Occupancy Rate',
    icon: PieChart,
    format: (v: number) => formatPercent(v),
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    key: 'active_leases',
    label: 'Active Leases',
    icon: FileText,
    format: (v: number) => v.toLocaleString(),
    color: 'text-violet-600',
    bg: 'bg-violet-50',
  },
  {
    key: 'total_income',
    label: 'Total Income',
    icon: DollarSign,
    format: (v: number) => formatCurrency(v),
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  {
    key: 'outstanding',
    label: 'Outstanding',
    icon: AlertCircle,
    format: (v: number) => formatCurrency(v),
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
] as const

function LandlordDashboard() {
  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ['landlord-portal', 'dashboard'],
    queryFn: async () => {
      const response = await api.get('/masterfile/landlord-portal/dashboard/')
      return response.data
    },
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 w-24 rounded bg-gray-200" />
              <div className="mt-3 h-8 w-32 rounded bg-gray-200" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-12 text-center">
        <AlertCircle className="mb-3 h-10 w-10 text-red-400" />
        <p className="text-lg font-medium text-red-800">
          Failed to load dashboard data
        </p>
        <p className="mt-1 text-sm text-red-600">
          Please try refreshing the page.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Landlord Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of your property portfolio
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {summaryCards.map((card, index) => {
          const Icon = card.icon
          const value = data[card.key as keyof DashboardData]

          return (
            <motion.div
              key={card.key}
              custom={index}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
            >
              <Card className="overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-500">
                        {card.label}
                      </p>
                      <p className="text-2xl font-bold text-gray-900">
                        {card.format(value as number)}
                      </p>
                    </div>
                    <div className={cn('rounded-lg p-2.5', card.bg)}>
                      <Icon className={cn('h-5 w-5', card.color)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

export default LandlordDashboard
