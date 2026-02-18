import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Shield, Clock, ChevronLeft, ChevronRight, Calendar, Monitor, Globe } from 'lucide-react'
import { auditApi } from '../../services/api'
import { Select, TimeAgo } from '../../components/ui'
import { formatDate, useDebounce } from '../../lib/utils'
import { TbUserSquareRounded } from "react-icons/tb";

export default function AuditTrail() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [actionFilter, setActionFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['audit-trail', debouncedSearch, actionFilter, startDate, endDate, page],
    queryFn: () => {
      const params: any = { search: debouncedSearch, page }
      if (actionFilter) params.action = actionFilter
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate
      return auditApi.list(params).then(r => r.data)
    },
  })

  const auditLogs = data?.results || data || []
  const totalCount = data?.count || 0
  const pageSize = 20
  const totalPages = Math.ceil(totalCount / pageSize)
  const hasNext = !!data?.next
  const hasPrev = !!data?.previous

  const actionColors: Record<string, string> = {
    journal_posted: 'bg-green-100 text-green-700',
    journal_reversed: 'bg-orange-100 text-orange-700',
    invoice_created: 'bg-blue-100 text-blue-700',
    invoice_updated: 'bg-blue-50 text-blue-600',
    invoice_payment_applied: 'bg-teal-100 text-teal-700',
    invoice_marked_overdue: 'bg-red-100 text-red-700',
    receipt_created: 'bg-emerald-100 text-emerald-700',
    receipt_updated: 'bg-emerald-50 text-emerald-600',
    account_created: 'bg-purple-100 text-purple-700',
    account_updated: 'bg-yellow-100 text-yellow-700',
    fiscal_period_closed: 'bg-indigo-100 text-indigo-700',
    reconciliation_completed: 'bg-cyan-100 text-cyan-700',
    expense_reallocated: 'bg-amber-100 text-amber-700',
    uniform_charge_applied: 'bg-violet-100 text-violet-700',
    billing_deleted: 'bg-red-100 text-red-600',
    bulk_email_sent: 'bg-sky-100 text-sky-700',
  }

  // Reset to page 1 when filters change
  const handleFilterChange = (setter: (val: string) => void, val: string) => {
    setter(val)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
        <p className="text-gray-500 mt-1">Immutable log of all financial actions</p>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap items-end gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search audit logs..."
              value={search}
              onChange={(e) => handleFilterChange(setSearch, e.target.value)}
              className="input pl-10"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
          <Select
            value={actionFilter}
            onChange={(e) => handleFilterChange(setActionFilter, e.target.value)}
            className="w-auto"
            options={[
              { value: '', label: 'All Actions' },
              { value: 'journal_posted', label: 'Journal Posted' },
              { value: 'journal_reversed', label: 'Journal Reversed' },
              { value: 'invoice_created', label: 'Invoice Created' },
              { value: 'invoice_updated', label: 'Invoice Updated' },
              { value: 'invoice_payment_applied', label: 'Payment Applied' },
              { value: 'invoice_marked_overdue', label: 'Marked Overdue' },
              { value: 'receipt_created', label: 'Receipt Created' },
              { value: 'account_created', label: 'Account Created' },
              { value: 'account_updated', label: 'Account Updated' },
              { value: 'fiscal_period_closed', label: 'Period Closed' },
              { value: 'reconciliation_completed', label: 'Reconciliation Done' },
              { value: 'expense_reallocated', label: 'Expense Reallocated' },
              { value: 'uniform_charge_applied', label: 'Uniform Charge' },
              { value: 'billing_deleted', label: 'Billing Deleted' },
              { value: 'bulk_email_sent', label: 'Bulk Email Sent' },
            ]}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => handleFilterChange(setStartDate, e.target.value)}
            className="input w-auto"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => handleFilterChange(setEndDate, e.target.value)}
            className="input w-auto"
          />
        </div>
        {(startDate || endDate || actionFilter || search) && (
          <button
            onClick={() => {
              setSearch('')
              setActionFilter('')
              setStartDate('')
              setEndDate('')
              setPage(1)
            }}
            className="text-sm text-gray-500 hover:text-gray-700 underline pb-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Results count */}
      {!isLoading && (
        <div className="text-sm text-gray-500">
          Showing {auditLogs.length} of {totalCount} entries
          {totalPages > 1 && ` (page ${page} of ${totalPages})`}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-6 h-6 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-5 w-24 bg-gray-200 rounded-full" />
                    <div className="h-4 w-28 bg-gray-200 rounded" />
                  </div>
                  <div className="font-mono text-xs bg-gray-50 p-2 rounded mb-2">
                    <div className="h-3 w-full bg-gray-200 rounded mb-1" />
                    <div className="h-3 w-3/4 bg-gray-200 rounded mb-1" />
                    <div className="h-3 w-1/2 bg-gray-200 rounded" />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <TbUserSquareRounded className="w-3 h-3" />
                      <span className="h-3 w-24 bg-gray-200 rounded inline-block" />
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span className="h-3 w-32 bg-gray-200 rounded inline-block" />
                    </span>
                    <span className="h-3 w-20 bg-gray-200 rounded" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : auditLogs.length === 0 ? (
        <div className="card p-12 text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600">No audit logs found</h3>
          <p className="text-gray-400 mt-1">Try adjusting your filters or date range</p>
        </div>
      ) : (
        <div className="space-y-3">
          {auditLogs.map((log: any) => (
            <div key={log.id} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-6 h-6 text-gray-600" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${actionColors[log.action] || 'bg-gray-100 text-gray-700'}`}>
                      {log.action?.replace(/_/g, ' ')}
                    </span>
                    <span className="text-sm text-gray-500">{log.model_name} #{log.record_id}</span>
                  </div>

                  <div className="text-sm text-gray-600 mb-2">
                    <pre className="font-mono text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                      {JSON.stringify(log.changes, null, 2)}
                    </pre>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <TbUserSquareRounded className="w-3.5 h-3.5" />
                      {log.user_email || 'System'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <TimeAgo date={log.timestamp} />
                    </span>
                    {log.ip_address && (
                      <span className="flex items-center gap-1">
                        <Globe className="w-3.5 h-3.5" />
                        {log.ip_address}
                      </span>
                    )}
                    {log.user_agent && (
                      <span className="flex items-center gap-1 max-w-[300px] truncate" title={log.user_agent}>
                        <Monitor className="w-3.5 h-3.5 flex-shrink-0" />
                        {log.user_agent.length > 60 ? log.user_agent.substring(0, 60) + '...' : log.user_agent}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages} ({totalCount} total entries)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={!hasPrev}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            {/* Page number buttons */}
            {(() => {
              const pages: number[] = []
              const start = Math.max(1, page - 2)
              const end = Math.min(totalPages, page + 2)
              for (let i = start; i <= end; i++) pages.push(i)
              return pages.map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-10 h-10 text-sm font-medium rounded-lg ${
                    p === page
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              ))
            })()}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={!hasNext}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
