import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, CreditCard, Plus, Send, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { receiptApi, tenantApi, invoiceApi } from '../../services/api'
import { formatCurrency, formatDate, useDebounce } from '../../lib/utils'
import toast from 'react-hot-toast'

export default function Receipts() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [showForm, setShowForm] = useState(false)
  const [postingId, setPostingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    tenant: '',
    invoice: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    payment_method: 'bank_transfer',
    reference: '',
    description: '',
  })

  const { data: receipts, isLoading } = useQuery({
    queryKey: ['receipts', debouncedSearch],
    queryFn: () => receiptApi.list({ search: debouncedSearch }).then(r => r.data.results || r.data),
  })

  const { data: tenants } = useQuery({
    queryKey: ['tenants-select'],
    queryFn: () => tenantApi.list().then(r => r.data.results || r.data),
    enabled: showForm,
  })

  const { data: invoices } = useQuery({
    queryKey: ['invoices-unpaid'],
    queryFn: () => invoiceApi.list({ status: 'sent' }).then(r => r.data.results || r.data),
    enabled: showForm,
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => receiptApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] })
      toast.success('Receipt created')
      setShowForm(false)
    },
  })

  const postMutation = useMutation({
    mutationFn: (id: number) => receiptApi.postToLedger(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] })
      toast.success('Receipt posted to ledger')
      setPostingId(null)
    },
    onError: () => {
      toast.error('Failed to post receipt')
      setPostingId(null)
    },
  })

  const handlePost = (id: number) => {
    setPostingId(id)
    postMutation.mutate(id)
  }

  const methodLabels: Record<string, string> = {
    cash: 'Cash',
    bank_transfer: 'Bank Transfer',
    ecocash: 'EcoCash',
    card: 'Card',
    cheque: 'Cheque',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Receipts</h1>
          <p className="text-gray-500 mt-1">Record payments received</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="w-4 h-4 mr-2" /> Record Receipt
        </button>
      </div>

      <div className="card p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search receipts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-semibold mb-4">Record Receipt</h2>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }} className="space-y-4">
              <div>
                <label className="label">Tenant</label>
                <select value={form.tenant} onChange={(e) => setForm({ ...form, tenant: e.target.value })} className="input" required>
                  <option value="">Select tenant</option>
                  {tenants?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Against Invoice (Optional)</label>
                <select value={form.invoice} onChange={(e) => setForm({ ...form, invoice: e.target.value })} className="input">
                  <option value="">Select invoice</option>
                  {invoices?.map((inv: any) => <option key={inv.id} value={inv.id}>{inv.invoice_number} - {formatCurrency(inv.balance)}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Date</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" required />
                </div>
                <div>
                  <label className="label">Amount</label>
                  <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Payment Method</label>
                  <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="input">
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="ecocash">EcoCash</option>
                    <option value="card">Card</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="label">Reference</label>
                  <input type="text" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="input" placeholder="Bank ref, EcoCash ref..." />
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" rows={2} />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Record Receipt</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Receipt</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tenant</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Method</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reference</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">GL Posted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="h-4 w-28 bg-gray-200 rounded" />
                    </div>
                  </td>
                  <td className="px-6 py-4"><div className="h-4 w-32 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-5 w-24 bg-gray-200 rounded-full" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-28 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                  <td className="px-6 py-4">
                    <button className="text-gray-300 text-sm font-medium flex items-center gap-1">
                      <Send className="w-4 h-4" /> Post
                    </button>
                  </td>
                </tr>
              ))
            ) : receipts?.map((receipt: any) => (
                <tr key={receipt.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-emerald-600" />
                      </div>
                      <span className="font-medium">{receipt.receipt_number}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{receipt.tenant_name}</td>
                  <td className="px-6 py-4 font-medium text-green-600">{formatCurrency(receipt.amount)}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-gray-100 rounded-full text-xs">
                      {methodLabels[receipt.payment_method] || receipt.payment_method}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{receipt.reference || '-'}</td>
                  <td className="px-6 py-4 text-gray-600">{formatDate(receipt.date)}</td>
                  <td className="px-6 py-4">
                    {receipt.journal ? (
                      <span className="text-green-600 text-sm">{receipt.journal_number}</span>
                    ) : (
                      <button
                        onClick={() => handlePost(receipt.id)}
                        disabled={postingId === receipt.id}
                        className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
                      >
                        {postingId === receipt.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Posting...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" /> Post
                          </>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
