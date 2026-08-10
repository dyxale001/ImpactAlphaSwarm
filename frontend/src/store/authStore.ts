import { create } from 'zustand'
import { Session, User } from '@supabase/supabase-js'
import { UserProfile, UserAnalysis } from '../types/auth'
import { fetchUserProfileData } from '../services/supabase/authService'

const RECOVERY_KEY = 'password-recovery-pending'

// A Supabase recovery link signs the user straight in, so the session alone
// cannot tell us whether they proved anything beyond opening an email. Read the
// recovery marker off the URL synchronously at module load, before supabase-js
// strips the hash, so route guards never see a recovery session as a real login.
function detectPendingRecovery(): boolean {
  if (typeof window === 'undefined') return false
  if (window.localStorage.getItem(RECOVERY_KEY) === 'true') return true
  if (window.location.hash.includes('type=recovery')) {
    window.localStorage.setItem(RECOVERY_KEY, 'true')
    return true
  }
  return false
}

interface AuthState {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  analysis: UserAnalysis | null
  isLoading: boolean
  isProfileLoading: boolean
  isRecovery: boolean
  setSession: (session: Session | null) => void
  setRecovery: (value: boolean) => void
  fetchProfile: (userId: string) => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  analysis: null,
  isLoading: true,
  isProfileLoading: false,
  isRecovery: detectPendingRecovery(),

  setRecovery: (value) => {
    if (typeof window !== 'undefined') {
      if (value) window.localStorage.setItem(RECOVERY_KEY, 'true')
      else window.localStorage.removeItem(RECOVERY_KEY)
    }
    set({ isRecovery: value })
  },

  setSession: (session) => set(() => ({
    session,
    user: session?.user ?? null,
    isLoading: false,
    ...(session === null ? { isProfileLoading: false, profile: null, analysis: null } : {})
  })),

  fetchProfile: async (userId) => {
    set({ isProfileLoading: true })

    const { profile, analysis, error } = await fetchUserProfileData(userId)
    if (error) {
      set({ isProfileLoading: false })
      return
    }
    set({
      profile,
      analysis,
      isProfileLoading: false
    })
  }
}))