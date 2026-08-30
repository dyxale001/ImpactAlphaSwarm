import { useState, useCallback, useRef } from 'react'

export interface AssistantSource {
  label: string
  url: string
}

export interface AssistantAnswer {
  answered: boolean
  reason: string | null
  answer: string
  ticker: string | null
  company_name?: string
  sources: AssistantSource[]
}

export function useAssistantQuery() {
  const BASE = (import.meta as any).env?.VITE_API_BASE ?? ''

  const [answer, setAnswer] = useState<AssistantAnswer | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const ask = useCallback(async (question: string) => {
    const q = question.trim()
    if (!q) return

    const thisRequest = ++requestId.current
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${BASE}/api/assistant/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      if (thisRequest !== requestId.current) return // a newer question superseded this one

      if (!res.ok) {
        setError('Something went wrong answering that question. Try again.')
        setAnswer(null)
        return
      }
      const data: AssistantAnswer = await res.json()
      setAnswer(data)
    } catch {
      if (thisRequest !== requestId.current) return
      setError('Something went wrong answering that question. Try again.')
      setAnswer(null)
    } finally {
      if (thisRequest === requestId.current) setLoading(false)
    }
  }, [BASE])

  const clear = useCallback(() => {
    requestId.current += 1
    setAnswer(null)
    setError(null)
    setLoading(false)
  }, [])

  return { answer, loading, error, ask, clear }
}
