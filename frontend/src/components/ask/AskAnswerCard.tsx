import { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import type { AskTurn } from '../../services/ask/types'

interface Props {
  turn: AskTurn
  onSuggestionClick: (question: string) => void
}

// The backend's `source` field is an internal routing/retrieval-tier label
// (e.g. "ai_recommendation" for a full analysed run, "assets" for basic
// asset info only, "methodology_glossary" for a glossary definition) — see
// _fetch_asset_analysis_data / _ask_learning_question in api.py. Preserves
// every distinct value the backend actually sends; this only translates
// each one into wording a user would recognise, it doesn't collapse or
// reinterpret the distinction.
const SOURCE_LABELS: Record<string, string> = {
  ai_recommendation: "AlphaSwarm's analysis",
  assets: 'AlphaSwarm asset data',
  asset_search: 'AlphaSwarm asset data',
  analysis_explanation: "AlphaSwarm's analysis",
  user_data: 'Your AlphaSwarm data',
  methodology_glossary: 'AlphaSwarm methodology',
  platform_methodology: 'AlphaSwarm methodology',
  learning_centre: 'AlphaSwarm Learning Centre',
  scope_boundary: "AlphaSwarm's scope",
}

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.replace(/_/g, ' ')
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
              Source: {sourceLabel(result.source)}
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
              {showData
                ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>Data used</span>
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
