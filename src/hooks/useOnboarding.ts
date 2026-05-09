import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

// The Psychometric Scoring Engine
const determineExpertiseAndArchetype = (scenarios: Record<string, string>, sliders: Record<string, number>, risk: string) => {
  let riskScore = 0;
  let expertiseScore = 0; 

  // 1. Explicit Risk Tolerance (Contributes to risk, but rarely expertise)
  if (risk === 'Conservative') riskScore -= 10;
  if (risk === 'Moderate') riskScore += 0;
  if (risk === 'Aggressive') riskScore += 10;
  if (risk === 'Very Aggressive') riskScore += 20;

  // 2. Scenario Adjustments
  if (scenarios.q_market_crash === 'panic_sell') { riskScore -= 10; expertiseScore -= 5; } // Novices panic
  if (scenarios.q_market_crash === 'buy_dip') { riskScore += 5; expertiseScore += 5; } // Pros buy the dip

  if (scenarios.q_hype_trend === 'momentum') { riskScore += 5; expertiseScore -= 2; }
  if (scenarios.q_hype_trend === 'fundamentals') { riskScore -= 2; expertiseScore += 5; } // Looking at math = higher expertise

  if (scenarios.q_ai_relationship === 'quant') expertiseScore += 15;
  if (scenarios.q_ai_relationship === 'mentor') expertiseScore -= 15;

  // 3. Slider Adjustments
  // Control
  const controlSlider = (sliders.q_control || 50) - 50; 
  expertiseScore += (controlSlider / 4); 

  // Financial Literacy
  const literacySlider = (sliders.q_financial_literacy || 50) - 50; 
  expertiseScore += (literacySlider / 2);

  // 4. Calculate Expertise
  let calculatedExpertise: 'novice' | 'intermediate' | 'advanced' = 'intermediate';
  if (expertiseScore < -10) calculatedExpertise = 'novice';
  if (expertiseScore > 15) calculatedExpertise = 'advanced';

  // 5. Standard Institutional Risk Profiles
  let calculatedArchetype = "Moderate Growth Investor"; 

  if (riskScore >= 10 && calculatedExpertise === 'advanced') {
    calculatedArchetype = "Aggressive Active Investor";
  } else if (riskScore >= 10 && calculatedExpertise !== 'advanced') {
    calculatedArchetype = "Aggressive Growth Investor";
  } else if (riskScore < 0 && calculatedExpertise === 'advanced') {
    calculatedArchetype = "Conservative Active Investor";
  } else if (riskScore < -10) {
    calculatedArchetype = "Capital Preservation Investor";
  } else if (riskScore >= 0 && riskScore < 10) {
    calculatedArchetype = "Moderate Growth Investor";
  }
  
  return { calculatedExpertise, calculatedArchetype };
};

export function useOnboarding() {
  const { user, fetchProfile } = useAuthStore()
  const navigate = useNavigate()
  
  const [step, setStep] = useState(1)

  const [formData, setFormData] = useState({
    // Phase 1 (Standard)
    capital: '', 
    riskTolerance: '', 
    
    // Phase 2 & 3 (Gamified)
    scenarioAnswers: {} as Record<string, string>,
    sliderAnswers: {
      q_time_horizon: 50,
      q_control: 50,
      q_risk_vs_reward: 50,
      q_financial_literacy: 50
    } as Record<string, number>,
    universe: [] as string[]
  })
  
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const toggleUniverse = (item: string) => {
    setFormData(prev => ({
      ...prev,
      universe: prev.universe.includes(item) 
        ? prev.universe.filter(i => i !== item)
        : [...prev.universe, item]
    }))
  }

  const handleScenarioAnswer = (questionId: string, answerValue: string) => {
    setFormData(prev => ({
      ...prev,
      scenarioAnswers: {
        ...prev.scenarioAnswers,
        [questionId]: answerValue
      }
    }))
  }

  const handleSliderChange = (questionId: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      sliderAnswers: {
        ...prev.sliderAnswers,
        [questionId]: value
      }
    }))
  }

  const nextStep = () => {
    setError('')
    if (step === 1) {
      if (!formData.capital || parseFloat(formData.capital) <= 0) return setError("Please enter valid initial capital.")
      if (!formData.riskTolerance) return setError("Please select a Risk Profile.")
    }
    if (step === 2) {
      if (Object.keys(formData.scenarioAnswers).length < 4) return setError("Please answer all scenario questions.")
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

    if (formData.universe.length === 0) {
       setError("Please select at least one Invesment Universe.")
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
   
    const riskPayload = {
      user_id: currentUserId,
      capital: parseFloat(formData.capital), 
      risk_tolerance: formData.riskTolerance, 
    }
    
    const surveyResults = {
      scenarios: formData.scenarioAnswers,
      sliders: formData.sliderAnswers,
      explicit_risk: formData.riskTolerance
    }

    const { calculatedExpertise, calculatedArchetype } = determineExpertiseAndArchetype(
      formData.scenarioAnswers, 
      formData.sliderAnswers, 
      formData.riskTolerance
    );

    const preferencesPayload = {
      user_id: currentUserId,
      investment_universe: formData.universe,
      survey_answers: surveyResults,
      ai_derived_expertise: calculatedExpertise,
      investor_archetype: calculatedArchetype,
      is_active: true
    }

    const { error: riskError } = await supabase.from('risk_profile').insert([riskPayload])
    if (riskError) {
      setError(`Database Error (Risk Profile): ${riskError.message}`)
      setLoading(false)
      return
    }

    const { error: prefError } = await supabase.from('user_preferences').insert([preferencesPayload])
    if (prefError) {
      setError(`Database Error (Preferences): ${prefError.message}`) 
      setLoading(false)
      return
    }

    await fetchProfile(currentUserId)
    navigate('/')
  }

  return { step, formData, setFormData, error, loading, handleSubmit, toggleUniverse, nextStep, prevStep, handleScenarioAnswer, handleSliderChange }
}