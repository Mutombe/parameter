import { useState, useEffect, useMemo, useCallback, createContext, useContext, Fragment, type ReactNode } from 'react'
import { useQuery, useIsFetching, keepPreviousData } from '@tanstack/react-query'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart3,
  FileText,
  Building2,
  DollarSign,
  Scale,
  Home,
  CheckCircle,
  XCircle,
  Download,
  Printer,
  Calendar,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  Banknote,
  ArrowRight,
  Clock,
  Users,
  Receipt,
  CreditCard,
  Filter,
  AlertTriangle,
  Landmark,
  ClipboardList,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
  Line,
} from 'recharts'
import { reportsApi, tenantApi, landlordApi, propertyApi } from '../../../services/api'
import { formatCurrency, formatPercent, formatDate, cn } from '../../../lib/utils'
import { printElement, printFinancialReport, type FinancialReportType } from '../../../lib/printTemplate'
import { exportReport } from '../../../lib/export'
import { PageHeader, Button, Badge, Skeleton, EmptyState, TableFilter, Pagination, Tooltip as UITooltip, DatePicker, Accordion, SplitButton, Select } from '../../../components/ui'
import {
  groupAssets, groupLiabilities, groupRevenue, groupExpenses,
  groupTrialBalance, sumRows,
  type ReportRow,
} from '../../../lib/reportGroups'
import { AsyncSelect } from '../../../components/ui/AsyncSelect'
import toast from 'react-hot-toast'
import { PiBuildingApartmentLight } from "react-icons/pi";
import { useUIStore } from '../../../stores/uiStore'

import { FINANCIAL_REPORTS, CASH_ONLY_REPORTS, PERIOD_REPORTS, derivePeriod, _ymd, _MONTHS, ReportFilterContext, useReportFilters, reportDataStore, SkeletonReport } from '../shared'
import type { ReportType, PeriodMode } from '../shared'

function CashFlowReport() {
  const { landlordId, propertyId, periodStart, periodEnd } = useReportFilters()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cash-flow', landlordId, propertyId, periodStart, periodEnd],
    queryFn: () => reportsApi.cashFlow({
      ...(landlordId ? { landlord_id: Number(landlordId) } : {}),
      ...(propertyId ? { property_id: Number(propertyId) } : {}),
      ...(periodStart ? { start_date: periodStart } : {}),
      ...(periodEnd ? { end_date: periodEnd } : {}),
    }).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  // Store data for export
  if (data) reportDataStore.data = data

  const netChange = data?.summary?.net_change_in_cash || 0
  const isPositive = netChange >= 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-50 dark:bg-cyan-900/30 flex items-center justify-center">
            <Banknote className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Cash Flow Statement</h2>
            <p className="text-sm text-gray-500">
              {data?.period?.start ? `${data.period.start} to ${data.period.end}` : 'Current Period'}
            </p>
          </div>
        </div>
        <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-4">
        {/* Operating Activities — wrapped in an Accordion so users can
            collapse sections they don't need. Net-cash line stays
            in the header (right slot) so collapsed sections still
            communicate the section bottom-line. */}
        <Accordion
          title={
            <span className="inline-flex items-center gap-2 text-emerald-800">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Operating Activities
            </span>
          }
          right={
            isLoading
              ? <div className="h-4 w-24 bg-emerald-100 rounded animate-pulse" />
              : <span className="text-sm font-semibold text-emerald-700 tabular-nums">
                  {formatCurrency(data?.operating_activities?.net_cash || 0)}
                </span>
          }
          className="border-emerald-200"
          headerClassName="bg-emerald-50 hover:bg-emerald-100/60"
        >
          <div className="divide-y divide-emerald-100">
            <div className="px-5 py-3 flex justify-between hover:bg-emerald-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                Cash receipts from tenants
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-emerald-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-emerald-700 tabular-nums">
                  {formatCurrency(data?.operating_activities?.inflows?.tenant_receipts || 0)}
                </span>
              )}
            </div>
            <div className="px-5 py-3 flex justify-between hover:bg-emerald-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-rose-500" />
                Cash paid for expenses
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-rose-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-rose-700 tabular-nums">
                  ({formatCurrency(data?.operating_activities?.outflows?.expense_payments || 0)})
                </span>
              )}
            </div>
            <div className="px-5 py-3 flex justify-between hover:bg-emerald-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-rose-500" />
                Cash paid to suppliers
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-rose-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-rose-700 tabular-nums">
                  ({formatCurrency(data?.operating_activities?.outflows?.supplier_payments || 0)})
                </span>
              )}
            </div>
            <div className="px-5 py-3 flex justify-between hover:bg-emerald-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-rose-500" />
                Cash paid to managing agent
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-rose-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-rose-700 tabular-nums">
                  ({formatCurrency(data?.operating_activities?.outflows?.agent_commission || 0)})
                </span>
              )}
            </div>
            {/* Per-income-type breakdown of agent commission, indented under
                the parent line so users can see which sub-account contributed
                what (e.g. Rent commission, Maintenance commission). */}
            {Array.isArray(data?.operating_activities?.outflows?.agent_commission_by_type) &&
              data.operating_activities.outflows.agent_commission_by_type.length > 0 &&
              data.operating_activities.outflows.agent_commission_by_type.map((row: any) => (
                <div key={`agent-comm-${row.income_type_id ?? row.income_type_name}`}
                     className="px-5 py-1.5 flex justify-between bg-gray-50/30">
                  <span className="text-gray-500 text-xs pl-6 flex items-center gap-1.5">
                    <span className="text-gray-300">·</span>
                    {row.income_type_name}
                  </span>
                  <span className="text-rose-600 text-xs tabular-nums">
                    ({formatCurrency(row.amount || 0)})
                  </span>
                </div>
              ))}
            <div className="px-5 py-3 flex justify-between hover:bg-emerald-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-rose-500" />
                Cash paid to landlord
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-rose-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-rose-700 tabular-nums">
                  ({formatCurrency(data?.operating_activities?.outflows?.landlord_payments || 0)})
                </span>
              )}
            </div>
          </div>
          <div className="px-5 py-4 bg-emerald-100 flex justify-between font-bold text-emerald-800">
            <span>Net Cash from Operating</span>
            {isLoading ? (
              <div className="h-5 w-28 bg-emerald-200 rounded animate-pulse" />
            ) : (
              <span className="tabular-nums">{formatCurrency(data?.operating_activities?.net_cash || 0)}</span>
            )}
          </div>
        </Accordion>

        {/* Investing Activities */}
        <Accordion
          title={
            <span className="inline-flex items-center gap-2 text-blue-800">
              <Building2 className="w-4 h-4 text-blue-600" />
              Investing Activities
            </span>
          }
          right={
            isLoading
              ? <div className="h-4 w-24 bg-blue-100 rounded animate-pulse" />
              : <span className="text-sm font-semibold text-blue-700 tabular-nums">
                  {formatCurrency(data?.investing_activities?.net_cash || 0)}
                </span>
          }
          className="border-blue-200"
          headerClassName="bg-blue-50 hover:bg-blue-100/60"
        >
          <div className="divide-y divide-blue-100">
            <div className="px-5 py-3 flex justify-between hover:bg-blue-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                Proceeds from asset sales
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-emerald-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-emerald-700 tabular-nums">
                  {formatCurrency(data?.investing_activities?.inflows?.asset_sales || 0)}
                </span>
              )}
            </div>
            <div className="px-5 py-3 flex justify-between hover:bg-blue-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-rose-500" />
                Purchase of assets
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-rose-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-rose-700 tabular-nums">
                  ({formatCurrency(data?.investing_activities?.outflows?.asset_purchases || 0)})
                </span>
              )}
            </div>
          </div>
          <div className="px-5 py-4 bg-blue-100 flex justify-between font-bold text-blue-800">
            <span>Net Cash from Investing</span>
            {isLoading ? (
              <div className="h-5 w-28 bg-blue-200 rounded animate-pulse" />
            ) : (
              <span className="tabular-nums">{formatCurrency(data?.investing_activities?.net_cash || 0)}</span>
            )}
          </div>
        </Accordion>

        {/* Financing Activities */}
        <Accordion
          title={
            <span className="inline-flex items-center gap-2 text-purple-800">
              <DollarSign className="w-4 h-4 text-purple-600" />
              Financing Activities
            </span>
          }
          right={
            isLoading
              ? <div className="h-4 w-24 bg-purple-100 rounded animate-pulse" />
              : <span className="text-sm font-semibold text-purple-700 tabular-nums">
                  {formatCurrency(data?.financing_activities?.net_cash || 0)}
                </span>
          }
          className="border-purple-200"
          headerClassName="bg-purple-50 hover:bg-purple-100/60"
        >
          <div className="divide-y divide-purple-100">
            <div className="px-5 py-3 flex justify-between hover:bg-purple-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                Owner contributions
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-emerald-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-emerald-700 tabular-nums">
                  {formatCurrency(data?.financing_activities?.inflows?.owner_contributions || 0)}
                </span>
              )}
            </div>
            <div className="px-5 py-3 flex justify-between items-center hover:bg-purple-50/50">
              <span className="text-gray-700 flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-rose-500" />
                Owner withdrawals
              </span>
              {isLoading ? (
                <div className="h-5 w-24 bg-rose-100 rounded animate-pulse" />
              ) : (
                <span className="font-semibold text-rose-700 tabular-nums">
                  ({formatCurrency(data?.financing_activities?.outflows?.owner_withdrawals || 0)})
                </span>
              )}
            </div>
          </div>
          <div className="px-5 py-4 bg-purple-100 flex justify-between font-bold text-purple-800">
            <span>Net Cash from Financing</span>
            {isLoading ? (
              <div className="h-5 w-28 bg-purple-200 rounded animate-pulse" />
            ) : (
              <span className="tabular-nums">{formatCurrency(data?.financing_activities?.net_cash || 0)}</span>
            )}
          </div>
        </Accordion>

        {/* Summary */}
        <div className="space-y-3">
          <div className="p-4 bg-gray-50 rounded-xl flex justify-between">
            <span className="text-gray-600">Beginning Cash Balance</span>
            {isLoading ? (
              <div className="h-5 w-28 bg-gray-200 rounded animate-pulse" />
            ) : (
              <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(data?.summary?.beginning_cash || 0)}</span>
            )}
          </div>

          <div className={cn(
            'rounded-xl p-6',
            isLoading ? 'bg-gradient-to-r from-gray-400 to-gray-500' : isPositive ? 'bg-gradient-to-r from-cyan-500 to-cyan-600' : 'bg-gradient-to-r from-rose-500 to-rose-600'
          )}>
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                {isLoading ? <TrendingUp className="w-8 h-8" /> : isPositive ? <TrendingUp className="w-8 h-8" /> : <TrendingDown className="w-8 h-8" />}
                <span className="text-xl font-semibold">Net Change in Cash</span>
              </div>
              {isLoading ? (
                <div className="h-9 w-32 bg-white/30 rounded animate-pulse" />
              ) : (
                <span className="text-3xl font-bold tabular-nums">
                  {isPositive ? '' : '-'}{formatCurrency(Math.abs(netChange))}
                </span>
              )}
            </div>
          </div>

          <div className="p-4 bg-gray-900 text-white rounded-xl flex justify-between">
            <span className="text-gray-300">Ending Cash Balance</span>
            {isLoading ? (
              <div className="h-8 w-32 bg-gray-700 rounded animate-pulse" />
            ) : (
              <span className="font-bold text-2xl tabular-nums">{formatCurrency(data?.summary?.ending_cash || 0)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export { CashFlowReport }
