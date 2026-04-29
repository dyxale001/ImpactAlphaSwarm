import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function ProtectedRoute() {
  const { session, profile, isLoading } = useAuthStore()
  const location = useLocation()

  if (isLoading) return <div className="flex h-screen items-center justify-center">Loading...</div>
  
  // Not logged in
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  
  // Logged in but hasn't completed onboarding, and not currently ON the onboarding page
  if (!profile && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}