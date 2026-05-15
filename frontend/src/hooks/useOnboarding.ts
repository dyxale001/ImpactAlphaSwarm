import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { determinePsychometrics } from '../utils/scoringEngine'
import { startAnalysis, getStatus, getResult } from "../services/api/analysis";
import { pollUntilComplete } from "../services/api/poll";

export function useOnboarding() {
  const { user, fetchProfile } = useAuthStore()
  const navigate = useNavigate()
  
  const [step, setStep] = useState(1)

  const [formData, setFormData] = useState({
    capital: '', 
    surveyAnswers: {} as Record<string, string>,
    universe: [] as string[]
  })
  
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)


  const psychometrics = useMemo(() => {
    return determinePsychometrics(formData.surveyAnswers);
  }, [formData.surveyAnswers]);  

  const toggleUniverse = (item: string) => {
    setFormData(prev => ({
      ...prev,
      universe: prev.universe.includes(item) 
        ? prev.universe.filter(i => i !== item)
        : [...prev.universe, item]
    }))
  }

  const handleSurveyAnswer = (questionId: string, answerValue: string) => {
    setFormData(prev => ({
      ...prev,
      surveyAnswers: {
        ...prev.surveyAnswers,
        [questionId]: answerValue
      }
    }))
  }

  const nextStep = () => {
    setError('')
    if (step === 1) {
      if (!formData.capital || parseFloat(formData.capital) <= 0) return setError("Please enter valid initial capital.")
    }
    if (step === 2) {
      if (Object.keys(formData.surveyAnswers).length < 20) return setError("Please answer all survey questions.")
      if (formData.universe.length === 0) return setError("Please select at least one Investment Universe.")
    }
    setStep(prev => prev + 1)
  }

  const prevStep = () => {
    setError('')
    setStep(prev => prev - 1)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
   
    if (step !== 3) {
      nextStep()
      return
    }

    if (!user) {
      setError("Critical Error: No user found. Please log in again.")
      return
    }

    setLoading(true)
    setError('')

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !sessionData.session) {
      setError("Session expired. Please log in again.")
      setLoading(false)
      return
    }

    const currentUserId = sessionData.session.user.id

  
    const analysisPayload = {
      user_id: currentUserId,
      capital: parseFloat(formData.capital), 
      risk_tolerance: psychometrics.riskTolerance,
      investment_universe: formData.universe,
      survey_answers: formData.surveyAnswers,
      ai_derived_expertise: psychometrics.calculatedExpertise,
      is_active: true
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
        watchlist: [],
        risk_tolerance: psychometrics.riskTolerance,
        expertise_level: psychometrics.calculatedExpertise,
      });

      // store or surface run_id (localStorage shown as minimal approach)
      localStorage.setItem("latest_run_id", run_id);

      // optional: poll and wait before navigating
      pollUntilComplete(run_id, getStatus, getResult, (s) => {
        // update UI or notify user of progress
      })
        .then((res) => {
          // optionally refresh profile/data or navigate
          fetchProfile(currentUserId);
          navigate("/");
        })
        .catch((err) => {
          // handle failure (set error state)
          console.error("Analysis failed", err);
        });
    } catch (err) {
      console.error("Failed to start analysis", err);
    }
    
    navigate('/')
  }

  return { 
    step, 
    formData, 
    setFormData, 
    error, 
    loading, 
    psychometrics, 
    handleSubmit, 
    toggleUniverse, 
    nextStep, 
    prevStep, 
    handleSurveyAnswer 
  }
}