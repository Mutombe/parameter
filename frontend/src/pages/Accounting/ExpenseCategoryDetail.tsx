import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { ArrowLeft, Layers, Receipt } from 'lucide-react'
import { expenseCategoryApi, expenseApi } from '../../services/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { Badge, Skeleton, EmptyState } from '../../components/ui'

/**
 * Expense Category detail — the category's configuration plus every
 * expense booked against it (with a running total). Reached by clicking a
 * category on the Expense Categories list or an expense's category label.
 */
export default function ExpenseCategoryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const categoryId = Number(id)

  const { data: category, isLoading } = useQuery({
    queryKey: ['expense-category', categoryId],
    queryFn: () => expenseCategoryApi.get(categoryId).then(r => r.data),
    enabled: !!categoryId,
  })

  const { data: expensesData, isLoading: loadingExpenses } = useQuery({
    queryKey: ['expense-category-expenses', categoryId],
    queryFn: () => expenseApi.list({ expense_category: categoryId, page_size: 500 }).then(r => r.data),
    enabled: !!categoryId,
    placeholderData: keepPreviousData,
  })

  const expenses: any[] = expensesData?.results || expensesData || []
  const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => navigate('/dashboard')} className="hover:text-gray-900">Dashboard</button>
        <span>/</span>
        <button onClick={() => navigate('/dashboard/expense-categories')} className="hover:text-gray-900">Expense Accounts</button>
        <span>/</span>
        <span className="text-gray-900 font-medium">{category?.name || '…'}</span>
      </nav>

      <button onClick={() => navigate('/dashboard/expense-categories')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" /> Back to Expense Accounts
      </button>

      {/* Header / config */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-indigo-50"><Layers className="w-6 h-6 text-indigo-600" /></div>
          <div className="flex-1 min-w-0">
            {isLoading ? <Skeleton className="h-7 w-48" /> : (
              <>
                <h1 className="text-2xl font-bold text-gray-900">{category?.name}</h1>
                <p className="text-sm text-gray-500 mt-0.5">{category?.code}{category?.description ? ` · ${category.description}` : ''}</p>
              </>
            )}
          </div>
        </div>
        {!isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <Info label="GL Account" value={category?.gl_account_code ? `${category.gl_account_code} — ${category.gl_account_name}` : '—'} />
            <Info label="Funding" value={(category?.funding_category || '—').replace(/_/g, ' ')} />
            <Info label="Default Description" value={category?.default_description || '—'} />
            <Info label="Total Booked" value={formatCurrency(total)} accent />
          </div>
        )}
      </div>

      {/* Expenses in this category */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Expenses in this category</h2>
          <span className="text-xs text-gray-400">({expenses.length})</span>
        </div>
        {loadingExpenses ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : expenses.length === 0 ? (
          <EmptyState icon={Receipt} title="No expenses" description="No expenses have been booked against this category yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Expense #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Payee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/dashboard/expenses/${e.id}`)}>
                    <td className="px-4 py-3 text-gray-600">{e.date ? formatDate(e.date) : '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-primary-600">{e.expense_number}</td>
                    <td className="px-4 py-3 text-gray-700">{e.payee_name || '—'}</td>
                    <td className="px-4 py-3"><Badge>{e.status}</Badge></td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(Number(e.amount || 0))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr className="font-bold">
                  <td colSpan={4} className="px-4 py-3 text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatCurrency(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Info({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className={cn('mt-1 text-sm', accent ? 'font-bold text-gray-900 tabular-nums' : 'text-gray-700')}>{value}</p>
    </div>
  )
}
