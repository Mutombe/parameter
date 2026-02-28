import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  Download,
  Printer,
  FileText,
  Calendar,
  Receipt,
  Calculator,
  TrendingUp,
} from 'lucide-react'
import api from '../../services/api'
import { formatCurrency, cn } from '../../lib/utils'
import { Card, CardHeader, CardContent } from '../../components/ui/Card'
import { Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '../../components/ui/Tabs'

// --- Type definitions ---

interface VatReturnData {
  period_from: string
  period_to: string
  output_vat: number
  input_vat: number
  net_vat_payable: number
  sales_breakdown: VatLineItem[]
  purchase_breakdown: VatLineItem[]
}

interface VatLineItem {
  description: string
  taxable_amount: number
  vat_amount: number
}

interface WithholdingTaxMonth {
  month: string
  gross_rent: number
  withholding_tax: number
  net_payment: number
}

interface WithholdingTaxData {
  year: number
  total_gross: number
  total_withholding: number
  total_net: number
  monthly_breakdown: WithholdingTaxMonth[]
}

interface IncomeByType {
  income_type: string
  amount: number
}

interface AnnualSummaryData {
  year: number
  total_income: number
  total_expenses: number
  net_income: number
  income_by_type: IncomeByType[]
}

const PIE_COLORS = [
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
]

const WITHHOLDING_RATE = 0.1

function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function TaxReports() {
  const currentYear = new Date().getFullYear()
  const today = new Date()
  const firstOfYear = `${currentYear}-01-01`
  const todayStr = today.toISOString().split('T')[0]

  const [activeTab, setActiveTab] = useState('vat')
  const [dateFrom, setDateFrom] = useState(firstOfYear)
  const [dateTo, setDateTo] = useState(todayStr)
  const [selectedYear, setSelectedYear] = useState(String(currentYear))

  // Year options for selectors
  const yearOptions = useMemo(() => {
    const years: { value: string; label: string }[] = []
    for (let y = currentYear; y >= currentYear - 5; y--) {
      years.push({ value: String(y), label: String(y) })
    }
    return years
  }, [currentYear])

  // --- VAT Return Query ---
  const { data: vatData, isLoading: vatLoading } = useQuery<VatReturnData>({
    queryKey: ['tax-vat-return', dateFrom, dateTo],
    queryFn: () =>
      api
        .get('/reports/tax/vat-return/', {
          params: { date_from: dateFrom, date_to: dateTo },
        })
        .then((r) => r.data),
    enabled: activeTab === 'vat',
  })

  // --- Withholding Tax Query ---
  const { data: whtData, isLoading: whtLoading } =
    useQuery<WithholdingTaxData>({
      queryKey: ['tax-withholding', selectedYear],
      queryFn: () =>
        api
          .get('/reports/tax/withholding-tax/', {
            params: { year: selectedYear },
          })
          .then((r) => r.data),
      enabled: activeTab === 'withholding',
    })

  // --- Annual Summary Query ---
  const { data: annualData, isLoading: annualLoading } =
    useQuery<AnnualSummaryData>({
      queryKey: ['tax-annual-summary', selectedYear],
      queryFn: () =>
        api
          .get('/reports/tax/annual-income/', {
            params: { year: selectedYear },
          })
          .then((r) => r.data),
      enabled: activeTab === 'annual',
    })

  // --- CSV Export Handlers ---

  const handleExportVat = () => {
    if (!vatData) return
    const rows = [
      ['VAT Return Report'],
      [`Period: ${vatData.period_from} to ${vatData.period_to}`],
      [''],
      ['Output VAT (Sales)'],
      ['Description', 'Taxable Amount', 'VAT Amount'],
      ...(vatData.sales_breakdown || []).map((item) => [
        item.description,
        item.taxable_amount.toFixed(2),
        item.vat_amount.toFixed(2),
      ]),
      [''],
      ['Input VAT (Purchases)'],
      ['Description', 'Taxable Amount', 'VAT Amount'],
      ...(vatData.purchase_breakdown || []).map((item) => [
        item.description,
        item.taxable_amount.toFixed(2),
        item.vat_amount.toFixed(2),
      ]),
      [''],
      ['Summary'],
      ['Output VAT', vatData.output_vat.toFixed(2)],
      ['Input VAT', vatData.input_vat.toFixed(2)],
      ['Net VAT Payable', vatData.net_vat_payable.toFixed(2)],
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    downloadCsv(`vat-return-${dateFrom}-to-${dateTo}.csv`, csv)
  }

  const handleExportWht = () => {
    if (!whtData) return
    const rows = [
      ['Withholding Tax Report'],
      [`Year: ${whtData.year}`],
      [''],
      [
        'Month',
        'Gross Rent',
        `Withholding Tax (${(WITHHOLDING_RATE * 100).toFixed(0)}%)`,
        'Net Payment',
      ],
      ...(whtData.monthly_breakdown || []).map((m) => [
        m.month,
        m.gross_rent.toFixed(2),
        m.withholding_tax.toFixed(2),
        m.net_payment.toFixed(2),
      ]),
      [''],
      ['Total', whtData.total_gross.toFixed(2), whtData.total_withholding.toFixed(2), whtData.total_net.toFixed(2)],
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    downloadCsv(`withholding-tax-${whtData.year}.csv`, csv)
  }

  const handleExportAnnual = () => {
    if (!annualData) return
    const rows = [
      ['Annual Income Summary'],
      [`Year: ${annualData.year}`],
      [''],
      ['Income Type', 'Amount'],
      ...(annualData.income_by_type || []).map((item) => [
        item.income_type,
        item.amount.toFixed(2),
      ]),
      [''],
      ['Total Income', annualData.total_income.toFixed(2)],
      ['Total Expenses', annualData.total_expenses.toFixed(2)],
      ['Net Income', annualData.net_income.toFixed(2)],
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    downloadCsv(`annual-summary-${annualData.year}.csv`, csv)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-6 print:space-y-4" id="tax-reports-content">
      {/* Print-friendly styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #tax-reports-content, #tax-reports-content * { visibility: visible; }
          #tax-reports-content { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          .print\\:shadow-none { box-shadow: none; }
          .print\\:border-gray-300 { border-color: #d1d5db; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tax Reports</h1>
          <p className="text-gray-500 mt-1">
            VAT returns, withholding tax, and annual income summaries
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
        >
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold text-gray-900">Tax Reports</h1>
        <p className="text-sm text-gray-500">
          {activeTab === 'vat' && `VAT Return: ${dateFrom} to ${dateTo}`}
          {activeTab === 'withholding' &&
            `Withholding Tax: Year ${selectedYear}`}
          {activeTab === 'annual' && `Annual Summary: Year ${selectedYear}`}
        </p>
      </div>

      <Tabs defaultValue="vat" onChange={(val) => setActiveTab(val)}>
        <TabsList className="no-print">
          <TabsTrigger value="vat" icon={Receipt}>
            VAT Return
          </TabsTrigger>
          <TabsTrigger value="withholding" icon={Calculator}>
            Withholding Tax
          </TabsTrigger>
          <TabsTrigger value="annual" icon={TrendingUp}>
            Annual Summary
          </TabsTrigger>
        </TabsList>

        {/* ======================= VAT RETURN TAB ======================= */}
        <TabsContent value="vat" className="mt-6 space-y-6">
          {/* Date Range Filters */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 no-print">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Period From
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="pl-10 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Period To
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="pl-10 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                icon={Download}
                onClick={handleExportVat}
                disabled={!vatData}
              >
                Export CSV
              </Button>
            </div>
          </div>

          {vatLoading ? (
            <VatSkeleton />
          ) : vatData ? (
            <>
              {/* VAT Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:break-inside-avoid">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl border border-gray-200 p-5 print:shadow-none print:border-gray-300"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Output VAT</p>
                      <p className="text-xl font-bold text-gray-900">
                        {formatCurrency(vatData.output_vat)}
                      </p>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="bg-white rounded-xl border border-gray-200 p-5 print:shadow-none print:border-gray-300"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <Receipt className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Input VAT</p>
                      <p className="text-xl font-bold text-gray-900">
                        {formatCurrency(vatData.input_vat)}
                      </p>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className={cn(
                    'bg-white rounded-xl border border-gray-200 p-5 print:shadow-none print:border-gray-300',
                    vatData.net_vat_payable > 0 && 'ring-1 ring-red-200'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        vatData.net_vat_payable > 0
                          ? 'bg-red-50'
                          : 'bg-emerald-50'
                      )}
                    >
                      <Calculator
                        className={cn(
                          'w-5 h-5',
                          vatData.net_vat_payable > 0
                            ? 'text-red-600'
                            : 'text-emerald-600'
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Net VAT Payable</p>
                      <p className="text-xl font-bold text-gray-900">
                        {formatCurrency(vatData.net_vat_payable)}
                      </p>
                      <Badge
                        variant={
                          vatData.net_vat_payable > 0 ? 'danger' : 'success'
                        }
                        size="sm"
                      >
                        {vatData.net_vat_payable > 0 ? 'Payable' : 'Refundable'}
                      </Badge>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* VAT Breakdowns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:break-inside-avoid">
                {/* Sales / Output VAT */}
                <Card className="print:shadow-none print:border-gray-300">
                  <CardHeader title="Output VAT (Sales)" />
                  <CardContent>
                    {(vatData.sales_breakdown || []).length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">
                        No sales data for this period.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left py-2 pr-4 font-semibold text-gray-500 text-xs uppercase">
                                Description
                              </th>
                              <th className="text-right py-2 px-2 font-semibold text-gray-500 text-xs uppercase">
                                Taxable
                              </th>
                              <th className="text-right py-2 pl-2 font-semibold text-gray-500 text-xs uppercase">
                                VAT
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {vatData.sales_breakdown.map((item, i) => (
                              <tr key={i}>
                                <td className="py-2 pr-4 text-gray-700">
                                  {item.description}
                                </td>
                                <td className="py-2 px-2 text-right text-gray-900 font-medium">
                                  {formatCurrency(item.taxable_amount)}
                                </td>
                                <td className="py-2 pl-2 text-right text-gray-900 font-medium">
                                  {formatCurrency(item.vat_amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Purchases / Input VAT */}
                <Card className="print:shadow-none print:border-gray-300">
                  <CardHeader title="Input VAT (Purchases)" />
                  <CardContent>
                    {(vatData.purchase_breakdown || []).length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">
                        No purchase data for this period.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left py-2 pr-4 font-semibold text-gray-500 text-xs uppercase">
                                Description
                              </th>
                              <th className="text-right py-2 px-2 font-semibold text-gray-500 text-xs uppercase">
                                Taxable
                              </th>
                              <th className="text-right py-2 pl-2 font-semibold text-gray-500 text-xs uppercase">
                                VAT
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {vatData.purchase_breakdown.map((item, i) => (
                              <tr key={i}>
                                <td className="py-2 pr-4 text-gray-700">
                                  {item.description}
                                </td>
                                <td className="py-2 px-2 text-right text-gray-900 font-medium">
                                  {formatCurrency(item.taxable_amount)}
                                </td>
                                <td className="py-2 pl-2 text-right text-gray-900 font-medium">
                                  {formatCurrency(item.vat_amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <EmptyTaxState message="Configure the date range above and data will appear here." />
          )}
        </TabsContent>

        {/* =================== WITHHOLDING TAX TAB =================== */}
        <TabsContent value="withholding" className="mt-6 space-y-6">
          {/* Year Selector */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 no-print">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[160px]">
                <Select
                  label="Tax Year"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  options={yearOptions}
                />
              </div>
              <Button
                variant="outline"
                icon={Download}
                onClick={handleExportWht}
                disabled={!whtData}
              >
                Export CSV
              </Button>
            </div>
          </div>

          {whtLoading ? (
            <TableSkeleton rows={12} cols={4} />
          ) : whtData ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:break-inside-avoid">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl border border-gray-200 p-5 print:shadow-none print:border-gray-300"
                >
                  <p className="text-sm text-gray-500">Total Gross Rent</p>
                  <p className="text-xl font-bold text-gray-900">
                    {formatCurrency(whtData.total_gross)}
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="bg-white rounded-xl border border-gray-200 p-5 print:shadow-none print:border-gray-300"
                >
                  <p className="text-sm text-gray-500">
                    Total Withholding Tax ({(WITHHOLDING_RATE * 100).toFixed(0)}
                    %)
                  </p>
                  <p className="text-xl font-bold text-red-600">
                    {formatCurrency(whtData.total_withholding)}
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white rounded-xl border border-gray-200 p-5 print:shadow-none print:border-gray-300"
                >
                  <p className="text-sm text-gray-500">Total Net Payment</p>
                  <p className="text-xl font-bold text-emerald-600">
                    {formatCurrency(whtData.total_net)}
                  </p>
                </motion.div>
              </div>

              {/* Monthly Breakdown Chart */}
              {(whtData.monthly_breakdown || []).length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="no-print"
                >
                  <Card>
                    <CardHeader
                      title="Monthly Withholding Tax"
                      description={`${(WITHHOLDING_RATE * 100).toFixed(0)}% withholding on gross rental income`}
                    />
                    <CardContent>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={whtData.monthly_breakdown}
                            margin={{
                              top: 5,
                              right: 20,
                              left: 10,
                              bottom: 5,
                            }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="#f0f0f0"
                            />
                            <XAxis
                              dataKey="month"
                              tick={{ fontSize: 12, fill: '#6b7280' }}
                              axisLine={{ stroke: '#e5e7eb' }}
                            />
                            <YAxis
                              tick={{ fontSize: 12, fill: '#6b7280' }}
                              axisLine={{ stroke: '#e5e7eb' }}
                              tickFormatter={(v) =>
                                formatCurrency(v).replace('.00', '')
                              }
                            />
                            <Tooltip
                              formatter={(value: number) =>
                                formatCurrency(value)
                              }
                              contentStyle={{
                                borderRadius: '12px',
                                border: '1px solid #e5e7eb',
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                              }}
                            />
                            <Bar
                              dataKey="gross_rent"
                              name="Gross Rent"
                              fill="#3b82f6"
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar
                              dataKey="withholding_tax"
                              name="Withholding Tax"
                              fill="#ef4444"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Monthly Breakdown Table */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="print:break-inside-avoid"
              >
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden print:shadow-none print:border-gray-300">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900">
                      Monthly Breakdown
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                            Month
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                            Gross Rent
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                            WHT ({(WITHHOLDING_RATE * 100).toFixed(0)}%)
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                            Net Payment
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(whtData.monthly_breakdown || []).map((row, i) => (
                          <motion.tr
                            key={row.month}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.02 }}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-6 py-3 text-sm font-medium text-gray-900">
                              {row.month}
                            </td>
                            <td className="px-6 py-3 text-sm text-right text-gray-900">
                              {formatCurrency(row.gross_rent)}
                            </td>
                            <td className="px-6 py-3 text-sm text-right text-red-600 font-medium">
                              {formatCurrency(row.withholding_tax)}
                            </td>
                            <td className="px-6 py-3 text-sm text-right text-emerald-600 font-medium">
                              {formatCurrency(row.net_payment)}
                            </td>
                          </motion.tr>
                        ))}
                        {/* Totals row */}
                        <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                          <td className="px-6 py-3 text-sm text-gray-900">
                            Total
                          </td>
                          <td className="px-6 py-3 text-sm text-right text-gray-900">
                            {formatCurrency(whtData.total_gross)}
                          </td>
                          <td className="px-6 py-3 text-sm text-right text-red-600">
                            {formatCurrency(whtData.total_withholding)}
                          </td>
                          <td className="px-6 py-3 text-sm text-right text-emerald-600">
                            {formatCurrency(whtData.total_net)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            </>
          ) : (
            <EmptyTaxState message="Select a tax year to view withholding tax data." />
          )}
        </TabsContent>

        {/* =================== ANNUAL SUMMARY TAB =================== */}
        <TabsContent value="annual" className="mt-6 space-y-6">
          {/* Year Selector */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 no-print">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[160px]">
                <Select
                  label="Tax Year"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  options={yearOptions}
                />
              </div>
              <Button
                variant="outline"
                icon={Download}
                onClick={handleExportAnnual}
                disabled={!annualData}
              >
                Export CSV
              </Button>
            </div>
          </div>

          {annualLoading ? (
            <TableSkeleton rows={6} cols={2} />
          ) : annualData ? (
            <>
              {/* Annual Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:break-inside-avoid">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl border border-gray-200 p-5 print:shadow-none print:border-gray-300"
                >
                  <p className="text-sm text-gray-500">Total Income</p>
                  <p className="text-xl font-bold text-emerald-600">
                    {formatCurrency(annualData.total_income)}
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="bg-white rounded-xl border border-gray-200 p-5 print:shadow-none print:border-gray-300"
                >
                  <p className="text-sm text-gray-500">Total Expenses</p>
                  <p className="text-xl font-bold text-red-600">
                    {formatCurrency(annualData.total_expenses)}
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white rounded-xl border border-gray-200 p-5 print:shadow-none print:border-gray-300"
                >
                  <p className="text-sm text-gray-500">Net Income</p>
                  <p
                    className={cn(
                      'text-xl font-bold',
                      annualData.net_income >= 0
                        ? 'text-emerald-600'
                        : 'text-red-600'
                    )}
                  >
                    {formatCurrency(annualData.net_income)}
                  </p>
                </motion.div>
              </div>

              {/* Income by Type */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:break-inside-avoid">
                {/* Pie Chart */}
                {(annualData.income_by_type || []).length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="no-print"
                  >
                    <Card>
                      <CardHeader title="Income Distribution" />
                      <CardContent>
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={annualData.income_by_type}
                                dataKey="amount"
                                nameKey="income_type"
                                cx="50%"
                                cy="50%"
                                outerRadius={100}
                                innerRadius={50}
                                paddingAngle={2}
                                label={({ income_type, percent }) =>
                                  `${income_type} (${(percent * 100).toFixed(0)}%)`
                                }
                              >
                                {annualData.income_by_type.map((_, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={
                                      PIE_COLORS[index % PIE_COLORS.length]
                                    }
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number) =>
                                  formatCurrency(value)
                                }
                                contentStyle={{
                                  borderRadius: '12px',
                                  border: '1px solid #e5e7eb',
                                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Income by Type Table */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden print:shadow-none print:border-gray-300">
                    <div className="px-6 py-4 border-b border-gray-100">
                      <h2 className="text-lg font-semibold text-gray-900">
                        Income by Type
                      </h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                              Income Type
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                              Amount
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                              % of Total
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(annualData.income_by_type || []).map((item, i) => {
                            const pct =
                              annualData.total_income > 0
                                ? (item.amount / annualData.total_income) * 100
                                : 0
                            return (
                              <motion.tr
                                key={item.income_type}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.03 }}
                                className="hover:bg-gray-50 transition-colors"
                              >
                                <td className="px-6 py-3 text-sm font-medium text-gray-900">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded-full shrink-0"
                                      style={{
                                        backgroundColor:
                                          PIE_COLORS[i % PIE_COLORS.length],
                                      }}
                                    />
                                    {item.income_type}
                                  </div>
                                </td>
                                <td className="px-6 py-3 text-sm text-right font-medium text-gray-900">
                                  {formatCurrency(item.amount)}
                                </td>
                                <td className="px-6 py-3 text-sm text-right text-gray-500">
                                  {pct.toFixed(1)}%
                                </td>
                              </motion.tr>
                            )
                          })}
                          {/* Total row */}
                          <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                            <td className="px-6 py-3 text-sm text-gray-900">
                              Total Income
                            </td>
                            <td className="px-6 py-3 text-sm text-right text-gray-900">
                              {formatCurrency(annualData.total_income)}
                            </td>
                            <td className="px-6 py-3 text-sm text-right text-gray-500">
                              100%
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              </div>
            </>
          ) : (
            <EmptyTaxState message="Select a year to view the annual income summary." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// --- Helper Components ---

function EmptyTaxState({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">No Data</h3>
      <p className="text-gray-500">{message}</p>
    </div>
  )
}

function VatSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-200" />
              <div>
                <div className="h-3 w-20 bg-gray-200 rounded mb-2" />
                <div className="h-6 w-28 bg-gray-200 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse"
          >
            <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
            <div className="space-y-3">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="h-4 bg-gray-100 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="h-5 w-40 bg-gray-200 rounded" />
      </div>
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {[...Array(cols)].map((_, i) => (
              <th key={i} className="px-6 py-3">
                <div className="h-3 w-20 bg-gray-200 rounded" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {[...Array(rows)].map((_, i) => (
            <tr key={i}>
              {[...Array(cols)].map((_, j) => (
                <td key={j} className="px-6 py-3">
                  <div className="h-4 w-16 bg-gray-100 rounded ml-auto" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
