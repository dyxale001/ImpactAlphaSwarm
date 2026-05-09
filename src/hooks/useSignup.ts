import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { validateEmail, validatePassword } from '../utils/validation'

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
  const [successMessage, setSuccessMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccessMessage('')

    if (!validateEmail(formData.email)) {
      setError('Please enter a valid email address.')
      setLoading(false)
      return
    }

    const passwordCheck = validatePassword(formData.password)
    if (!passwordCheck.isValid) {
      setError(passwordCheck.message)
      setLoading(false)
      return
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          first_name: formData.firstName,
          last_name: formData.lastName,
          role: 'user'
        }
      }
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (authData.user) {
      // If we have a session immediately, they are logged in.
      // We can safely try inserting the profile here.
      // Otherwise, we skip the insert because RLS will block it for unauthenticated users,
      // and we handle profile creation upon their first successful login (in fetchProfile).
      if (authData.session) {
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
          console.error("Profile creation error on signup:", dbError)
        }
        
        setSession(authData.session)
        navigate('/onboarding')
      } else {
        setSuccessMessage('A confirmation link has been sent to your email address. Please click the link to verify your account.')
        setLoading(false)
      }
    }
  }

  return { formData, setFormData, error, successMessage, loading, handleSubmit }
}