/**
 * Branded Print Template Engine
 * Generates professionally branded HTML documents with company logo, details, and configurable paper sizes.
 * Reads company info from the auth store persisted in localStorage.
 */

import { formatCurrency, formatDate } from './utils'
import { usePrintStore } from '../stores/printStore'

// ─── Types ────────────────────────────────────────────────────────

interface CompanyInfo {
  name: string
  email: string
  phone: string
  address: string
  logoUrl: string | null
  showLogo: boolean
  paperSize: 'A4' | 'Letter' | 'Legal'
  invoicePrefix: string
  invoiceFooter: string
  defaultCurrency: string
}

interface PrintOptions {
  title?: string
  subtitle?: string
  orientation?: 'portrait' | 'landscape'
  paperSize?: 'A4' | 'Letter' | 'Legal'
}

interface TableColumn {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
}

// ─── Company Info Reader ──────────────────────────────────────────

export function getCompanyInfo(): CompanyInfo {
  const defaults: CompanyInfo = {
    name: 'Company Name',
    email: '',
    phone: '',
    address: '',
    logoUrl: null,
    showLogo: true,
    paperSize: 'A4',
    invoicePrefix: 'INV-',
    invoiceFooter: 'Thank you for your business!',
    defaultCurrency: 'USD',
  }

  try {
    const raw = localStorage.getItem('auth-storage')
    if (!raw) return defaults

    const parsed = JSON.parse(raw)
    const tenant = parsed?.state?.user?.tenant_info
    if (!tenant) return defaults

    return {
      name: tenant.name || defaults.name,
      email: tenant.email || '',
      phone: tenant.phone || '',
      address: tenant.address || '',
      logoUrl: tenant.logo_url || null,
      showLogo: tenant.show_logo !== false,
      paperSize: tenant.paper_size || 'A4',
      invoicePrefix: tenant.invoice_prefix || 'INV-',
      invoiceFooter: tenant.invoice_footer || defaults.invoiceFooter,
      defaultCurrency: tenant.default_currency || 'USD',
    }
  } catch {
    return defaults
  }
}

// ─── Style Builder ────────────────────────────────────────────────

function getPageSize(paperSize: string, orientation: string): string {
  const sizes: Record<string, string> = {
    A4: '210mm 297mm',
    Letter: '8.5in 11in',
    Legal: '8.5in 14in',
  }
  return `${sizes[paperSize] || sizes.A4} ${orientation}`
}

function getPageMargin(paperSize: string): string {
  return paperSize === 'A4' ? '1.5cm' : '0.75in'
}

function buildBaseStyles(paperSize: string, orientation: string): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
    @page {
      size: ${getPageSize(paperSize, orientation)};
      margin: ${getPageMargin(paperSize)};
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      color: #1a1a1a;
      padding: 0;
      margin: 0;
      font-size: 14px;
    }
    .page { padding: 20px 40px; }

    /* Header */
    .branded-header { display: flex; align-items: center; gap: 20px; padding-bottom: 16px; border-bottom: 2px solid #1a1a1a; margin-bottom: 24px; }
    .branded-header .logo { width: 80px; height: 80px; object-fit: contain; border-radius: 4px; }
    .branded-header .company-details { flex: 1; }
    .branded-header .company-name { font-size: 22px; font-weight: 800; color: #111827; margin-bottom: 2px; }
    .branded-header .company-contact { font-size: 11px; color: #4b5563; line-height: 1.6; }

    /* Document title */
    .doc-title { text-align: center; font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #111827; margin-bottom: 4px; }
    .doc-subtitle { text-align: center; font-size: 13px; color: #6b7280; margin-bottom: 24px; }

    /* Info grid */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .info-group label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; margin-bottom: 2px; font-weight: 600; }
    .info-group p { font-size: 14px; font-weight: 600; color: #111827; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    th { background-color: #f9fafb; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #374151; }
    td { color: #1f2937; }
    tr:nth-child(even) { background-color: #fafbfc; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }
    .tabular-nums { font-variant-numeric: tabular-nums; }

    /* Summary boxes */
    .summary-box { background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .summary-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .summary-row:last-child { border-bottom: none; }
    .summary-row .label { color: #6b7280; font-size: 13px; }
    .summary-row .value { font-weight: 700; font-size: 13px; }
    .highlight-box { background: #111827; color: #fff; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
    .highlight-box small { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.8; }
    .highlight-box .big-value { font-size: 28px; font-weight: 800; margin-top: 4px; }
    .highlight-green { background: #059669; }
    .status-badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .status-paid { background: #d1fae5; color: #065f46; }
    .status-overdue { background: #fee2e2; color: #991b1b; }
    .status-sent, .status-partial, .status-pending, .status-posted { background: #fef3c7; color: #92400e; }
    .status-draft { background: #f3f4f6; color: #374151; }
    .status-active { background: #d1fae5; color: #065f46; }
    .status-expired { background: #fef3c7; color: #92400e; }
    .status-terminated { background: #fee2e2; color: #991b1b; }
    .text-red { color: #dc2626; }
    .text-green { color: #059669; }

    /* Footer */
    .branded-footer { margin-top: 40px; padding-top: 16px; border-top: 2px solid #1a1a1a; text-align: center; font-size: 11px; color: #6b7280; line-height: 1.8; }
    .branded-footer .footer-text { font-style: italic; margin-bottom: 4px; }
    .branded-footer .footer-company { font-weight: 600; color: #374151; }
    .branded-footer .footer-date { color: #9ca3af; font-size: 10px; }

    @media print {
      body { padding: 0; margin: 0; }
      .page { padding: 0; }
      .no-print { display: none !important; }
    }
  `
}

// ─── Header & Footer Builders ─────────────────────────────────────

function getLogoProxyUrl(): string {
  const base = import.meta.env.VITE_API_URL || ''

  // Resolve tenant subdomain (same logic as services/api.ts)
  let subdomain = ''
  const urlParams = new URLSearchParams(window.location.search)
  const tenantParam = urlParams.get('tenant')
  if (tenantParam) {
    subdomain = tenantParam
  } else {
    const stored = sessionStorage.getItem('tenant_subdomain')
    if (stored) {
      subdomain = stored
    } else {
      const hostname = window.location.hostname
      const parts = hostname.split('.')
      if (hostname.endsWith('.localhost') && parts.length >= 2) {
        subdomain = parts[0]
      } else if (parts.length >= 3 && !['www', 'api'].includes(parts[0]) && !hostname.includes('onrender.com')) {
        subdomain = parts[0]
      }
    }
  }

  return `${base}/api/tenants/company-settings/logo/proxy/${subdomain ? `?t=${subdomain}` : ''}`
}

function buildBrandedHeader(info: CompanyInfo): string {
  const logo = info.showLogo && info.logoUrl
    ? `<img class="logo" src="${getLogoProxyUrl()}" alt="${info.name}" />`
    : ''

  const contactLines: string[] = []
  if (info.address) contactLines.push(info.address)
  const phoneLine: string[] = []
  if (info.phone) phoneLine.push(`Tel: ${info.phone}`)
  if (info.email) phoneLine.push(`Email: ${info.email}`)
  if (phoneLine.length) contactLines.push(phoneLine.join(' | '))

  return `
    <div class="branded-header">
      ${logo}
      <div class="company-details">
        <div class="company-name">${info.name}</div>
        <div class="company-contact">${contactLines.join('<br/>')}</div>
      </div>
    </div>
  `
}

function buildBrandedFooter(info: CompanyInfo): string {
  const contactParts: string[] = [info.name]
  if (info.phone) contactParts.push(info.phone)
  if (info.email) contactParts.push(info.email)

  return `
    <div class="branded-footer">
      <div class="footer-text">${info.invoiceFooter}</div>
      <div class="footer-company">${contactParts.join(' | ')}</div>
      <div class="footer-date">Generated on ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
    </div>
  `
}

// ─── Core Print Window ────────────────────────────────────────────

export function generateBrandedHtml(body: string, options: PrintOptions = {}): string {
  const info = getCompanyInfo()
  const paperSize = options.paperSize || info.paperSize || 'A4'
  const orientation = options.orientation || 'portrait'
  const title = options.title || 'Document'

  return `<!DOCTYPE html>
<html>
<head>
  <title>${title} - ${info.name}</title>
  <style>${buildBaseStyles(paperSize, orientation)}</style>
</head>
<body>
  <div class="page">
    ${buildBrandedHeader(info)}
    <div class="doc-title">${title}</div>
    ${options.subtitle ? `<div class="doc-subtitle">${options.subtitle}</div>` : ''}
    ${body}
    ${buildBrandedFooter(info)}
  </div>
</body>
</html>`
}

export function openBrandedPrintWindow(body: string, options: PrintOptions = {}): void {
  const html = generateBrandedHtml(body, options)
  usePrintStore.getState().open(html)
}

// ─── Invoice Print ────────────────────────────────────────────────

interface InvoiceData {
  invoice_number: string
  tenant_name: string
  unit_name?: string
  date: string
  due_date: string
  status: string
  invoice_type?: string
  description?: string
  total_amount: number
  balance: number
  line_items?: any[]
  items?: any[]
}

export function printInvoice(data: InvoiceData): void {
  const amountPaid = Number(data.total_amount) - Number(data.balance)
  const lineItems = data.line_items || data.items || []

  const lineItemsHtml = lineItems.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Unit Price</th>
          <th class="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItems.map((li: any) => `
          <tr>
            <td>${li.description || li.name || '-'}</td>
            <td class="text-right">${li.quantity || 1}</td>
            <td class="text-right tabular-nums">${formatCurrency(li.unit_price || li.price || 0)}</td>
            <td class="text-right tabular-nums font-bold">${formatCurrency(li.amount || li.total || 0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''

  const body = `
    <div class="info-grid">
      <div>
        <div class="info-group">
          <label>Bill To</label>
          <p>${data.tenant_name}</p>
        </div>
        ${data.unit_name ? `<div class="info-group" style="margin-top:8px"><label>Unit</label><p>${data.unit_name}</p></div>` : ''}
      </div>
      <div style="text-align:right">
        <div class="info-group">
          <label>Invoice Number</label>
          <p>${data.invoice_number}</p>
        </div>
        <div class="info-group" style="margin-top:8px">
          <label>Date</label>
          <p>${formatDate(data.date)}</p>
        </div>
        <div class="info-group" style="margin-top:8px">
          <label>Due Date</label>
          <p>${formatDate(data.due_date)}</p>
        </div>
        <div class="info-group" style="margin-top:8px">
          <label>Status</label>
          <p><span class="status-badge status-${data.status}">${data.status}</span></p>
        </div>
      </div>
    </div>

    ${data.invoice_type ? `<div class="info-group" style="margin-bottom:16px"><label>Type</label><p style="text-transform:capitalize">${data.invoice_type}</p></div>` : ''}
    ${data.description ? `<div class="info-group" style="margin-bottom:16px"><label>Description</label><p>${data.description}</p></div>` : ''}

    ${lineItemsHtml}

    <div class="summary-box">
      <div class="summary-row">
        <span class="label">Total Amount</span>
        <span class="value tabular-nums">${formatCurrency(data.total_amount)}</span>
      </div>
      <div class="summary-row">
        <span class="label">Amount Paid</span>
        <span class="value tabular-nums text-green">${formatCurrency(amountPaid)}</span>
      </div>
      <div class="summary-row">
        <span class="label">Balance Due</span>
        <span class="value tabular-nums ${Number(data.balance) > 0 ? 'text-red' : 'text-green'}">${formatCurrency(data.balance)}</span>
      </div>
    </div>

    <div class="highlight-box">
      <small>Amount Due</small>
      <div class="big-value">${formatCurrency(data.balance)}</div>
    </div>
  `

  openBrandedPrintWindow(body, {
    title: 'Invoice',
    subtitle: data.invoice_number,
  })
}

// ─── Receipt Print ────────────────────────────────────────────────

interface ReceiptData {
  receipt_number: string
  tenant_name: string
  invoice_number?: string
  date: string
  payment_method: string
  reference?: string
  amount: number
  description?: string
}

const methodLabels: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  ecocash: 'EcoCash',
  card: 'Card',
  cheque: 'Cheque',
}

export function printReceipt(data: ReceiptData): void {
  const body = `
    <div class="info-grid">
      <div>
        <div class="info-group">
          <label>Received From</label>
          <p>${data.tenant_name}</p>
        </div>
        ${data.invoice_number ? `<div class="info-group" style="margin-top:8px"><label>For Invoice</label><p>${data.invoice_number}</p></div>` : ''}
      </div>
      <div style="text-align:right">
        <div class="info-group">
          <label>Receipt Number</label>
          <p>${data.receipt_number}</p>
        </div>
        <div class="info-group" style="margin-top:8px">
          <label>Date</label>
          <p>${formatDate(data.date)}</p>
        </div>
        <div class="info-group" style="margin-top:8px">
          <label>Payment Method</label>
          <p>${methodLabels[data.payment_method] || data.payment_method}</p>
        </div>
        ${data.reference ? `<div class="info-group" style="margin-top:8px"><label>Reference</label><p>${data.reference}</p></div>` : ''}
      </div>
    </div>

    ${data.description ? `<div class="info-group" style="margin-bottom:16px"><label>Description</label><p>${data.description}</p></div>` : ''}

    <div class="highlight-box highlight-green">
      <small>Amount Received</small>
      <div class="big-value">${formatCurrency(data.amount)}</div>
    </div>
  `

  openBrandedPrintWindow(body, {
    title: 'Receipt',
    subtitle: data.receipt_number,
  })
}

// ─── Lease Print ──────────────────────────────────────────────────

interface LeaseData {
  lease_number: string
  tenant_name?: string
  unit_display?: string
  status: string
  start_date: string
  end_date: string
  monthly_rent: number
  deposit_amount?: number
  payment_day?: number
  billing_day?: number
  currency?: string
  notes?: string
  leaseTerm?: number
  daysRemaining?: number
}

export function printLease(data: LeaseData): void {
  const body = `
    <div style="text-align:center; margin-bottom:12px;">
      <span class="status-badge status-${data.status}">${(data.status || 'draft').toUpperCase()}</span>
    </div>

    <div class="info-grid">
      <div>
        <div class="info-group"><label>Tenant</label><p>${data.tenant_name || '-'}</p></div>
        <div class="info-group" style="margin-top:8px"><label>Unit</label><p>${data.unit_display || '-'}</p></div>
        <div class="info-group" style="margin-top:8px"><label>Monthly Rent</label><p>${formatCurrency(data.monthly_rent || 0)}</p></div>
      </div>
      <div style="text-align:right">
        <div class="info-group"><label>Lease Number</label><p>${data.lease_number}</p></div>
        <div class="info-group" style="margin-top:8px"><label>Start Date</label><p>${formatDate(data.start_date)}</p></div>
        <div class="info-group" style="margin-top:8px"><label>End Date</label><p>${formatDate(data.end_date)}</p></div>
      </div>
    </div>

    <div class="summary-box" style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 16px; text-align:center;">
      <div>
        <div style="font-size:10px; text-transform:uppercase; color:#6b7280; margin-bottom:4px;">Deposit</div>
        <div style="font-size:18px; font-weight:700;">${formatCurrency(data.deposit_amount || 0)}</div>
      </div>
      <div>
        <div style="font-size:10px; text-transform:uppercase; color:#6b7280; margin-bottom:4px;">Term</div>
        <div style="font-size:18px; font-weight:700;">${data.leaseTerm || '-'} months</div>
      </div>
      <div>
        <div style="font-size:10px; text-transform:uppercase; color:#6b7280; margin-bottom:4px;">Payment Day</div>
        <div style="font-size:18px; font-weight:700;">Day ${data.payment_day || data.billing_day || '-'}</div>
      </div>
      <div>
        <div style="font-size:10px; text-transform:uppercase; color:#6b7280; margin-bottom:4px;">Currency</div>
        <div style="font-size:18px; font-weight:700;">${data.currency || '-'}</div>
      </div>
    </div>

    ${data.daysRemaining !== undefined && data.status === 'active' ? `
      <div style="text-align:center; margin:16px 0; font-size:13px; color:#6b7280;">
        <strong>${data.daysRemaining}</strong> days remaining
      </div>
    ` : ''}

    ${data.notes ? `
      <div class="info-group" style="margin-top:16px;">
        <label>Notes</label>
        <p style="white-space:pre-wrap; font-weight:400; color:#374151;">${data.notes}</p>
      </div>
    ` : ''}
  `

  openBrandedPrintWindow(body, {
    title: 'Lease Agreement',
    subtitle: data.lease_number,
  })
}

// ─── Generic Table Print ──────────────────────────────────────────

export function printTable(
  data: Record<string, any>[],
  columns: TableColumn[],
  options: PrintOptions = {}
): void {
  const headers = columns.map((col) => {
    const align = col.align || 'left'
    return `<th class="text-${align}">${col.label}</th>`
  }).join('')

  const rows = data.map((row) => {
    const cells = columns.map((col) => {
      const align = col.align || 'left'
      return `<td class="text-${align}">${row[col.key] ?? '-'}</td>`
    }).join('')
    return `<tr>${cells}</tr>`
  }).join('')

  const body = `
    <table>
      <thead><tr>${headers}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `

  openBrandedPrintWindow(body, options)
}

// ─── Element Print ────────────────────────────────────────────────

export function printElement(elementId: string, options: PrintOptions = {}): void {
  const element = document.getElementById(elementId)
  if (!element) {
    console.error(`Element with ID "${elementId}" not found`)
    return
  }

  openBrandedPrintWindow(element.innerHTML, options)
}

// ─── Financial Report Print (bank-statement style) ────────────────

export type FinancialReportType =
  | 'trial-balance' | 'income-statement' | 'balance-sheet'
  | 'cash-flow' | 'income-expenditure'

interface FinancialReportPrintOptions {
  reportType: FinancialReportType
  reportName: string
  data: any
  scope?: {
    landlordName?: string
    propertyName?: string
    currency?: string
    periodStart?: string
    periodEnd?: string
    asOfDate?: string
  }
}

function fmtMoney(v: number | string | null | undefined, currency = 'USD', negParens = true): string {
  const num = Number(v ?? 0)
  if (Number.isNaN(num)) return '—'
  const abs = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const symbol = currency === 'ZWG' ? 'ZWG ' : '$'
  if (num < 0) return negParens ? `(${symbol}${abs})` : `-${symbol}${abs}`
  return `${symbol}${abs}`
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return d
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Bank-statement-style CSS — overrides the generic table styles. Tighter,
 *  black-and-white, hairline rules, tabular numerals, accountant double-rule
 *  for grand totals. Designed to print cleanly on A4. */
function buildStatementStyles(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @page { size: A4 portrait; margin: 18mm 16mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 10.5pt; line-height: 1.45; color: #111827;
      font-feature-settings: 'tnum' 1, 'lnum' 1;
    }
    .page { padding: 0; }

    /* Letterhead — minimal, no thick rules, classic statement look */
    .lh { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px;
          padding-bottom: 14px; border-bottom: 1.5pt solid #111827; }
    .lh-co { flex: 1; }
    .lh-logo { width: 64px; height: 64px; object-fit: contain; }
    .lh-co-name { font-size: 16pt; font-weight: 700; letter-spacing: -0.01em; color: #111827; }
    .lh-co-meta { margin-top: 3pt; font-size: 8.5pt; color: #4b5563; line-height: 1.6; }
    .lh-doc { text-align: right; min-width: 200px; }
    .lh-doc-label { font-size: 8pt; font-weight: 600; letter-spacing: 0.12em;
                    text-transform: uppercase; color: #6b7280; }
    .lh-doc-title { margin-top: 3pt; font-size: 14pt; font-weight: 700; color: #111827; letter-spacing: -0.01em; }
    .lh-doc-subtitle { margin-top: 2pt; font-size: 9pt; color: #4b5563; }

    /* Statement particulars block — 2-column grid like a bank statement */
    .stmt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 28px;
                 padding: 14px 0; border-bottom: 0.5pt solid #d1d5db; }
    .stmt-cell .lbl { font-size: 7.5pt; font-weight: 600; letter-spacing: 0.1em;
                      text-transform: uppercase; color: #6b7280; }
    .stmt-cell .val { font-size: 10.5pt; font-weight: 600; color: #111827; margin-top: 2pt; }
    .stmt-cell .val-sub { font-size: 9pt; font-weight: 400; color: #4b5563; }

    /* Section header — small caps tracked label with hairline */
    .sec { margin-top: 18pt; }
    .sec-h { display: flex; align-items: baseline; justify-content: space-between;
             padding-bottom: 6pt; border-bottom: 0.75pt solid #111827; }
    .sec-h-title { font-size: 8.5pt; font-weight: 700; letter-spacing: 0.14em;
                   text-transform: uppercase; color: #111827; }
    .sec-h-meta { font-size: 7.5pt; letter-spacing: 0.1em; text-transform: uppercase; color: #6b7280; }

    /* Tables — no borders on cells, hairline rows */
    .ftbl { width: 100%; border-collapse: collapse; }
    .ftbl thead th { padding: 6pt 4pt; text-align: left;
                     font-size: 7.5pt; font-weight: 600; letter-spacing: 0.1em;
                     text-transform: uppercase; color: #6b7280;
                     border-bottom: 0.5pt solid #d1d5db; }
    .ftbl tbody td { padding: 5pt 4pt; font-size: 10pt; color: #111827;
                     border-bottom: 0.25pt solid #e5e7eb; }
    .ftbl tbody tr:last-child td { border-bottom: 0; }
    .ftbl .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .ftbl .code { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
                  font-size: 9.5pt; color: #4b5563; letter-spacing: -0.01em; }
    .ftbl .muted { color: #6b7280; }
    .ftbl .grow { width: 100%; }

    /* Subtotal / total / grand-total rules — accountant convention */
    .subtotal td { padding-top: 7pt; padding-bottom: 5pt; font-weight: 600;
                   border-top: 0.5pt solid #9ca3af !important;
                   border-bottom: 0 !important; }
    .total td { padding-top: 7pt; padding-bottom: 5pt; font-weight: 700;
                border-top: 0.75pt solid #111827 !important;
                border-bottom: 0 !important; }
    .grand td { padding-top: 9pt; padding-bottom: 4pt; font-weight: 700;
                border-top: 0.75pt solid #111827 !important;
                border-bottom: 2.25pt double #111827 !important; }
    .neg { color: #b91c1c; }
    .pos { color: #047857; }

    /* Two-column ledger layout (Balance Sheet / Trial Balance) */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 22pt; }

    /* Statement summary box — like a bank "balance summary" */
    .balance-box { margin-top: 16pt; padding: 10pt 12pt;
                   border: 0.75pt solid #111827; }
    .balance-box .row { display: flex; justify-content: space-between;
                        padding: 3pt 0; font-size: 10pt; }
    .balance-box .row.head { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.12em;
                             text-transform: uppercase; color: #111827;
                             padding-bottom: 5pt; border-bottom: 0.5pt solid #111827;
                             margin-bottom: 4pt; }
    .balance-box .row .v { font-variant-numeric: tabular-nums; font-weight: 600; }
    .balance-box .row.final { margin-top: 5pt; padding-top: 6pt;
                              border-top: 0.75pt solid #111827; font-weight: 700; font-size: 10.5pt; }

    /* Accrued-expenses table — category sub-headers + detail rows */
    .accrued-tbl .cat-row td { background: #f9fafb;
                               padding-top: 6pt; padding-bottom: 5pt;
                               border-top: 0.5pt solid #d1d5db !important;
                               border-bottom: 0.25pt solid #d1d5db !important; }
    .accrued-tbl .cat-row .cat-label { font-size: 8pt; font-weight: 700;
                                       letter-spacing: 0.1em; text-transform: uppercase;
                                       color: #374151; }
    .accrued-tbl .cat-row .cat-amt { font-weight: 700; color: #111827; }
    .accrued-tbl .acc-date { font-size: 9pt; color: #6b7280;
                             font-variant-numeric: tabular-nums; white-space: nowrap; }
    .accrued-tbl .acc-supplier { font-weight: 500; color: #1f2937; }
    .accrued-tbl .acc-supplier-code { display: inline-block; margin-left: 6pt;
                                      font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
                                      font-size: 8pt; color: #9ca3af; letter-spacing: -0.01em; }
    .accrued-tbl .acc-desc { color: #4b5563; font-size: 9.5pt; }

    /* Notes — supporting schedules under the main statement */
    .notes-section { margin-top: 24pt; }
    .notes-h { display: flex; align-items: baseline; justify-content: space-between;
               padding-bottom: 6pt; border-bottom: 0.75pt solid #111827; }
    .notes-h-title { font-size: 9pt; font-weight: 700; letter-spacing: 0.16em;
                     text-transform: uppercase; color: #111827; }
    .notes-h-meta { font-size: 7.5pt; letter-spacing: 0.1em; text-transform: uppercase; color: #6b7280; }
    .note { margin-top: 14pt; break-inside: avoid; }
    .note-head { display: flex; align-items: baseline; gap: 10pt;
                 padding-bottom: 4pt; border-bottom: 0.25pt solid #d1d5db; }
    .note-num { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.12em;
                text-transform: uppercase; color: #6b7280; min-width: 48pt; }
    .note-title { font-size: 10pt; font-weight: 600; color: #111827; flex: 1; }
    .note-meta { font-size: 8.5pt; color: #6b7280; }
    .note-body { margin-top: 6pt; }

    /* Footer disclaimer */
    .stmt-footer { margin-top: 26pt; padding-top: 8pt; border-top: 0.5pt solid #d1d5db;
                   font-size: 7.5pt; line-height: 1.6; color: #6b7280; }
    .stmt-footer .row { display: flex; justify-content: space-between; gap: 24px; }
    .stmt-footer .gen { letter-spacing: 0.04em; }

    @media print {
      body { padding: 0; }
      .page { padding: 0; }
      thead { display: table-header-group; }  /* Repeat headers across pages */
      .sec { break-inside: avoid; }
    }
  `
}

/** Build the letterhead block. Logo+company on left, doc title on right —
 *  classic bank statement letterhead. */
function buildStatementLetterhead(info: CompanyInfo, reportName: string, generatedOn: string): string {
  const logo = info.showLogo && info.logoUrl
    ? `<img class="lh-logo" src="${getLogoProxyUrl()}" alt="${info.name}" />` : ''
  const meta: string[] = []
  if (info.address) meta.push(info.address)
  const contact: string[] = []
  if (info.phone) contact.push(`Tel ${info.phone}`)
  if (info.email) contact.push(info.email)
  if (contact.length) meta.push(contact.join('  ·  '))
  return `
    <div class="lh">
      <div class="lh-co" style="display: flex; gap: 16px; align-items: flex-start;">
        ${logo}
        <div>
          <div class="lh-co-name">${info.name}</div>
          <div class="lh-co-meta">${meta.join('<br/>')}</div>
        </div>
      </div>
      <div class="lh-doc">
        <div class="lh-doc-label">Statement of</div>
        <div class="lh-doc-title">${reportName}</div>
        <div class="lh-doc-subtitle">Generated ${generatedOn}</div>
      </div>
    </div>
  `
}

/** "Statement particulars" — the row of metadata that runs across the top
 *  of every bank statement (account holder, period, currency, etc.). */
function buildStatementParticulars(opts: FinancialReportPrintOptions): string {
  const s = opts.scope || {}
  const cells: { label: string; value: string; sub?: string }[] = []
  cells.push({ label: 'Account Holder', value: s.landlordName || 'Agency-Wide', sub: s.landlordName ? 'Landlord' : 'All landlords' })
  cells.push({ label: 'Property', value: s.propertyName || 'All Properties' })
  if (s.asOfDate) {
    cells.push({ label: 'As Of', value: fmtDate(s.asOfDate) })
  } else if (s.periodStart || s.periodEnd) {
    cells.push({ label: 'Period', value: `${fmtDate(s.periodStart)} – ${fmtDate(s.periodEnd)}` })
  } else {
    cells.push({ label: 'Period', value: 'Current' })
  }
  cells.push({ label: 'Currency', value: s.currency || 'USD' })
  return `
    <div class="stmt-grid">
      ${cells.map(c => `
        <div class="stmt-cell">
          <div class="lbl">${c.label}</div>
          <div class="val">${c.value}</div>
          ${c.sub ? `<div class="val-sub">${c.sub}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `
}

/** ── Per-report body builders ─────────────────────────────────── */

function buildTrialBalanceBody(data: any, currency: string): string {
  const rows: any[] = data?.accounts || []
  const totals = data?.totals || {}
  if (!rows.length) return `<p style="margin-top:18pt; color:#6b7280; text-align:center;">No accounts with movement.</p>`
  return `
    <div class="sec">
      <div class="sec-h">
        <div class="sec-h-title">Account Balances</div>
        <div class="sec-h-meta">Currency · ${currency}</div>
      </div>
      <table class="ftbl">
        <thead>
          <tr>
            <th style="width: 90pt">Code</th>
            <th class="grow">Account</th>
            <th class="num" style="width: 110pt">Debit</th>
            <th class="num" style="width: 110pt">Credit</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(a => `
            <tr>
              <td class="code">${a.code || a.account_code || ''}</td>
              <td>${a.name || a.account_name || ''}</td>
              <td class="num">${a.debit > 0 ? fmtMoney(a.debit, currency, false) : '<span class="muted">—</span>'}</td>
              <td class="num">${a.credit > 0 ? fmtMoney(a.credit, currency, false) : '<span class="muted">—</span>'}</td>
            </tr>
          `).join('')}
          <tr class="grand">
            <td colspan="2">Total</td>
            <td class="num">${fmtMoney(totals.debits || 0, currency, false)}</td>
            <td class="num">${fmtMoney(totals.credits || 0, currency, false)}</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top:8pt; font-size:8pt; color:${totals.balanced ? '#047857' : '#b91c1c'};">
        ${totals.balanced ? '✓  Trial balance is in balance.' : `✗  Out of balance by ${fmtMoney(totals.difference || 0, currency, false)}.`}
      </div>
    </div>
  `
}

function buildIncomeStatementBody(data: any, currency: string): string {
  const rev = data?.revenue?.accounts || []
  const exp = data?.expenses?.accounts || []
  const revTotal = data?.revenue?.total || 0
  const expTotal = data?.expenses?.total || 0
  const net = data?.net_income || 0
  const isProfit = net >= 0
  const sectionRows = (rows: any[], emptyLabel: string) => rows.length
    ? rows.map(a => `
        <tr>
          <td class="grow">${a.name}</td>
          ${a.code ? `<td class="code" style="width:70pt">${a.code}</td>` : `<td style="width:70pt"></td>`}
          <td class="num" style="width: 110pt">${fmtMoney(a.balance, currency, false)}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" class="muted" style="text-align:center; padding: 6pt 0;">${emptyLabel}</td></tr>`

  return `
    <div class="sec">
      <div class="sec-h">
        <div class="sec-h-title">Revenue</div>
        <div class="sec-h-meta">Income earned</div>
      </div>
      <table class="ftbl"><tbody>
        ${sectionRows(rev, 'No revenue recognised in this period.')}
        <tr class="total">
          <td colspan="2">Total Revenue</td>
          <td class="num">${fmtMoney(revTotal, currency, false)}</td>
        </tr>
      </tbody></table>
    </div>

    <div class="sec">
      <div class="sec-h">
        <div class="sec-h-title">Expenses</div>
        <div class="sec-h-meta">Costs incurred (cash &amp; accrued)</div>
      </div>
      <table class="ftbl"><tbody>
        ${sectionRows(exp, 'No expenses recognised in this period.')}
        <tr class="total">
          <td colspan="2">Total Expenses</td>
          <td class="num">(${fmtMoney(expTotal, currency, false)})</td>
        </tr>
      </tbody></table>
    </div>

    <div class="sec">
      <table class="ftbl"><tbody>
        <tr class="grand">
          <td class="grow" style="font-size: 10.5pt;">Net ${isProfit ? 'Income' : 'Loss'}</td>
          <td class="num ${isProfit ? 'pos' : 'neg'}" style="font-size: 11pt;">${isProfit ? fmtMoney(net, currency, false) : `(${fmtMoney(Math.abs(net), currency, false)})`}</td>
        </tr>
      </tbody></table>
    </div>
  `
}

function buildBalanceSheetBody(data: any, currency: string): string {
  const assets = data?.assets?.accounts || []
  const liabs = data?.liabilities?.accounts || []
  const equity = data?.equity?.accounts || []
  const totalA = data?.assets?.total || 0
  const totalL = data?.liabilities?.total || 0
  const totalE = data?.equity?.total || 0
  const balanced = data?.totals?.balanced
  const breakdowns = data?.breakdowns || {}

  const block = (rows: any[], totalLabel: string, total: number) => `
    <table class="ftbl"><tbody>
      ${rows.length ? rows.map(a => `
        <tr>
          ${a.code ? `<td class="code" style="width:70pt">${a.code}</td>` : `<td style="width:70pt"></td>`}
          <td class="grow">${a.name}</td>
          <td class="num" style="width:110pt">${fmtMoney(a.balance, currency, false)}</td>
        </tr>`).join('')
        : `<tr><td colspan="3" class="muted" style="text-align:center; padding: 6pt 0;">No items.</td></tr>`}
      <tr class="total">
        <td colspan="2">${totalLabel}</td>
        <td class="num">${fmtMoney(total, currency, false)}</td>
      </tr>
    </tbody></table>
  `

  // ---- Notes (supporting schedules) -------------------------------------
  // Composed in landlord-statement style: each breakdown is a numbered note
  // with its own table, mirroring how published financial statements
  // present supporting detail.
  const notes: string[] = []
  let noteNo = 0

  const trust = breakdowns.trust_composition
  if (trust && (trust.receipts_collected || trust.commission_charged ||
      trust.operating_expenses_paid || trust.landlord_remittances ||
      trust.funds_held_in_trust)) {
    noteNo += 1
    notes.push(`
      <div class="note">
        <div class="note-head">
          <div class="note-num">Note ${noteNo}</div>
          <div class="note-title">Composition of Funds Held in Trust</div>
          <div class="note-meta">Cash basis · since inception</div>
        </div>
        <div class="note-body">
          <table class="ftbl"><tbody>
            <tr><td class="grow">Tenant receipts collected</td>
                <td class="num">${fmtMoney(trust.receipts_collected || 0, currency, false)}</td></tr>
            <tr><td class="grow">Less: Management commission charged</td>
                <td class="num neg">(${fmtMoney(trust.commission_charged || 0, currency, false)})</td></tr>
            <tr><td class="grow">Less: Operating expenses paid from trust</td>
                <td class="num neg">(${fmtMoney(trust.operating_expenses_paid || 0, currency, false)})</td></tr>
            <tr><td class="grow">Less: Remittances paid to landlord</td>
                <td class="num neg">(${fmtMoney(trust.landlord_remittances || 0, currency, false)})</td></tr>
            <tr class="grand"><td>Funds Held in Trust</td>
                <td class="num">${fmtMoney(trust.funds_held_in_trust || 0, currency, false)}</td></tr>
          </tbody></table>
        </div>
      </div>
    `)
  }

  const perProp = breakdowns.per_property
  if (Array.isArray(perProp) && perProp.length) {
    noteNo += 1
    const totals = perProp.reduce((acc: any, r: any) => ({
      fht: acc.fht + (r.funds_held_in_trust || 0),
      tr:  acc.tr  + (r.tenant_receivables || 0),
      ae:  acc.ae  + (r.accrued_expenses || 0),
    }), { fht: 0, tr: 0, ae: 0 })
    notes.push(`
      <div class="note">
        <div class="note-head">
          <div class="note-num">Note ${noteNo}</div>
          <div class="note-title">Per-Property Breakdown</div>
          <div class="note-meta">${perProp.length} propert${perProp.length === 1 ? 'y' : 'ies'}</div>
        </div>
        <div class="note-body">
          <table class="ftbl">
            <thead>
              <tr>
                <th class="grow">Property</th>
                <th class="num">Funds Held in Trust</th>
                <th class="num">Tenant Receivables</th>
                <th class="num">Accrued Expenses</th>
              </tr>
            </thead>
            <tbody>
              ${perProp.map((r: any) => `
                <tr>
                  <td>${r.property_name || '—'}</td>
                  <td class="num">${fmtMoney(r.funds_held_in_trust || 0, currency, false)}</td>
                  <td class="num">${fmtMoney(r.tenant_receivables || 0, currency, false)}</td>
                  <td class="num">${fmtMoney(r.accrued_expenses || 0, currency, false)}</td>
                </tr>`).join('')}
              <tr class="total">
                <td>Total</td>
                <td class="num">${fmtMoney(totals.fht, currency, false)}</td>
                <td class="num">${fmtMoney(totals.tr, currency, false)}</td>
                <td class="num">${fmtMoney(totals.ae, currency, false)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `)
  }

  const eq = breakdowns.equity_reconciliation
  if (eq && (eq.opening_equity || eq.period_net_income || eq.drawings || eq.closing_equity)) {
    noteNo += 1
    const periodLbl = (eq.period_start && eq.period_end)
      ? `${fmtDate(eq.period_start)} – ${fmtDate(eq.period_end)}`
      : 'year-to-date'
    notes.push(`
      <div class="note">
        <div class="note-head">
          <div class="note-num">Note ${noteNo}</div>
          <div class="note-title">Reconciliation of Owner's Equity</div>
          <div class="note-meta">${periodLbl}</div>
        </div>
        <div class="note-body">
          <table class="ftbl"><tbody>
            <tr><td class="grow">Opening equity</td>
                <td class="num">${fmtMoney(eq.opening_equity || 0, currency, false)}</td></tr>
            <tr><td class="grow">Add: Period net income</td>
                <td class="num ${(eq.period_net_income || 0) >= 0 ? 'pos' : 'neg'}">${fmtMoney(eq.period_net_income || 0, currency)}</td></tr>
            <tr><td class="grow">Less: Drawings (remittances to owner)</td>
                <td class="num neg">(${fmtMoney(eq.drawings || 0, currency, false)})</td></tr>
            <tr class="grand"><td>Closing equity</td>
                <td class="num">${fmtMoney(eq.closing_equity || 0, currency, false)}</td></tr>
          </tbody></table>
        </div>
      </div>
    `)
  }

  const accruedCats = breakdowns.accrued_expenses_by_category
  const accruedDetail: any[] = breakdowns.accrued_expenses_detail || []
  if (Array.isArray(accruedCats) && accruedCats.length) {
    noteNo += 1
    const totalAcc = accruedCats.reduce((s: number, r: any) => s + (r.amount || 0), 0)
    // Group detail entries by category so each category subtotal heads a
    // block of line items showing the supplier (City of Harare, ZESA, …),
    // date, and description — landlords need to see WHO they owe.
    const detailByCategory = new Map<string, any[]>()
    for (const e of accruedDetail) {
      const key = e.category || 'Uncategorised'
      const arr = detailByCategory.get(key) || []
      arr.push(e)
      detailByCategory.set(key, arr)
    }
    const meta = accruedDetail.length
      ? `${accruedDetail.length} ${accruedDetail.length === 1 ? 'entry' : 'entries'} · ${accruedCats.length} categor${accruedCats.length === 1 ? 'y' : 'ies'}`
      : `${accruedCats.length} categor${accruedCats.length === 1 ? 'y' : 'ies'}`

    const escapeHtml = (s: string) =>
      String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

    const rowsHtml = accruedCats.map((cat: any) => {
      const entries = detailByCategory.get(cat.category) || []
      const headerRow = `
        <tr class="cat-row">
          <td colspan="3" class="cat-label">${escapeHtml(cat.category || 'Uncategorised')}</td>
          <td class="num cat-amt">${fmtMoney(cat.amount || 0, currency, false)}</td>
        </tr>`
      const detailRows = entries.map((e: any) => `
        <tr>
          <td class="acc-date">${fmtDate(e.date)}</td>
          <td class="acc-supplier">
            ${escapeHtml(e.supplier_name || '—')}
            ${e.supplier_code ? `<span class="acc-supplier-code">${escapeHtml(e.supplier_code)}</span>` : ''}
          </td>
          <td class="acc-desc">${escapeHtml(e.description || (e.reference ? `Ref ${e.reference}` : '—'))}</td>
          <td class="num">${fmtMoney(e.amount || 0, currency, false)}</td>
        </tr>`).join('')
      return headerRow + detailRows
    }).join('')

    notes.push(`
      <div class="note">
        <div class="note-head">
          <div class="note-num">Note ${noteNo}</div>
          <div class="note-title">Accrued Expenses</div>
          <div class="note-meta">${meta}</div>
        </div>
        <div class="note-body">
          <table class="ftbl accrued-tbl">
            <thead>
              <tr>
                <th style="width:60pt">Date</th>
                <th>Supplier / Payee</th>
                <th>Description</th>
                <th class="num" style="width:90pt">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="grand">
                <td colspan="3">Total Accrued Expenses</td>
                <td class="num">${fmtMoney(totalAcc, currency, false)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `)
  }

  const notesBlock = notes.length ? `
    <div class="notes-section">
      <div class="notes-h">
        <div class="notes-h-title">Notes to the Balance Sheet</div>
        <div class="notes-h-meta">Supporting detail · ${currency}</div>
      </div>
      ${notes.join('')}
    </div>
  ` : ''

  return `
    <div class="sec">
      <div class="sec-h">
        <div class="sec-h-title">Assets</div>
        <div class="sec-h-meta">What the entity owns</div>
      </div>
      ${block(assets, 'Total Assets', totalA)}
    </div>

    <div class="sec">
      <div class="sec-h">
        <div class="sec-h-title">Liabilities</div>
        <div class="sec-h-meta">What the entity owes</div>
      </div>
      ${block(liabs, 'Total Liabilities', totalL)}
    </div>

    <div class="sec">
      <div class="sec-h">
        <div class="sec-h-title">Equity</div>
        <div class="sec-h-meta">Net worth (residual)</div>
      </div>
      ${block(equity, 'Total Equity', totalE)}
    </div>

    <div class="balance-box">
      <div class="row head"><span>Balance Check</span><span>${currency}</span></div>
      <div class="row"><span>Total Assets</span><span class="v">${fmtMoney(totalA, currency, false)}</span></div>
      <div class="row"><span>Total Liabilities &amp; Equity</span><span class="v">${fmtMoney(totalL + totalE, currency, false)}</span></div>
      <div class="row final"><span>${balanced ? '✓ Balanced' : '✗ Out of Balance'}</span>
        <span class="v ${balanced ? 'pos' : 'neg'}">${fmtMoney(totalA - (totalL + totalE), currency, false)}</span></div>
    </div>

    ${notesBlock}
  `
}

function buildCashFlowBody(data: any, currency: string): string {
  const op = data?.operating_activities || {}
  const inv = data?.investing_activities || {}
  const fin = data?.financing_activities || {}
  const sum = data?.summary || {}
  const opIn = op.inflows || {}
  const opOut = op.outflows || {}

  return `
    <div class="sec">
      <div class="sec-h">
        <div class="sec-h-title">Operating Activities</div>
        <div class="sec-h-meta">Cash from day-to-day operations</div>
      </div>
      <table class="ftbl"><tbody>
        <tr><td class="grow">Cash receipts from tenants</td><td class="num">${fmtMoney(opIn.tenant_receipts || 0, currency, false)}</td></tr>
        <tr><td class="grow">Cash paid for expenses</td><td class="num neg">(${fmtMoney(opOut.expense_payments || 0, currency, false)})</td></tr>
        <tr><td class="grow">Cash paid to managing agent</td><td class="num neg">(${fmtMoney(opOut.agent_commission || 0, currency, false)})</td></tr>
        <tr><td class="grow">Cash paid to landlord</td><td class="num neg">(${fmtMoney(opOut.landlord_payments || 0, currency, false)})</td></tr>
        <tr class="total"><td>Net cash from operating</td><td class="num">${fmtMoney(op.net_cash || 0, currency, false)}</td></tr>
      </tbody></table>
    </div>

    <div class="sec">
      <div class="sec-h">
        <div class="sec-h-title">Investing Activities</div>
        <div class="sec-h-meta">Asset purchases &amp; sales</div>
      </div>
      <table class="ftbl"><tbody>
        <tr><td class="grow">Asset sales</td><td class="num">${fmtMoney(inv.inflows?.asset_sales || 0, currency, false)}</td></tr>
        <tr><td class="grow">Asset purchases</td><td class="num neg">(${fmtMoney(inv.outflows?.asset_purchases || 0, currency, false)})</td></tr>
        <tr class="total"><td>Net cash from investing</td><td class="num">${fmtMoney(inv.net_cash || 0, currency, false)}</td></tr>
      </tbody></table>
    </div>

    <div class="sec">
      <div class="sec-h">
        <div class="sec-h-title">Financing Activities</div>
        <div class="sec-h-meta">Owner contributions &amp; withdrawals</div>
      </div>
      <table class="ftbl"><tbody>
        <tr><td class="grow">Owner contributions</td><td class="num">${fmtMoney(fin.inflows?.owner_contributions || 0, currency, false)}</td></tr>
        <tr><td class="grow">Owner withdrawals</td><td class="num neg">(${fmtMoney(fin.outflows?.owner_withdrawals || 0, currency, false)})</td></tr>
        <tr class="total"><td>Net cash from financing</td><td class="num">${fmtMoney(fin.net_cash || 0, currency, false)}</td></tr>
      </tbody></table>
    </div>

    <div class="balance-box">
      <div class="row head"><span>Cash Position</span><span>${currency}</span></div>
      <div class="row"><span>Beginning cash</span><span class="v">${fmtMoney(sum.beginning_cash || 0, currency, false)}</span></div>
      <div class="row"><span>Net change in cash</span><span class="v ${(sum.net_change_in_cash || 0) >= 0 ? 'pos' : 'neg'}">${fmtMoney(sum.net_change_in_cash || 0, currency)}</span></div>
      <div class="row final"><span>Ending cash</span><span class="v">${fmtMoney(sum.ending_cash || 0, currency, false)}</span></div>
    </div>

    <div style="margin-top:10pt; font-size:8pt; color:#6b7280; line-height:1.5;">
      <em>Cash basis. Non-cash entries (accruals, depreciation) are excluded from this statement.</em>
    </div>
  `
}

function buildIncomeExpenditureBody(data: any, currency: string): string {
  const months: any[] = data?.months || []
  const cons = data?.consolidated || {}
  if (!months.length) return `<p style="margin-top:18pt; color:#6b7280; text-align:center;">No activity in this period.</p>`

  // Income & Expenditure is rendered as a compact monthly columnar view —
  // matches the spreadsheet users already know from the on-screen report.
  const incomeKeys = Object.keys(cons.income_categories || {})
  const expenseKeys = Object.keys(cons.expenditure_categories || {})

  const monthHeads = months.map(m => `<th class="num">${m.label || m.month}</th>`).join('')
  const total = `<th class="num">Total</th>`
  return `
    <div class="sec">
      <div class="sec-h">
        <div class="sec-h-title">Monthly Income &amp; Expenditure</div>
        <div class="sec-h-meta">${months.length} period${months.length === 1 ? '' : 's'} · ${currency}</div>
      </div>
      <table class="ftbl">
        <thead>
          <tr><th class="grow">Item</th>${monthHeads}${total}</tr>
        </thead>
        <tbody>
          ${incomeKeys.map(k => `
            <tr>
              <td>${k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ')}</td>
              ${months.map(m => `<td class="num">${fmtMoney(m.income_categories?.[k] || 0, currency, false)}</td>`).join('')}
              <td class="num">${fmtMoney(cons.income_categories?.[k] || 0, currency, false)}</td>
            </tr>`).join('')}
          <tr class="subtotal">
            <td>Total Income</td>
            ${months.map(m => `<td class="num">${fmtMoney(m.total_income || 0, currency, false)}</td>`).join('')}
            <td class="num">${fmtMoney(cons.total_income || 0, currency, false)}</td>
          </tr>
          ${expenseKeys.map(k => `
            <tr>
              <td>${k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ')}</td>
              ${months.map(m => `<td class="num neg">(${fmtMoney(m.expenditure_categories?.[k] || 0, currency, false)})</td>`).join('')}
              <td class="num neg">(${fmtMoney(cons.expenditure_categories?.[k] || 0, currency, false)})</td>
            </tr>`).join('')}
          <tr>
            <td>Management Commission</td>
            ${months.map(m => `<td class="num neg">(${fmtMoney(m.management_commission || 0, currency, false)})</td>`).join('')}
            <td class="num neg">(${fmtMoney(cons.management_commission || 0, currency, false)})</td>
          </tr>
          <tr class="subtotal">
            <td>Total Expenditure</td>
            ${months.map(m => `<td class="num neg">(${fmtMoney(m.total_expenditure || 0, currency, false)})</td>`).join('')}
            <td class="num neg">(${fmtMoney(cons.total_expenditure || 0, currency, false)})</td>
          </tr>
          <tr class="grand">
            <td>Balance c/f</td>
            ${months.map(m => `<td class="num">${fmtMoney(m.balance_cf || 0, currency)}</td>`).join('')}
            <td class="num">${fmtMoney(cons.balance_cf || cons.closing_balance || 0, currency)}</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top:10pt; font-size:8pt; color:#6b7280; line-height:1.5;">
        <em>Cash basis. Non-cash accruals are reported on the Income Statement, not here.</em>
      </div>
    </div>
  `
}

/** Public entrypoint — renders the right body for the given report type
 *  inside the bank-statement letterhead+particulars+footer shell. */
export function printFinancialReport(opts: FinancialReportPrintOptions): void {
  const info = getCompanyInfo()
  const currency = opts.scope?.currency || info.defaultCurrency || 'USD'
  const generatedOn = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  let body = ''
  switch (opts.reportType) {
    case 'trial-balance':       body = buildTrialBalanceBody(opts.data, currency); break
    case 'income-statement':    body = buildIncomeStatementBody(opts.data, currency); break
    case 'balance-sheet':       body = buildBalanceSheetBody(opts.data, currency); break
    case 'cash-flow':           body = buildCashFlowBody(opts.data, currency); break
    case 'income-expenditure':  body = buildIncomeExpenditureBody(opts.data, currency); break
  }

  const contactParts: string[] = [info.name]
  if (info.phone) contactParts.push(info.phone)
  if (info.email) contactParts.push(info.email)

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${opts.reportName} — ${info.name}</title>
  <style>${buildStatementStyles()}</style>
</head>
<body>
  <div class="page">
    ${buildStatementLetterhead(info, opts.reportName, generatedOn)}
    ${buildStatementParticulars(opts)}
    ${body}
    <div class="stmt-footer">
      <div class="row">
        <div>
          ${info.invoiceFooter ? `<div><em>${info.invoiceFooter}</em></div>` : ''}
          <div style="margin-top: 2pt;">${contactParts.join('  ·  ')}</div>
        </div>
        <div class="gen" style="text-align:right;">
          <div>Generated ${generatedOn}</div>
          <div>This statement is computer-generated and does not require a signature.</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`

  usePrintStore.getState().open(html)
}
