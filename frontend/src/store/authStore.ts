// Note: This file defines a Zustand store for managing authentication state in a React application using Supabase. 
// It includes the user's session, profile (personal info), preferences (financial info), and loading state.

import { create } from 'zustand'
import { Session, User } from '@supabase/supabase-js'
import { UserProfile, UserPreferences } from '../types/auth'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  preferences: UserPreferences | null
  isLoading: boolean
  setSession: (session: Session | null) => void
  fetchProfile: (userId: string) => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  preferences: null,
  isLoading: true, 
  
  setSession: (session) => set({ 
    session, 
    user: session?.user ?? null,
    isLoading: false 
  }),
  
  fetchProfile: async (userId) => {
    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileError) {
      console.error("Error fetching user profile:", profileError.message)
      return
    }

    const { data: prefData } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    set({ 
      profile: profileData as UserProfile,
      preferences: prefData ? (prefData as UserPreferences) : null
    })
  }
}))