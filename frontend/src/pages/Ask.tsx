import { useEffect, useRef } from 'react'
import { useAskAlphaSwarm } from '../hooks/useAskAlphaSwarm'
import AskLandingCards from '../components/ask/AskLandingCards'
import AskAnswerCard, { AskThinking } from '../components/ask/AskAnswerCard'
import AskComposer from '../components/ask/AskComposer'
import AskHelp from '../components/ask/AskHelp'
import LearnPopover from '../components/learning/LearnPopover'
import AskMascot from '../components/ask/AskMascot'

export default function AskAlphaSwarmPage() {
  const { turns, query, setQuery, pendingQuestion, loading, error, ask, reset } = useAskAlphaSwarm()
  const hasHistory = turns.length > 0
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length, pendingQuestion])

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-7xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      {/* ── Header ──
          The hub header every page uses. "What can I ask?" opens the scope and
          how-it-works notes in the shared window; the book button holds any
          lessons for this page. */}
      <div className="hero-card px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* The mascot beside the title, in place of the sparkle icon. It reacts to
              the conversation below: typing, thinking, and a hop for each answer. */}
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <AskMascot size={84} state={loading ? 'thinking' : query.trim() ? 'typing' : 'idle'} answers={turns.length} className="h-14 w-14 sm:h-[84px] sm:w-[84px]" />
            <div className="min-w-0">
              <p className="band-eyebrow mb-2">Questions about your data</p>
              <h1 className="text-2xl font-bold tracking-[-0.02em] text-brand-bg lg:text-3xl">
                Ask AlphaSwarm
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-bg/75">
                Ask about your results, the stocks and funds we cover, or what a term means. Answers
                explain; they never tell you what to buy.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start">
            <LearnPopover context="ask" onDark />
            <AskHelp onDark />
          </div>
        </div>
      </div>

      {/* The conversation at reading width, centred under the header. */}
      <div className="mx-auto mt-6 flex w-full max-w-3xl flex-1 flex-col">
        <div className="flex-1 space-y-6">
          {!hasHistory && !loading ? (
            <AskLandingCards onSelect={setQuery} />
          ) : (
            <div className="space-y-6">
              {turns.map(turn => (
                <AskAnswerCard key={turn.id} turn={turn} onSuggestionClick={q => ask(q)} />
              ))}
              {loading && pendingQuestion && <AskThinking question={pendingQuestion} />}
              <div ref={bottomRef} />
            </div>
          )}

          {error && (
            <div className="rounded-[12px] bg-down-bg p-3 text-sm text-down" role="alert">
              {error}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="sticky bottom-0 mt-6 bg-brand-bg pb-1 pt-4">
          <AskComposer query={query} setQuery={setQuery} loading={loading} onAsk={() => ask()} onClear={hasHistory ? reset : undefined} />
        </div>
      </div>
    </div>
  )
}
