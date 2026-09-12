import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Sparkles, X, Send, Loader2 } from 'lucide-react'
import { useAskAlphaSwarm } from '../../hooks/useAskAlphaSwarm'
import { useAskChatbotStore } from '../../store/askChatbotStore'
import AskAnswerCard from '../ask/AskAnswerCard'

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
          className="mb-3 flex flex-col w-[calc(100vw-2rem)] max-w-sm h-[min(32rem,calc(100dvh-7rem))] sm:w-96 rounded-2xl border border-brand-border/60 bg-brand-card shadow-2xl overflow-hidden"
          style={{ animation: 'slide-up 0.2s ease-out forwards' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-brand-border/50 bg-brand-bg/40 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 shrink-0 text-brand-primary" />
              <p className="text-sm font-bold text-brand-fg truncate">Ask AlphaSwarm</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {hasHistory && (
                <button
                  type="button"
                  onClick={reset}
                  className="px-2 py-1 rounded-full text-[11px] font-semibold text-brand-muted-fg hover:text-brand-fg hover:bg-brand-bg/60 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close Ask AlphaSwarm"
                className="p-1.5 rounded-full text-brand-muted-fg hover:text-brand-fg hover:bg-brand-bg/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {!hasHistory && !loading ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-6">
                <Sparkles className="w-6 h-6 text-brand-primary" />
                <p className="text-sm font-semibold text-brand-fg">Ask AlphaSwarm anything</p>
                <p className="text-xs text-brand-muted-fg max-w-[15rem]">
                  Ask about an asset, your watchlist, or how AlphaSwarm's analysis works.
                </p>
              </div>
            ) : (
              <>
                {turns.map(turn => (
                  <AskAnswerCard key={turn.id} turn={turn} onSuggestionClick={q => ask(q)} />
                ))}
                {loading && pendingQuestion && (
                  <div className="flex items-center gap-2 text-xs text-brand-muted-fg">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Thinking about "{pendingQuestion}"…
                  </div>
                )}
              </>
            )}
            {error && (
              <div className="p-2.5 rounded-lg bg-semantic-danger/10 border border-semantic-danger/20 text-semantic-danger text-xs">
                {error}
              </div>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-3 border-t border-brand-border/50 shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ask AlphaSwarm…"
              aria-label="Ask AlphaSwarm a question"
              className="flex-1 rounded-full border border-brand-border/60 bg-brand-bg px-3.5 py-2 text-sm text-brand-fg placeholder:text-brand-muted-fg focus:outline-none focus:border-brand-primary/50 transition-colors"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              aria-label="Send"
              className="shrink-0 p-2.5 rounded-full bg-brand-primary text-brand-bg disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 transition-all"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      )}

      {/* Floating trigger */}
      <div className="relative group flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Close Ask AlphaSwarm' : 'Ask AlphaSwarm'}
          aria-expanded={open}
          className="w-14 h-14 rounded-full bg-brand-primary text-brand-bg shadow-xl flex items-center justify-center hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary transition-all"
        >
          {open ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
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
