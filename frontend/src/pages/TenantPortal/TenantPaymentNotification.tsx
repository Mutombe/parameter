import { useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation } from '@tanstack/react-query'
import {
  Bell,
  DollarSign,
  Calendar,
  CreditCard,
  Hash,
  FileText,
  CheckCircle,
  Loader2,
} from 'lucide-react'
import { tenantPortalApi } from '../../services/api'
import { Button, Input, Select, Textarea } from '../../components/ui'
import { showToast, parseApiError } from '../../lib/toast'

export default function TenantPaymentNotification() {
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    reference: '',
    notes: '',
  })

  const notifyMutation = useMutation({
    mutationFn: (data: any) => tenantPortalApi.notifyPayment(data),
    onSuccess: () => {
      showToast.success('Payment notification sent successfully')
      setSubmitted(true)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to send notification')),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    notifyMutation.mutate({
      amount: parseFloat(form.amount),
      payment_date: form.payment_date,
      payment_method: form.payment_method,
      reference: form.reference || undefined,
      notes: form.notes || undefined,
    })
  }

  const resetForm = () => {
    setSubmitted(false)
    setForm({
      amount: '',
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'bank_transfer',
      reference: '',
      notes: '',
    })
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Notify Payment</h1>
        <p className="text-sm text-gray-500 mt-1">Let management know about your payment</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="max-w-lg"
      >
        {submitted ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Notification Sent!</h2>
            <p className="text-sm text-gray-500 mb-6">
              Your payment notification has been submitted to management. They will verify and process it shortly.
            </p>
            <Button onClick={resetForm} variant="outline">
              Send Another Notification
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
                <Bell className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Payment Details</h2>
                <p className="text-xs text-gray-500">Fill in the details of your payment</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                type="number"
                label="Amount"
                placeholder="0.00"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />

              <Input
                type="date"
                label="Payment Date"
                value={form.payment_date}
                onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                required
              />

              <Select
                label="Payment Method"
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="ecocash">EcoCash</option>
                <option value="innbucks">InnBucks</option>
                <option value="other">Other</option>
              </Select>

              <Input
                label="Reference Number"
                placeholder="e.g. Transfer reference or receipt number"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
              />

              <Textarea
                label="Notes"
                placeholder="Any additional details about your payment..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" className="flex-1" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={notifyMutation.isPending || !form.amount}>
                  {notifyMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Sending...
                    </>
                  ) : (
                    'Send Notification'
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </motion.div>
    </div>
  )
}
