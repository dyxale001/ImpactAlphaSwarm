import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { reactivateOwnAccount } from '../services/api/analysis'

export function useLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [needsReactivation, setNeedsReactivation] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNeedsReactivation(false)

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      const msg = authError.message.toLowerCase()
      if (msg.includes('banned')) {
        // Admin-deactivated — not self-reversible
        setError('This account has been deactivated by an administrator. Please contact support.')
      } else if (authError.message === 'Invalid login credentials') {
        setError('Incorrect email or password. Please try again.')
      } else {
        setError(authError.message)
      }
      setLoading(false)
      return
    }

    if (authData.user) {
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle()

      // Self-deactivated — offer to reactivate instead of blocking
      if (profile && profile.is_active === false) {
        setNeedsReactivation(true)
        setLoading(false)
        return
      }

      setLoading(false)
      navigate(profile?.role === 'admin' ? '/admin' : '/')
      return
    }

    setLoading(false)
  }

  const handleReactivate = async () => {
    setLoading(true)
    setError('')
    try {
      await reactivateOwnAccount()
      const { data } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user?.id ?? '')
        .maybeSingle()
      navigate(profile?.role === 'admin' ? '/admin' : '/')
    } catch {
      setError('Could not reactivate your account. Please try again.')
      setLoading(false)
    }
  }

  const cancelReactivation = async () => {
    await supabase.auth.signOut()
    setNeedsReactivation(false)
    setPassword('')
  }

  return {
    email, setEmail, password, setPassword,
    error, loading, handleLogin,
    needsReactivation, handleReactivate, cancelReactivation,
  }
}