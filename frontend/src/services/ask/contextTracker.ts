import type { AskContext, AskResult, AskTurn } from './types'

// Mirrors backend/src/api.py's _ASK_REFERENCE_PATTERN — used here ONLY to
// decide whether a past turn's question was a fresh, standalone mention
// ("Tell me about MSFT") or a reference/continuation ("what about MSFT?",
// "its RSI"). This is conversational bookkeeping, not retrieval or safety
// logic — the backend independently re-resolves and re-validates everything
// this hands it.
const REFERENCE_WORDS =
  /\b(what\s+about|is\s+(?:that|this)\s+good|why|the\s+other\s+one|those\s+results|that\s+metric|this\s+metric|the\s+stock|the\s+company|the\s+asset|it['’]s|its|it|this|that|these|those)\b/i

function isReferenceQuestion(question: string): boolean {
  return REFERENCE_WORDS.test(question)
}

const METRIC_KEYWORDS: [string, string][] = [
  ['sharpe ratio', 'Sharpe ratio'],
  ['sharpe', 'Sharpe ratio'],
  ['signal strength', 'signal strength'],
  ['signal score', 'signal strength'],
  ['relative strength', 'RSI'],
  ['rsi', 'RSI'],
  ['macd', 'MACD'],
  ['volatility', 'volatility'],
  ['convergence', 'convergence'],
  ['confidence score', 'confidence score'],
  ['confidence', 'confidence score'],
  ['sentiment', 'sentiment score'],
  ['beta', 'beta'],
  ['price', 'price'],
  ['dividend', 'dividend'],
]

function extractMetric(question: string): string | null {
  const q = question.toLowerCase()
  for (const [phrase, canonical] of METRIC_KEYWORDS) {
    if (q.includes(phrase)) return canonical
  }
  return null
}

// Ground truth for "what asset was this turn actually about" comes from the
// backend's own response data (data.ticker for a single-asset answer,
// data.assets for a comparison) — never re-guessed from the question text.
function extractAssets(result: AskResult): string[] {
  const data = result.data || {}
  if (typeof data.ticker === 'string' && data.ticker) return [data.ticker]
  if (Array.isArray(data.assets)) {
    return data.assets
      .map((a: unknown) => (a && typeof a === 'object' ? (a as Record<string, unknown>).ticker : undefined))
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
  }
  return []
}

/**
 * Builds the AskContext to send with the NEXT question, from the turns
 * already in the conversation. Pure function — no state, no side effects,
 * so it needs no class of its own (the SRP that matters here is "don't
 * scatter this logic across components", not "wrap it in an object").
 *
 * Asset-tracking rule (matches the product spec's examples):
 *  - A turn whose question has no reference/continuation wording is a
 *    FRESH mention — its asset is added ALONGSIDE any existing candidates
 *    (doesn't discard them), because the user hasn't signalled moving on.
 *  - A turn whose question DOES have reference wording and resolves to a
 *    DIFFERENT asset than the current candidates is a deliberate PIVOT
 *    ("what about MSFT?") — it replaces the candidate set entirely.
 *  - A turn whose question has reference wording and resolves to the SAME
 *    asset already tracked is just a continuation — no change.
 * This is what makes "GOOGL, MSFT, is that good?" ambiguous (two fresh
 * mentions, no pivot) while "GOOGL, its RSI, what about MSFT?, its beta"
 * stays unambiguous (the explicit "what about MSFT?" pivot clears GOOGL).
 */
// The pair a comparison follow-up ("which one has the higher beta?",
// "compare the two") should use. Prefers an actual past comparison turn's
// own pair if the most recent turn WAS one; otherwise walks backward
// collecting the last two DISTINCT single-asset tickers mentioned — even
// across a pivot ("GOOGL" then "what about MSFT?" still yields [GOOGL,
// MSFT] here), because a comparison question is inherently about more than
// one asset regardless of which one is currently "active" for a single-
// asset follow-up. Deliberately a SEPARATE pass from the active-asset
// tracking below, which needs the opposite behaviour (a pivot clears the
// old asset) for single-asset questions to stay unambiguous.
function lastTwoComparisonAssets(turns: AskTurn[]): string[] {
  const last = turns[turns.length - 1]
  if (last) {
    const lastAssets = extractAssets(last.result)
    if (lastAssets.length >= 2) return lastAssets.slice(0, 2)
  }
  const seen: string[] = []
  for (let i = turns.length - 1; i >= 0 && seen.length < 2; i--) {
    const assets = extractAssets(turns[i].result)
    if (assets.length !== 1) continue
    const ticker = assets[0]
    if (!seen.includes(ticker)) seen.push(ticker)
  }
  return seen.reverse() // chronological order
}

export function buildAskContext(turns: AskTurn[]): AskContext {
  const last = turns[turns.length - 1]
  const previousIntent = last ? last.result.intent : null
  const recentMetric = last ? extractMetric(last.question) : null
  const compareAssets = lastTwoComparisonAssets(turns)

  let candidates: string[] = []
  for (const turn of turns.slice(-6)) {
    const assets = extractAssets(turn.result)
    if (assets.length !== 1) continue // skip comparison/no-asset turns for this pass
    const ticker = assets[0]
    const referenced = isReferenceQuestion(turn.question)

    if (candidates.includes(ticker)) continue // already tracked, no change
    if (referenced && candidates.length > 0) {
      candidates = [ticker] // deliberate pivot — discard prior candidates
    } else {
      candidates.push(ticker) // fresh mention (or the first candidate) — add alongside
    }
  }

  return {
    active_asset: candidates.length === 1 ? candidates[0] : null,
    ambiguous_assets: candidates.length >= 2 ? candidates.slice(-2) : [],
    compare_assets: compareAssets,
    recent_metric: recentMetric,
    previous_intent: previousIntent,
  }
}
