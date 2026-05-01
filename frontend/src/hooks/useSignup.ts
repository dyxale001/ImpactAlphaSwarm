//Note: This file defines a custom React hook called `useSignup` that manages the state and logic for a user signup form. 
// It handles form data, submission, and interaction with the Supabase backend to create a new user account. 
// The hook also manages loading and error states during the signup process.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

export function useSignup() {
  const navigate = useNavigate()
  const { setSession } = useAuthStore()

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  })
  
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // 1. Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (authData.user) {
      const { error: dbError } = await supabase
        .from('users')
        .insert([
          {
            id: authData.user.id,
            first_name: formData.firstName,
            last_name: formData.lastName,
            email: formData.email,
            role: 'user'
          }
        ])

      if (dbError) {
        setError(dbError.message)
        setLoading(false)
        return
      }

      setSession(authData.session)
      navigate('/onboarding')
    }
  }

  return { formData, setFormData, error, loading, handleSubmit }
}