// Note: This file defines a Zustand store for managing authentication state in a React application using Supabase. 
// It includes the user's session, profile, and loading state, along with functions to set the session and fetch the user's profile from the database.

import { create } from 'zustand'
import { Session, User } from '@supabase/supabase-js'
import { UserProfile } from '../types/auth'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  isLoading: boolean
  setSession: (session: Session | null) => void
  fetchProfile: (userId: string) => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: true, // Starts true until Supabase initializes
  
  setSession: (session) => set({ 
    session, 
    user: session?.user ?? null,
    isLoading: false 
  }),
  
  fetchProfile: async (userId) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
      
    if (!error && data) {
      set({ profile: data as UserProfile })
    }
  }
}))