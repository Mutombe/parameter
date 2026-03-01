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
