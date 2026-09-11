import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { supabase } from '../lib/supabase'
import { UNIVERSE_OPTIONS } from '../utils/onboardingData'

type RiskTolerance = 'aggressive' | 'moderate' | 'conservative'
type Expertise = 'novice' | 'intermediate' | 'advanced'

/** The two preferences that save on their own cards. */
export type PrefScope = 'universe' | 'expertise'

export interface SaveStatus {
  saving: boolean
  error: string | null
  success: string | null
}

const IDLE: SaveStatus = { saving: false, error: null, success: null }

const normalizeRiskTolerance = (value?: string): RiskTolerance => {
  const v = (value || '').toLowerCase().trim()
  if (v === 'aggresive' || v === 'aggressive') return 'aggressive'
  if (v === 'moderate') return 'moderate'
  if (v === 'conservative' || v === 'passive' || v === 'tolerant') return 'conservative'
  return 'moderate'
}

const normalizeExpertise = (value?: string): Expertise =>
  value === 'advanced' ? 'advanced' : value === 'novice' ? 'novice' : 'intermediate'

/**
 * Name, sectors and expertise: the settings that are chosen rather than
 * derived.
 *
 * Each preference saves on its own, with its own status, because the Settings
 * page shows them on separate cards and a message under one card about a save
 * made on another is a message about the wrong thing. Sectors and expertise
 * still write to the same `user_analysis` row; each save touches only its own
 * column so a change made on one card cannot carry a stale value from the
 * other.
 */
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

  // One status per preference card
  const [prefStatus, setPrefStatus] = useState<Record<PrefScope, SaveStatus>>({
    universe: IDLE,
    expertise: IDLE,
  })

  useEffect(() => {
    setFormData({
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      risk_tolerance: normalizeRiskTolerance(analysis?.risk_tolerance),
      expertise_level: normalizeExpertise(analysis?.ai_derived_expertise),
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
    if (field === 'expertise_level') setPrefStatus((s) => ({ ...s, expertise: IDLE }))
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
    setPrefStatus((s) => ({ ...s, universe: IDLE }))
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
      setAccountSuccess('Your details are saved.')
    } catch (err: any) {
      setAccountError(err.message || 'Your details did not save. Please try again.')
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

  /** Whether a card's value differs from what is stored. */
  const prefDirty = (scope: PrefScope): boolean => {
    if (scope === 'expertise') {
      return formData.expertise_level !== normalizeExpertise(analysis?.ai_derived_expertise)
    }
    const stored = Array.isArray(analysis?.investment_universe) ? analysis!.investment_universe : []
    return (
      stored.length !== formData.investment_universe.length ||
      stored.some((s) => !formData.investment_universe.includes(s))
    )
  }

  const saveInvestmentPrefs = async (scope: PrefScope) => {
    if (!profile?.id) return
    setPrefStatus((s) => ({ ...s, [scope]: { saving: true, error: null, success: null } }))
    try {
      // risk_tolerance is deliberately not written here. It is derived from
      // the questionnaire (see useProfileAnswers), and this form holds
      // whatever it loaded, so saving it back would silently undo a retake
      // done since the page opened.
      const patch =
        scope === 'universe'
          ? { investment_universe: formData.investment_universe }
          : { ai_derived_expertise: formData.expertise_level }
      const { error: analysisError } = await supabase
        .from('user_analysis')
        .upsert(
          {
            user_id: profile.id,
            ...patch,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
      if (analysisError) throw analysisError
      await fetchProfile(profile.id)
      setPrefStatus((s) => ({
        ...s,
        [scope]: {
          saving: false,
          error: null,
          success: scope === 'universe' ? 'Sectors saved.' : 'Expertise level saved.',
        },
      }))
    } catch (err: any) {
      setPrefStatus((s) => ({
        ...s,
        [scope]: {
          saving: false,
          error: err.message || 'That did not save. Please try again.',
          success: null,
        },
      }))
    }
  }

  const resetInvestmentPrefs = (scope: PrefScope) => {
    setFormData((prev) =>
      scope === 'expertise'
        ? { ...prev, expertise_level: normalizeExpertise(analysis?.ai_derived_expertise) }
        : {
            ...prev,
            investment_universe: Array.isArray(analysis?.investment_universe)
              ? analysis!.investment_universe
              : [],
          }
    )
    setPrefStatus((s) => ({ ...s, [scope]: IDLE }))
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
    // Preferences, one status per card
    prefStatus,
    prefDirty,
    saveInvestmentPrefs,
    resetInvestmentPrefs,
    email: profile?.email || '',
  }
}
