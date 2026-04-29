export interface UserProfile {
  id: string
  first_name: string
  last_name: string
  email: string
  role: 'user' | 'admin'
  risk_tolerance: 'Conservative' | 'Moderate' | 'Aggressive' | 'Very Aggressive'
  capital: number
  investment_universe: string[]
  is_active: boolean
  created_at: string
}
