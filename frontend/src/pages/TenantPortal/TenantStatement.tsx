import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Printer } from 'lucide-react'
import { tenantPortalApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { Button } from '../../components/ui'
import { printElement } from '../../lib/print'

export default function TenantStatement() {
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-statement'],
    queryFn: () => tenantPortalApi.statement().then(r => r.data),
  })

  const entries = data?.entries || data?.results || data || []

  const handlePrint = () => {
    printElement('statement-content', {
      title: 'Tenant Statement',
      subtitle: `Generated on ${new Date().toLocaleDateString()}`,
    })
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Account Statement</h1>
          <p className="text-sm text-gray-500 mt-1">Your complete account ledger</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={handlePrint}>
          <Printer className="w-4 h-4" />
          Print
        </Button>
      </motion.div>

      <div id="statement-content" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Reference</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Debit</th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Credit</th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-40 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 w-16 bg-gray-200 rounded ml-auto" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 w-16 bg-gray-200 rounded ml-auto" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 w-20 bg-gray-200 rounded ml-auto" /></td>
                </tr>
              ))
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                  <BookOpen className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p className="font-medium">No statement entries found</p>
                </td>
              </tr>
            ) : entries.map((entry: any, idx: number) => (
              <motion.tr
                key={idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.01 }}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-4 text-sm text-gray-600">{formatDate(entry.date)}</td>
                <td className="px-6 py-4 text-sm font-mono text-primary-600">{entry.reference || '-'}</td>
                <td className="px-6 py-4 text-sm text-gray-900">{entry.description}</td>
                <td className="px-6 py-4 text-sm text-right">
                  {entry.debit > 0 ? (
                    <span className="font-semibold text-red-600 tabular-nums">{formatCurrency(entry.debit)}</span>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-right">
                  {entry.credit > 0 ? (
                    <span className="font-semibold text-emerald-600 tabular-nums">{formatCurrency(entry.credit)}</span>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm font-semibold text-right tabular-nums">
                  <span className={entry.running_balance > 0 ? 'text-red-600' : entry.running_balance < 0 ? 'text-emerald-600' : 'text-gray-900'}>
                    {formatCurrency(Math.abs(entry.running_balance || entry.balance || 0))}
                    {(entry.running_balance || entry.balance || 0) > 0 ? ' DR' : (entry.running_balance || entry.balance || 0) < 0 ? ' CR' : ''}
                  </span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
