import { supabase } from '../../lib/supabase'
import type { AskContext, AskResult } from './types'

// Typed failure modes, so the hook can map each to the right user-facing
// message without string-sniffing an error or duplicating fetch/auth
// details across components. Never carries the raw response body — that
// stays server-side.
export class AskAuthError extends Error {
  constructor() {
    super('Not signed in')
    this.name = 'AskAuthError'
  }
}

export class AskRateLimitedError extends Error {
  constructor() {
    super('Rate limited')
    this.name = 'AskRateLimitedError'
  }
}

export class AskRequestFailedError extends Error {
  constructor() {
    super('Request failed')
    this.name = 'AskRequestFailedError'
  }
}

/**
 * Single point of contact with the existing /api/ask endpoint.
 *
 * This does not reimplement or move any backend logic (intent
 * classification, retrieval, source validation, narration) — it only
 * encapsulates the HTTP + auth-token details that were previously inline in
 * the hook, so the hook (and any future consumer) depends on "ask a
 * question" rather than on fetch/Supabase specifics.
 */
export class AskAlphaSwarmService {
  constructor(private readonly baseUrl: string) {}

  private async getToken(): Promise<string | null> {
    // Same reasoning as the original hook: fetch the token fresh from
    // Supabase at call time rather than off a store, which can still be
    // null/stale right after navigation.
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? null
  }

  async ask(question: string, context?: AskContext | null): Promise<AskResult> {
    const token = await this.getToken()
    if (!token) throw new AskAuthError()

    const res = await fetch(`${this.baseUrl}/api/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(context ? { query: question, context } : { query: question }),
    })

    if (res.status === 429) throw new AskRateLimitedError()
    if (!res.ok) throw new AskRequestFailedError()

    return (await res.json()) as AskResult
  }
}
