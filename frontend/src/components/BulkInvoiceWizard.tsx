import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Check, Loader2, ChevronRight, ChevronLeft, Calendar, Building2, AlertCircle } from 'lucide-react'
import { invoiceApi, leaseApi } from '../services/api'
import { formatCurrency, cn } from '../lib/utils'
import { Modal, ModalFooter, Button, FormStepper } from './ui'
import { showToast, parseApiError } from '../lib/toast'

interface BulkInvoiceWizardProps {
  open: boolean
  onClose: () => void
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const steps = [
  { label: 'Period', description: 'Select billing period' },
  { label: 'Leases', description: 'Choose leases' },
  { label: 'Review', description: 'Confirm & generate' },
]

export default function BulkInvoiceWizard({ open, onClose }: BulkInvoiceWizardProps) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [selectedLeaseIds, setSelectedLeaseIds] = useState<number[]>([])
  const [selectAll, setSelectAll] = useState(true)

  // Fetch active leases
  const { data: leasesData, isLoading: leasesLoading } = useQuery({
    queryKey: ['leases-for-bulk', 'active'],
    queryFn: () => leaseApi.list({ status: 'active', page_size: 500 }).then(r => r.data),
    enabled: open,
  })

  const leases = leasesData?.results || leasesData || []

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: (data: { month: number; year: number; lease_ids?: number[] }) =>
      invoiceApi.generateMonthly(data),
    onSuccess: (response) => {
      const count = response.data?.created || response.data?.count || 'All'
      showToast.success(`${count} invoices generated successfully`)
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      handleClose()
    },
    onError: (err) => {
      showToast.error(parseApiError(err))
    },
  })

  const handleClose = () => {
    setStep(0)
    setSelectedLeaseIds([])
    setSelectAll(true)
    onClose()
  }

  const handleToggleLease = (id: number) => {
    setSelectAll(false)
    setSelectedLeaseIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectAll(false)
      setSelectedLeaseIds([])
    } else {
      setSelectAll(true)
      setSelectedLeaseIds(leases.map((l: any) => l.id))
    }
  }

  const effectiveLeaseIds = selectAll
    ? leases.map((l: any) => l.id)
    : selectedLeaseIds

  const totalAmount = useMemo(() => {
    return leases
      .filter((l: any) => effectiveLeaseIds.includes(l.id))
      .reduce((sum: number, l: any) => sum + (parseFloat(l.monthly_rent) || 0), 0)
  }, [leases, effectiveLeaseIds])

  const handleGenerate = () => {
    generateMutation.mutate({
      month,
      year,
      lease_ids: selectAll ? undefined : selectedLeaseIds,
    })
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Generate Monthly Invoices"
      description="Create invoices for active leases"
      icon={FileText}
      size="lg"
    >
      <FormStepper steps={steps} currentStep={step} />

      <AnimatePresence mode="wait">
        {/* Step 1: Period */}
        {step === 0 && (
          <motion.div
            key="step-0"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Month</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Year</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {[year - 1, year, year + 1].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <Calendar className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900">
                  Generating for {MONTHS[month - 1]} {year}
                </p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Invoices will be created for all active leases in the selected period.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 2: Lease Selection */}
        {step === 1 && (
          <motion.div
            key="step-1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {effectiveLeaseIds.length} of {leases.length} leases selected
              </p>
              <button
                onClick={handleSelectAll}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                {selectAll ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
              {leasesLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin mx-auto" />
                </div>
              ) : leases.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">
                  No active leases found
                </div>
              ) : (
                leases.map((lease: any) => {
                  const isSelected = selectAll || selectedLeaseIds.includes(lease.id)
                  return (
                    <label
                      key={lease.id}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors',
                        isSelected && 'bg-primary-50/50'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleLease(lease.id)}
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {lease.tenant_name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {lease.property_name} — Unit {lease.unit_number || lease.unit_name}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-gray-700 tabular-nums shrink-0">
                        {formatCurrency(parseFloat(lease.monthly_rent) || 0)}
                      </span>
                    </label>
                  )
                })
              )}
            </div>
          </motion.div>
        )}

        {/* Step 3: Review */}
        {step === 2 && (
          <motion.div
            key="step-2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Period</span>
                <span className="text-sm font-semibold text-gray-900">{MONTHS[month - 1]} {year}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Leases</span>
                <span className="text-sm font-semibold text-gray-900">{effectiveLeaseIds.length}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm font-medium text-gray-700">Total Invoiced Amount</span>
                <span className="text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(totalAmount)}</span>
              </div>
            </div>

            {effectiveLeaseIds.length === 0 && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800">No leases selected. Go back to select at least one lease.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <ModalFooter>
        {step > 0 && (
          <Button
            variant="outline"
            onClick={() => setStep(s => s - 1)}
            disabled={generateMutation.isPending}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        )}
        <div className="flex-1" />
        {step < 2 ? (
          <Button onClick={() => setStep(s => s + 1)}>
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending || effectiveLeaseIds.length === 0}
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-1" />
                Generate {effectiveLeaseIds.length} Invoices
              </>
            )}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  )
}
