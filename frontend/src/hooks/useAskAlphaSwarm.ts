import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AskSource {
  title: string
  publisher: string
  url: string
  retrieved_at: string
}

export interface AskResult {
  intent: string
  narration: string
  data: Record<string, unknown>
  source: string
  // Structured, exact source metadata for externally-grounded Learning
  // Centre fallback answers (empty for every other response type).
  sources: AskSource[]
  is_blocked: boolean
  redirect_suggestions: string[]
}

// Same pattern as services/api/analysis.ts: fetch the token fresh from
// Supabase at call time rather than off the zustand auth store, which can
// still be null/stale at the moment a request fires (e.g. right after
// navigation, before onAuthStateChange has re-populated it) and was causing
// /api/ask to be called with no Authorization header at all.
async function getToken() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token ?? null
}

// ─── Session-scoped persistence ─────────────────────────────────────────────
// The hook previously kept `query`/`result` in local useState only, which
// lives inside WatchlistPage. Navigating to another route (Dashboard,
// Learning, Settings, ...) unmounts WatchlistPage, so switching back reset
// the conversation to blank — that was the reported bug. sessionStorage is
// scoped to the browser tab, not to any one component's mount lifecycle, so
// it survives route changes and re-renders while staying private to this
// tab/session (cleared when the tab closes) — no new global store, no
// permanent database write, nothing sensitive persisted beyond the current
// browser session. A real page refresh also happens to survive (sessionStorage
// outlives that too), which is a bonus, not a requirement being claimed here.
const STORAGE_KEY = 'askAlphaSwarm.session'

interface StoredState {
  query: string
  result: AskResult | null
}

function loadStored(): StoredState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { query: '', result: null }
    const parsed = JSON.parse(raw)
    return { query: parsed.query ?? '', result: parsed.result ?? null }
  } catch {
    return { query: '', result: null }
  }
}

function saveStored(state: StoredState) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Best-effort only (private browsing / storage disabled) — the feature
    // still works within a single mount, it just won't survive navigation.
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useAskAlphaSwarm() {
  const BASE = (import.meta as any).env?.VITE_API_BASE ?? ''

  const initial = loadStored()
  const [query, setQuery]     = useState(initial.query)
  const [result, setResult]   = useState<AskResult | null>(initial.result)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    saveStored({ query, result })
  }, [query, result])

  const ask = useCallback(async (q?: string) => {
    const question = (q ?? query).trim()
    if (!question) return

    const token = await getToken()
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
  }, [BASE, query])

  const reset = useCallback(() => {
    setQuery('')
    setResult(null)
    setError(null)
    setLoading(false)
    try {
      window.sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // best-effort, see saveStored above
    }
  }, [])

  return { query, setQuery, result, loading, error, ask, reset }
}
