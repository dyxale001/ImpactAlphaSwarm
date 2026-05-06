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
  isProfileLoading: false, 
  
  setSession: (session) => set(() => ({ 
    session, 
    user: session?.user ?? null,
    isLoading: false,
    ...(session === null ? { isProfileLoading: false } : {})
  })),
  
  fetchProfile: async (userId) => {
    set({ isProfileLoading: true }) 
    
    // 1. Fetch Profile
    let { data: profileData, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      console.error("Error fetching user profile:", profileError.message)
      set({ isProfileLoading: false })
      return
    }

    // If profile doesn't exist, we attempt to create it using auth metadata (helpful when RLS prevented insert on signup)
    if (!profileData) {
      const { data: userData } = await supabase.auth.getUser()
      const metadata = userData?.user?.user_metadata || {}
      
      const { data: newProfile, error: insertError } = await supabase
        .from('users')
        .insert([
          {
            id: userId,
            first_name: metadata.first_name || '',
            last_name: metadata.last_name || '',
            email: userData?.user?.email || '',
            role: 'user'
          }
        ])
        .select()
        .single()
        
      if (insertError) {
        console.error("Error creating user profile on first login:", insertError.message)
        set({ isProfileLoading: false })
        return
      }
      profileData = newProfile
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