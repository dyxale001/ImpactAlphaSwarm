import { Routes, Route } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useAuthStore } from './store/authStore' 

// Route Guards
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'

// Pages
import Login from './pages/Login'
import Signup from './pages/Signup'
import Onboarding from './pages/Onboarding'

// Updated Dashboard to test Zustand
const Dashboard = () => {
  // Pull both profile (personal) and preferences (financial) from the store
  const { profile, preferences, user } = useAuthStore()

  return (
    <div className="flex h-screen items-center justify-center bg-brand-bg text-brand-fg flex-col gap-4">
      <h1 className="text-3xl font-bold">AlphaSwarm Dashboard</h1>
      
      {profile ? (
        <div className="p-6 bg-brand-secondary border border-brand-border rounded-brand w-full max-w-md shadow-card">
          <p className="text-brand-muted-fg text-sm">Welcome back,</p>
          <h2 className="text-2xl font-bold mb-6">{profile.first_name} {profile.last_name}</h2>
          
          {/* Read financial data from preferences instead of profile */}
          {preferences ? (
            <>
              <div className="flex justify-between border-b border-brand-border/50 pb-3 mb-3">
                <span className="text-brand-muted-fg">Capital:</span>
                <span className="text-semantic-success font-mono font-bold">R {preferences.capital}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-brand-muted-fg">Risk DNA:</span>
                <span className="text-brand-primary font-medium">{preferences.risk_tolerance}</span>
              </div>
            </>
          ) : (
            <p className="text-brand-muted-fg text-sm italic">Swarm unconfigured. Please complete onboarding.</p>
          )}
        </div>
      ) : (
        <p>Loading profile...</p>
      )}
      
      <p className="text-xs text-brand-muted-fg mt-4">Active session: {user?.email}</p>
    </div>
  )
}

const AdminDashboard = () => (
  <div className="flex h-screen items-center justify-center bg-brand-bg text-semantic-danger">
    <h1 className="text-3xl font-bold">Admin Dashboard</h1>
  </div>
)

export default function App() {
  useAuth() // Initializes Supabase auth listener globally

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Routes needing Auth via ProtectedRoute */}
      <Route element={<ProtectedRoute />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/" element={<Dashboard />} />
        
        {/* Routes strictly requiring 'admin' role */}
        <Route element={<AdminRoute />}>
           <Route path="/admin" element={<AdminDashboard />} />
        </Route>
      </Route>
    </Routes>
  )
}