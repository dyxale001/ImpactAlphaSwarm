export interface UserProfile {
  id: string
  first_name: string
  last_name: string
  email: string
  role: 'user' | 'admin'
  created_at: string
}

export interface UserAnalysis {
  user_id: string
  investment_universe: string[]
  survey_answers: any
  ai_derived_expertise?: 'beginner' | 'intermediate' | 'expert'
  ai_derived_sentiment?: 'bullish' | 'bearish' | 'neutral'
  ai_derived_volatility?: 'protective' | 'buy_the_dip' | 'hold_steady'
  investor_archetype?: string
  ai_system_prompt?: string
  
  // Migrated from risk_profile
  capital: any // Update to correct type (e.g., number | string)
  risk_tolerance: string
  
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export type AdminUserView = UserProfile & { 
  user_preferences: Pick<
    UserAnalysis, 
    'investor_archetype' | 'ai_derived_expertise' | 'ai_derived_sentiment' | 'ai_derived_volatility'
  > | null;
};