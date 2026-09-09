import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { determinePsychometrics } from '../utils/scoringEngine'
import { startAnalysis, getStatus, getResult } from '../services/api/analysis'
import { pollUntilComplete } from '../services/api/poll'
import type { UserAnalysis } from '../types/auth'
import { inferUniverseFromAssets } from '../utils/onboardingData'
import { buildGoals, GOAL_QUESTION_IDS, type GoalQuestionId } from '../utils/goals'
import { validateGoals } from '../utils/validation'

// Total steps: 1=Path, 2=Assets, 3=Survey, 4=Review
const TOTAL_STEPS = 4
const SUBMIT_STEP = TOTAL_STEPS

export function useOnboarding() {
  const { user, fetchProfile, saveCompletedAnalysis } = useAuthStore()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)

  // ── New: investor path & familiar asset picks ──────────────────────────
  const [investorPath, setInvestorPath] = useState('')
  const [familiarAssets, setFamiliarAssets] = useState<string[]>([])
  // Opt-in: also save the user's familiar picks to their watchlist
  const [addPicksToWatchlist, setAddPicksToWatchlist] = useState(true)

  // ── Existing form data ─────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    surveyAnswers: {} as Record<string, string>,
    universe: [] as string[],
  })

  // ── Goal answers: what the money is for, and by when ───────────────────
  // Held apart from surveyAnswers on purpose. determinePsychometrics sums every
  // answer whose key starts with `q_`, so anything mixed into that record risks
  // becoming part of the risk score. These four drive the funds catalogue only.
  const [goalAnswers, setGoalAnswers] = useState<Record<string, string>>({})

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)

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

  const handleGoalAnswer = (questionId: string, answerValue: string) => {
    setGoalAnswers(prev => ({ ...prev, [questionId]: answerValue }))
  }

  const goals = useMemo(
    () => buildGoals(goalAnswers as Partial<Record<GoalQuestionId, string>>),
    [goalAnswers]
  )

  const goalsAnswered = GOAL_QUESTION_IDS.filter(id => Boolean(goalAnswers[id])).length

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
      // Goals first: they are asked first on the page, so the error should
      // point at the top of it rather than sending the reader past a gap.
      const goalCheck = validateGoals(goalAnswers)
      if (!goalCheck.isValid) return setError(goalCheck.message)
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

  // ── Final submit (step 4) ──────────────────────────────────────────────
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

    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    setError('')

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session) {
        setError('Session expired. Please log in again.')
        return
      }

      const currentUserId = sessionData.session.user.id

      const analysisPayload: UserAnalysis = {
        user_id: currentUserId,
        risk_tolerance: psychometrics.riskTolerance,
        investment_universe: formData.universe,
        survey_answers: {
          ...formData.surveyAnswers,
          // Store onboarding metadata for future use without affecting scoring
          _investor_path: investorPath,
          _familiar_assets: familiarAssets.join(','),
          // Goal answers, nested under one key and outside the spread above so
          // they can never be read as risk answers. The funds catalogue matches
          // on these; nothing else reads them. Horizon is stored as a target
          // year so it ages on its own rather than claiming five years forever.
          goals,
        },
        ai_derived_expertise: psychometrics.calculatedExpertise,
        is_active: true,
        // dashboard_layout is deliberately left unwritten. A new account arrives
        // on a blank dashboard with the setup guide, which is what a null column
        // means: nothing is arranged on anyone's behalf.
      }

      const { error: analysisError } = await supabase
        .from('user_analysis')
        .insert([analysisPayload])

      if (analysisError) {
        setError(`Database Error: ${analysisError.message}`)
        return
      }

      saveCompletedAnalysis(analysisPayload)

      // Save familiar-asset picks to the watchlist if the user opted in.
      // Wrapped so a failure here can never block onboarding from completing.
      if (addPicksToWatchlist && familiarAssets.length > 0) {
        try {
          const { data: assetRows } = await supabase
            .from('assets')
            .select('id, ticker')
            .in('ticker', familiarAssets)

          const idByTicker = new Map((assetRows || []).map(a => [a.ticker, a.id]))

          await supabase.from('user_watchlist_assets').insert(
            familiarAssets.map(ticker => ({
              user_id: currentUserId,
              ticker,
              ...(idByTicker.get(ticker) ? { asset_id: idByTicker.get(ticker) } : {}),
            }))
          )
        } catch (err) {
          console.warn('Could not save watchlist picks:', err)
        }
      }

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

      if (useAuthStore.getState().user?.id === currentUserId) {
        navigate('/dashboard', { replace: true })
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Unable to complete onboarding. Please try again.')
    } finally {
      submitting.current = false
      setLoading(false)
    }
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
    addPicksToWatchlist,
    setAddPicksToWatchlist,
    // Goals
    goalAnswers,
    handleGoalAnswer,
    goals,
    goalsAnswered,
    // Existing
    handleSubmit,
    toggleUniverse,
    nextStep,
    prevStep,
    handleSurveyAnswer,
  }
}