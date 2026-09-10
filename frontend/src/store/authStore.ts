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
  // Initial resolution blocks routing; background refresh never does.
  isProfileLoading: boolean
  isProfileRefreshing: boolean
  hasResolvedProfile: boolean
  profileError: string | null
  saveCompletedAnalysis: (analysis: UserAnalysis) => void
  isRecovery: boolean
  setSession: (session: Session | null) => void
  setRecovery: (value: boolean) => void
  fetchProfile: (userId: string) => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => {
  let revision = 0
  let pending: Promise<void> | null = null
  return {
    session: null,
    user: null,
    profile: null,
    analysis: null,
    isLoading: true,
    isProfileLoading: false,
    isProfileRefreshing: false,
    hasResolvedProfile: false,
    profileError: null,
    isRecovery: detectPendingRecovery(),

    setRecovery: (value) => {
      if (typeof window !== 'undefined') {
        if (value) window.localStorage.setItem(RECOVERY_KEY, 'true')
        else window.localStorage.removeItem(RECOVERY_KEY)
      }
      set({ isRecovery: value })
    },

    setSession: (session) => {
      const changedUser = get().user?.id !== session?.user.id
      if (changedUser || !session) {
        revision++
        pending = null
        set({ profile: null, analysis: null, hasResolvedProfile: false,
          profileError: null, isProfileLoading: Boolean(session), isProfileRefreshing: false })
      }
      set({ session, user: session?.user ?? null, isLoading: false })
    },

    // A successful write is newer evidence than any outstanding profile read.
    saveCompletedAnalysis: (analysis) => {
      if (get().user?.id !== analysis.user_id) return
      revision++
      pending = null
      set({ analysis, profileError: null, isProfileLoading: false,
        isProfileRefreshing: false })
    },

    fetchProfile: (userId) => {
      if (get().user?.id !== userId) return Promise.resolve()
      if (pending) return pending
      const requestRevision = ++revision
      const isCurrent = () => revision === requestRevision && get().user?.id === userId
      set({ isProfileLoading: !get().hasResolvedProfile,
        isProfileRefreshing: get().hasResolvedProfile, profileError: null })

      const request = (async () => {
        try {
          const result = await fetchUserProfileData(userId)
          if (!isCurrent()) return
          if (result.error) throw result.error
          set({ profile: result.profile, analysis: result.analysis, hasResolvedProfile: true })
        } catch (error: unknown) {
          if (isCurrent()) set({ profileError:
            error instanceof Error ? error.message : 'Unable to load your profile. Please try again.' })
        } finally {
          if (isCurrent()) {
            pending = null
            set({ isProfileLoading: false, isProfileRefreshing: false })
          }
        }
      })()
      pending = request
      return request
    }
  }
})
