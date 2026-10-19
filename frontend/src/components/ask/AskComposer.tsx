import type { FormEvent } from 'react'
import { Loader2, Send, Sparkles, X } from 'lucide-react'

interface Props {
  query: string
  setQuery: (val: string) => void
  loading: boolean
  onAsk: () => void
  /** Shown once there is a conversation to clear. */
  onClear?: () => void
}

// The question box, with one quiet line under it: the disclaimer, and Clear
// conversation once there is one. "What can I ask?" lives in the page header.
export default function AskComposer({ query, setQuery, loading, onAsk, onClear }: Props) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!loading) onAsk()
  }

  return (
    <div className="space-y-2">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          {loading
            ? <Loader2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-muted-fg" />
            : <Sparkles className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-forest-700" />
          }
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask about a stock, a fund or a term…"
            aria-label="Ask AlphaSwarm"
            className="h-11 w-full rounded-full border border-forest-900/15 bg-white pl-10 pr-4 text-sm text-forest-900 transition-colors placeholder:text-forest-400 hover:border-forest-900/30 focus:border-forest-700 focus:outline-none"
          />
        </div>
        {/* Icon-only on a phone, so the question box keeps the room. */}
        <button type="submit" disabled={loading || !query.trim()} aria-label="Ask" className="as-btn as-btn-primary shrink-0 px-3 sm:px-5">
          <Send className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Ask</span>
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-xs text-brand-muted-fg">
        <p>Financial information for educational purposes only · Not personalised financial advice</p>
        {onClear && (
          <button type="button" onClick={onClear} className="inline-flex items-center gap-1 font-semibold hover:text-forest-900">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear conversation
          </button>
        )}
      </div>
    </div>
  )
}
