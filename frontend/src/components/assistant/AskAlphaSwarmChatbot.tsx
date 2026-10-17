import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowUpRight, Sparkles, X, Send, Loader2 } from 'lucide-react'
import { useAskAlphaSwarm } from '../../hooks/useAskAlphaSwarm'
import { useAskChatbotStore } from '../../store/askChatbotStore'
import AskAnswerCard, { AskThinking } from '../ask/AskAnswerCard'
import AskHelp from '../ask/AskHelp'
import AskMascot from '../ask/AskMascot'

// Mirrors the backend's own _ASK_REDIRECT_SUGGESTIONS (api.py) — same
// three example questions shown wherever Ask AlphaSwarm has nothing to
// show yet, so a new user sees one consistent set of starting points
// rather than a different list depending on which entry point they used.
const SUGGESTED_QUESTIONS = [
  'Compare AAPL and GOOGL',
  'Tell me about NVDA',
  'How does AlphaSwarm work?',
]

/**
 * Global floating Ask AlphaSwarm assistant, mounted once at the layout
 * level (see AppLayout.tsx) so it's available on every authenticated page
 * without per-page wiring. Deliberately a thin client over the SAME
 * pipeline the full /ask page uses — useAskAlphaSwarm (context tracking,
 * conversation persistence, error mapping) and AskAnswerCard (narration +
 * source/provenance rendering) are reused as-is, not reimplemented. Hidden
 * on /ask itself, since that page already IS the full chat experience —
 * showing a second floating entry point there would just be a duplicate.
 */
export default function AskAlphaSwarmChatbot() {
  const location = useLocation()
  const open = useAskChatbotStore(s => s.open)
  const setOpen = useAskChatbotStore(s => s.setOpen)
  // Subscribed directly (not read only inside the effect below) so the
  // effect's dependency array sees every NEW prompt, including the case
  // where the panel is already open and a second "Ask AlphaSwarm about
  // this" button is clicked without closing it first — depending on `open`
  // alone missed that case, since `open` stays `true` and the effect never
  // re-fires.
  const pendingPrompt = useAskChatbotStore(s => s.pendingPrompt)
  const consumePendingPrompt = useAskChatbotStore(s => s.consumePendingPrompt)
  const { turns, query, setQuery, pendingQuestion, loading, error, ask, reset } = useAskAlphaSwarm()
  const messagesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // A prompt handed over by e.g. the Assets page's "Ask AlphaSwarm about
  // this" button — pre-fills the composer only, exactly like
  // AskLandingCards' onSelect={setQuery} already does on the full /ask
  // page. Never auto-submits: the user still presses Send, so this goes
  // through the identical pipeline as typing the question by hand.
  useEffect(() => {
    if (pendingPrompt === null) return
    const prompt = consumePendingPrompt()
    if (prompt) setQuery(prompt)
  }, [pendingPrompt, consumePendingPrompt, setQuery])

  useEffect(() => {
    if (!open) return
    let reduceMotion = false
    try {
      reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch { /* fall back to instant */ }
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [open, turns.length, pendingQuestion])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Esc closes the panel — standard for a floating overlay, and the only
  // extra keyboard affordance needed since focus order otherwise already
  // flows naturally (button -> panel controls -> input).
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (location.pathname === '/ask') return null

  const hasHistory = turns.length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!loading) ask()
  }

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[100]">
      {open && (
        <div
          role="dialog"
          aria-label="Ask AlphaSwarm assistant"
          // D-212 asked that the panel not get "lost" on busy pages. A 1px solid forest
          // outline, a deep shadow and the tinted header keep it distinct without the
          // heavy 2px frame.
          className="relative mb-3 flex h-[min(34rem,calc(100dvh-7rem))] w-[calc(100vw-2rem)] max-w-sm flex-col rounded-[20px] border border-forest-700 bg-white shadow-[0_24px_60px_-12px_rgba(16,34,30,0.45),0_8px_20px_-8px_rgba(16,34,30,0.25)] sm:w-[26rem]"
          style={{ animation: 'slide-up 0.2s ease-out forwards' }}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-2 rounded-t-[19px] border-b border-forest-900/8 bg-forest-50 py-3 pl-16 pr-3">
            {/* The mascot marks the panel, so the title needs no icon of its own. */}
            <p className="min-w-0 truncate text-sm font-bold text-forest-900">Ask AlphaSwarm</p>
            <div className="flex shrink-0 items-center gap-1">
              <Link to="/ask" onClick={() => setOpen(false)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold text-forest-700 hover:bg-white hover:underline">
                Full page<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              {hasHistory && (
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-full px-2 py-1 text-xs font-semibold text-brand-muted-fg transition-colors hover:bg-white hover:text-forest-900"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close Ask AlphaSwarm"
                className="rounded-full p-1.5 text-brand-muted-fg transition-colors hover:bg-white hover:text-forest-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* The mascot sits on the panel's top-left corner, so it reads as ON the
              card rather than inside the conversation. The panel must NOT clip
              (hence no overflow-hidden, and the header carrying its own rounded
              top), and the header's left padding keeps the title clear of it.
              It glances down while you type, looks up while an answer is being
              written, and hops when one arrives. */}
          <div className="pointer-events-none absolute -left-4 -top-8 z-10">
            <AskMascot size={76} state={loading ? 'thinking' : query.trim() ? 'typing' : 'idle'} answers={turns.length} />
          </div>

          {/* Messages */}
          <div ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {!hasHistory && !loading ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-6 text-center">
                <p className="text-base font-bold text-forest-900">Ask AlphaSwarm anything</p>
                <p className="max-w-[16rem] text-sm text-brand-muted-fg">
                  Ask about a stock, your watchlist, or how AlphaSwarm's analysis works.
                </p>
                <div className="flex flex-col items-center gap-1.5 w-full pt-1">
                  {SUGGESTED_QUESTIONS.map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => ask(q)}
                      className="as-btn as-btn-sm as-btn-secondary w-full"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {turns.map(turn => (
                  <AskAnswerCard key={turn.id} turn={turn} onSuggestionClick={q => ask(q)} />
                ))}
                {loading && pendingQuestion && <AskThinking question={pendingQuestion} />}
              </>
            )}
            {error && (
              <div className="rounded-[12px] bg-down-bg p-2.5 text-xs text-down" role="alert">
                {error}
              </div>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={handleSubmit} className="flex shrink-0 items-center gap-2 border-t border-forest-900/8 px-3 py-3">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ask AlphaSwarm…"
              aria-label="Ask AlphaSwarm a question"
              className="h-10 min-w-0 flex-1 rounded-full border border-forest-900/15 bg-white px-3.5 text-sm text-forest-900 transition-colors placeholder:text-forest-400 hover:border-forest-900/30 focus:border-forest-700 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              aria-label="Send"
              className="as-btn as-btn-primary h-10 w-10 shrink-0 p-0"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
          <div className="flex items-center justify-center pb-2 px-3 shrink-0">
            <AskHelp />
          </div>
        </div>
      )}

      {/* Floating trigger */}
      <div className="relative group flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          data-spotlight="floating-assistant"
          aria-label={open ? 'Close Ask AlphaSwarm' : 'Ask AlphaSwarm'}
          aria-expanded={open}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-brand-primary text-brand-bg shadow-xl border-2 border-brand-bg ring-2 ring-brand-primary/50 flex items-center justify-center hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary transition-all"
        >
          {open
            ? <X className="w-5 h-5 sm:w-6 sm:h-6" />
            : <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>
        {!open && (
          <div className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute right-0 bottom-full mb-2 z-50">
            <div className="bg-brand-fg text-brand-bg text-xs rounded-md px-2.5 py-1.5 shadow-lg border border-brand-border whitespace-nowrap">
              Ask AlphaSwarm
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
