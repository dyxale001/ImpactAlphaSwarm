import { Routes, Route } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useIdleTimeout } from './hooks/useIdleTimeout'

// Route Guards
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import AppLayout from './components/layout/AppLayout'

// Pages
import Login from './pages/Login'
import Signup from './pages/Signup'
import Onboarding from './pages/Onboarding'
import AdminDashboard from './pages/AdminDashboard'
import AdminEditUser from './pages/AdminEditUser'
import DashboardPage from './pages/Dashboard'
import ResearchPage from './pages/Research'
import WatchlistPage from './pages/Watchlist'
import PortfolioPage from './pages/Portfolio'

export default function App() {
  useAuth() 
  useIdleTimeout(15)

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/onboarding" element={<Onboarding />} />

        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/research" element={<ResearchPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
        </Route>
        
        <Route element={<AdminRoute />}>
           <Route path="/admin" element={<AdminDashboard />} />
           <Route path="/admin/edit/:id" element={<AdminEditUser />} />
        </Route>
      </Route>
    </Routes>
  )
}