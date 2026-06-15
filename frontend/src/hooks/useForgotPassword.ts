import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { validateEmail } from '../utils/validation'

export function useForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validateEmail(email)) {
      setError('Please enter a valid email address.')
      return
    }

    setLoading(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)

    if (resetError) {
      setError(resetError.message)
      return
    }

    setSent(true)
  }

  const reset = () => {
    setEmail('')
    setError('')
    setSent(false)
  }

  return { email, setEmail, loading, error, sent, handleSendReset, reset }
}
