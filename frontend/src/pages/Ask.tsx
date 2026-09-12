import { useEffect, useRef } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { useAskAlphaSwarm } from '../hooks/useAskAlphaSwarm'
import AskLandingCards from '../components/ask/AskLandingCards'
import AskAnswerCard from '../components/ask/AskAnswerCard'
import AskComposer from '../components/ask/AskComposer'

export default function AskAlphaSwarmPage() {
  const { turns, query, setQuery, pendingQuestion, loading, error, ask, reset } = useAskAlphaSwarm()
  const hasHistory = turns.length > 0
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length, pendingQuestion])

  return (
    <div className="max-w-3xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-10 flex flex-col min-h-[calc(100dvh-2rem)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-brand-fg flex items-center gap-3">
            <Sparkles className="w-6 h-6 shrink-0 text-brand-primary" />
            Ask AlphaSwarm
          </h1>
          <p className="text-sm text-brand-muted-fg mt-2 max-w-xl leading-relaxed">
            Understand your AlphaSwarm data. Explore. Compare. Learn.
          </p>
        </div>
        {hasHistory && (
          <button
            type="button"
            onClick={reset}
            className="shrink-0 text-xs font-semibold text-brand-muted-fg hover:text-brand-fg transition-colors"
          >
            Clear conversation
          </button>
        )}
      </div>

      {/* Landing or conversation */}
      <div className="flex-1 space-y-6">
        {!hasHistory && !loading ? (
          <AskLandingCards onSelect={setQuery} />
        ) : (
          <div className="space-y-6">
            {turns.map(turn => (
              <AskAnswerCard key={turn.id} turn={turn} onSuggestionClick={q => ask(q)} />
            ))}
            {loading && pendingQuestion && (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-brand-muted-fg">{pendingQuestion}</p>
                <div className="soft-card p-4 flex items-center gap-2 text-sm text-brand-muted-fg">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-semantic-danger/10 border border-semantic-danger/20 text-semantic-danger text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 pt-4 mt-6 bg-brand-bg">
        <AskComposer query={query} setQuery={setQuery} loading={loading} onAsk={() => ask()} />
      </div>
    </div>
  )
}
