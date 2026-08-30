import { useState, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AskResult {
  intent: string
  narration: string
  data: Record<string, unknown>
  source: string
  is_blocked: boolean
  redirect_suggestions: string[]
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useAskAlphaSwarm() {
  const { session } = useAuthStore()
  const BASE = (import.meta as any).env?.VITE_API_BASE ?? ''

  const [query, setQuery]     = useState('')
  const [result, setResult]   = useState<AskResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const ask = useCallback(async (q?: string) => {
    const question = (q ?? query).trim()
    if (!question) return

    const token = session?.access_token
    if (!token) {
      setError('You need to be signed in to ask AlphaSwarm.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${BASE}/api/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: question }),
      })

      if (res.status === 429) {
        setError('Too many requests — please wait a moment before asking again.')
        setResult(null)
        return
      }
      if (!res.ok) {
        setError('Something went wrong answering that question. Try again.')
        setResult(null)
        return
      }

      const data: AskResult = await res.json()
      setResult(data)
    } catch {
      setError('Something went wrong answering that question. Try again.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [BASE, query, session])

  const reset = useCallback(() => {
    setQuery('')
    setResult(null)
    setError(null)
    setLoading(false)
  }, [])

  return { query, setQuery, result, loading, error, ask, reset }
}
