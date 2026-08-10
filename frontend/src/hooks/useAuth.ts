import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

export function useAuth() {
  const { setSession, fetchProfile, setRecovery } = useAuthStore()

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on subscription, covering the
    // getSession() use case without a separate call that can race with recovery flows.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // The recovery session is stored like any other; ProtectedRoute is what
        // keeps it from unlocking the app until the password is actually changed.
        if (event === 'PASSWORD_RECOVERY') setRecovery(true)
        if (event === 'SIGNED_OUT') setRecovery(false)
        setSession(session)
        if (session?.user) {
          fetchProfile(session.user.id)
        } else {
          useAuthStore.setState({ profile: null })
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [setSession, fetchProfile, setRecovery])
}