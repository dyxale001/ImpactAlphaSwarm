export interface UserProfile {
  id: string
  first_name: string
  last_name: string
  email: string
  role: 'user' | 'admin'
  created_at: string
}

export interface RiskProfile {
  user_id: string
  capital: number
  risk_tolerance: string
  created_at?: string
  updated_at?: string
}

export interface UserPreferences {
  user_id: string
  investment_universe: string[]
  
  survey_answers: {
    scenarios: Record<string, string>
    sliders: Record<string, number>
    explicit_risk: string
  }
  
  ai_derived_expertise?: 'novice' | 'intermediate' | 'advanced'
  ai_derived_sentiment?: 'fundamentals' | 'momentum_and_hype' | 'contrarian'
  ai_derived_volatility?: 'protective' | 'buy_the_dip' | 'hold_steady'
  
  investor_archetype?: string
  ai_system_prompt?: string
  
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export type AdminUserView = UserProfile & { 
  user_preferences: Pick<
    UserPreferences, 
    'investor_archetype' | 'ai_derived_expertise' | 'ai_derived_sentiment' | 'ai_derived_volatility'
  > | null;
};