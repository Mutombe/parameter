import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  Home,
  DollarSign,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  FileText,
  Printer,
} from 'lucide-react'
import { tenantPortalApi } from '../../services/api'
import { formatCurrency, formatDate, cn, getMediaUrl } from '../../lib/utils'
import { Button } from '../../components/ui'
import { printLease } from '../../lib/printTemplate'

const statusConfig: Record<string, { color: string; bgColor: string; icon: any; label: string }> = {
  draft: { color: 'text-gray-600', bgColor: 'bg-gray-100', icon: Clock, label: 'Draft' },
  active: { color: 'text-emerald-600', bgColor: 'bg-emerald-50', icon: CheckCircle, label: 'Active' },
  expired: { color: 'text-amber-600', bgColor: 'bg-amber-50', icon: AlertTriangle, label: 'Expired' },
  terminated: { color: 'text-rose-600', bgColor: 'bg-rose-50', icon: XCircle, label: 'Terminated' },
}

export default function TenantLease() {
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-lease'],
    queryFn: () => tenantPortalApi.lease().then(r => r.data),
  })

  const lease = data?.active_lease || null

  const config = statusConfig[lease?.status || 'draft'] || statusConfig.draft
  const StatusIcon = config.icon

  const leaseTerm = (() => {
    if (!lease?.start_date || !lease?.end_date) return 0
    const start = new Date(lease.start_date)
    const end = new Date(lease.end_date)
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30))
  })()

  const daysRemaining = (() => {
    if (!lease?.end_date || lease?.status !== 'active') return 0
    const end = new Date(lease.end_date)
    return Math.max(0, Math.ceil((end.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
  })()

  const handlePrintLease = () => {
    if (!lease) return
    printLease({
      lease_number: lease.lease_number,
      tenant_name: lease.tenant_name,
      unit_display: lease.unit_display,
      status: lease.status || 'draft',
      start_date: lease.start_date,
      end_date: lease.end_date,
      monthly_rent: lease.monthly_rent || 0,
      deposit_amount: lease.deposit_amount,
      payment_day: lease.payment_day,
      billing_day: lease.billing_day,
      currency: lease.currency,
      notes: lease.notes,
      leaseTerm,
      daysRemaining,
    })
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">My Lease</h1>
          <p className="text-sm text-gray-500 mt-1">Your current lease agreement details</p>
        </div>
        {lease && (
          <Button variant="outline" className="gap-2" onClick={handlePrintLease}>
            <Printer className="w-4 h-4" />
            Download Summary
          </Button>
        )}
      </motion.div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-16 bg-gray-200 rounded" />
                  <div className="h-5 w-32 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : !lease ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Home className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="font-medium text-gray-600">No active lease found</p>
          <p className="text-sm text-gray-400 mt-1">Contact your property manager for details</p>
        </div>
      ) : (
        <>
          {/* Lease Details Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Lease {lease.lease_number}</h2>
              <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', config.bgColor, config.color)}>
                <StatusIcon className="w-3 h-3" />
                {config.label}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Unit</p>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Home className="w-3.5 h-3.5 text-gray-400" />
                  <span>{lease.unit_display}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Monthly Rent</p>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-semibold">{formatCurrency(lease.monthly_rent || 0)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Lease Period</p>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <span>{formatDate(lease.start_date)} - {formatDate(lease.end_date)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Payment Day</p>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span>Day {lease.payment_day || lease.billing_day || '-'} of each month</span>
                </div>
              </div>
            </div>

            {/* Summary Row */}
            <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-xs text-gray-400">Deposit</p>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(lease.deposit_amount || 0)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Lease Term</p>
                <p className="text-lg font-bold text-gray-900">{leaseTerm} months</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Days Remaining</p>
                <p className={cn(
                  "text-lg font-bold",
                  daysRemaining > 90 ? 'text-emerald-600' : daysRemaining > 30 ? 'text-amber-600' : 'text-red-600'
                )}>
                  {lease.status === 'active' ? daysRemaining : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Currency</p>
                <p className="text-lg font-bold text-gray-900">{lease.currency}</p>
              </div>
            </div>
          </motion.div>

          {/* Lease Document */}
          {(lease.document || lease.document_url) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-white rounded-xl border border-gray-200 p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Lease Document</h3>
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Lease Agreement</p>
                    <p className="text-xs text-gray-500">PDF Document</p>
                  </div>
                </div>
                <a
                  href={lease.document_url || getMediaUrl(lease.document) || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
              </div>
              {(lease.document_url || lease.document || '').endsWith('.pdf') && (
                <iframe
                  src={lease.document_url || getMediaUrl(lease.document) || ''}
                  className="w-full h-96 rounded-lg border border-gray-200 mt-4"
                  title="Lease Document"
                />
              )}
            </motion.div>
          )}

          {/* Notes */}
          {lease.notes && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-xl border border-gray-200 p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Notes</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{lease.notes}</p>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}
