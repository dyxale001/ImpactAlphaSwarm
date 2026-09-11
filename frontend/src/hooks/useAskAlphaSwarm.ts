import { useCallback, useEffect, useState } from 'react'
import {
  AskAlphaSwarmService,
  AskAuthError,
  AskRateLimitedError,
} from '../services/ask/AskAlphaSwarmService'
import { ConversationStorage } from '../services/ask/ConversationStorage'
import { buildAskContext } from '../services/ask/contextTracker'
import type { AskResult, AskSource, AskTurn } from '../services/ask/types'

export type { AskResult, AskSource, AskTurn }

const STORAGE_KEY = 'askAlphaSwarm.session'

// Module-level singletons: one HTTP client and one storage key for the
// whole app, regardless of how many components use the hook. Constructing
// them outside the hook keeps them out of React's render cycle — they hold
// no component state of their own, just configuration (base URL, key).
const service = new AskAlphaSwarmService((import.meta as any).env?.VITE_API_BASE ?? '')
const storage = new ConversationStorage(STORAGE_KEY)

function makeTurnId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Ask AlphaSwarm's interaction/state orchestrator. Depends on
 * AskAlphaSwarmService (API) and ConversationStorage (persistence) rather
 * than reimplementing either — this hook's only job is turning "the user
 * asked a question" into conversation state, mapping failures to
 * user-facing messages, and keeping that state in sync with storage.
 */
export function useAskAlphaSwarm() {
  const [turns, setTurns] = useState<AskTurn[]>(() => storage.load())
  const [query, setQuery] = useState('')
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    storage.save(turns)
  }, [turns])

  const ask = useCallback(async (q?: string) => {
    const question = (q ?? query).trim()
    if (!question || loading) return

    setQuery('')
    setError(null)
    setLoading(true)
    setPendingQuestion(question)

    try {
      // Computed from the conversation already on screen — the backend
      // treats it as a hint for what the question refers to, never as
      // evidence, and re-resolves/re-validates everything itself.
      const context = buildAskContext(turns)
      const result = await service.ask(question, context)
      setTurns(prev => [...prev, { id: makeTurnId(), question, result }])
    } catch (e) {
      if (e instanceof AskAuthError) {
        setError('You need to be signed in to ask AlphaSwarm.')
      } else if (e instanceof AskRateLimitedError) {
        setError('Too many requests — please wait a moment before asking again.')
      } else {
        setError('Something went wrong answering that question. Try again.')
      }
    } finally {
      setLoading(false)
      setPendingQuestion(null)
    }
  }, [query, loading, turns])

  const reset = useCallback(() => {
    setTurns([])
    setQuery('')
    setError(null)
    setLoading(false)
    setPendingQuestion(null)
    storage.clear()
  }, [])

  return { turns, query, setQuery, pendingQuestion, loading, error, ask, reset }
}
