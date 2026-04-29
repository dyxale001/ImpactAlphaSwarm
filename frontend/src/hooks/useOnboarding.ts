import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

export function useOnboarding() {
  const { user, fetchProfile } = useAuthStore()
  const navigate = useNavigate()
  
  const [formData, setFormData] = useState({
    firstName: '', 
    lastName: '', 
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

        const payload = {
      id: user.id, 
      first_name: formData.firstName,
      last_name: formData.lastName,
      email: user.email, 
      role: 'user', 
      capital: parseFloat(formData.capital), 
      risk_tolerance: formData.riskTolerance, 
      investment_universe: formData.universe, 
      is_active: true
    }

    console.log("SENDING PAYLOAD TO SUPABASE:", payload)

    const { error: dbError } = await supabase.from('users').insert([payload])

    if (dbError) {
      console.error("SUPABASE ERROR DETAILS:", dbError)
      setError(dbError.message)
      setLoading(false)
    } else {
      await fetchProfile(user.id)
      navigate('/')
    }
  }

  return { formData, setFormData, error, loading, handleSubmit, toggleUniverse }
}