import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Building2, ArrowLeft, Mail, Phone, MapPin, Hash, FileText, Wallet,
} from 'lucide-react'
import { supplierApi, expenseApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { PageHeader, Button, Skeleton, EmptyState, Badge } from '../../components/ui'

export default function SupplierDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: supplier, isLoading } = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => supplierApi.get(Number(id)).then(r => r.data),
    enabled: !!id,
  })

  const { data: expData, isLoading: expLoading } = useQuery({
    queryKey: ['supplier-expenses', id],
    queryFn: () => expenseApi.list({ supplier: Number(id), page_size: 200, ordering: '-date' }).then(r => r.data),
    enabled: !!id,
  })
  const expenses: any[] = expData?.results || expData || []

  const sum = (pred: (e: any) => boolean) =>
    expenses.filter(pred).reduce((t, e) => t + Number(e.amount || 0), 0)
  const notCancelled = (e: any) => e.status !== 'cancelled'
  // Non-cash entries are invoices raised (amounts owed); cash entries are
  // actual payments made from cash/bank.
  const totalBilled = sum(e => notCancelled(e) && e.expense_kind === 'non_cash')
  const totalPaid = sum(e => notCancelled(e) && e.expense_kind !== 'non_cash')
  const outstanding = totalBilled - totalPaid

  // Display helpers: an invoice raised via non-cash reads "Owed"; a cash
  // settlement reads "Paid". METHOD shows how it was settled.
  const rowStatus = (e: any) =>
    e.status === 'cancelled' ? 'Cancelled' : (e.expense_kind === 'non_cash' ? 'Owed' : 'Paid')
  const rowStatusVariant = (e: any) =>
    e.status === 'cancelled' ? 'danger' : (e.expense_kind === 'non_cash' ? 'warning' : 'success')
  const rowMethod = (e: any) =>
    e.expense_kind === 'non_cash' ? 'Non-cash' : (e.bank_account_name || 'Cash')

  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier?.name || 'Supplier'}
        subtitle={supplier?.code ? `Supplier ${supplier.code}` : 'Supplier detail'}
        icon={Building2}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Chart of Accounts', href: '/dashboard/chart-of-accounts' },
          { label: supplier?.name || '…' },
        ]}
        actions={
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate('/dashboard/chart-of-accounts')}>
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        }
      />

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !supplier ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500">
          Supplier not found.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Outstanding (owed)</p>
              <p className="text-2xl font-bold text-rose-600 mt-1 tabular-nums">{formatCurrency(outstanding)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Paid</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1 tabular-nums">{formatCurrency(totalPaid)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Billed</p>
              <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{formatCurrency(totalBilled)}</p>
            </div>
          </div>

          {/* Contact card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Supplier Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <Detail icon={Hash} label="Code" value={supplier.code} />
              <Detail icon={Mail} label="Email" value={supplier.email} />
              <Detail icon={Phone} label="Phone" value={supplier.phone} />
              <Detail icon={MapPin} label="Address" value={supplier.address} />
              <Detail icon={FileText} label="VAT Number" value={supplier.tax_id} />
              <Detail icon={FileText} label="TIN Number" value={supplier.tin_number} />
              <Detail icon={Wallet} label="Default Expenditure Category" value={supplier.default_expense_category_name} />
            </div>
            {supplier.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-700">{supplier.notes}</p>
              </div>
            )}
          </div>

          {/* Expenditure history */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Expenditure History</h3>
            </div>
            {expLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !expenses.length ? (
              <EmptyState icon={FileText} title="No expenditure" description="This supplier has no recorded expenditure yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Number</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Method</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {expenses.map((e: any) => (
                      <tr
                        key={e.id}
                        onClick={() => navigate(`/dashboard/expenses/${e.id}`)}
                        className="hover:bg-primary-50/40 cursor-pointer"
                      >
                        <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{formatDate(e.date)}</td>
                        <td className="px-5 py-3 font-medium text-primary-600 whitespace-nowrap">{e.expense_number}</td>
                        <td className="px-5 py-3 text-gray-600 max-w-xs truncate">{e.description || e.expense_category_name || '—'}</td>
                        <td className="px-5 py-3"><Badge variant={rowStatusVariant(e)}>{rowStatus(e)}</Badge></td>
                        <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{rowMethod(e)}</td>
                        <td className={cn('px-5 py-3 text-right tabular-nums font-semibold',
                          e.expense_kind === 'non_cash' ? 'text-rose-600' : 'text-gray-900')}>
                          {formatCurrency(e.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Detail({ icon: Icon, label, value }: { icon: any; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-gray-800">{value || '—'}</p>
      </div>
    </div>
  )
}
