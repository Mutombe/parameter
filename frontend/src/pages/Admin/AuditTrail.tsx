import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Shield, Clock, User } from 'lucide-react'
import { auditApi } from '../../services/api'
import { formatDate, useDebounce } from '../../lib/utils'

export default function AuditTrail() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [actionFilter, setActionFilter] = useState('')

  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ['audit-trail', debouncedSearch, actionFilter],
    queryFn: () => {
      const params: any = { search: debouncedSearch }
      if (actionFilter) params.action = actionFilter
      return auditApi.list(params).then(r => r.data.results || r.data)
    },
  })

  const actionColors: Record<string, string> = {
    journal_posted: 'bg-green-100 text-green-700',
    journal_reversed: 'bg-orange-100 text-orange-700',
    invoice_created: 'bg-blue-100 text-blue-700',
    receipt_created: 'bg-emerald-100 text-emerald-700',
    account_created: 'bg-purple-100 text-purple-700',
    account_updated: 'bg-yellow-100 text-yellow-700',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
        <p className="text-gray-500 mt-1">Immutable log of all financial actions</p>
      </div>

      <div className="card p-4 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search audit logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="input w-auto">
          <option value="">All Actions</option>
          <option value="journal_posted">Journal Posted</option>
          <option value="journal_reversed">Journal Reversed</option>
          <option value="invoice_created">Invoice Created</option>
          <option value="receipt_created">Receipt Created</option>
        </select>
      </div>

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
                      <User className="w-3 h-3" />
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
      ) : (
        <div className="space-y-3">
          {auditLogs?.map((log: any) => (
            <div key={log.id} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-6 h-6 text-gray-600" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${actionColors[log.action] || 'bg-gray-100 text-gray-700'}`}>
                      {log.action?.replace('_', ' ')}
                    </span>
                    <span className="text-sm text-gray-500">{log.model_name} #{log.record_id}</span>
                  </div>

                  <div className="text-sm text-gray-600 mb-2">
                    <pre className="font-mono text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                      {JSON.stringify(log.changes, null, 2)}
                    </pre>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {log.user_email || 'System'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    {log.ip_address && (
                      <span>IP: {log.ip_address}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
