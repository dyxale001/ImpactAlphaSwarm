import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function ProtectedRoute() {

  const { session, profile, analysis, isLoading, isProfileLoading } = useAuthStore()
  const location = useLocation()

 
  if (isLoading || isProfileLoading) {
    return <div className="flex h-screen items-center justify-center bg-brand-bg text-brand-fg">Verifying session...</div>
  }
  
  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  

  if (!profile && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }


  if (profile && profile.role !== 'admin' && !analysis && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}