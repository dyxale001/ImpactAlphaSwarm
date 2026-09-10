import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function ProtectedRoute() {

  const { session, profile, analysis, isLoading, isProfileLoading, hasResolvedProfile, profileError, fetchProfile, isRecovery } = useAuthStore()
  const location = useLocation()


  if (isLoading || isProfileLoading) {
    return <div className="flex h-screen items-center justify-center bg-brand-bg text-brand-fg">Verifying session...</div>
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Clicking a reset link creates a real session. Until the new password is
  // saved, that session only unlocks the reset page, nothing else.
  if (isRecovery) {
    return <Navigate to="/reset-password" replace />
  }


  if (!hasResolvedProfile) {
    return <div className="flex h-screen items-center justify-center bg-brand-bg text-brand-fg">
      <div role="alert">
        <p>{profileError || 'Unable to load your profile.'}</p>
        <button onClick={() => void fetchProfile(session.user.id)}>Try again</button>
      </div>
    </div>
  }

  if (!profile && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }


  if (profile && profile.role !== 'admin' && !analysis && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}
