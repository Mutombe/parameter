import { lazy, Suspense, ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout/Layout'
import { PageSkeleton, ProfileSkeleton, SettingsSkeleton, SkeletonDashboard } from './components/ui'

// Lazy load pages for better performance
const Landing = lazy(() => import('./pages/Landing'))
const Learn = lazy(() => import('./pages/Learn'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Signup = lazy(() => import('./pages/Signup'))
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Landlords = lazy(() => import('./pages/Masterfile/Landlords'))
const LandlordDetail = lazy(() => import('./pages/Masterfile/LandlordDetail'))
const Properties = lazy(() => import('./pages/Masterfile/Properties'))
const PropertyDetail = lazy(() => import('./pages/Masterfile/PropertyDetail'))
const Units = lazy(() => import('./pages/Masterfile/Units'))
const UnitDetail = lazy(() => import('./pages/Masterfile/UnitDetail'))
const Tenants = lazy(() => import('./pages/Masterfile/Tenants'))
const TenantDetail = lazy(() => import('./pages/Masterfile/TenantDetail'))
const Leases = lazy(() => import('./pages/Masterfile/Leases'))
const LeaseDetail = lazy(() => import('./pages/Masterfile/LeaseDetail'))
const Invoices = lazy(() => import('./pages/Billing/Invoices'))
const InvoiceDetail = lazy(() => import('./pages/Billing/InvoiceDetail'))
const Receipts = lazy(() => import('./pages/Billing/Receipts'))
const ReceiptDetail = lazy(() => import('./pages/Billing/ReceiptDetail'))
const Expenses = lazy(() => import('./pages/Billing/Expenses'))
const ExpenseDetail = lazy(() => import('./pages/Billing/ExpenseDetail'))
const ChartOfAccounts = lazy(() => import('./pages/Accounting/ChartOfAccounts'))
const Journals = lazy(() => import('./pages/Accounting/Journals'))
const BankAccounts = lazy(() => import('./pages/Accounting/BankAccounts'))
const IncomeTypes = lazy(() => import('./pages/Accounting/IncomeTypes'))
const ExpenseCategories = lazy(() => import('./pages/Accounting/ExpenseCategories'))
const Reports = lazy(() => import('./pages/Reports/Reports'))
// AgedAnalysis now lives inside Reports.tsx — old route redirects there
const BankReconciliation = lazy(() => import('./pages/Accounting/BankReconciliation'))
const AuditTrail = lazy(() => import('./pages/Admin/AuditTrail'))
const TeamManagement = lazy(() => import('./pages/Admin/TeamManagement'))
const SuperAdminDashboard = lazy(() => import('./pages/Admin/SuperAdminDashboard'))
const DataImport = lazy(() => import('./pages/Admin/DataImport'))
const DocumentScanner = lazy(() => import('./pages/AI/DocumentScanner'))
const Profile = lazy(() => import('./pages/Profile'))
const Settings = lazy(() => import('./pages/Settings'))
const Search = lazy(() => import('./pages/Search'))
const Notifications = lazy(() => import('./pages/Notifications'))
const LatePenalties = lazy(() => import('./pages/Billing/LatePenalties'))
const Trash = lazy(() => import('./pages/Trash'))

// Tenant Portal
const TenantPortalLayout = lazy(() => import('./components/TenantPortalLayout'))
const TenantDashboard = lazy(() => import('./pages/TenantPortal/TenantDashboard'))
const TenantInvoices = lazy(() => import('./pages/TenantPortal/TenantInvoices'))
const TenantReceipts = lazy(() => import('./pages/TenantPortal/TenantReceipts'))
const TenantStatement = lazy(() => import('./pages/TenantPortal/TenantStatement'))
const TenantLease = lazy(() => import('./pages/TenantPortal/TenantLease'))
const TenantPaymentNotification = lazy(() => import('./pages/TenantPortal/TenantPaymentNotification'))

// Wrapper component for lazy loaded pages with skeleton fallback
function LazyPage({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <Suspense fallback={fallback || <PageSkeleton />}>
      {children}
    </Suspense>
  )
}

// Minimal loader for public pages (login, register, etc.)
function PublicPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse space-y-4 w-full max-w-md px-4">
        <div className="h-8 w-32 bg-gray-200 rounded mx-auto" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    </div>
  )
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function PortalRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, impersonation } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Allow staff users when impersonating a tenant
  const isStaff = user?.role && ['super_admin', 'admin', 'accountant', 'clerk'].includes(user.role)
  if (user?.role !== 'tenant_portal' && !(isStaff && impersonation)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Suspense fallback={<PublicPageLoader />}><Landing /></Suspense>} />
      <Route path="/learn" element={<Suspense fallback={<PublicPageLoader />}><Learn /></Suspense>} />
      <Route path="/login" element={<Suspense fallback={<PublicPageLoader />}><Login /></Suspense>} />
      <Route path="/register" element={<Suspense fallback={<PublicPageLoader />}><Register /></Suspense>} />
      <Route path="/signup" element={<Suspense fallback={<PublicPageLoader />}><Signup /></Suspense>} />
      <Route path="/accept-invite" element={<Suspense fallback={<PublicPageLoader />}><AcceptInvite /></Suspense>} />
      <Route path="/forgot-password" element={<Suspense fallback={<PublicPageLoader />}><ForgotPassword /></Suspense>} />
      <Route path="/reset-password" element={<Suspense fallback={<PublicPageLoader />}><ResetPassword /></Suspense>} />

      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<LazyPage fallback={<SkeletonDashboard />}><Dashboard /></LazyPage>} />
        <Route path="landlords" element={<LazyPage><Landlords /></LazyPage>} />
        <Route path="landlords/:id" element={<LazyPage><LandlordDetail /></LazyPage>} />
        <Route path="properties" element={<LazyPage><Properties /></LazyPage>} />
        <Route path="properties/:id" element={<LazyPage><PropertyDetail /></LazyPage>} />
        <Route path="units" element={<LazyPage><Units /></LazyPage>} />
        <Route path="units/:id" element={<LazyPage><UnitDetail /></LazyPage>} />
        <Route path="tenants" element={<LazyPage><Tenants /></LazyPage>} />
        <Route path="tenants/:id" element={<LazyPage><TenantDetail /></LazyPage>} />
        <Route path="leases" element={<LazyPage><Leases /></LazyPage>} />
        <Route path="leases/:id" element={<LazyPage><LeaseDetail /></LazyPage>} />
        <Route path="invoices" element={<LazyPage><Invoices /></LazyPage>} />
        <Route path="invoices/:id" element={<LazyPage><InvoiceDetail /></LazyPage>} />
        <Route path="receipts" element={<LazyPage><Receipts /></LazyPage>} />
        <Route path="receipts/:id" element={<LazyPage><ReceiptDetail /></LazyPage>} />
        <Route path="expenses" element={<LazyPage><Expenses /></LazyPage>} />
        <Route path="expenses/:id" element={<LazyPage><ExpenseDetail /></LazyPage>} />
        <Route path="chart-of-accounts" element={<LazyPage><ChartOfAccounts /></LazyPage>} />
        <Route path="journals" element={<LazyPage><Journals /></LazyPage>} />
        <Route path="bank-accounts" element={<LazyPage><BankAccounts /></LazyPage>} />
        <Route path="income-types" element={<LazyPage><IncomeTypes /></LazyPage>} />
        <Route path="expense-categories" element={<LazyPage><ExpenseCategories /></LazyPage>} />
        <Route path="bank-reconciliation" element={<LazyPage><BankReconciliation /></LazyPage>} />
        <Route path="reports" element={<LazyPage><Reports /></LazyPage>} />
        <Route path="aged-analysis" element={<Navigate to="/dashboard/reports?report=aged-analysis" replace />} />
        <Route path="audit-trail" element={<LazyPage><AuditTrail /></LazyPage>} />
        <Route path="team" element={<LazyPage><TeamManagement /></LazyPage>} />
        <Route path="super-admin" element={<LazyPage fallback={<SkeletonDashboard />}><SuperAdminDashboard /></LazyPage>} />
        <Route path="data-import" element={<LazyPage><DataImport /></LazyPage>} />
        <Route path="document-scanner" element={<LazyPage><DocumentScanner /></LazyPage>} />
        <Route path="profile" element={<LazyPage fallback={<ProfileSkeleton />}><Profile /></LazyPage>} />
        <Route path="settings" element={<LazyPage fallback={<SettingsSkeleton />}><Settings /></LazyPage>} />
        <Route path="search" element={<LazyPage><Search /></LazyPage>} />
        <Route path="notifications" element={<LazyPage><Notifications /></LazyPage>} />
        <Route path="late-penalties" element={<LazyPage><LatePenalties /></LazyPage>} />
        <Route path="trash" element={<LazyPage><Trash /></LazyPage>} />
      </Route>

      {/* Tenant Portal Routes */}
      <Route
        path="/portal"
        element={
          <PortalRoute>
            <Suspense fallback={<PageSkeleton />}>
              <TenantPortalLayout />
            </Suspense>
          </PortalRoute>
        }
      >
        <Route index element={<LazyPage fallback={<SkeletonDashboard />}><TenantDashboard /></LazyPage>} />
        <Route path="invoices" element={<LazyPage><TenantInvoices /></LazyPage>} />
        <Route path="receipts" element={<LazyPage><TenantReceipts /></LazyPage>} />
        <Route path="statement" element={<LazyPage><TenantStatement /></LazyPage>} />
        <Route path="lease" element={<LazyPage><TenantLease /></LazyPage>} />
        <Route path="notify-payment" element={<LazyPage><TenantPaymentNotification /></LazyPage>} />
      </Route>
    </Routes>
  )
}
