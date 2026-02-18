import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Clock,
  Calendar,
  AlertTriangle,
  TrendingUp,
  Users,
  Download,
  Filter,
  Printer,
} from 'lucide-react'
import { reportsApi, propertyApi, landlordApi } from '../../services/api'
import { cn } from '../../lib/utils'
import { formatCurrency } from '../../lib/utils'
import { printElement } from '../../lib/printTemplate'
import { AsyncSelect } from '../../components/ui/AsyncSelect'

interface AgedAnalysisSummary {
  total_outstanding: number
  total_overdue: number
  overdue_count: number
  current: number
  days_31_60: number
  days_61_90: number
  days_91_120: number
  days_over_120: number
}

interface TenantAging {
  tenant_id: number
  tenant_name: string
  current: number
  days_31_60: number
  days_61_90: number
  days_91_120: number
  days_over_120: number
  total: number
}

interface ChartData {
  label: string
  value: number
  color: string
}

interface Property {
  id: number
  name: string
}

interface Landlord {
  id: number
  name: string
}

const bucketConfig = [
  { key: 'current', label: 'Current (0-30)', color: 'bg-green-500', textColor: 'text-green-700', bgLight: 'bg-green-50' },
  { key: 'days_31_60', label: '31-60 Days', color: 'bg-amber-500', textColor: 'text-amber-700', bgLight: 'bg-amber-50' },
  { key: 'days_61_90', label: '61-90 Days', color: 'bg-orange-500', textColor: 'text-orange-700', bgLight: 'bg-orange-50' },
  { key: 'days_91_120', label: '91-120 Days', color: 'bg-red-500', textColor: 'text-red-700', bgLight: 'bg-red-50' },
  { key: 'days_over_120', label: '120+ Days', color: 'bg-red-800', textColor: 'text-red-900', bgLight: 'bg-red-100' },
] as const

export default function AgedAnalysis() {
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]
  const [asOfDate, setAsOfDate] = useState(today)
  const [propertyFilter, setPropertyFilter] = useState<string>('')
  const [landlordFilter, setLandlordFilter] = useState<string>('')

  // Queries
  const { data: analysisData, isLoading } = useQuery({
    queryKey: ['aged-analysis', asOfDate, propertyFilter, landlordFilter],
    queryFn: () => reportsApi.agedAnalysis({
      as_of_date: asOfDate,
      ...(propertyFilter ? { property_id: Number(propertyFilter) } : {}),
      ...(landlordFilter ? { landlord_id: Number(landlordFilter) } : {}),
    }).then(r => r.data),
  })

  const { data: propertiesData } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () => propertyApi.list().then(r => r.data.results || r.data),
  })

  const { data: landlordsData } = useQuery({
    queryKey: ['landlords-list'],
    queryFn: () => landlordApi.list().then(r => r.data.results || r.data),
  })

  const summary: AgedAnalysisSummary = analysisData?.summary || {
    total_outstanding: 0,
    total_overdue: 0,
    overdue_count: 0,
    current: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_91_120: 0,
    days_over_120: 0,
  }

  const tenants: TenantAging[] = analysisData?.by_tenant || []
  const properties: Property[] = Array.isArray(propertiesData) ? propertiesData : []
  const landlords: Landlord[] = Array.isArray(landlordsData) ? landlordsData : []

  // Calculate chart max for bar widths
  const chartMax = useMemo(() => {
    const values = bucketConfig.map(b => summary[b.key as keyof AgedAnalysisSummary] as number || 0)
    return Math.max(...values, 1)
  }, [summary])

  // Find worst bucket
  const worstBucket = useMemo(() => {
    let worst = { label: 'None', value: 0 }
    for (const b of bucketConfig) {
      const val = (summary[b.key as keyof AgedAnalysisSummary] as number) || 0
      if (val > worst.value) {
        worst = { label: b.label, value: val }
      }
    }
    return worst
  }, [summary])

  const handlePrint = () => {
    printElement('aged-analysis-content', {
      title: 'Aged Analysis',
      subtitle: `Outstanding invoice aging as of ${asOfDate}`,
    })
  }

  return (
    <div className="space-y-6" id="aged-analysis-content">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Aged Analysis</h1>
          <p className="text-gray-500 mt-1">Outstanding invoice aging by tenant</p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
        >
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">Filters:</span>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">As of Date</label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <AsyncSelect
            label="Property"
            placeholder="All Properties"
            value={propertyFilter}
            onChange={(val) => setPropertyFilter(String(val))}
            options={properties.map((p) => ({ value: p.id, label: p.name }))}
            searchable
            clearable
            className="min-w-[180px]"
          />
          <AsyncSelect
            label="Landlord"
            placeholder="All Landlords"
            value={landlordFilter}
            onChange={(val) => setLandlordFilter(String(val))}
            options={landlords.map((l) => ({ value: l.id, label: l.name }))}
            searchable
            clearable
            className="min-w-[180px]"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-gray-200 p-5"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Outstanding</p>
              <p className="text-xl font-bold text-gray-900">
                {isLoading ? '...' : formatCurrency(summary.total_outstanding)}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-xl border border-gray-200 p-5"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Overdue Invoices</p>
              <p className="text-xl font-bold text-gray-900">
                {isLoading ? '...' : summary.overdue_count}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl border border-gray-200 p-5"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Worst Bucket</p>
              <p className="text-xl font-bold text-gray-900">
                {isLoading ? '...' : formatCurrency(worstBucket.value)}
              </p>
              <p className="text-xs text-gray-400">{worstBucket.label}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Aging Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Aging Buckets</h2>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {bucketConfig.map((bucket) => {
              const value = (summary[bucket.key as keyof AgedAnalysisSummary] as number) || 0
              const percentage = chartMax > 0 ? (value / chartMax) * 100 : 0
              const totalPercentage = summary.total_outstanding > 0
                ? (value / summary.total_outstanding) * 100 : 0

              return (
                <div key={bucket.key} className="flex items-center gap-4">
                  <div className="w-32 text-sm text-gray-600 font-medium shrink-0">
                    {bucket.label}
                  </div>
                  <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(percentage, 0.5)}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className={cn("h-full rounded-lg", bucket.color)}
                    />
                  </div>
                  <div className="w-28 text-right shrink-0">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(value)}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">
                      ({totalPercentage.toFixed(0)}%)
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Tenant Breakdown Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Tenant Breakdown
            {tenants.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({tenants.length} tenant{tenants.length !== 1 ? 's' : ''})
              </span>
            )}
          </h2>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : tenants.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No outstanding balances</h3>
            <p className="text-gray-500">All tenant accounts are current.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tenant</th>
                  {bucketConfig.map((bucket) => (
                    <th key={bucket.key} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                      {bucket.label}
                    </th>
                  ))}
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tenants
                  .sort((a, b) => b.total - a.total)
                  .map((tenant, index) => (
                    <motion.tr
                      key={tenant.tenant_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-3 text-sm font-medium">
                        {tenant.tenant_id ? (
                          <a
                            href={`/dashboard/tenants/${tenant.tenant_id}`}
                            onClick={(e) => { e.preventDefault(); navigate(`/dashboard/tenants/${tenant.tenant_id}`) }}
                            className="text-primary-600 hover:text-primary-700 hover:underline"
                          >
                            {tenant.tenant_name}
                          </a>
                        ) : (
                          <span className="text-gray-900">{tenant.tenant_name}</span>
                        )}
                      </td>
                      {bucketConfig.map((bucket) => {
                        const val = tenant[bucket.key as keyof TenantAging] as number || 0
                        return (
                          <td
                            key={bucket.key}
                            className={cn(
                              "px-4 py-3 text-sm text-right font-medium",
                              val > 0 ? bucket.textColor : "text-gray-300"
                            )}
                          >
                            {val > 0 ? (
                              <span className={cn("px-2 py-0.5 rounded", val > 0 ? bucket.bgLight : '')}>
                                {formatCurrency(val)}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        )
                      })}
                      <td className="px-6 py-3 text-sm text-right font-bold text-gray-900">
                        {formatCurrency(tenant.total)}
                      </td>
                    </motion.tr>
                  ))}

                {/* Totals row */}
                <tr className="bg-gray-50 font-bold">
                  <td className="px-6 py-3 text-sm text-gray-900">Total</td>
                  {bucketConfig.map((bucket) => {
                    const total = tenants.reduce((sum, t) => sum + ((t[bucket.key as keyof TenantAging] as number) || 0), 0)
                    return (
                      <td key={bucket.key} className={cn("px-4 py-3 text-sm text-right", bucket.textColor)}>
                        {formatCurrency(total)}
                      </td>
                    )
                  })}
                  <td className="px-6 py-3 text-sm text-right text-gray-900">
                    {formatCurrency(summary.total_outstanding)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
