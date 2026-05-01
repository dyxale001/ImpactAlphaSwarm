export interface UserProfile {
  id: string
  first_name: string
  last_name: string
  email: string
  role: 'user' | 'admin'
  created_at: string
}

export interface UserPreferences {
  id: string
  user_id: string
  risk_tolerance: string
  capital: number
  investment_universe: string[]
  is_active: boolean
}