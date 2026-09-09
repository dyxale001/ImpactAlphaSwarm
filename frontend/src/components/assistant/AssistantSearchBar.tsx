import { useState, type FormEvent } from 'react'
import { Sparkles, Loader2, X, ExternalLink } from 'lucide-react'
import { useAssistantQuery } from '../../hooks/useAssistantQuery'

export default function AssistantSearchBar() {
  const [question, setQuestion] = useState('')
  const { answer, loading, error, ask, clear } = useAssistantQuery()

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!question.trim() || loading) return
    ask(question)
  }

  const handleClear = () => {
    setQuestion('')
    clear()
  }

  const showPanel = loading || error || answer

  return (
    <div className="relative w-full">
      <form onSubmit={handleSubmit} className="relative">
        {loading
          ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg animate-spin pointer-events-none" />
          : <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg pointer-events-none" />
        }
        <input
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Ask about a ticker, e.g. “what does the data say about AAPL right now?”"
          aria-label="Ask the assistant about a ticker"
          className="w-full rounded-full border border-brand-border/60 bg-brand-card pl-9 pr-9 py-2.5 text-sm text-brand-fg placeholder:text-brand-muted-fg focus:outline-none focus:border-brand-primary/50 transition-colors"
        />
        {question && (
          <button
            type="button"
            aria-label="Clear question"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted-fg hover:text-brand-fg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </form>

      {showPanel && (
        <div className="absolute z-50 mt-2 w-full rounded-2xl border border-brand-border/60 bg-brand-card shadow-lg overflow-hidden">
          {loading && (
            <p className="px-4 py-3 text-sm text-brand-muted-fg italic">Checking the data…</p>
          )}

          {!loading && error && (
            <p className="px-4 py-3 text-sm text-red-400">{error}</p>
          )}

          {!loading && !error && answer && (
            <div className="px-4 py-3 space-y-3">
              {answer.ticker && (
                <p className="text-xs font-semibold text-brand-muted-fg uppercase tracking-wide">
                  {answer.ticker}{answer.company_name ? ` · ${answer.company_name}` : ''}
                </p>
              )}

              <p className="text-sm text-brand-fg leading-relaxed">{answer.answer}</p>

              {answer.sources.length > 0 && (
                <div className="pt-2 border-t border-brand-border/40 space-y-1">
                  <p className="text-[11px] font-semibold text-brand-muted-fg uppercase tracking-wide">Sources</p>
                  {answer.sources.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-brand-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{s.label}</span>
                    </a>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-brand-muted-fg italic pt-1">
                Informational only, not financial advice — figures reflect data at the time of the query.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
