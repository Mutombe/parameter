import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout/Layout'
import { Loader2 } from 'lucide-react'

// Lazy load pages for better performance
const Landing = lazy(() => import('./pages/Landing'))
const Learn = lazy(() => import('./pages/Learn'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Signup = lazy(() => import('./pages/Signup'))
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Landlords = lazy(() => import('./pages/Masterfile/Landlords'))
const Properties = lazy(() => import('./pages/Masterfile/Properties'))
const Units = lazy(() => import('./pages/Masterfile/Units'))
const Tenants = lazy(() => import('./pages/Masterfile/Tenants'))
const Leases = lazy(() => import('./pages/Masterfile/Leases'))
const Invoices = lazy(() => import('./pages/Billing/Invoices'))
const Receipts = lazy(() => import('./pages/Billing/Receipts'))
const ChartOfAccounts = lazy(() => import('./pages/Accounting/ChartOfAccounts'))
const Journals = lazy(() => import('./pages/Accounting/Journals'))
const Reports = lazy(() => import('./pages/Reports/Reports'))
const AuditTrail = lazy(() => import('./pages/Admin/AuditTrail'))
const TeamManagement = lazy(() => import('./pages/Admin/TeamManagement'))
const SuperAdminDashboard = lazy(() => import('./pages/Admin/SuperAdminDashboard'))
const DocumentScanner = lazy(() => import('./pages/AI/DocumentScanner'))
const Profile = lazy(() => import('./pages/Profile'))
const Settings = lazy(() => import('./pages/Settings'))
const Search = lazy(() => import('./pages/Search'))

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
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

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />

        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="landlords" element={<Landlords />} />
          <Route path="properties" element={<Properties />} />
          <Route path="units" element={<Units />} />
          <Route path="tenants" element={<Tenants />} />
          <Route path="leases" element={<Leases />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="receipts" element={<Receipts />} />
          <Route path="chart-of-accounts" element={<ChartOfAccounts />} />
          <Route path="journals" element={<Journals />} />
          <Route path="reports" element={<Reports />} />
          <Route path="audit-trail" element={<AuditTrail />} />
          <Route path="team" element={<TeamManagement />} />
          <Route path="super-admin" element={<SuperAdminDashboard />} />
          <Route path="document-scanner" element={<DocumentScanner />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="search" element={<Search />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
