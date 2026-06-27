import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileSpreadsheet, ArrowLeft, ArrowRight, ArrowUpRight, ArrowDownLeft,
  Calendar, Clock, CheckCircle2, RotateCcw, Send, Loader2,
} from 'lucide-react'
import { journalApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { PageHeader, Button, Skeleton, Badge } from '../../components/ui'
import toast from 'react-hot-toast'

const statusConfig: Record<string, { color: string; bg: string; label: string; icon: any }> = {
  draft: { color: 'text-amber-600', bg: 'bg-amber-50', label: 'Draft', icon: Clock },
  posted: { color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Posted', icon: CheckCircle2 },
  reversed: { color: 'text-gray-500', bg: 'bg-gray-100', label: 'Reversed', icon: RotateCcw },
}

export default function JournalDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: journal, isLoading } = useQuery({
    queryKey: ['journal', id],
    queryFn: () => journalApi.get(Number(id)).then(r => r.data),
    enabled: !!id,
  })

  const postMutation = useMutation({
    mutationFn: () => journalApi.post(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal', id] })
      queryClient.invalidateQueries({ queryKey: ['journals'] })
      toast.success('Journal posted to ledger')
    },
    onError: () => toast.error('Failed to post journal'),
  })

  const cfg = journal ? (statusConfig[journal.status] || statusConfig.draft) : statusConfig.draft
  const StatusIcon = cfg.icon

  return (
    <div className="space-y-6">
      <PageHeader
        title={journal?.journal_number || 'Journal'}
        subtitle="Journal entry detail"
        icon={FileSpreadsheet}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Journals', href: '/dashboard/journals' },
          { label: journal?.journal_number || '…' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate('/dashboard/journals')}>
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            {journal?.status === 'draft' && (
              <Button size="sm" className="gap-2" onClick={() => postMutation.mutate()} disabled={postMutation.isPending}>
                {postMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Post to Ledger
              </Button>
            )}
          </div>
        }
      />

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : !journal ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500">
          Journal not found.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Header summary */}
          <div className="p-5 border-b border-gray-100 flex flex-wrap items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-gray-900">{journal.journal_number}</h3>
                <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', cfg.bg, cfg.color)}>
                  <StatusIcon className="w-3 h-3" />
                  {cfg.label}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{journal.description}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">
                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                {formatDate(journal.date)}
              </p>
              <p className="font-semibold text-gray-900 mt-1">{formatCurrency(journal.total_debit || 0)}</p>
            </div>
          </div>

          {/* Entries */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Account</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />Debit</span>
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1"><ArrowDownLeft className="w-3 h-3" />Credit</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(journal.entries || []).map((entry: any, idx: number) => (
                  <tr key={entry.id || idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-primary-600 font-medium">{entry.target_code || entry.account_code}</span>
                        <ArrowRight className="w-3 h-3 text-gray-300" />
                        <span className="text-gray-700">{entry.target_name || entry.account_name}</span>
                        {entry.target_kind && entry.target_kind !== 'gl' && (
                          <Badge variant="secondary" className="ml-1 capitalize">
                            {entry.target_kind === 'subsidiary' ? 'Sub-Account' : 'Bank'}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{entry.description}</td>
                    <td className="px-6 py-4 text-right">
                      {entry.debit_amount > 0
                        ? <span className="font-semibold text-blue-600 tabular-nums">{formatCurrency(entry.debit_amount)}</span>
                        : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {entry.credit_amount > 0
                        ? <span className="font-semibold text-rose-600 tabular-nums">{formatCurrency(entry.credit_amount)}</span>
                        : <span className="text-gray-300">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td colSpan={2} className="px-6 py-3 text-right text-gray-700">Total</td>
                  <td className="px-6 py-3 text-right text-blue-600 tabular-nums">{formatCurrency(journal.total_debit || 0)}</td>
                  <td className="px-6 py-3 text-right text-rose-600 tabular-nums">{formatCurrency(journal.total_credit || 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
