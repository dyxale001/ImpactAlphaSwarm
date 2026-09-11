import type { AskTurn } from './types'

function isAskTurn(value: unknown): value is AskTurn {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'string' && typeof v.question === 'string' && !!v.result
}

/**
 * Encapsulates Ask AlphaSwarm's conversation persistence: the storage key,
 * the read/write calls, and validating what comes back out. Callers work
 * with AskTurn[] and never touch sessionStorage or its failure modes
 * (disabled storage, private browsing, a stale/incompatible shape from a
 * previous version) directly.
 *
 * sessionStorage (not localStorage, not a backend table) is deliberate: it
 * is scoped to the browser tab, survives route/component unmounts within
 * that tab, and is cleared automatically when the tab closes — exactly the
 * "survives navigation, forgotten at session end" behaviour this feature
 * has always had.
 */
export class ConversationStorage {
  constructor(private readonly key: string) {}

  load(): AskTurn[] {
    try {
      const raw = window.sessionStorage.getItem(this.key)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isAskTurn)
    } catch {
      return []
    }
  }

  save(turns: AskTurn[]): void {
    try {
      window.sessionStorage.setItem(this.key, JSON.stringify(turns))
    } catch {
      // Best-effort only (private browsing / storage disabled) — the
      // conversation still works for the current mount, it just won't
      // survive navigation away and back.
    }
  }

  clear(): void {
    try {
      window.sessionStorage.removeItem(this.key)
    } catch {
      // best-effort, see save() above
    }
  }
}
