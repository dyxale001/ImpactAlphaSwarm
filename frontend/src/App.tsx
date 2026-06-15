import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useIdleTimeout } from './hooks/useIdleTimeout'
import { useAuthStore } from './store/authStore' // Added to check session for redirect

// Route Guards
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import AppLayout from './components/layout/AppLayout'

// Pages
import Landing from './pages/Landing' // <-- Import the new Landing page
import Login from './pages/Login'
import Signup from './pages/Signup'
import Onboarding from './pages/Onboarding'
import AdminDashboard from './pages/AdminDashboard'
import AdminEditUser from './pages/AdminEditUser'
import DashboardPage from './pages/Dashboard'
import ResearchPage from './pages/Research'
import WatchlistPage from './pages/Watchlist'
import PortfolioPage from './pages/Portfolio'
import AssetDetailsPage from './pages/AssetDetailsPage'
import SettingsPage from './pages/Settings'
import ResetPassword from './pages/ResetPassword'

// A wrapper to prevent logged-in users from seeing the landing/auth pages
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, isProfileLoading } = useAuthStore()
  if (isProfileLoading) return null // Let global loading state handle spinner
  if (session) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  useAuth() 
  useIdleTimeout(15)

  return (
    <Routes>
      {/* Publicly mapped routes wrapped with redirect logic */}
      <Route path="/" element={
        <PublicRoute>
          <Landing />
        </PublicRoute>
      } />
      <Route path="/login" element={
        <PublicRoute>
          <Login />
        </PublicRoute>
      } />
      <Route path="/signup" element={
        <PublicRoute>
          <Signup />
        </PublicRoute>
      } />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Authenticated Routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/onboarding" element={<Onboarding />} />

        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} /> {/* Changed from "/" to "/dashboard" */}
          <Route path="/research" element={<ResearchPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/asset/:ticker" element={<AssetDetailsPage />} />
        </Route>
        
        {/* Admin Routes */}
        <Route element={<AdminRoute />}>
           <Route path="/admin" element={<AdminDashboard />} />
           <Route path="/admin/edit/:id" element={<AdminEditUser />} />
        </Route>
      </Route>
    </Routes>
  )
}