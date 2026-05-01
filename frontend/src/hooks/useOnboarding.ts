import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

export function useOnboarding() {
  const { user, fetchProfile } = useAuthStore()
  const navigate = useNavigate()
  
  // Removed firstName and lastName
  const [formData, setFormData] = useState({
    capital: '', 
    riskTolerance: '', 
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    
    // Validation
    if (!formData.riskTolerance) {
      setError("Please select a Risk Profile to continue.")
      return
    }
    if (formData.universe.length === 0) {
      setError("Please select at least one sector for your Investment Universe.")
      return
    }

    setLoading(true)
    setError('')

    // Payload strictly for user_preferences
    const payload = {
      user_id: user.id, // Using user_id to map to the preferences table
      capital: parseFloat(formData.capital), 
      risk_tolerance: formData.riskTolerance, 
      investment_universe: formData.universe, 
      is_active: true
    }

    console.log("SENDING PREFERENCES TO SUPABASE:", payload)

    // Insert into user_preferences instead of users
    const { error: dbError } = await supabase.from('user_preferences').insert([payload])

    if (dbError) {
      console.error("SUPABASE ERROR DETAILS:", dbError)
      setError(dbError.message)
      setLoading(false)
    } else {
      // Re-fetch the store to pull both profile and the new preferences
      await fetchProfile(user.id)
      navigate('/')
    }
  }

  return { formData, setFormData, error, loading, handleSubmit, toggleUniverse }
}