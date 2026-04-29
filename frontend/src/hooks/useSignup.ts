//Note: This file defines a custom React hook called `useSignup` that manages the state and logic for a user signup form. 
// It handles form data, submission, and interaction with the Supabase backend to create a new user account. 
// The hook also manages loading and error states during the signup process.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function useSignup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    const { error } = await supabase.auth.signUp({ email, password })
    
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/onboarding')
    }
  }

  return { email, setEmail, password, setPassword, error, loading, handleSignup }
}