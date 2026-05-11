import { useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useIdleTimeout } from './hooks/useIdleTimeout'
import { useAuthStore } from './store/authStore' 
import AdminEditUser from './pages/AdminEditUser'

// Route Guards
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'

// Pages
import Login from './pages/Login'
import Signup from './pages/Signup'
import Onboarding from './pages/Onboarding'
import AdminDashboard from './pages/AdminDashboard'

const Dashboard = () => {
  const { profile, preferences, riskProfile, user, isLoading, isProfileLoading } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    const currentlyLoading = isProfileLoading !== undefined ? isProfileLoading : isLoading;
    if (!currentlyLoading && profile?.role === 'admin') {
      navigate('/admin', { replace: true })
    }
  }, [profile, isProfileLoading, isLoading, navigate])

  const currentlyLoading = isProfileLoading !== undefined ? isProfileLoading : isLoading;
  
  if (currentlyLoading) {
    return <div className="flex h-screen items-center justify-center bg-brand-bg text-brand-fg">Loading workspace...</div>
  }

  if (profile?.role === 'admin') return null;

  return (
    <div className="flex h-screen items-center justify-center bg-brand-bg text-brand-fg flex-col gap-4">
      <h1 className="text-3xl font-bold">AlphaSwarm Dashboard</h1>
      
      {profile ? (
        <div className="p-6 bg-brand-secondary border border-brand-border rounded-brand w-full max-w-md shadow-card">
          <p className="text-brand-muted-fg text-sm">Welcome back,</p>
          <h2 className="text-2xl font-bold mb-6">{profile.first_name} {profile.last_name}</h2>
          
          {riskProfile ? (
            <>
              <div className="flex justify-between border-b border-brand-border/50 pb-3 mb-3">
                <span className="text-brand-muted-fg">Capital:</span>
                <span className="text-semantic-success font-mono font-bold">R {riskProfile.capital}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-brand-muted-fg">Risk DNA:</span>
                <span className="text-brand-primary font-medium">{riskProfile.risk_tolerance}</span>
              </div>
            </>
          ) : (
            <p className="text-brand-muted-fg text-sm italic">Swarm unconfigured. Please complete onboarding.</p>
          )}
          
          
          {preferences && (
             <div className="mt-4 pt-3 border-t border-brand-border/50 flex flex-col gap-2">
               <div className="flex justify-between items-center">
                 <span className="text-brand-muted-fg text-sm">Archetype:</span>
                 {preferences.investor_archetype ? (
                   <span className="text-brand-accent font-bold">{preferences.investor_archetype}</span>
                 ) : (
                   <span className="text-brand-muted-fg text-xs italic animate-pulse">Gemini Analyzing Profile...</span>
                 )}
               </div>
               
               
               <div className="flex justify-between items-center">
                 <span className="text-brand-muted-fg text-sm">Target Sectors:</span>
                 <span className="text-brand-fg text-sm">{preferences.investment_universe?.length || 0} active</span>
               </div>
             </div>
          )}
        </div>
      ) : (
        <p>Loading profile...</p>
      )}
      
      <p className="text-xs text-brand-muted-fg mt-4">Active session: {user?.email}</p>
    </div>
  )
}

export default function App() {
  useAuth() 
  useIdleTimeout(15)

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/onboarding" element={<Onboarding />} />
        
        <Route path="/" element={<Dashboard />} />
        
        <Route element={<AdminRoute />}>
           <Route path="/admin" element={<AdminDashboard />} />
           <Route path="/admin/edit/:id" element={<AdminEditUser />} />
        </Route>
      </Route>
    </Routes>
  )
}