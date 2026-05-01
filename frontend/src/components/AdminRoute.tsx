

import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function AdminRoute() {
  const { profile, isLoading } = useAuthStore()

  if (isLoading) return <div>Loading...</div>
  
  if (profile?.role !== 'admin') {
    return <Navigate to="/" replace /> // Redirect non-admins to main dashboard
  }

  return <Outlet />
}