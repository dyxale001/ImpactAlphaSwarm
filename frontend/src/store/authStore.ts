import { create } from 'zustand'
import { Session, User } from '@supabase/supabase-js'
import { UserProfile, UserPreferences, RiskProfile } from '../types/auth'
import { supabase } from '../lib/supabase'

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
  isProfileLoading: true, 
  
  setSession: (session) => set({ 
    session, 
    user: session?.user ?? null,
    isLoading: false 
  }),
  
  fetchProfile: async (userId) => {
    set({ isProfileLoading: true }) 
    
    // 1. Fetch Profile
    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileError) {
      console.error("Error fetching user profile:", profileError.message)
      set({ isProfileLoading: false })
      return
    }

    // 2. Fetch User Preferences
    const { data: prefData } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    // 3. Fetch Risk Profile
    const { data: riskData } = await supabase
      .from('risk_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    set({ 
      profile: profileData as UserProfile,
      preferences: prefData ? (prefData as UserPreferences) : null,
      riskProfile: riskData ? (riskData as RiskProfile) : null,
      isProfileLoading: false 
    })
  }
}))