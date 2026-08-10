import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { validatePassword } from '../utils/validation'

export function useResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const isRecoverySession = useAuthStore((state) => state.isRecovery)
  const navigate = useNavigate()

  // Walking away from the reset has to end the recovery session. Leaving it
  // alive would let the user, or anyone else holding the emailed link, browse
  // the app without ever proving they know a password.
  const cancelReset = async () => {
    setLeaving(true)
    await supabase.auth.signOut()
    navigate('/login')
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const { isValid, message } = validatePassword(password)
    if (!isValid) {
      setError(message)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setLoading(false)
      setError(updateError.message)
      return
    }

    // Sign out so the new password is actually used to get back in, rather than
    // riding the recovery session into the app.
    await supabase.auth.signOut()
    setLoading(false)
    setSuccess(true)
    setTimeout(() => navigate('/login'), 3000)
  }

  return {
    password, setPassword,
    confirmPassword, setConfirmPassword,
    loading, error, success, isRecoverySession, leaving,
    handleReset, cancelReset,
  }
}
