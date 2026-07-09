export interface UserProfile {
  id: string
  first_name: string
  last_name: string
  email: string
  role: 'user' | 'admin'
  is_active: boolean
  created_at: string
}

export interface UserAnalysis {
  user_id: string
  investment_universe: string[]
  survey_answers: any
  ai_derived_expertise?: 'novice' | 'intermediate' | 'advanced'
  capital: any // Update to correct type (e.g., number | string)
  risk_tolerance: string
  
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export type AdminUserView = UserProfile & { 
  user_preferences: Pick<
    UserAnalysis, 
    'investment_universe' | 'ai_derived_expertise' | 'risk_tolerance' | 'capital'
  > | null;
};
