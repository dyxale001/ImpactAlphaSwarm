// Shared Ask AlphaSwarm types — the exact shape of /api/ask's response.
// Unchanged from the previous Watchlist-embedded implementation: the
// frontend is a presentation/client layer over the existing backend
// contract and does not redefine it.

export interface AskSource {
  title: string
  publisher: string
  url: string
  retrieved_at: string
}

// One figure the answer states, and where that figure came from. Emitted
// by the backend's output validator: a figure appears here only if it was
// checked against AlphaSwarm's stored data and matched, so the list says
// what the answer rests on rather than asserting an origin. Optional
// because older/cached responses predate the field.
export interface AskDataPoint {
  ticker: string
  label: string
  value: number
  field: string
  origin: string
}

// Where in the app the reader can go and see this for themselves. Resolved
// deterministically on the backend from the intent and the entity that
// retrieval actually used, so it cannot point somewhere the answer was not
// about. Absent on refusals, clarifications and bare definitions.
export interface AskLink {
  path: string
  label: string
}

export interface AskResult {
  intent: string
  narration: string
  data: Record<string, unknown>
  source: string
  sources: AskSource[]
  data_points?: AskDataPoint[]
  link?: AskLink | null
  is_blocked: boolean
  redirect_suggestions: string[]
}

// One question/answer exchange in a conversation.
export interface AskTurn {
  id: string
  question: string
  result: AskResult
}

// Compact conversational context sent alongside a new question, so the
// backend can resolve "its RSI"/"what about that" against what the
// conversation is currently about. This is bookkeeping ONLY — derived from
// the backend's own past responses (AskResult.intent/data), never invented
// client-side and never treated as financial fact. The backend re-resolves
// evidence fresh on every request; this just tells it what the question
// probably refers to. Mirrors backend/src/api.py's AskContext model.
export interface AskContext {
  active_asset: string | null
  ambiguous_assets: string[]
  compare_assets: string[]
  recent_metric: string | null
  previous_intent: string | null
}
