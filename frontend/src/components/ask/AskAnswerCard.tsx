import { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import type { AskTurn } from '../../services/ask/types'

interface Props {
  turn: AskTurn
  onSuggestionClick: (question: string) => void
}

export default function AskAnswerCard({ turn, onSuggestionClick }: Props) {
  const [showData, setShowData] = useState(false)
  const { question, result } = turn

  const hasDataToShow = !result.is_blocked && result.data && Object.keys(result.data).length > 0

  return (
    <div className="space-y-2.5" style={{ animation: 'slide-up 0.3s ease-out forwards' }}>
      <p className="text-xs font-semibold text-brand-muted-fg">{question}</p>

      <div className="soft-card p-4 space-y-3">
        <p className="text-sm text-brand-fg leading-relaxed whitespace-pre-line">{result.narration}</p>

        {result.sources.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-brand-muted-fg font-semibold">Source</p>
            {result.sources.map(s => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-1.5 text-xs text-brand-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
                <span>
                  <span className="font-semibold">{s.publisher}</span>
                  {' — '}
                  <span className="italic">{s.title}</span>
                </span>
              </a>
            ))}
          </div>
        ) : (
          result.source && result.source !== 'none' && (
            <p className="text-[10px] uppercase tracking-wider text-brand-muted-fg font-semibold">
              Source: {result.source.replace(/_/g, ' ')}
            </p>
          )
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
                onClick={() => onSuggestionClick(s)}
                className="chip bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 text-[11px] transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
