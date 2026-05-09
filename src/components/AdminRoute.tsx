

import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function AdminRoute() {
 
  const { profile, isLoading, isProfileLoading } = useAuthStore()

  if (isLoading || isProfileLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-bg text-brand-fg">
        Loading admin workspace...
      </div>
    )
  }
  
  if (profile?.role !== 'admin') {
    return <Navigate to="/" replace /> 
  }

  return <Outlet />
}