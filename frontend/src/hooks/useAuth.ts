import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

export function useAuth() {
  const { setSession, fetchProfile } = useAuthStore()

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on subscription, covering the
    // getSession() use case without a separate call that can race with recovery flows.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'PASSWORD_RECOVERY') return
        setSession(session)
        if (session?.user) {
          fetchProfile(session.user.id)
        } else {
          useAuthStore.setState({ profile: null })
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [setSession, fetchProfile])
}