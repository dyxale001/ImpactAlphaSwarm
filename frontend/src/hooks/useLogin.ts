import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
    
    // 1. Authenticate with Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    
    if (authError) {
      if (authError.message === 'Invalid login credentials') {
        setError('Incorrect email or password. Please try again.')
      } else {
        setError(authError.message)
      }
      setLoading(false)
      return
    }

    if (authData.user) {
      // 2. Fetch the user's profile to check their role
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single()

      // 3. Route accordingly based on role
      if (profile?.role === 'admin') {
        navigate('/admin')
      } else {
        navigate('/')
      }
    }
  }

  return { email, setEmail, password, setPassword, error, loading, handleLogin }
}