import axios from 'axios'

// API base URL - use environment variable for production, localhost for development
// In production on Render, frontend is served from same origin as API
const API_BASE_URL = import.meta.env.VITE_API_URL || (
  typeof window !== 'undefined' && window.location.hostname.includes('localhost')
    ? 'http://localhost:8000'
    : ''
)

// Extract subdomain from current hostname for multi-tenant routing
const getSubdomain = (): string | null => {
  // First check URL parameter (for demo/testing when DNS isn't set up)
  const urlParams = new URLSearchParams(window.location.search)
  const tenantParam = urlParams.get('tenant')
  if (tenantParam) {
    // Store in sessionStorage for subsequent requests
    sessionStorage.setItem('tenant_subdomain', tenantParam)
    return tenantParam
  }

  // Check sessionStorage (persists tenant across page navigations)
  const storedTenant = sessionStorage.getItem('tenant_subdomain')
  if (storedTenant) {
    return storedTenant
  }

  const hostname = window.location.hostname
  // Check for subdomains (e.g., acme.localhost or acme.parameter.co.zw)
  const parts = hostname.split('.')

  // Development: subdomain.localhost
  if (hostname.endsWith('.localhost') && parts.length >= 2) {
    return parts[0]
  }

  // Production: subdomain.parameter.co.zw (3+ parts means there's a subdomain)
  // Exclude onrender.com domains
  if (parts.length >= 3 && !['www', 'api'].includes(parts[0]) && !hostname.includes('onrender.com')) {
    return parts[0]
  }

  return null
}

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add CSRF token and tenant subdomain handling
api.interceptors.request.use((config) => {
  // CSRF token for Django
  const csrfToken = document.cookie
    .split('; ')
    .find(row => row.startsWith('csrftoken='))
    ?.split('=')[1]

  if (csrfToken) {
    config.headers['X-CSRFToken'] = csrfToken
  }

  // Add tenant subdomain header for multi-tenant routing
  // This is used when frontend and API are on different domains
  const subdomain = getSubdomain()
  if (subdomain) {
    config.headers['X-Tenant-Subdomain'] = subdomain
  }

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

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Avoid redirect loops — don't redirect if already on login/public pages
      const path = window.location.pathname
      if (path !== '/login' && path !== '/' && !path.startsWith('/accept-invite') && !path.startsWith('/demo')) {
        window.location.href = '/login'
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
  commissionAnalysis: (params?: { start_date?: string; end_date?: string }) =>
    api.get('/reports/commission-analysis/', { params }),
  leaseCharges: (params?: { property_id?: number; landlord_id?: number; start_date?: string; end_date?: string }) =>
    api.get('/reports/lease-charges/', { params }),
  receiptListing: (params?: { start_date?: string; end_date?: string; bank_account_id?: number; income_type?: string; payment_method?: string; export?: string }) =>
    api.get('/reports/receipts/', { params }),
  incomeItemAnalysis: (params?: { start_date?: string; end_date?: string; income_type?: string; bank_account_id?: number }) =>
    api.get('/reports/income-item-analysis/', { params }),
  incomeExpenditure: (params: { landlord_id?: number; property_id?: number; start_date?: string; end_date?: string }) =>
    api.get('/reports/income-expenditure/', { params }),
  charts: (params: { chart_type: string; tenant_id?: number; property_id?: number; months?: number; start_date?: string; end_date?: string }) =>
    api.get('/reports/charts/', { params }),
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
  create: (data: object) => api.post('/accounting/bank-reconciliations/', data),
  complete: (id: number) => api.post(`/accounting/bank-reconciliations/${id}/complete/`),
  exportExcel: (id: number) => api.get(`/accounting/bank-reconciliations/${id}/export_excel/`, {
    responseType: 'blob'
  }),
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
  // Get allowed roles for current user
  allowedRoles: () => api.get('/accounts/invitations/allowed_roles/'),
  // Accept invitation (public)
  validate: (token: string) => api.get('/accounts/accept-invitation/', { params: { token } }),
  accept: (data: { token: string; password: string; confirm_password: string; first_name?: string; last_name?: string }) =>
    api.post('/accounts/accept-invitation/', data),
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

export default api
