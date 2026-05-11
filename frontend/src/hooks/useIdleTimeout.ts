import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useIdleTimeout(timeoutMinutes = 15) {
  const timeoutMs = timeoutMinutes * 60 * 1000
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const logout = async () => {
      await supabase.auth.signOut()
    }

    const resetTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(logout, timeoutMs)
      localStorage.setItem('lastActivity', Date.now().toString())
    }

    // Check if the user was already inactive for >15 mins before loading the app
    const lastActivity = localStorage.getItem('lastActivity')
    if (lastActivity) {
      const timeSinceLastActivity = Date.now() - parseInt(lastActivity, 10)
      if (timeSinceLastActivity > timeoutMs) {
        logout()
        return
      }
    }

    // Events that indicate the user is active
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
    
    events.forEach((event) => {
      document.addEventListener(event, resetTimer, { passive: true })
    })

    resetTimer()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      events.forEach((event) => {
        document.removeEventListener(event, resetTimer)
      })
    }
  }, [timeoutMs])
}