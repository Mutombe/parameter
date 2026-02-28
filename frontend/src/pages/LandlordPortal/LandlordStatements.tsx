import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Download, FileText, AlertCircle } from 'lucide-react'
import api from '../../services/api'
import {
  Card,
  CardHeader,
  CardContent,
  Button,
} from '../../components/ui'
import { formatCurrency, cn } from '../../lib/utils'

interface StatementRow {
  id: number
  month: string
  gross_income: number
  expenses: number
  net_income: number
  status: string
}

function downloadCSV(statements: StatementRow[]) {
  const headers = ['Month', 'Gross Income', 'Expenses', 'Net Income', 'Status']
  const rows = statements.map((s) => [
    s.month,
    s.gross_income.toFixed(2),
    s.expenses.toFixed(2),
    s.net_income.toFixed(2),
    s.status,
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.join(',')),
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `landlord-statements-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function getStatusBadgeClass(status: string) {
  switch (status.toLowerCase()) {
    case 'paid':
    case 'completed':
      return 'bg-green-100 text-green-800'
    case 'pending':
      return 'bg-yellow-100 text-yellow-800'
    case 'overdue':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

function LandlordStatements() {
  const { data, isLoading, isError } = useQuery<StatementRow[]>({
    queryKey: ['landlord-portal', 'statements'],
    queryFn: async () => {
      const response = await api.get('/masterfile/landlord-portal/statements/')
      return response.data
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Income Statements
          </h1>
          <p className="mt-1 text-sm text-gray-500">Loading statements...</p>
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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Income Statements
          </h1>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-12 text-center">
          <AlertCircle className="mb-3 h-10 w-10 text-red-400" />
          <p className="text-lg font-medium text-red-800">
            Failed to load statements
          </p>
          <p className="mt-1 text-sm text-red-600">
            Please try refreshing the page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Income Statements
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Monthly income and expense summary
          </p>
        </div>
        <Button
          onClick={() => downloadCSV(data)}
          disabled={data.length === 0}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <FileText className="mb-3 h-10 w-10 text-gray-400" />
          <p className="text-lg font-medium text-gray-600">
            No statements available
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Statements will appear here once transactions are processed.
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
                      <th className="whitespace-nowrap px-6 py-3.5 font-semibold text-gray-900">
                        Month
                      </th>
                      <th className="whitespace-nowrap px-6 py-3.5 text-right font-semibold text-gray-900">
                        Gross Income
                      </th>
                      <th className="whitespace-nowrap px-6 py-3.5 text-right font-semibold text-gray-900">
                        Expenses
                      </th>
                      <th className="whitespace-nowrap px-6 py-3.5 text-right font-semibold text-gray-900">
                        Net Income
                      </th>
                      <th className="whitespace-nowrap px-6 py-3.5 text-center font-semibold text-gray-900">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.map((statement, index) => (
                      <motion.tr
                        key={statement.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.03, duration: 0.3 }}
                        className="transition-colors hover:bg-gray-50"
                      >
                        <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900">
                          {statement.month}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-gray-700">
                          {formatCurrency(statement.gross_income)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-gray-700">
                          {formatCurrency(statement.expenses)}
                        </td>
                        <td
                          className={cn(
                            'whitespace-nowrap px-6 py-4 text-right font-semibold',
                            statement.net_income >= 0
                              ? 'text-green-700'
                              : 'text-red-700'
                          )}
                        >
                          {formatCurrency(statement.net_income)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-center">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                              getStatusBadgeClass(statement.status)
                            )}
                          >
                            {statement.status}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
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
