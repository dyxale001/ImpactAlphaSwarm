import { useState } from 'react'
import { Search, Loader2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { type AskResult } from '../../hooks/useAskAlphaSwarm'

interface Props {
  query: string
  setQuery: (val: string) => void
  result: AskResult | null
  loading: boolean
  error: string | null
  onAsk: () => void
}

const SUGGESTED_QUESTIONS = [
  'Show me technology assets in my universe',
  'What is on my watchlist?',
  'Why does AlphaSwarm rank this asset the way it does?',
  'What does beta mean?',
  'How does AlphaSwarm calculate Signal Score?',
]

export default function AskAlphaSwarm({ query, setQuery, result, loading, error, onAsk }: Props) {
  const [showData, setShowData] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!loading) onAsk()
  }

  const hasDataToShow = result && !result.is_blocked && result.data && Object.keys(result.data).length > 0

  return (
    <div className="w-full space-y-3">
      {/* Input row */}
      <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
        <div className="relative flex-1">
          {loading
            ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg animate-spin pointer-events-none" />
            : <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg pointer-events-none" />
          }
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask AlphaSwarm about assets, your watchlist, or how it works…"
            aria-label="Ask AlphaSwarm"
            className="w-full rounded-full border border-brand-border/60 bg-brand-card pl-9 pr-4 py-2.5 text-sm text-brand-fg placeholder:text-brand-muted-fg focus:outline-none focus:border-brand-primary/50 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-brand-primary text-brand-bg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 transition-all"
        >
          <Search className="w-4 h-4" />
          Ask
        </button>
      </form>

      {/* Safe suggested questions */}
      {!result && !loading && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map(q => (
            <button
              key={q}
              type="button"
              onClick={() => setQuery(q)}
              className="chip bg-brand-border/20 text-brand-muted-fg hover:text-brand-fg hover:bg-brand-border/30 text-[11px] transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-semantic-danger/10 border border-semantic-danger/20 text-semantic-danger text-sm">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="soft-card p-4 space-y-3" style={{ animation: 'slide-up 0.3s ease-out forwards' }}>
          <p className="text-sm text-brand-fg leading-relaxed whitespace-pre-line">{result.narration}</p>

          {result.source && result.source !== 'none' && (
            <p className="text-[10px] uppercase tracking-wider text-brand-muted-fg font-semibold">
              Source: {result.source.replace(/_/g, ' ')}
            </p>
          )}

          {hasDataToShow && (
            <div>
              <button
                type="button"
                onClick={() => setShowData(v => !v)}
                className="flex items-center gap-1 text-xs text-brand-primary hover:underline font-semibold"
              >
                {showData ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Data used
              </button>
              {showData && (
                <pre className="mt-2 p-3 rounded-lg bg-brand-bg/50 border border-brand-border/40 text-[11px] text-brand-muted-fg overflow-x-auto">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              )}
            </div>
          )}

          {result.redirect_suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {result.redirect_suggestions.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQuery(s)}
                  className="chip bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 text-[11px] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
