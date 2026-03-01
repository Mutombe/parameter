import axios, { type InternalAxiosRequestConfig } from 'axios'
import { useSessionStore } from '../stores/sessionStore'

// API base URL - use environment variable for production, empty for development.
// In development, requests use relative URLs (e.g. /api/...) so they go through
// the Vite dev server proxy, which forwards to Django with the correct Host header
// for tenant resolution. In production, VITE_API_URL points to the API server.
const API_BASE_URL = import.meta.env.VITE_API_URL || ''

// Extract subdomain from current hostname for multi-tenant routing
const getSubdomain = (): string | null => {
  // First check URL parameter (for demo/testing when DNS isn't set up)
  const urlParams = new URLSearchParams(window.location.search)
  const tenantParam = urlParams.get('tenant')
  if (tenantParam) {
    sessionStorage.setItem('tenant_subdomain', tenantParam)
    console.debug('[TENANT] from URL param:', tenantParam)
    return tenantParam
  }

  // Check sessionStorage (persists tenant across page navigations)
  const storedTenant = sessionStorage.getItem('tenant_subdomain')
  if (storedTenant) {
    console.debug('[TENANT] from sessionStorage:', storedTenant)
    return storedTenant
  }

  // Fallback: derive from logged-in user's tenant_info (persisted in localStorage)
  try {
    const authStorage = JSON.parse(localStorage.getItem('auth-storage') || '{}')
    const schemaName = authStorage?.state?.user?.tenant_info?.schema_name
    console.debug('[TENANT] auth-storage schema_name:', schemaName)
    if (schemaName && schemaName !== 'public') {
      sessionStorage.setItem('tenant_subdomain', schemaName)
      return schemaName
    }
  } catch {
    // ignore parse errors
  }

  const hostname = window.location.hostname
  const parts = hostname.split('.')

  // Development: subdomain.localhost
  if (hostname.endsWith('.localhost') && parts.length >= 2) {
    console.debug('[TENANT] from dev hostname:', parts[0])
    return parts[0]
  }

  // Production: subdomain.parameter.co.zw (3+ parts means there's a subdomain)
  // Exclude onrender.com domains
  if (parts.length >= 3 && !['www', 'api'].includes(parts[0]) && !hostname.includes('onrender.com')) {
    console.debug('[TENANT] from prod hostname:', parts[0])
    return parts[0]
  }

  console.warn('[TENANT] NO SUBDOMAIN RESOLVED! hostname:', hostname, 'sessionStorage:', sessionStorage.getItem('tenant_subdomain'), 'auth-storage schema:', (() => { try { return JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.user?.tenant_info?.schema_name } catch { return 'parse-error' } })())
  return null
}

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Slow network detection infrastructure
const SLOW_THRESHOLD_MS = 5000
const ROLLING_WINDOW_SIZE = 5
const requestDurations: number[] = []
let slowNetworkCallback: ((isSlow: boolean) => void) | null = null
let wasSlow = false

export function onSlowNetworkChange(callback: (isSlow: boolean) => void) {
  slowNetworkCallback = callback
  return () => { slowNetworkCallback = null }
}

// Extend config type to carry timing metadata
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _requestStartTime?: number
  }
}

// Add CSRF token and tenant subdomain handling
api.interceptors.request.use((config) => {
  // Stamp start time for slow-network detection
  config._requestStartTime = Date.now()

  // CSRF token for Django
  const csrfToken = document.cookie
    .split('; ')
    .find(row => row.startsWith('csrftoken='))
    ?.split('=')[1]

  if (csrfToken) {
    config.headers['X-CSRFToken'] = csrfToken
  }

  // Add tenant subdomain header for multi-tenant routing
  const subdomain = getSubdomain()
  if (subdomain) {
    config.headers['X-Tenant-Subdomain'] = subdomain
  }

  const fullUrl = `${config.baseURL || ''}${config.url || ''}`
  console.log(`[API REQ] ${config.method?.toUpperCase()} ${fullUrl} | tenant=${subdomain || 'NONE'} | headers:`, {
    'X-Tenant-Subdomain': config.headers['X-Tenant-Subdomain'] || 'NOT SET',
    'X-CSRFToken': config.headers['X-CSRFToken'] ? 'present' : 'NOT SET',
  })

  // Staff impersonation: append tenant_id to tenant-portal API calls
  if (config.url?.includes('/tenant-portal/')) {
    try {
      const authStorage = JSON.parse(localStorage.getItem('auth-storage') || '{}')
      const impersonation = authStorage?.state?.impersonation
      if (impersonation?.tenantId) {
        config.params = { ...config.params, tenant_id: impersonation.tenantId }
      }
    } catch {
      // ignore parse errors
    }
  }

  return config
})

// Response interceptor for error handling + slow-network tracking
api.interceptors.response.use(
  (response) => {
    console.log(`[API RES] ${response.config.method?.toUpperCase()} ${response.config.url} → ${response.status}`, {
      dataKeys: response.data ? Object.keys(response.data) : 'no data',
      count: response.data?.count ?? response.data?.results?.length ?? (Array.isArray(response.data) ? response.data.length : undefined),
    })
    // Track request duration for slow-network detection
    const start = response.config._requestStartTime
    if (start) {
      const duration = Date.now() - start
      requestDurations.push(duration)
      if (requestDurations.length > ROLLING_WINDOW_SIZE) {
        requestDurations.shift()
      }
      if (requestDurations.length === ROLLING_WINDOW_SIZE) {
        const avg = requestDurations.reduce((a, b) => a + b, 0) / ROLLING_WINDOW_SIZE
        const isSlow = avg > SLOW_THRESHOLD_MS
        if (isSlow !== wasSlow) {
          wasSlow = isSlow
          slowNetworkCallback?.(isSlow)
        }
      }
    }
    return response
  },
  (error) => {
    console.error(`[API ERR] ${error.config?.method?.toUpperCase()} ${error.config?.url} → ${error.response?.status || 'NETWORK ERROR'}`, {
      data: error.response?.data,
      message: error.message,
    })
    if (error.response?.status === 401) {
      const path = window.location.pathname
      const url = (error.config as InternalAxiosRequestConfig)?.url || ''

      // Guard: skip for public pages and login endpoint itself
      const isPublicPage = path === '/login' || path === '/' || path.startsWith('/accept-invite') || path.startsWith('/demo')
      const isLoginRequest = url.includes('/auth/login')

      if (!isPublicPage && !isLoginRequest) {
        const sessionStore = useSessionStore.getState()

        // Only trigger modal once for concurrent 401s
        if (!sessionStore.isSessionExpired) {
          sessionStore.setSessionExpired(true)
        }

        // Queue the failed request — caller suspends until re-login replays it
        return new Promise((resolve, reject) => {
          sessionStore.addToQueue({
            config: error.config as InternalAxiosRequestConfig,
            resolve,
            reject,
          })
        })
      }
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authApi = {
  login: (data: { email: string; password: string }) =>
    api.post('/accounts/auth/login/', data),
  logout: () => api.post('/accounts/auth/logout/'),
  me: () => api.get('/accounts/auth/me/'),
  changePassword: (data: { current_password: string; new_password: string; confirm_password: string }) =>
    api.post('/accounts/auth/change_password/', data),
  updateProfile: (data: { first_name?: string; last_name?: string; phone?: string }) =>
    api.patch('/accounts/auth/update_profile/', data),
  uploadAvatar: (file: File) => {
    const formData = new FormData()
    formData.append('avatar', file)
    return api.post('/accounts/auth/upload_avatar/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  removeAvatar: () => api.delete('/accounts/auth/remove_avatar/'),
  requestPasswordReset: (email: string) =>
    api.post('/accounts/auth/request_password_reset/', { email }),
  validateResetToken: (token: string) =>
    api.get('/accounts/auth/validate_reset_token/', { params: { token } }),
  resetPassword: (data: { token: string; new_password: string; confirm_password: string }) =>
    api.post('/accounts/auth/reset_password/', data),
}

// Dashboard/Reports API
export const reportsApi = {
  dashboard: () => api.get('/reports/dashboard/'),
  trialBalance: (params?: { as_of_date?: string }) =>
    api.get('/reports/trial-balance/', { params }),
  incomeStatement: (params?: { start_date?: string; end_date?: string }) =>
    api.get('/reports/income-statement/', { params }),
  balanceSheet: (params?: { as_of_date?: string }) =>
    api.get('/reports/balance-sheet/', { params }),
  cashFlow: (params?: { start_date?: string; end_date?: string }) =>
    api.get('/reports/cash-flow/', { params }),
  vacancy: () => api.get('/reports/vacancy/'),
  rentRoll: () => api.get('/reports/rent-roll/'),
  rentRollover: (params: { start_date: string; end_date: string; property_id?: number }) =>
    api.get('/reports/rent-rollover/', { params }),
  landlordStatement: (params: { landlord_id: number; start_date?: string; end_date?: string }) =>
    api.get('/reports/landlord-statement/', { params }),
  // New reports
  agedAnalysis: (params?: { as_of_date?: string; tenant_id?: number; property_id?: number; landlord_id?: number }) =>
    api.get('/reports/aged-analysis/', { params }),
  tenantAccount: (params: { tenant_id: number; start_date?: string; end_date?: string }) =>
    api.get('/reports/tenant-account/', { params }),
  depositSummary: (params?: { tenant_id?: number; property_id?: number }) =>
    api.get('/reports/deposit-summary/', { params }),
  commission: (params?: { start_date?: string; end_date?: string; landlord_id?: number }) =>
    api.get('/reports/commission/', { params }),
  commissionPropertyDrilldown: (params: { property_id: number; start_date?: string; end_date?: string }) =>
    api.get('/reports/commission/drilldown/', { params }),
  commissionAnalysis: (params?: { start_date?: string; end_date?: string }) =>
    api.get('/reports/commission-analysis/', { params }),
  leaseCharges: (params?: { property_id?: number; landlord_id?: number; start_date?: string; end_date?: string }) =>
    api.get('/reports/lease-charges/', { params }),
  receiptListing: (params?: { start_date?: string; end_date?: string; bank_account_id?: number; income_type?: string; payment_method?: string; export?: string }) =>
    api.get('/reports/receipts/', { params }),
  incomeItemAnalysis: (params?: { start_date?: string; end_date?: string; income_type?: string; bank_account_id?: number }) =>
    api.get('/reports/income-item-analysis/', { params }),
  incomeItemDrilldown: (params: { level: number; bank_account_id: number; income_type?: string; start_date?: string; end_date?: string }) =>
    api.get('/reports/income-item-analysis/drilldown/', { params }),
  incomeExpenditure: (params: { landlord_id?: number; property_id?: number; start_date?: string; end_date?: string }) =>
    api.get('/reports/income-expenditure/', { params }),
  charts: (params: { chart_type: string; tenant_id?: number; property_id?: number; months?: number; start_date?: string; end_date?: string }) =>
    api.get('/reports/charts/', { params }),
  // Server-side streaming CSV export for large datasets
  streamExport: (type: string, filters?: Record<string, string>) =>
    api.get('/reports/export/', { params: { type, ...filters }, responseType: 'blob' }),
}

// Masterfile API
export const landlordApi = {
  list: (params?: object) => api.get('/masterfile/landlords/', { params }),
  get: (id: number) => api.get(`/masterfile/landlords/${id}/`),
  create: (data: object) => api.post('/masterfile/landlords/', data),
  update: (id: number, data: object) => api.patch(`/masterfile/landlords/${id}/`, data),
  delete: (id: number) => api.delete(`/masterfile/landlords/${id}/`),
  statement: (id: number) => api.get(`/masterfile/landlords/${id}/statement/`),
}

export const propertyApi = {
  list: (params?: object) => api.get('/masterfile/properties/', { params }),
  get: (id: number) => api.get(`/masterfile/properties/${id}/`),
  create: (data: object) => api.post('/masterfile/properties/', data),
  update: (id: number, data: object) => api.patch(`/masterfile/properties/${id}/`, data),
  delete: (id: number) => api.delete(`/masterfile/properties/${id}/`),
  stats: () => api.get('/masterfile/properties/stats/'),
  previewUnits: (id: number) => api.get(`/masterfile/properties/${id}/preview_units/`),
  generateUnits: (id: number, data: object) => api.post(`/masterfile/properties/${id}/generate_units/`, data),
}

export const unitApi = {
  list: (params?: object) => api.get('/masterfile/units/', { params }),
  get: (id: number) => api.get(`/masterfile/units/${id}/`),
  create: (data: object) => api.post('/masterfile/units/', data),
  update: (id: number, data: object) => api.patch(`/masterfile/units/${id}/`, data),
  delete: (id: number) => api.delete(`/masterfile/units/${id}/`),
  vacant: () => api.get('/masterfile/units/vacant/'),
}

export const tenantApi = {
  list: (params?: object) => api.get('/masterfile/tenants/', { params }),
  get: (id: number) => api.get(`/masterfile/tenants/${id}/`),
  create: (data: object) => api.post('/masterfile/tenants/', data),
  update: (id: number, data: object) => api.patch(`/masterfile/tenants/${id}/`, data),
  delete: (id: number) => api.delete(`/masterfile/tenants/${id}/`),
  ledger: (id: number) => api.get(`/masterfile/tenants/${id}/ledger/`),
  detailView: (id: number) => api.get(`/masterfile/tenants/${id}/detail_view/`),
}

export const leaseApi = {
  list: (params?: object) => api.get('/masterfile/leases/', { params }),
  get: (id: number) => api.get(`/masterfile/leases/${id}/`),
  create: (data: object) => api.post('/masterfile/leases/', data),
  update: (id: number, data: object) => api.patch(`/masterfile/leases/${id}/`, data),
  activate: (id: number) => api.post(`/masterfile/leases/${id}/activate/`),
  terminate: (id: number, reason: string) =>
    api.post(`/masterfile/leases/${id}/terminate/`, { reason }),
  expiringSoon: () => api.get('/masterfile/leases/expiring_soon/'),
  uploadDocument: (id: number, file: File) => {
    const formData = new FormData()
    formData.append('document', file)
    return api.post(`/masterfile/leases/${id}/upload_document/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
}

// Billing API
export const invoiceApi = {
  list: (params?: object) => api.get('/billing/invoices/', { params }),
  get: (id: number) => api.get(`/billing/invoices/${id}/`),
  create: (data: object) => api.post('/billing/invoices/', data),
  update: (id: number, data: object) => api.patch(`/billing/invoices/${id}/`, data),
  postToLedger: (id: number) => api.post(`/billing/invoices/${id}/post_to_ledger/`),
  generateMonthly: (data: { month: number; year: number; lease_ids?: number[] }) =>
    api.post('/billing/invoices/generate_monthly/', data),
  overdue: () => api.get('/billing/invoices/overdue/'),
  summary: () => api.get('/billing/invoices/summary/'),
  // New billing management actions
  uniformCharge: (data: {
    property_id: number;
    invoice_type?: string;
    amount: number;
    description?: string;
    due_date?: string;
    period_start?: string;
    period_end?: string
  }) => api.post('/billing/invoices/uniform_charge/', data),
  deleteBilling: (data: {
    property_id?: number;
    lease_id?: number;
    year: number;
    month: number;
    invoice_type?: string
  }) => api.post('/billing/invoices/delete_billing/', data),
  sendInvoices: (data: {
    tenant_ids?: number[];
    property_ids?: number[];
    invoice_ids?: number[];
    send_all?: boolean;
    subject?: string;
    message?: string
  }) => api.post('/billing/invoices/send_invoices/', data),
}

// Bulk Mailing API
export const mailingApi = {
  sendBulkEmail: (data: {
    tenant_ids?: number[];
    property_ids?: number[];
    account_type?: 'rental' | 'levy' | 'both';
    send_all?: boolean;
    subject: string;
    message: string
  }) => api.post('/billing/mailing/send_bulk_email/', data),
  previewRecipients: (params?: {
    tenant_ids?: number[];
    property_ids?: number[];
    account_type?: string;
    send_all?: boolean
  }) => api.get('/billing/mailing/preview_recipients/', { params }),
}

export const receiptApi = {
  list: (params?: object) => api.get('/billing/receipts/', { params }),
  get: (id: number) => api.get(`/billing/receipts/${id}/`),
  create: (data: object) => api.post('/billing/receipts/', data),
  postToLedger: (id: number) => api.post(`/billing/receipts/${id}/post_to_ledger/`),
  batchProcess: (receipts: object[]) =>
    api.post('/billing/receipts/batch_process/', { receipts }),
  summary: () => api.get('/billing/receipts/summary/'),
}

export const expenseApi = {
  list: (params?: object) => api.get('/billing/expenses/', { params }),
  get: (id: number) => api.get(`/billing/expenses/${id}/`),
  create: (data: object) => api.post('/billing/expenses/', data),
  update: (id: number, data: object) => api.patch(`/billing/expenses/${id}/`, data),
  delete: (id: number) => api.delete(`/billing/expenses/${id}/`),
  approve: (id: number) => api.post(`/billing/expenses/${id}/approve/`),
  pay: (id: number) => api.post(`/billing/expenses/${id}/pay/`),
}

// Accounting API
export const accountApi = {
  list: (params?: object) => api.get('/accounting/accounts/', { params }),
  get: (id: number) => api.get(`/accounting/accounts/${id}/`),
  create: (data: object) => api.post('/accounting/accounts/', data),
  byType: () => api.get('/accounting/accounts/by_type/'),
  seedDefaults: () => api.post('/accounting/accounts/seed_defaults/'),
}

export const journalApi = {
  list: (params?: object) => api.get('/accounting/journals/', { params }),
  get: (id: number) => api.get(`/accounting/journals/${id}/`),
  create: (data: object) => api.post('/accounting/journals/', data),
  post: (id: number) => api.post(`/accounting/journals/${id}/post_journal/`),
  reverse: (id: number, reason: string) =>
    api.post(`/accounting/journals/${id}/reverse_journal/`, { reason }),
}

export const glApi = {
  list: (params?: object) => api.get('/accounting/general-ledger/', { params }),
  accountStatement: (params: { account: number; start_date?: string; end_date?: string }) =>
    api.get('/accounting/general-ledger/account_statement/', { params }),
  trialBalance: (params?: { as_of_date?: string }) =>
    api.get('/accounting/general-ledger/trial_balance/', { params }),
}

export const auditApi = {
  list: (params?: object) => api.get('/accounting/audit-trail/', { params }),
}

// Bank Account API
export const bankAccountApi = {
  list: (params?: object) => api.get('/accounting/bank-accounts/', { params }),
  get: (id: number) => api.get(`/accounting/bank-accounts/${id}/`),
  create: (data: object) => api.post('/accounting/bank-accounts/', data),
  update: (id: number, data: object) => api.patch(`/accounting/bank-accounts/${id}/`, data),
  delete: (id: number) => api.delete(`/accounting/bank-accounts/${id}/`),
  byCurrency: () => api.get('/accounting/bank-accounts/by_currency/'),
  summary: () => api.get('/accounting/bank-accounts/summary/'),
  setDefault: (id: number) => api.post(`/accounting/bank-accounts/${id}/set_default/`),
  seedDefaults: () => api.post('/accounting/bank-accounts/seed_defaults/'),
}

// Bank Transaction API
export const bankTransactionApi = {
  list: (params?: object) => api.get('/accounting/bank-transactions/', { params }),
  get: (id: number) => api.get(`/accounting/bank-transactions/${id}/`),
  create: (data: object) => api.post('/accounting/bank-transactions/', data),
  uploadStatement: (file: File, bankAccountId: number, fileFormat: string = 'csv') => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('bank_account', bankAccountId.toString())
    formData.append('file_format', fileFormat)
    return api.post('/accounting/bank-transactions/upload_statement/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  reconcile: (id: number, data: { receipt_id?: number; journal_id?: number }) =>
    api.post(`/accounting/bank-transactions/${id}/reconcile/`, data),
  unreconciled: (params?: { bank_account?: number }) =>
    api.get('/accounting/bank-transactions/unreconciled/', { params }),
  autoMatch: (bankAccountId: number) =>
    api.post('/accounting/bank-transactions/auto_match/', { bank_account: bankAccountId }),
}

// Bank Reconciliation API
export const bankReconciliationApi = {
  list: (params?: object) => api.get('/accounting/bank-reconciliations/', { params }),
  get: (id: number) => api.get(`/accounting/bank-reconciliations/${id}/`),
  create: (data: { bank_account: number; month: number; year: number;
                    statement_balance: number; notes?: string }) =>
    api.post('/accounting/bank-reconciliations/', data),
  workspace: (id: number) =>
    api.get(`/accounting/bank-reconciliations/${id}/workspace/`),
  toggleItem: (id: number, itemId: number) =>
    api.post(`/accounting/bank-reconciliations/${id}/toggle_item/`, { item_id: itemId }),
  selectAll: (id: number) =>
    api.post(`/accounting/bank-reconciliations/${id}/select_all/`),
  deselectAll: (id: number) =>
    api.post(`/accounting/bank-reconciliations/${id}/deselect_all/`),
  updateBalance: (id: number, statementBalance: number) =>
    api.patch(`/accounting/bank-reconciliations/${id}/`, { statement_balance: statementBalance }),
  complete: (id: number) =>
    api.post(`/accounting/bank-reconciliations/${id}/complete/`),
  exportExcel: (id: number) =>
    api.get(`/accounting/bank-reconciliations/${id}/export_excel/`, { responseType: 'blob' }),
  summary: () => api.get('/accounting/bank-reconciliations/summary/'),
}

// Expense Category API
export const expenseCategoryApi = {
  list: (params?: object) => api.get('/accounting/expense-categories/', { params }),
  get: (id: number) => api.get(`/accounting/expense-categories/${id}/`),
  create: (data: object) => api.post('/accounting/expense-categories/', data),
  update: (id: number, data: object) => api.patch(`/accounting/expense-categories/${id}/`, data),
  delete: (id: number) => api.delete(`/accounting/expense-categories/${id}/`),
  seedDefaults: () => api.post('/accounting/expense-categories/seed_defaults/'),
}

// Journal Reallocation API
export const reallocationApi = {
  list: (params?: object) => api.get('/accounting/reallocations/', { params }),
  get: (id: number) => api.get(`/accounting/reallocations/${id}/`),
  create: (data: { original_entry_id: number; to_account_id: number; amount: number; reason: string }) =>
    api.post('/accounting/reallocations/', data),
  byAccount: (params?: { from_account?: number; to_account?: number }) =>
    api.get('/accounting/reallocations/by_account/', { params }),
}

// Income Type API
export const incomeTypeApi = {
  list: (params?: object) => api.get('/accounting/income-types/', { params }),
  get: (id: number) => api.get(`/accounting/income-types/${id}/`),
  create: (data: object) => api.post('/accounting/income-types/', data),
  update: (id: number, data: object) => api.patch(`/accounting/income-types/${id}/`, data),
  delete: (id: number) => api.delete(`/accounting/income-types/${id}/`),
  forInvoicing: () => api.get('/accounting/income-types/for_invoicing/'),
  seedDefaults: () => api.post('/accounting/income-types/seed_defaults/'),
}

// Tenant Portal API (for tenant portal users)
export const tenantPortalApi = {
  profile: () => api.get('/accounts/tenant-portal/profile/'),
  dashboard: () => api.get('/accounts/tenant-portal/dashboard/'),
  invoices: (params?: { status?: string; start_date?: string; end_date?: string }) =>
    api.get('/accounts/tenant-portal/invoices/', { params }),
  receipts: (params?: { start_date?: string; end_date?: string }) =>
    api.get('/accounts/tenant-portal/receipts/', { params }),
  statement: (params?: { start_date?: string; end_date?: string }) =>
    api.get('/accounts/tenant-portal/statement/', { params }),
  lease: () => api.get('/accounts/tenant-portal/lease/'),
  notifyPayment: (data: { amount: number; payment_method: string; reference?: string; notes?: string; payment_date?: string }) =>
    api.post('/accounts/tenant-portal/notify_payment/', data),
  paymentHistory: () => api.get('/accounts/tenant-portal/payment_history/'),
}

// AI API
export const aiApi = {
  ask: (question: string) => api.post('/ai/ask/', { question }),
  reconcile: (data: { reference: string; amount: number; date?: string }) =>
    api.post('/ai/reconcile/', data),
  status: () => api.get('/ai/status/'),
  suggestions: () => api.get('/ai/suggestions/'),
  // OCR endpoints
  ocrLease: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/ai/ocr/lease/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  ocrInvoice: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/ai/ocr/invoice/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  ocrId: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/ai/ocr/id/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
}

// Penalty API
export const penaltyApi = {
  // Configs
  listConfigs: (params?: object) => api.get('/billing/penalty-configs/', { params }),
  getConfig: (id: number) => api.get(`/billing/penalty-configs/${id}/`),
  createConfig: (data: object) => api.post('/billing/penalty-configs/', data),
  updateConfig: (id: number, data: object) => api.patch(`/billing/penalty-configs/${id}/`, data),
  deleteConfig: (id: number) => api.delete(`/billing/penalty-configs/${id}/`),
  forProperty: (propertyId: number) => api.get('/billing/penalty-configs/for_property/', { params: { property_id: propertyId } }),
  penaltyInvoices: (params?: object) => api.get('/billing/penalty-configs/penalty_invoices/', { params }),
  applyNow: () => api.post('/billing/penalty-configs/apply_now/'),
  overdueSummary: () => api.get('/billing/penalty-configs/overdue_summary/'),
  // Exclusions
  listExclusions: (params?: object) => api.get('/billing/penalty-exclusions/', { params }),
  createExclusion: (data: object) => api.post('/billing/penalty-exclusions/', data),
  deleteExclusion: (id: number) => api.delete(`/billing/penalty-exclusions/${id}/`),
}

// Property Manager API
export const propertyManagerApi = {
  list: (params?: object) => api.get('/masterfile/property-managers/', { params }),
  create: (data: object) => api.post('/masterfile/property-managers/', data),
  update: (id: number, data: object) => api.patch(`/masterfile/property-managers/${id}/`, data),
  delete: (id: number) => api.delete(`/masterfile/property-managers/${id}/`),
}

// Notifications API
export const notificationsApi = {
  list: (params?: object) => api.get('/notifications/notifications/', { params }),
  unreadCount: () => api.get('/notifications/notifications/unread_count/'),
  markRead: (id: number) => api.post(`/notifications/notifications/${id}/read/`),
  markAllRead: () => api.post('/notifications/notifications/mark_read/', { mark_all: true }),
  recent: () => api.get('/notifications/notifications/recent/'),
  clearAll: () => api.delete('/notifications/notifications/clear_all/'),
  // Preferences
  getPreferences: () => api.get('/notifications/preferences/'),
  updatePreferences: (data: object) => api.post('/notifications/preferences/', data),
  // Change log
  changeLog: (params?: object) => api.get('/notifications/changelog/', { params }),
}

// User Invitations API
export const invitationsApi = {
  list: (params?: object) => api.get('/accounts/invitations/', { params }),
  create: (data: { email: string; first_name?: string; last_name?: string; role: string }) =>
    api.post('/accounts/invitations/', data),
  resend: (id: number) => api.post(`/accounts/invitations/${id}/resend/`),
  cancel: (id: number) => api.post(`/accounts/invitations/${id}/cancel/`),
  bulkCreate: (data: {
    invitations: Array<{ email: string; first_name?: string; last_name?: string; role?: string }>
  }) => api.post('/accounts/invitations/bulk_invite/', data),
  // Get allowed roles for current user
  allowedRoles: () => api.get('/accounts/invitations/allowed_roles/'),
  // Accept invitation (public)
  validate: (token: string) => api.get('/accounts/accept-invitation/', { params: { token } }),
  accept: (data: { token: string; password: string; confirm_password: string; first_name?: string; last_name?: string }) =>
    api.post('/accounts/accept-invitation/', data),
}

// Company Settings API (tenant-scoped)
export const companySettingsApi = {
  get: () => api.get('/tenants/company-settings/'),
  update: (data: object) => api.patch('/tenants/company-settings/', data),
  uploadLogo: (file: File) => {
    const formData = new FormData()
    formData.append('logo', file)
    return api.post('/tenants/company-settings/logo/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  removeLogo: () => api.delete('/tenants/company-settings/logo/'),
}

// Tenants/Onboarding API (Public schema)
export const tenantsApi = {
  // Onboarding
  checkSubdomain: (subdomain: string) =>
    api.get('/tenants/check-subdomain/', { params: { subdomain } }),
  getPlans: () => api.get('/tenants/plans/'),
  register: (data: {
    company_name: string;
    subdomain: string;
    company_email: string;
    company_phone?: string;
    company_address?: string;
    subscription_plan?: string;
    default_currency?: string;
    admin_email: string;
    admin_password: string;
    admin_first_name: string;
    admin_last_name: string;
    admin_phone?: string;
  }) => api.post('/tenants/onboarding/', data),
  // Super Admin (requires admin auth)
  dashboard: () => api.get('/tenants/dashboard/'),
  tenantDetails: (id: number) => api.get(`/tenants/dashboard/${id}/`),
  health: () => api.get('/tenants/health/'),
  clients: (params?: object) => api.get('/tenants/clients/', { params }),
  toggleAI: (id: number, feature: string, enabled: boolean) =>
    api.post(`/tenants/clients/${id}/toggle_ai/`, { feature, enabled }),
  // Seed demo data for current tenant (admin only)
  seedDemoData: () => api.post('/tenants/seed-demo-data/'),
  // Company management actions (Super Admin)
  suspend: (id: number) => api.post(`/tenants/clients/${id}/suspend/`),
  activate: (id: number) => api.post(`/tenants/clients/${id}/activate/`),
  scheduleDeletion: (id: number) => api.post(`/tenants/clients/${id}/schedule_deletion/`),
  cancelDeletion: (id: number) => api.post(`/tenants/clients/${id}/cancel_deletion/`),
}

// Tenant Invitations API (Super Admin)
export const tenantInvitationsApi = {
  list: (params?: object) => api.get('/tenants/invitations/', { params }),
  create: (data: {
    email: string;
    company_name: string;
    first_name?: string;
    last_name?: string;
    invitation_type?: 'full' | 'demo';
    subscription_plan?: string;
    message?: string;
  }) => api.post('/tenants/invitations/', data),
  resend: (id: number) => api.post(`/tenants/invitations/${id}/resend/`),
  cancel: (id: number) => api.post(`/tenants/invitations/${id}/cancel/`),
  activateDemo: (id: number) => api.post(`/tenants/invitations/${id}/activate_demo/`),
  // Public endpoints
  validate: (token: string) => api.get('/tenants/accept-invitation/', { params: { token } }),
  accept: (data: {
    token: string;
    subdomain: string;
    company_phone?: string;
    company_address?: string;
    admin_password: string;
    admin_password_confirm: string;
    admin_first_name?: string;
    admin_last_name?: string;
    admin_phone?: string;
    default_currency?: string;
  }) => api.post('/tenants/accept-invitation/', data),
}

// Demo Signup API (Public)
export const demoApi = {
  signup: (data: {
    company_name: string;
    subdomain: string;
    company_email: string;
    company_phone?: string;
    admin_email: string;
    admin_password: string;
    admin_password_confirm: string;
    admin_first_name: string;
    admin_last_name: string;
    admin_phone?: string;
    default_currency?: string;
  }) => api.post('/tenants/demo-signup/', data),
  process: (requestId: string) => api.post(`/tenants/process-demo-signup/${requestId}/`),
  checkStatus: (requestId: string) => api.get(`/tenants/demo-signup-status/${requestId}/`),
  autoLogin: (token: string, subdomain: string) => {
    return api.post('/accounts/auth/auto_login/', { token }, {
      headers: { 'X-Tenant-Subdomain': subdomain }
    })
  },
}

// Users API
export const usersApi = {
  list: (params?: object) => api.get('/accounts/users/', { params }),
  get: (id: number) => api.get(`/accounts/users/${id}/`),
  create: (data: object) => api.post('/accounts/users/', data),
  update: (id: number, data: object) => api.patch(`/accounts/users/${id}/`, data),
  deactivate: (id: number) => api.post(`/accounts/users/${id}/deactivate/`),
  activate: (id: number) => api.post(`/accounts/users/${id}/activate/`),
}

// Unified Search API - High performance search with PostgreSQL full-text search
export const searchApi = {
  // Main unified search endpoint
  search: (params: { q: string; type?: string; limit?: number }) =>
    api.get('/search/', { params }),
  // Fast autocomplete suggestions
  suggestions: (q: string) =>
    api.get('/search/suggestions/', { params: { q } }),
}

// Data Import API - CSV/Excel imports for bulk data
export const importsApi = {
  // List import jobs
  list: (params?: object) => api.get('/imports/jobs/', { params }),
  // Get specific import job
  get: (id: number) => api.get(`/imports/jobs/${id}/`),
  // Upload file for validation
  upload: (file: File, importType?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (importType) {
      formData.append('import_type', importType)
    }
    return api.post('/imports/jobs/upload/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  // Confirm and process validated import
  confirm: (id: number) => api.post(`/imports/jobs/${id}/confirm/`),
  // Cancel an import job
  cancel: (id: number) => api.post(`/imports/jobs/${id}/cancel/`),
  // Get available templates
  templates: () => api.get('/imports/jobs/templates/'),
  // Download template file
  downloadTemplate: (templateType: string) =>
    api.get(`/imports/jobs/templates/${templateType}/`, { responseType: 'blob' }),
}

// Trash API
export const trashApi = {
  list: (params?: { type?: string }) => api.get('/trash/', { params }),
  restore: (data: { type: string; ids: number[] }) => api.post('/trash/restore/', data),
  purge: (data: { type: string; ids: number[] }) => api.delete('/trash/purge/', { data }),
  purgeAll: () => api.delete('/trash/purge-all/'),
}

export default api
