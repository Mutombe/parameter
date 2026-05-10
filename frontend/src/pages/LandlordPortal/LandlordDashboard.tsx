import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Building2,
  DoorOpen,
  PieChart,
  FileText,
  DollarSign,
  AlertCircle,
  Percent,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import api from '../../services/api'
import { Card, CardContent } from '../../components/ui'
import { formatCurrency, formatPercent, cn } from '../../lib/utils'

interface CommissionBreakdownRow {
  income_type_id: number | null
  income_type_name: string
  amount: string
}

interface DashboardSummary {
  total_properties: number
  total_units: number
  occupied_units: number
  occupancy_rate: string
  active_leases: number
  total_income: string
  total_outstanding: string
  total_commission: string
  operating_expenses: string
  net_payable: string
}

interface DashboardData {
  landlord: { id: number; name: string; code: string }
  summary: DashboardSummary
  commission_breakdown: CommissionBreakdownRow[]
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
}

function LandlordDashboard() {
  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ['landlord-portal', 'dashboard'],
    queryFn: async () => {
      const response = await api.get('/masterfile/landlord-portal/dashboard/')
      return response.data
    },
    placeholderData: keepPreviousData,
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 8 }).map((_, i) => (
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
        <p className="text-lg font-medium text-red-800">Failed to load dashboard data</p>
        <p className="mt-1 text-sm text-red-600">Please try refreshing the page.</p>
      </div>
    )
  }

  const s = data.summary
  const breakdown = data.commission_breakdown || []
  const totalIncome = Number(s.total_income) || 0
  const totalCommission = Number(s.total_commission) || 0
  const commissionRatePct = totalIncome > 0 ? (totalCommission / totalIncome) * 100 : 0

  // Card definitions read from summary so the keys match the backend.
  const cards = [
    {
      label: 'Total Properties', value: s.total_properties.toLocaleString(),
      icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50',
    },
    {
      label: 'Total Units', value: s.total_units.toLocaleString(),
      icon: DoorOpen, color: 'text-indigo-600', bg: 'bg-indigo-50',
    },
    {
      label: 'Occupancy Rate', value: formatPercent(Number(s.occupancy_rate) || 0),
      icon: PieChart, color: 'text-emerald-600', bg: 'bg-emerald-50',
    },
    {
      label: 'Active Leases', value: s.active_leases.toLocaleString(),
      icon: FileText, color: 'text-violet-600', bg: 'bg-violet-50',
    },
    {
      label: 'Total Income', value: formatCurrency(totalIncome),
      icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50',
    },
    {
      label: 'Outstanding', value: formatCurrency(Number(s.total_outstanding) || 0),
      icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50',
    },
    {
      label: 'Commission Charged',
      value: formatCurrency(totalCommission),
      sub: totalIncome > 0 ? `${commissionRatePct.toFixed(1)}% blended of income` : 'No income yet',
      icon: Percent, color: 'text-amber-600', bg: 'bg-amber-50',
    },
    {
      label: 'Net Payable to You',
      value: formatCurrency(Number(s.net_payable) || 0),
      sub: 'Income − Commission − Operating expenses',
      icon: Wallet, color: 'text-sky-700', bg: 'bg-sky-50',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Landlord Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Overview of your property portfolio · {data.landlord.name}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, index) => {
          const Icon = card.icon
          return (
            <motion.div
              key={card.label}
              custom={index}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
            >
              <Card className="overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-medium text-gray-500 truncate">{card.label}</p>
                      <p className="text-2xl font-bold text-gray-900 truncate">{card.value}</p>
                      {card.sub && (
                        <p className="text-[11px] text-gray-400 truncate">{card.sub}</p>
                      )}
                    </div>
                    <div className={cn('rounded-lg p-2.5 flex-shrink-0', card.bg)}>
                      <Icon className={cn('h-5 w-5', card.color)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Commission breakdown — shows what was deducted per income type */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
      >
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Commission Deductions by Income Type</h3>
              <p className="text-xs text-gray-500">
                What the agency charged on each sub-account · since inception
              </p>
            </div>
          </div>
          <CardContent className="p-0">
            {breakdown.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                No commission has been charged yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50">
                    <th className="text-left px-6 py-3 text-[11px] tracking-wider uppercase font-semibold text-gray-500">
                      Income Type
                    </th>
                    <th className="text-right px-6 py-3 text-[11px] tracking-wider uppercase font-semibold text-gray-500">
                      Commission Charged
                    </th>
                    <th className="text-right px-6 py-3 text-[11px] tracking-wider uppercase font-semibold text-gray-500 w-32">
                      % of Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {breakdown.map((row) => {
                    const amt = Number(row.amount) || 0
                    const pct = totalCommission > 0 ? (amt / totalCommission) * 100 : 0
                    return (
                      <tr key={row.income_type_id ?? row.income_type_name} className="hover:bg-gray-50/40">
                        <td className="px-6 py-3 text-gray-800 font-medium">{row.income_type_name}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-amber-700 font-semibold">
                          {formatCurrency(amt)}
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums text-gray-500 text-xs">
                          {pct.toFixed(1)}%
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="border-t-2 border-gray-900 bg-gray-50/40 font-bold">
                    <td className="px-6 py-3 text-gray-900">Total Commission</td>
                    <td className="px-6 py-3 text-right tabular-nums text-amber-800">
                      {formatCurrency(totalCommission)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-500 text-xs">100.0%</td>
                  </tr>
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

export default LandlordDashboard
