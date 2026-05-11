import { create } from 'zustand'
import { Session, User } from '@supabase/supabase-js'
import { UserProfile, UserPreferences, RiskProfile } from '../types/auth'
import { fetchUserProfileData } from '../services/supabase/authService'

interface AuthState {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  preferences: UserPreferences | null
  riskProfile: RiskProfile | null
  isLoading: boolean
  isProfileLoading: boolean

  setSession: (session: Session | null) => void
  fetchProfile: (userId: string) => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  preferences: null,
  riskProfile: null,
  isLoading: true, 
  isProfileLoading: false, 
  
  setSession: (session) => set(() => ({ 
    session, 
    user: session?.user ?? null,
    isLoading: false,
    ...(session === null ? { isProfileLoading: false } : {})
  })),
  
  fetchProfile: async (userId) => {
    set({ isProfileLoading: true }) 
    
    // Calls Supabase service
    const { profile, preferences, riskProfile, error } = await fetchUserProfileData(userId)

    if (error) {
      set({ isProfileLoading: false })
      return
    }

    set({ 
      profile,
      preferences,
      riskProfile,
      isProfileLoading: false 
    })
  }
}))