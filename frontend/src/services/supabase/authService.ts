import { supabase } from '../../lib/supabase'
import { UserProfile, UserAnalysis } from '../../types/auth'

export async function fetchUserProfileData(userId: string) {
  //fetch profile data
  let { data: profileData, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    console.error("Error fetching user profile:", profileError.message)
    return { error: profileError }
  }

  //Auto Create profile if missing
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

  const { data: analysisData } = await supabase
    .from('user_analysis') 
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()


  return {
    profile: (profileData as UserProfile) || null,
    analysis: (analysisData as UserAnalysis) || null,
    error: null
  }
}