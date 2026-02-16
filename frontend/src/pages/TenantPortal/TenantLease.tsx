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
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Lease ${lease.lease_number}</title>
        <style>
          @page { size: A4; margin: 1.5cm; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1a1a1a; }
          .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
          .header h1 { font-size: 28px; margin: 0; color: #059669; }
          .header p { color: #6b7280; margin: 5px 0 0; }
          .status { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; background: #d1fae5; color: #065f46; }
          .details { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 30px; }
          .detail-group label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 4px; }
          .detail-group p { font-size: 16px; font-weight: 600; margin: 0; }
          .summary { background: #f9fafb; border-radius: 12px; padding: 24px; margin-top: 30px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
          .summary label { display: block; font-size: 11px; text-transform: uppercase; color: #6b7280; }
          .summary .value { font-size: 18px; font-weight: 700; }
          .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LEASE AGREEMENT</h1>
          <p>${lease.lease_number}</p>
          <div style="margin-top: 12px;"><span class="status">${(lease.status || 'draft').toUpperCase()}</span></div>
        </div>
        <div class="details">
          <div class="detail-group">
            <label>Unit</label>
            <p>${lease.unit_display || '-'}</p>
          </div>
          <div class="detail-group">
            <label>Monthly Rent</label>
            <p>${formatCurrency(lease.monthly_rent || 0)}</p>
          </div>
          <div class="detail-group">
            <label>Start Date</label>
            <p>${formatDate(lease.start_date)}</p>
          </div>
          <div class="detail-group">
            <label>End Date</label>
            <p>${formatDate(lease.end_date)}</p>
          </div>
          <div class="detail-group">
            <label>Payment Day</label>
            <p>Day ${lease.payment_day || lease.billing_day || '-'} of each month</p>
          </div>
          <div class="detail-group">
            <label>Currency</label>
            <p>${lease.currency || '-'}</p>
          </div>
        </div>
        <div class="summary">
          <div>
            <label>Deposit</label>
            <div class="value">${formatCurrency(lease.deposit_amount || 0)}</div>
          </div>
          <div>
            <label>Lease Term</label>
            <div class="value">${leaseTerm} months</div>
          </div>
          <div>
            <label>Days Remaining</label>
            <div class="value">${lease.status === 'active' ? daysRemaining : '-'}</div>
          </div>
          <div>
            <label>Tenant</label>
            <div class="value">${lease.tenant_name || '-'}</div>
          </div>
        </div>
        ${lease.notes ? `<div style="margin-top: 30px;"><label style="display: block; font-size: 11px; text-transform: uppercase; color: #6b7280; margin-bottom: 8px;">Notes</label><p style="font-size: 14px; color: #374151; white-space: pre-wrap;">${lease.notes}</p></div>` : ''}
        <div class="footer">Generated by Parameter Real Estate Accounting System &bull; ${new Date().toLocaleDateString()}</div>
      </body>
      </html>
    `)

    printWindow.document.close()
    printWindow.onload = () => {
      printWindow.focus()
      printWindow.print()
      printWindow.close()
    }
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
