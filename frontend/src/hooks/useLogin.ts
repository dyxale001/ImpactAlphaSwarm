//Note: This file defines a custom React hook called `useLogin` that manages the state and logic for a user login form. 
// It handles form data, submission, and interaction with the Supabase backend to authenticate the user. 
// The hook also manages loading and error states during the login process.

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
    
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  return { email, setEmail, password, setPassword, error, loading, handleLogin }
}