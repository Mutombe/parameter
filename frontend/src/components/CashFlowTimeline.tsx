import { motion } from 'framer-motion'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { cn, formatCurrency } from '../lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface CashFlowEntry {
  month: string
  income: number
  expenses: number
  net: number
}

interface CashFlowTimelineProps {
  data: CashFlowEntry[]
  isLoading?: boolean
  className?: string
}

export function CashFlowTimeline({ data, isLoading, className }: CashFlowTimelineProps) {
  if (isLoading) {
    return (
      <div className={cn('h-72', className)}>
        <div className="w-full h-full flex flex-col justify-end gap-2 px-4 pb-4">
          <div className="flex items-end gap-3 h-full">
            {[40, 55, 65, 50, 70, 60].map((h, i) => (
              <div key={i} className="flex-1 bg-gray-200 rounded-t animate-pulse" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No cash flow data available
      </div>
    )
  }

  // Calculate summary stats
  const totalIncome = data.reduce((sum, d) => sum + d.income, 0)
  const totalExpenses = data.reduce((sum, d) => sum + d.expenses, 0)
  const totalNet = totalIncome - totalExpenses
  const latestNet = data[data.length - 1]?.net || 0

  return (
    <div className={className}>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center">
          <p className="text-xs text-gray-500 mb-1">Total Income</p>
          <p className="text-lg font-bold text-emerald-600 tabular-nums">{formatCurrency(totalIncome)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 mb-1">Total Expenses</p>
          <p className="text-lg font-bold text-red-600 tabular-nums">{formatCurrency(totalExpenses)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 mb-1">Net Cash Flow</p>
          <div className="flex items-center justify-center gap-1">
            {totalNet > 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            ) : totalNet < 0 ? (
              <TrendingDown className="w-4 h-4 text-red-600" />
            ) : (
              <Minus className="w-4 h-4 text-gray-400" />
            )}
            <p className={cn(
              'text-lg font-bold tabular-nums',
              totalNet >= 0 ? 'text-emerald-600' : 'text-red-600'
            )}>
              {formatCurrency(Math.abs(totalNet))}
            </p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis
              stroke="#94a3b8"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatCurrency(value), name]}
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                fontSize: '13px',
              }}
            />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="income"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#incomeGradient)"
              name="Income"
            />
            <Area
              type="monotone"
              dataKey="expenses"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#expenseGradient)"
              name="Expenses"
            />
            <Area
              type="monotone"
              dataKey="net"
              stroke="#3b82f6"
              strokeWidth={2.5}
              fill="url(#netGradient)"
              name="Net Cash Flow"
              strokeDasharray="5 3"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-emerald-500 rounded" />
          <span className="text-xs text-gray-500">Income</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-red-500 rounded" />
          <span className="text-xs text-gray-500">Expenses</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="12" height="2" className="mt-px"><line x1="0" y1="1" x2="12" y2="1" stroke="#3b82f6" strokeWidth="2" strokeDasharray="3 2" /></svg>
          <span className="text-xs text-gray-500">Net Flow</span>
        </div>
      </div>
    </div>
  )
}
