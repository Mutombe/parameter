import { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { FileText, Download, Printer } from 'lucide-react'
import { tenantPortalApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { Button, Select } from '../../components/ui'
import { printTable, printInvoice } from '../../lib/printTemplate'

export default function TenantInvoices() {
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-invoices', statusFilter],
    queryFn: () => {
      const params: any = {}
      if (statusFilter) params.status = statusFilter
      return tenantPortalApi.invoices(params).then(r => r.data)
    },
  })

  const invoices = data?.invoices || data?.results || []

  const handlePrintAll = () => {
    printTable(
      invoices.map((inv: any) => ({
        invoice_number: inv.invoice_number,
        date: formatDate(inv.date),
        due_date: formatDate(inv.due_date),
        amount: formatCurrency(inv.total_amount || 0),
        balance: formatCurrency(inv.balance || 0),
        status: inv.status,
      })),
      [
        { key: 'invoice_number', label: 'Invoice #' },
        { key: 'date', label: 'Date' },
        { key: 'due_date', label: 'Due Date' },
        { key: 'amount', label: 'Amount', align: 'right' },
        { key: 'balance', label: 'Balance', align: 'right' },
        { key: 'status', label: 'Status' },
      ],
      { title: 'My Invoices', subtitle: `${invoices.length} invoices` }
    )
  }

  const handlePrintSingle = (inv: any) => {
    printInvoice({
      invoice_number: inv.invoice_number,
      tenant_name: inv.tenant_name || '',
      date: inv.date,
      due_date: inv.due_date,
      status: inv.status,
      invoice_type: inv.invoice_type,
      description: inv.description,
      total_amount: inv.total_amount || 0,
      balance: inv.balance || 0,
    })
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">My Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">View all your billing invoices</p>
        </div>
        {invoices.length > 0 && (
          <Button variant="outline" className="gap-2" onClick={handlePrintAll}>
            <Printer className="w-4 h-4" />
            Print All
          </Button>
        )}
      </motion.div>

      {/* Summary bar */}
      {data && !isLoading && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Total Invoiced</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(data.total_amount || 0)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Outstanding</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(data.total_balance || 0)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Count</p>
            <p className="text-lg font-bold text-gray-900">{data.count || invoices.length}</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-4">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          placeholder="All Statuses"
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'pending', label: 'Pending' },
            { value: 'posted', label: 'Posted' },
            { value: 'paid', label: 'Paid' },
            { value: 'overdue', label: 'Overdue' },
          ]}
        />
        <div className="ml-auto text-sm text-gray-500">{invoices.length} invoices</div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice #</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Due Date</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4 text-right"><div className="h-4 w-16 bg-gray-200 rounded ml-auto" /></td>
                    <td className="px-6 py-4 text-right"><div className="h-4 w-16 bg-gray-200 rounded ml-auto" /></td>
                    <td className="px-6 py-4"><div className="h-5 w-16 bg-gray-200 rounded-full" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-8 bg-gray-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    <FileText className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                    <p className="font-medium">No invoices found</p>
                  </td>
                </tr>
              ) : invoices.map((inv: any, idx: number) => (
                <motion.tr
                  key={inv.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className="hover:bg-gray-50 transition-colors group"
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{inv.invoice_number}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{formatDate(inv.date)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{formatDate(inv.due_date)}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">{formatCurrency(inv.total_amount || 0)}</td>
                  <td className="px-6 py-4 text-sm font-medium text-right">
                    <span className={(inv.balance || 0) > 0 ? 'text-red-600' : 'text-gray-900'}>
                      {formatCurrency(inv.balance || 0)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      'inline-flex px-2.5 py-1 rounded-full text-xs font-medium',
                      inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                      inv.status === 'overdue' ? 'bg-red-50 text-red-700' :
                      inv.status === 'draft' ? 'bg-gray-100 text-gray-600' :
                      'bg-amber-50 text-amber-700'
                    )}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handlePrintSingle(inv)}
                      className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Download Invoice"
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
