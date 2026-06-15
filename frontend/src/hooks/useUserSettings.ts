import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { supabase } from '../lib/supabase'
import { UNIVERSE_OPTIONS } from '../utils/onboardingData'

type RiskTolerance = 'aggressive' | 'moderate' | 'conservative'
type Expertise = 'novice' | 'intermediate' | 'advanced'

const normalizeRiskTolerance = (value?: string): RiskTolerance => {
  const v = (value || '').toLowerCase().trim()
  if (v === 'aggresive' || v === 'aggressive') return 'aggressive'
  if (v === 'moderate') return 'moderate'
  if (v === 'conservative' || v === 'passive' || v === 'tolerant') return 'conservative'
  return 'moderate'
}

export const useUserSettings = () => {
  const { profile, analysis, fetchProfile } = useAuthStore()

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    risk_tolerance: 'moderate' as RiskTolerance,
    expertise_level: 'intermediate' as Expertise,
    investment_universe: [] as string[],
  })

  // Account section state
  const [isAccountSaving, setIsAccountSaving] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [accountSuccess, setAccountSuccess] = useState<string | null>(null)

  // App settings section state
  const [isAppSaving, setIsAppSaving] = useState(false)
  const [appError, setAppError] = useState<string | null>(null)
  const [appSuccess, setAppSuccess] = useState<string | null>(null)

  useEffect(() => {
    const normalizedExpertise =
      analysis?.ai_derived_expertise === 'advanced'
        ? 'advanced'
        : analysis?.ai_derived_expertise === 'novice'
        ? 'novice'
        : 'intermediate'

    setFormData({
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      risk_tolerance: normalizeRiskTolerance(analysis?.risk_tolerance),
      expertise_level: normalizedExpertise,
      investment_universe: Array.isArray(analysis?.investment_universe)
        ? analysis!.investment_universe
        : [],
    })
  }, [
    profile?.first_name,
    profile?.last_name,
    analysis?.risk_tolerance,
    analysis?.ai_derived_expertise,
    analysis?.investment_universe,
  ])

  const updateFormField = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: field === 'risk_tolerance' ? normalizeRiskTolerance(value) : value,
    }))
  }

  const toggleUniverse = (item: string) => {
    setFormData((prev) => {
      const exists = prev.investment_universe.includes(item)
      return {
        ...prev,
        investment_universe: exists
          ? prev.investment_universe.filter((u) => u !== item)
          : [...prev.investment_universe, item],
      }
    })
  }

  const availableUniverse = UNIVERSE_OPTIONS.filter((o) => !formData.investment_universe.includes(o))

  const saveAccountInfo = async () => {
    if (!profile?.id) return
    setIsAccountSaving(true)
    setAccountError(null)
    setAccountSuccess(null)
    try {
      const { error: profileError } = await supabase
        .from('users')
        .update({
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
        })
        .eq('id', profile.id)
      if (profileError) throw profileError
      await fetchProfile(profile.id)
      setAccountSuccess('Account information saved.')
    } catch (err: any) {
      setAccountError(err.message || 'Failed to save account information.')
    } finally {
      setIsAccountSaving(false)
    }
  }

  const resetAccountInfo = () => {
    setFormData((prev) => ({
      ...prev,
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
    }))
    setAccountError(null)
    setAccountSuccess(null)
  }

  const saveInvestmentPrefs = async () => {
    if (!profile?.id) return
    setIsAppSaving(true)
    setAppError(null)
    setAppSuccess(null)
    try {
      const { error: analysisError } = await supabase
        .from('user_analysis')
        .upsert(
          {
            user_id: profile.id,
            investment_universe: formData.investment_universe,
            risk_tolerance: normalizeRiskTolerance(formData.risk_tolerance),
            ai_derived_expertise: formData.expertise_level,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
      if (analysisError) throw analysisError
      await fetchProfile(profile.id)
      setAppSuccess('App settings saved.')
    } catch (err: any) {
      setAppError(err.message || 'Failed to save app settings.')
    } finally {
      setIsAppSaving(false)
    }
  }

  const resetInvestmentPrefs = () => {
    setFormData((prev) => ({
      ...prev,
      risk_tolerance: normalizeRiskTolerance(analysis?.risk_tolerance),
      expertise_level: (analysis?.ai_derived_expertise || 'intermediate') as Expertise,
      investment_universe: Array.isArray(analysis?.investment_universe)
        ? analysis!.investment_universe
        : [],
    }))
    setAppError(null)
    setAppSuccess(null)
  }

  return {
    formData,
    updateFormField,
    toggleUniverse,
    availableUniverse,
    // Account Management
    saveAccountInfo,
    resetAccountInfo,
    isAccountSaving,
    accountError,
    accountSuccess,
    // App Settings
    saveInvestmentPrefs,
    resetInvestmentPrefs,
    isAppSaving,
    appError,
    appSuccess,
    email: profile?.email || '',
  }
}
