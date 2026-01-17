/**
 * Export utilities for CSV and Excel formats
 */

interface ExportColumn {
  key: string
  header: string
  format?: (value: any) => string
}

/**
 * Export data to CSV file
 */
export function exportToCSV(
  data: Record<string, any>[],
  columns: ExportColumn[],
  filename: string
): void {
  if (!data || data.length === 0) {
    console.warn('No data to export')
    return
  }

  // Build header row
  const headers = columns.map(col => `"${col.header}"`)

  // Build data rows
  const rows = data.map(row => {
    return columns.map(col => {
      let value = row[col.key]
      if (col.format) {
        value = col.format(value)
      }
      // Escape quotes and wrap in quotes
      if (value === null || value === undefined) {
        return '""'
      }
      const stringValue = String(value).replace(/"/g, '""')
      return `"${stringValue}"`
    }).join(',')
  })

  // Combine header and rows
  const csvContent = [headers.join(','), ...rows].join('\n')

  // Create and trigger download
  downloadFile(csvContent, `${filename}.csv`, 'text/csv;charset=utf-8;')
}

/**
 * Export data to Excel-compatible format (CSV with BOM for Excel)
 */
export function exportToExcel(
  data: Record<string, any>[],
  columns: ExportColumn[],
  filename: string
): void {
  if (!data || data.length === 0) {
    console.warn('No data to export')
    return
  }

  // Build header row
  const headers = columns.map(col => col.header)

  // Build data rows
  const rows = data.map(row => {
    return columns.map(col => {
      let value = row[col.key]
      if (col.format) {
        value = col.format(value)
      }
      if (value === null || value === undefined) {
        return ''
      }
      return String(value)
    })
  })

  // Create workbook content (tab-separated for better Excel compatibility)
  const tsvContent = [
    headers.join('\t'),
    ...rows.map(row => row.join('\t'))
  ].join('\n')

  // Add BOM for Excel to recognize UTF-8
  const BOM = '\uFEFF'
  downloadFile(BOM + tsvContent, `${filename}.xls`, 'application/vnd.ms-excel;charset=utf-8;')
}

/**
 * Export report data with automatic formatting
 */
export function exportReport(
  reportType: string,
  data: any,
  format: 'csv' | 'excel' = 'csv'
): void {
  const timestamp = new Date().toISOString().split('T')[0]
  const filename = `${reportType}_${timestamp}`

  let exportData: Record<string, any>[] = []
  let columns: ExportColumn[] = []

  switch (reportType) {
    case 'trial-balance':
      exportData = data?.accounts || []
      columns = [
        { key: 'code', header: 'Account Code' },
        { key: 'name', header: 'Account Name' },
        { key: 'type', header: 'Type' },
        { key: 'debit', header: 'Debit', format: formatNumber },
        { key: 'credit', header: 'Credit', format: formatNumber },
      ]
      break

    case 'income-statement':
      // Combine revenue and expense accounts
      const revenueAccounts = (data?.revenue?.accounts || []).map((a: any) => ({
        ...a,
        category: 'Revenue'
      }))
      const expenseAccounts = (data?.expenses?.accounts || []).map((a: any) => ({
        ...a,
        category: 'Expense'
      }))
      exportData = [...revenueAccounts, ...expenseAccounts]

      // Add totals
      exportData.push({ code: '', name: 'Total Revenue', category: '', balance: data?.revenue?.total || 0 })
      exportData.push({ code: '', name: 'Total Expenses', category: '', balance: data?.expenses?.total || 0 })
      exportData.push({ code: '', name: 'Net Income', category: '', balance: data?.net_income || 0 })

      columns = [
        { key: 'code', header: 'Account Code' },
        { key: 'name', header: 'Account Name' },
        { key: 'category', header: 'Category' },
        { key: 'balance', header: 'Amount', format: formatNumber },
      ]
      break

    case 'balance-sheet':
      // Combine all account categories
      const assets = (data?.assets?.accounts || []).map((a: any) => ({ ...a, category: 'Asset' }))
      const liabilities = (data?.liabilities?.accounts || []).map((a: any) => ({ ...a, category: 'Liability' }))
      const equity = (data?.equity?.accounts || []).map((a: any) => ({ ...a, category: 'Equity' }))
      exportData = [...assets, ...liabilities, ...equity]

      // Add totals
      exportData.push({ code: '', name: 'Total Assets', category: '', balance: data?.assets?.total || 0 })
      exportData.push({ code: '', name: 'Total Liabilities', category: '', balance: data?.liabilities?.total || 0 })
      exportData.push({ code: '', name: 'Total Equity', category: '', balance: data?.equity?.total || 0 })

      columns = [
        { key: 'code', header: 'Account Code' },
        { key: 'name', header: 'Account Name' },
        { key: 'category', header: 'Category' },
        { key: 'balance', header: 'Balance', format: formatNumber },
      ]
      break

    case 'cash-flow':
      exportData = [
        { section: 'Operating Activities', item: 'Cash from tenants', amount: data?.operating_activities?.inflows?.tenant_receipts || 0 },
        { section: 'Operating Activities', item: 'Cash paid for expenses', amount: -(data?.operating_activities?.outflows?.expense_payments || 0) },
        { section: 'Operating Activities', item: 'Cash paid to landlords', amount: -(data?.operating_activities?.outflows?.landlord_payments || 0) },
        { section: 'Operating Activities', item: 'Net Operating Cash', amount: data?.operating_activities?.net_cash || 0 },
        { section: 'Investing Activities', item: 'Asset sales', amount: data?.investing_activities?.inflows?.asset_sales || 0 },
        { section: 'Investing Activities', item: 'Asset purchases', amount: -(data?.investing_activities?.outflows?.asset_purchases || 0) },
        { section: 'Investing Activities', item: 'Net Investing Cash', amount: data?.investing_activities?.net_cash || 0 },
        { section: 'Financing Activities', item: 'Owner contributions', amount: data?.financing_activities?.inflows?.owner_contributions || 0 },
        { section: 'Financing Activities', item: 'Owner withdrawals', amount: -(data?.financing_activities?.outflows?.owner_withdrawals || 0) },
        { section: 'Financing Activities', item: 'Net Financing Cash', amount: data?.financing_activities?.net_cash || 0 },
        { section: 'Summary', item: 'Beginning Cash', amount: data?.summary?.beginning_cash || 0 },
        { section: 'Summary', item: 'Net Change in Cash', amount: data?.summary?.net_change_in_cash || 0 },
        { section: 'Summary', item: 'Ending Cash', amount: data?.summary?.ending_cash || 0 },
      ]
      columns = [
        { key: 'section', header: 'Section' },
        { key: 'item', header: 'Item' },
        { key: 'amount', header: 'Amount', format: formatNumber },
      ]
      break

    case 'vacancy':
      exportData = data?.properties || []
      columns = [
        { key: 'code', header: 'Property Code' },
        { key: 'name', header: 'Property Name' },
        { key: 'landlord', header: 'Landlord' },
        { key: 'total_units', header: 'Total Units' },
        { key: 'occupied', header: 'Occupied' },
        { key: 'vacant', header: 'Vacant' },
        { key: 'vacancy_rate', header: 'Vacancy Rate (%)', format: (v) => `${v}%` },
      ]
      break

    case 'rent-roll':
      exportData = data?.leases || []
      columns = [
        { key: 'lease_number', header: 'Lease Number' },
        { key: 'tenant', header: 'Tenant' },
        { key: 'property', header: 'Property' },
        { key: 'unit', header: 'Unit' },
        { key: 'monthly_rent', header: 'Monthly Rent', format: formatNumber },
        { key: 'currency', header: 'Currency' },
        { key: 'start_date', header: 'Start Date' },
        { key: 'end_date', header: 'End Date' },
      ]
      break

    default:
      console.warn('Unknown report type:', reportType)
      return
  }

  if (format === 'excel') {
    exportToExcel(exportData, columns, filename)
  } else {
    exportToCSV(exportData, columns, filename)
  }
}

/**
 * Format number for export
 */
function formatNumber(value: any): string {
  if (value === null || value === undefined) return '0.00'
  const num = parseFloat(value)
  if (isNaN(num)) return '0.00'
  return num.toFixed(2)
}

/**
 * Create and trigger file download
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 100)
}

/**
 * Export any table data generically
 */
export function exportTableData(
  data: Record<string, any>[],
  columns: { key: string; header: string }[],
  filename: string,
  format: 'csv' | 'excel' = 'csv'
): void {
  if (format === 'excel') {
    exportToExcel(data, columns, filename)
  } else {
    exportToCSV(data, columns, filename)
  }
}
