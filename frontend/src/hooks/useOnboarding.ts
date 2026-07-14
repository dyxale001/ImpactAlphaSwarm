import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { determinePsychometrics } from '../utils/scoringEngine'
import { startAnalysis, getStatus, getResult } from '../services/api/analysis'
import { pollUntilComplete } from '../services/api/poll'
import { inferUniverseFromAssets } from '../utils/onboardingData'

// Total steps: 1=Path, 2=Assets, 3=Capital, 4=Survey, 5=Review
const TOTAL_STEPS = 5
const SUBMIT_STEP = TOTAL_STEPS

export function useOnboarding() {
  const { user, fetchProfile } = useAuthStore()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)

  // ── New: investor path & familiar asset picks ──────────────────────────
  const [investorPath, setInvestorPath] = useState('')
  const [familiarAssets, setFamiliarAssets] = useState<string[]>([])

  // ── Existing form data ─────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    capital: '',
    surveyAnswers: {} as Record<string, string>,
    universe: [] as string[],
  })

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const psychometrics = useMemo(
    () => determinePsychometrics(formData.surveyAnswers),
    [formData.surveyAnswers]
  )

  // ── Familiar asset toggle ──────────────────────────────────────────────
  const toggleFamiliarAsset = (ticker: string) => {
    setFamiliarAssets(prev =>
      prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker]
    )
  }

  // ── Universe toggle (survey step) ─────────────────────────────────────
  const toggleUniverse = (item: string) => {
    setFormData(prev => ({
      ...prev,
      universe: prev.universe.includes(item)
        ? prev.universe.filter(i => i !== item)
        : [...prev.universe, item],
    }))
  }

  const handleSurveyAnswer = (questionId: string, answerValue: string) => {
    setFormData(prev => ({
      ...prev,
      surveyAnswers: { ...prev.surveyAnswers, [questionId]: answerValue },
    }))
  }

  // ── Step navigation ────────────────────────────────────────────────────
  const nextStep = () => {
    setError('')

    if (step === 1) {
      if (!investorPath) return setError('Please choose an investor path to continue.')
    }

    if (step === 2) {
      // Asset picker is optional — but infer universe from picks if any were made
      const inferred = inferUniverseFromAssets(familiarAssets)
      if (inferred.length > 0) {
        setFormData(prev => ({ ...prev, universe: inferred }))
      }
    }

    if (step === 3) {
      if (!formData.capital || parseFloat(formData.capital) <= 0)
        return setError('Please enter valid initial capital.')
    }

    if (step === 4) {
      if (Object.keys(formData.surveyAnswers).length < 20)
        return setError('Please answer all survey questions.')
      if (formData.universe.length === 0)
        return setError('Please select at least one Investment Universe.')
    }

    setStep(prev => prev + 1)
  }

  const prevStep = () => {
    setError('')
    setStep(prev => prev - 1)
  }

  // ── Final submit (step 5) ──────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (step !== SUBMIT_STEP) {
      nextStep()
      return
    }

    if (!user) {
      setError('Critical Error: No user found. Please log in again.')
      return
    }

    setLoading(true)
    setError('')

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !sessionData.session) {
      setError('Session expired. Please log in again.')
      setLoading(false)
      return
    }

    const currentUserId = sessionData.session.user.id

    const analysisPayload = {
      user_id: currentUserId,
      capital: parseFloat(formData.capital),
      risk_tolerance: psychometrics.riskTolerance,
      investment_universe: formData.universe,
      survey_answers: {
        ...formData.surveyAnswers,
        // Store onboarding metadata for future use without affecting scoring
        _investor_path: investorPath,
        _familiar_assets: familiarAssets.join(','),
      },
      ai_derived_expertise: psychometrics.calculatedExpertise,
      is_active: true,
    }

    const { error: analysisError } = await supabase
      .from('user_analysis')
      .insert([analysisPayload])

    if (analysisError) {
      setError(`Database Error: ${analysisError.message}`)
      setLoading(false)
      return
    }

    await fetchProfile(currentUserId)

    try {
      const { run_id } = await startAnalysis({
        universes: formData.universe,
        watchlist: familiarAssets, // seed watchlist with familiar picks
        risk_tolerance: psychometrics.riskTolerance,
        expertise_level: psychometrics.calculatedExpertise,
      })

      localStorage.setItem('latest_run_id', run_id)

      pollUntilComplete(run_id, getStatus, getResult, () => {})
        .then(() => fetchProfile(currentUserId))
        .catch(err => console.error('Analysis failed', err))
    } catch (err) {
      console.error('Failed to start analysis', err)
    }

    navigate('/')
  }

  return {
    step,
    totalSteps: TOTAL_STEPS,
    formData,
    setFormData,
    error,
    loading,
    psychometrics,
    // New
    investorPath,
    setInvestorPath,
    familiarAssets,
    toggleFamiliarAsset,
    // Existing
    handleSubmit,
    toggleUniverse,
    nextStep,
    prevStep,
    handleSurveyAnswer,
  }
}
