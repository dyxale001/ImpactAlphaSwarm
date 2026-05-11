import { supabase } from '../../lib/supabase'
import { UserProfile, UserPreferences, RiskProfile } from '../../types/auth'

export async function fetchUserProfileData(userId: string) {
  // 1. Fetch Profile
  let { data: profileData, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    console.error("Error fetching user profile:", profileError.message)
    return { error: profileError }
  }

  // Auto-create profile if missing
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
      return { error: insertError }
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

  return {
    profile: (profileData as UserProfile) || null,
    preferences: (prefData as UserPreferences) || null,
    riskProfile: (riskData as RiskProfile) || null,
    error: null
  }
}