import { Link } from 'react-router-dom'
import { ArrowRight, ExternalLink, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
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
  stocks: 'AlphaSwarm stock data',
  asset_search: 'AlphaSwarm stock data',
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

/** The reader's question, as a chat bubble on the right. */
export function AskBubble({ children }: { children: ReactNode }) {
  return (
    <p className="ml-auto w-fit max-w-[min(85%,35rem)] rounded-[18px] rounded-br-[6px] bg-forest-700 px-4 py-2.5 text-sm leading-relaxed text-white">
      {children}
    </p>
  )
}

/** The Sparkles mark and name every AI paragraph in the app carries. */
function AnswerHeader({ meta }: { meta?: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-bold text-forest-900">
      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-lime-500 text-forest-800" aria-hidden="true">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      AlphaSwarm
      {meta && <span className="text-xs font-normal text-brand-muted-fg">{meta}</span>}
    </p>
  )
}

/** While an answer is on its way: the question, then the answer box with typing dots. */
export function AskThinking({ question }: { question: string }) {
  return (
    <div className="space-y-2.5">
      <AskBubble>{question}</AskBubble>
      <div className="as-inset flex items-center gap-3 p-4" role="status">
        <AnswerHeader />
        <span className="inline-flex gap-1" aria-hidden="true">
          {[0, 150, 300].map(delay => (
            <i key={delay} className="h-1.5 w-1.5 rounded-full bg-forest-300 motion-safe:animate-pulse" style={{ animationDelay: `${delay}ms` }} />
          ))}
        </span>
        <span className="text-xs text-brand-muted-fg">Thinking</span>
      </div>
    </div>
  )
}

// The question as a bubble, then the answer in the Sparkles box every AI paragraph
// in the app uses: the narration, its sources, the figures checked against stored
// data, the way into the app, and the suggested follow-ups.
export default function AskAnswerCard({ turn, onSuggestionClick }: Props) {
  const { question, result } = turn
  const hasSourceList = result.sources.length > 0
  const sourceMeta = !hasSourceList && result.source && result.source !== 'none' ? `From ${sourceLabel(result.source)}` : undefined

  return (
    <div className="space-y-2.5" style={{ animation: 'slide-up 0.3s ease-out forwards' }}>
      <AskBubble>{question}</AskBubble>

      <div className="as-inset space-y-3 p-4">
        <AnswerHeader meta={sourceMeta} />
        <p className="text-sm leading-relaxed text-forest-900 whitespace-pre-line">{result.narration}</p>

        {hasSourceList && (
          <div className="space-y-1.5 rounded-[12px] bg-white p-3">
            <p className="text-xs font-bold text-forest-900">Sources</p>
            {result.sources.map(s => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-1.5 text-xs text-forest-700 hover:underline"
              >
                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                <span>
                  <span className="font-semibold">{s.publisher}</span>
                  {' — '}
                  <span className="italic">{s.title}</span>
                </span>
              </a>
            ))}
          </div>
        )}

        {/* Per-figure provenance. Every row here is a number stated in the
            answer above that was checked against AlphaSwarm's stored data
            and matched — so it is the evidence the answer rests on, not a
            restatement of it. Shown as a plain list rather than a
            collapsible JSON dump: the point is that a reader can see the
            figures and their origin at a glance. */}
        {result.data_points && result.data_points.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-forest-900">
              Figures used · verified against {result.data_points[0].origin}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {result.data_points.map(p => (
                <span key={`${p.ticker}-${p.field}`} className="chip bg-white">
                  <span className="font-bold text-forest-900">{p.ticker}</span>
                  <span className="font-normal text-brand-muted-fg">{p.label}</span>
                  <span className="tabular-nums text-forest-900">{p.value.toLocaleString()}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Where to go and see this in the app. Backend-resolved from the
            entity retrieval actually used, so it always points at what the
            answer was about. */}
        {result.link && (
          <Link
            to={result.link.path}
            className="inline-flex items-center gap-1 text-sm font-bold text-forest-700 hover:underline"
          >
            {result.link.label}
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </Link>
        )}

        {result.redirect_suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {result.redirect_suggestions.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggestionClick(s)}
                className="as-btn as-btn-sm as-btn-secondary"
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
