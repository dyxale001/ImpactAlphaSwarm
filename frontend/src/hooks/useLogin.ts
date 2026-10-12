import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { signInActiveAccount } from '../services/supabase/authService'

export function useLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const profile = await signInActiveAccount(email, password)
      useAuthStore.getState().setRecovery(false)
      navigate(profile?.role === 'admin' ? '/admin' : '/')
    } catch (err) {
      useAuthStore.getState().setSession(null)
      setError(err instanceof Error ? err.message : 'Could not sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return { email, setEmail, password, setPassword, error, loading, handleLogin }
}
