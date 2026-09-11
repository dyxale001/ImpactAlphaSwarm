import type { FormEvent } from 'react'
import { Search, Loader2, Sparkles } from 'lucide-react'
import AskInfoTooltip from './AskInfoTooltip'

interface Props {
  query: string
  setQuery: (val: string) => void
  loading: boolean
  onAsk: () => void
}

export default function AskComposer({ query, setQuery, loading, onAsk }: Props) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!loading) onAsk()
  }

  return (
    <div className="space-y-2">
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
            placeholder="Ask AlphaSwarm anything…"
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

      <div className="flex items-center justify-center gap-2 flex-wrap">
        <p className="text-[10px] text-brand-muted-fg/70 text-center">
          Financial information for educational purposes only · Not personalised financial advice
        </p>
        <span className="text-brand-muted-fg/40 text-[10px]">·</span>
        <AskInfoTooltip />
      </div>
    </div>
  )
}
