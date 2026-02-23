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

    case 'rent-rollover':
      exportData = data?.properties || data?.leases || []
      columns = [
        { key: 'property_name', header: 'Property' },
        { key: 'balance_bf', header: 'Balance B/F', format: formatNumber },
        { key: 'amount_charged', header: 'Amount Charged', format: formatNumber },
        { key: 'amount_due', header: 'Amount Due', format: formatNumber },
        { key: 'amount_paid', header: 'Amount Paid', format: formatNumber },
        { key: 'carried_forward', header: 'Carried Forward', format: formatNumber },
      ]
      break

    case 'commission-property':
      exportData = data?.by_property || []
      columns = [
        { key: 'rank', header: 'Rank' },
        { key: 'property_name', header: 'Property' },
        { key: 'landlord_name', header: 'Landlord' },
        { key: 'commission_rate', header: 'Rate (%)', format: (v) => `${v}%` },
        { key: 'collected', header: 'Revenue', format: formatNumber },
        { key: 'commission', header: 'Commission', format: formatNumber },
        { key: 'percentage', header: '% of Total', format: (v) => `${v?.toFixed(1)}%` },
      ]
      break

    case 'commission-income':
      exportData = data?.by_income_type || []
      columns = [
        { key: 'rank', header: 'Rank' },
        { key: 'label', header: 'Category' },
        { key: 'income', header: 'Revenue', format: formatNumber },
        { key: 'commission', header: 'Commission', format: formatNumber },
        { key: 'percentage', header: '% of Total', format: (v) => `${v?.toFixed(1)}%` },
      ]
      break

    case 'aged-analysis':
      exportData = (data?.by_tenant || []).map((t: any) => ({
        ...t,
        current: t.current ?? t['0_30'] ?? 0,
        days_31_60: t.days_31_60 ?? t['31_60'] ?? 0,
        days_61_90: t.days_61_90 ?? t['61_90'] ?? 0,
        days_91_120: t.days_91_120 ?? t['91_120'] ?? 0,
        days_over_120: t.days_over_120 ?? t['over_120'] ?? 0,
      }))
      columns = [
        { key: 'tenant_code', header: 'Tenant Code' },
        { key: 'tenant_name', header: 'Tenant Name' },
        { key: 'current', header: 'Current', format: formatNumber },
        { key: 'days_31_60', header: '31-60 Days', format: formatNumber },
        { key: 'days_61_90', header: '61-90 Days', format: formatNumber },
        { key: 'days_91_120', header: '91-120 Days', format: formatNumber },
        { key: 'days_over_120', header: '120+ Days', format: formatNumber },
        { key: 'total', header: 'Total', format: formatNumber },
      ]
      break

    case 'tenant-account':
      exportData = data?.transactions || []
      columns = [
        { key: 'date', header: 'Date' },
        { key: 'type', header: 'Type' },
        { key: 'reference', header: 'Reference' },
        { key: 'description', header: 'Description' },
        { key: 'debit', header: 'Debit', format: formatNumber },
        { key: 'credit', header: 'Credit', format: formatNumber },
        { key: 'balance', header: 'Balance', format: formatNumber },
      ]
      break

    case 'landlord-account':
      exportData = data?.transactions || []
      columns = [
        { key: 'date', header: 'Date' },
        { key: 'type', header: 'Type' },
        { key: 'reference', header: 'Reference' },
        { key: 'property', header: 'Property' },
        { key: 'unit', header: 'Unit' },
        { key: 'tenant', header: 'Tenant' },
        { key: 'debit', header: 'Debit', format: formatNumber },
        { key: 'credit', header: 'Credit', format: formatNumber },
        { key: 'balance', header: 'Balance', format: formatNumber },
      ]
      break

    case 'bank-to-income': {
      const bankCols = data?.bank_columns || []
      exportData = (data?.matrix || []).map((row: any) => {
        const flat: any = { income_type: row.income_type }
        bankCols.forEach((col: any) => { flat[col.key] = row[col.key] || 0 })
        flat.total = row.total || 0
        return flat
      })
      columns = [
        { key: 'income_type', header: 'Income Type' },
        ...bankCols.map((col: any) => ({ key: col.key, header: col.label, format: formatNumber })),
        { key: 'total', header: 'Total', format: formatNumber },
      ]
      break
    }

    case 'receipts-listing':
      exportData = data?.receipts || []
      columns = [
        { key: 'date', header: 'Date' },
        { key: 'receipt_number', header: 'Receipt #' },
        { key: 'tenant_code', header: 'Tenant Code' },
        { key: 'tenant_name', header: 'Tenant' },
        { key: 'landlord_name', header: 'Landlord' },
        { key: 'property_name', header: 'Property' },
        { key: 'unit_name', header: 'Unit' },
        { key: 'income_type', header: 'Income Type' },
        { key: 'bank_account', header: 'Bank' },
        { key: 'payment_method', header: 'Method' },
        { key: 'reference', header: 'Reference' },
        { key: 'currency', header: 'Currency' },
        { key: 'amount', header: 'Amount', format: formatNumber },
      ]
      break

    case 'deposits-listing':
      exportData = data?.deposits || []
      columns = [
        { key: 'lease_number', header: 'Lease #' },
        { key: 'tenant_name', header: 'Tenant' },
        { key: 'property_name', header: 'Property' },
        { key: 'unit_name', header: 'Unit' },
        { key: 'required', header: 'Required', format: formatNumber },
        { key: 'paid', header: 'Paid', format: formatNumber },
        { key: 'outstanding', header: 'Outstanding', format: formatNumber },
        { key: 'status', header: 'Status' },
      ]
      break

    case 'lease-charges':
      exportData = data?.leases || []
      columns = [
        { key: 'lease_number', header: 'Lease #' },
        { key: 'tenant_name', header: 'Tenant' },
        { key: 'property_name', header: 'Property' },
        { key: 'unit_name', header: 'Unit' },
        { key: 'monthly_rent', header: 'Monthly Rent', format: formatNumber },
        { key: 'total_charged', header: 'Total Charged', format: formatNumber },
        { key: 'total_paid', header: 'Paid', format: formatNumber },
        { key: 'balance', header: 'Balance', format: formatNumber },
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

/**
 * Server-side streaming export for large datasets.
 * Downloads CSV directly from the backend, avoiding client-side memory limits.
 */
export async function streamExportFromServer(
  type: string,
  filters?: Record<string, string>
): Promise<void> {
  try {
    const { reportsApi } = await import('../services/api')
    const response = await reportsApi.streamExport(type, filters)
    const blob = response.data as Blob
    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `${type}_${timestamp}.csv`

    downloadBlob(blob, filename)
  } catch (error) {
    console.error('Server-side export failed:', error)
    throw error
  }
}

/**
 * Trigger download from a Blob
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()

  setTimeout(() => {
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 100)
}
