import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  Home,
  Filter,
  Calendar,
} from 'lucide-react'
import api from '../../services/api'
import { formatCurrency, cn } from '../../lib/utils'
import { Card, CardHeader, CardContent } from '../../components/ui/Card'
import { Select } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'

interface Property {
  id: number
  name: string
}

interface IncomeBreakdownItem {
  category: string
  amount: number
}

interface ExpenseBreakdownItem {
  category: string
  amount: number
}

interface MonthlyData {
  month: string
  income: number
  expenses: number
}

interface PerformanceData {
  total_income: number
  total_expenses: number
  net_income: number
  occupancy_rate: number
  income_breakdown: IncomeBreakdownItem[]
  expense_breakdown: ExpenseBreakdownItem[]
  monthly_data: MonthlyData[]
}

const CHART_COLORS = {
  income: '#10b981',
  expenses: '#ef4444',
}

export default function PropertyPerformance() {
  const today = new Date()
  const firstOfYear = `${today.getFullYear()}-01-01`
  const todayStr = today.toISOString().split('T')[0]

  const [propertyId, setPropertyId] = useState<string>('')
  const [dateFrom, setDateFrom] = useState(firstOfYear)
  const [dateTo, setDateTo] = useState(todayStr)

  // Fetch properties for the selector
  const { data: propertiesData } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () =>
      api
        .get('/masterfile/properties/')
        .then((r) => r.data.results || r.data),
  })

  const properties: Property[] = Array.isArray(propertiesData)
    ? propertiesData
    : []

  // Fetch property performance data
  const {
    data: performanceData,
    isLoading,
    isFetching,
  } = useQuery<PerformanceData>({
    queryKey: ['property-performance', propertyId, dateFrom, dateTo],
    queryFn: () =>
      api
        .get(`/reports/property-performance/${propertyId}/`, {
          params: { date_from: dateFrom, date_to: dateTo },
        })
        .then((r) => r.data),
    enabled: !!propertyId,
  })

  const data = performanceData || {
    total_income: 0,
    total_expenses: 0,
    net_income: 0,
    occupancy_rate: 0,
    income_breakdown: [],
    expense_breakdown: [],
    monthly_data: [],
  }

  const summaryCards = [
    {
      title: 'Total Income',
      value: formatCurrency(data.total_income),
      icon: DollarSign,
      color: 'green' as const,
      bgColor: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
    },
    {
      title: 'Total Expenses',
      value: formatCurrency(data.total_expenses),
      icon: TrendingDown,
      color: 'red' as const,
      bgColor: 'bg-red-50',
      iconColor: 'text-red-600',
    },
    {
      title: 'Net Income',
      value: formatCurrency(data.net_income),
      icon: TrendingUp,
      color: data.net_income >= 0 ? ('green' as const) : ('red' as const),
      bgColor: data.net_income >= 0 ? 'bg-emerald-50' : 'bg-red-50',
      iconColor: data.net_income >= 0 ? 'text-emerald-600' : 'text-red-600',
    },
    {
      title: 'Occupancy Rate',
      value: `${data.occupancy_rate.toFixed(1)}%`,
      icon: Home,
      color: 'blue' as const,
      bgColor: 'bg-blue-50',
      iconColor: 'text-blue-600',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Property Performance
        </h1>
        <p className="text-gray-500 mt-1">
          Income, expenses, and occupancy analysis by property
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2 self-center">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">Filters:</span>
          </div>

          <div className="min-w-[220px]">
            <Select
              label="Property"
              placeholder="Select a property"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              options={properties.map((p) => ({
                value: String(p.id),
                label: p.name,
              }))}
              searchable
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Date From
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="pl-10 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Date To
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="pl-10 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      {/* No property selected state */}
      {!propertyId && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Home className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Select a Property
          </h3>
          <p className="text-gray-500">
            Choose a property from the dropdown above to view its performance
            report.
          </p>
        </div>
      )}

      {/* Loading state */}
      {propertyId && isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-200" />
                <div>
                  <div className="h-3 w-24 bg-gray-200 rounded mb-2" />
                  <div className="h-6 w-28 bg-gray-200 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      {propertyId && !isLoading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {summaryCards.map((card, index) => {
              const Icon = card.icon
              return (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={cn(
                    'bg-white rounded-xl border border-gray-200 p-5',
                    isFetching && 'opacity-60'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        card.bgColor
                      )}
                    >
                      <Icon className={cn('w-5 h-5', card.iconColor)} />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">{card.title}</p>
                      <p className="text-xl font-bold text-gray-900">
                        {card.value}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Income vs Expense Bar Chart */}
          {data.monthly_data && data.monthly_data.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card>
                <CardHeader title="Income vs Expenses" description="Monthly comparison over the selected period" />
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.monthly_data}
                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f0f0f0"
                        />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                        />
                        <YAxis
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickFormatter={(value) =>
                            formatCurrency(value).replace('.00', '')
                          }
                        />
                        <Tooltip
                          formatter={(value: number) => formatCurrency(value)}
                          contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #e5e7eb',
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                          }}
                        />
                        <Bar
                          dataKey="income"
                          name="Income"
                          fill={CHART_COLORS.income}
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="expenses"
                          name="Expenses"
                          fill={CHART_COLORS.expenses}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center justify-center gap-6 mt-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                      <span className="text-sm text-gray-600">Income</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-red-500" />
                      <span className="text-sm text-gray-600">Expenses</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Breakdown Lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Income Breakdown */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card>
                <CardHeader
                  title="Income Breakdown"
                  action={
                    <Badge variant="success">
                      {formatCurrency(data.total_income)}
                    </Badge>
                  }
                />
                <CardContent>
                  {data.income_breakdown.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">
                      No income data for the selected period.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {data.income_breakdown.map((item, index) => {
                        const percentage =
                          data.total_income > 0
                            ? (item.amount / data.total_income) * 100
                            : 0
                        return (
                          <div key={index} className="group">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-700">
                                {item.category}
                              </span>
                              <span className="text-sm font-semibold text-gray-900">
                                {formatCurrency(item.amount)}
                              </span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{
                                  width: `${Math.max(percentage, 0.5)}%`,
                                }}
                                transition={{
                                  duration: 0.5,
                                  delay: index * 0.05,
                                }}
                                className="h-full bg-emerald-500 rounded-full"
                              />
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {percentage.toFixed(1)}% of total income
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Expense Breakdown */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <Card>
                <CardHeader
                  title="Expense Breakdown"
                  action={
                    <Badge variant="danger">
                      {formatCurrency(data.total_expenses)}
                    </Badge>
                  }
                />
                <CardContent>
                  {data.expense_breakdown.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">
                      No expense data for the selected period.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {data.expense_breakdown.map((item, index) => {
                        const percentage =
                          data.total_expenses > 0
                            ? (item.amount / data.total_expenses) * 100
                            : 0
                        return (
                          <div key={index} className="group">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-700">
                                {item.category}
                              </span>
                              <span className="text-sm font-semibold text-gray-900">
                                {formatCurrency(item.amount)}
                              </span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{
                                  width: `${Math.max(percentage, 0.5)}%`,
                                }}
                                transition={{
                                  duration: 0.5,
                                  delay: index * 0.05,
                                }}
                                className="h-full bg-red-500 rounded-full"
                              />
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {percentage.toFixed(1)}% of total expenses
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </>
      )}
    </div>
  )
}
