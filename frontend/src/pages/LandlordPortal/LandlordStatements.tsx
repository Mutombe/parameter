import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Download, FileText, AlertCircle } from 'lucide-react'
import api from '../../services/api'
import { Card, CardContent, Button } from '../../components/ui'
import { formatCurrency, cn } from '../../lib/utils'

interface MonthRow {
  month: string  // ISO date
  total_income: string
  commission: string
  net_income: string
  receipt_count: number
}

interface StatementsResponse {
  landlord: string
  statements: MonthRow[]
}

function fmtMonth(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
}

function downloadCSV(rows: MonthRow[]) {
  const headers = ['Month', 'Gross Income', 'Commission Charged', 'Net Income', 'Receipts']
  const lines = rows.map((r) => [
    fmtMonth(r.month),
    Number(r.total_income).toFixed(2),
    Number(r.commission).toFixed(2),
    Number(r.net_income).toFixed(2),
    String(r.receipt_count),
  ].join(','))
  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `landlord-statements-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function LandlordStatements() {
  const { data, isLoading, isError } = useQuery<StatementsResponse>({
    queryKey: ['landlord-portal', 'statements'],
    queryFn: async () => {
      const r = await api.get('/masterfile/landlord-portal/statements/')
      return r.data
    },
    placeholderData: keepPreviousData,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Income Statements</h1>
          <p className="mt-1 text-sm text-gray-500">Loading…</p>
        </div>
        <Card className="animate-pulse">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="h-8 w-full rounded bg-gray-200" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-6 w-full rounded bg-gray-100" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Income Statements</h1>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-12 text-center">
          <AlertCircle className="mb-3 h-10 w-10 text-red-400" />
          <p className="text-lg font-medium text-red-800">Failed to load statements</p>
          <p className="mt-1 text-sm text-red-600">Please try refreshing the page.</p>
        </div>
      </div>
    )
  }

  const rows = data.statements || []
  const totals = rows.reduce(
    (acc, r) => ({
      income: acc.income + (Number(r.total_income) || 0),
      commission: acc.commission + (Number(r.commission) || 0),
      net: acc.net + (Number(r.net_income) || 0),
      receipts: acc.receipts + (r.receipt_count || 0),
    }),
    { income: 0, commission: 0, net: 0, receipts: 0 },
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Income Statements</h1>
          <p className="mt-1 text-sm text-gray-500">
            Last 12 months · {data.landlord}
          </p>
        </div>
        <Button onClick={() => downloadCSV(rows)} disabled={rows.length === 0} className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <FileText className="mb-3 h-10 w-10 text-gray-400" />
          <p className="text-lg font-medium text-gray-600">No statements available</p>
          <p className="mt-1 text-sm text-gray-400">
            Statements appear here once receipts are recorded.
          </p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="whitespace-nowrap px-6 py-3.5 font-semibold text-gray-900">Month</th>
                      <th className="whitespace-nowrap px-6 py-3.5 text-right font-semibold text-gray-900">Gross Income</th>
                      <th className="whitespace-nowrap px-6 py-3.5 text-right font-semibold text-gray-900">Commission Charged</th>
                      <th className="whitespace-nowrap px-6 py-3.5 text-right font-semibold text-gray-900">Net Income</th>
                      <th className="whitespace-nowrap px-6 py-3.5 text-right font-semibold text-gray-900">Receipts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((r, i) => {
                      const income = Number(r.total_income) || 0
                      const commission = Number(r.commission) || 0
                      const net = Number(r.net_income) || 0
                      const ratePct = income > 0 ? (commission / income) * 100 : 0
                      return (
                        <motion.tr
                          key={r.month}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03, duration: 0.3 }}
                          className="transition-colors hover:bg-gray-50"
                        >
                          <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900">
                            {fmtMonth(r.month)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right tabular-nums text-gray-700">
                            {formatCurrency(income)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right tabular-nums text-amber-700">
                            <span className="font-semibold">({formatCurrency(commission)})</span>
                            {income > 0 && (
                              <div className="text-[10px] text-amber-500/80 font-normal">
                                {ratePct.toFixed(1)}% blended
                              </div>
                            )}
                          </td>
                          <td className={cn(
                            'whitespace-nowrap px-6 py-4 text-right tabular-nums font-semibold',
                            net >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          )}>
                            {formatCurrency(net)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right tabular-nums text-gray-500 text-xs">
                            {r.receipt_count}
                          </td>
                        </motion.tr>
                      )
                    })}
                    <tr className="border-t-2 border-gray-900 bg-gray-50/50 font-bold">
                      <td className="whitespace-nowrap px-6 py-3 text-gray-900">Total</td>
                      <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums text-gray-900">
                        {formatCurrency(totals.income)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums text-amber-800">
                        ({formatCurrency(totals.commission)})
                      </td>
                      <td className={cn(
                        'whitespace-nowrap px-6 py-3 text-right tabular-nums',
                        totals.net >= 0 ? 'text-emerald-800' : 'text-rose-800',
                      )}>
                        {formatCurrency(totals.net)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums text-gray-500">
                        {totals.receipts}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}

export default LandlordStatements
