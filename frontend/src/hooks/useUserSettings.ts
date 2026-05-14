import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { supabase } from '../lib/supabase'
import { UNIVERSE_OPTIONS } from '../utils/onboardingData'

type RiskTolerance = 'aggresive' | 'moderate' | 'conservative'
type Expertise = 'novice' | 'intermediate' | 'advanced'

const normalizeRiskTolerance = (value?: string): RiskTolerance => {
  const v = (value || '').toLowerCase().trim()
  if (v === 'aggresive' || v === 'aggressive') return 'aggresive'
  if (v === 'moderate') return 'moderate'
  if (v === 'conservative' || v === 'passive' || v === 'tolerant') return 'conservative'
  return 'moderate'
}

export const useUserSettings = () => {
  const { profile, analysis, fetchProfile } = useAuthStore()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    risk_tolerance: 'moderate' as RiskTolerance,
    expertise_level: 'intermediate' as Expertise,
    investment_universe: [] as string[],
  })

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
    setError(null)
    setSuccessMessage(null)
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
    setError(null)
    setSuccessMessage(null)
  }

  const availableUniverse = UNIVERSE_OPTIONS.filter((o) => !formData.investment_universe.includes(o))

  const saveChanges = async () => {
    if (!profile?.id) return

    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const { error: profileError } = await supabase
        .from('users')
        .update({
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
        })
        .eq('id', profile.id)

      if (profileError) throw profileError

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
      setSuccessMessage('Settings saved successfully.')
    } catch (err: any) {
      setError(err.message || 'Failed to save changes.')
    } finally {
      setIsSaving(false)
    }
  }

  const resetChanges = () => {
    setFormData({
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      risk_tolerance: normalizeRiskTolerance(analysis?.risk_tolerance),
      expertise_level: (analysis?.ai_derived_expertise || 'intermediate') as Expertise,
      investment_universe: Array.isArray(analysis?.investment_universe)
        ? analysis!.investment_universe
        : [],
    })
    setError(null)
    setSuccessMessage(null)
  }

  return {
    formData,
    updateFormField,
    toggleUniverse,
    availableUniverse,
    saveChanges,
    resetChanges,
    isSaving,
    error,
    successMessage,
    email: profile?.email || '',
  }
}