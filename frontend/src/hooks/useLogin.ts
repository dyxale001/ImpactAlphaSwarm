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
    
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    
    if (authError) {
      if (authError.message === 'Invalid login credentials') {
        setError('Incorrect email or password. Please try again.')
      } else {
        setError(authError.message)
      }
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  return { email, setEmail, password, setPassword, error, loading, handleLogin }
}