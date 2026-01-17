import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add CSRF token handling for Django
api.interceptors.request.use((config) => {
  const csrfToken = document.cookie
    .split('; ')
    .find(row => row.startsWith('csrftoken='))
    ?.split('=')[1]

  if (csrfToken) {
    config.headers['X-CSRFToken'] = csrfToken
  }

  return config
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/login'
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
  landlordStatement: (params: { landlord_id: number }) =>
    api.get('/reports/landlord-statement/', { params }),
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

export default api
