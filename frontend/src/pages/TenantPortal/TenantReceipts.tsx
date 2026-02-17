import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Receipt, Download, Printer } from 'lucide-react'
import { tenantPortalApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { Button } from '../../components/ui'
import { printTable, printReceipt } from '../../lib/printTemplate'

export default function TenantReceipts() {
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-receipts'],
    queryFn: () => tenantPortalApi.receipts().then(r => r.data),
  })

  const receipts = data?.receipts || data?.results || []

  const handlePrintAll = () => {
    printTable(
      receipts.map((r: any) => ({
        receipt_number: r.receipt_number,
        date: formatDate(r.date),
        amount: formatCurrency(r.amount || 0),
        method: r.payment_method || '-',
        reference: r.reference || '-',
      })),
      [
        { key: 'receipt_number', label: 'Receipt #' },
        { key: 'date', label: 'Date' },
        { key: 'amount', label: 'Amount', align: 'right' },
        { key: 'method', label: 'Method' },
        { key: 'reference', label: 'Reference' },
      ],
      { title: 'My Receipts', subtitle: `${receipts.length} receipts` }
    )
  }

  const handlePrintSingle = (r: any) => {
    printReceipt({
      receipt_number: r.receipt_number,
      tenant_name: r.tenant_name || '',
      invoice_number: r.invoice_number,
      date: r.date,
      payment_method: r.payment_method,
      reference: r.reference,
      amount: r.amount || 0,
    })
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">My Receipts</h1>
          <p className="text-sm text-gray-500 mt-1">View all your payment receipts</p>
        </div>
        {receipts.length > 0 && (
          <Button variant="outline" className="gap-2" onClick={handlePrintAll}>
            <Printer className="w-4 h-4" />
            Print All
          </Button>
        )}
      </motion.div>

      {/* Summary bar */}
      {data && !isLoading && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Total Paid</p>
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(data.total_paid || 0)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Receipts</p>
            <p className="text-lg font-bold text-gray-900">{data.count || receipts.length}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Receipt #</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Method</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Reference</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4 text-right"><div className="h-4 w-16 bg-gray-200 rounded ml-auto" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-8 bg-gray-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : receipts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    <Receipt className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                    <p className="font-medium">No receipts found</p>
                  </td>
                </tr>
              ) : receipts.map((r: any, idx: number) => (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className="hover:bg-gray-50 transition-colors group"
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{r.receipt_number}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{formatDate(r.date)}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-emerald-600 text-right">{formatCurrency(r.amount || 0)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 capitalize">{r.payment_method || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{r.reference || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handlePrintSingle(r)}
                      className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Download Receipt"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
