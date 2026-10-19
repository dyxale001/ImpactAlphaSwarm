import { useRef, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import PageExplanationDialog from '../guidance/PageExplanationDialog'

// "What can I ask?": one button that opens the shared explanation window with
// what Ask AlphaSwarm can answer, what it won't do, and how its information is
// collected. It replaces the two hover tooltips that sat under the composer, which
// could not be opened on a phone. The wording is theirs, unchanged.
export default function AskHelp({ onDark = false, className = '' }: { onDark?: boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const navigatingRef = useRef(false)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={onDark
          ? `as-btn as-btn-sm as-btn-ghost-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${className}`
          : `inline-flex items-center gap-1 text-xs font-semibold text-brand-muted-fg hover:text-forest-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary ${className}`}
      >
        <HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        What can I ask?
      </button>
      {open && (
        <PageExplanationDialog title="What can I ask?" eyebrow="Ask AlphaSwarm" onClose={() => setOpen(false)} triggerRef={triggerRef} navigatingRef={navigatingRef}>
          <section className="flex flex-col gap-3">
            <h3 className="text-base font-bold tracking-[-0.01em] text-forest-900">Ask AlphaSwarm can answer</h3>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-forest-900">
              <li>A specific stock — "Tell me about NVDA", "What's AAPL's RSI?"</li>
              <li>Your watchlist or latest analysis run</li>
              <li>Comparing assets you're tracking</li>
              <li>Investing/finance concepts — "What is beta?", "What's a TFSA?"</li>
              <li>A specific fund, where the fund catalogue is enabled</li>
              <li>How AlphaSwarm's own ranking and data work</li>
            </ul>
            <p className="text-sm leading-relaxed text-brand-muted-fg">
              It won't predict prices, pick what to buy/sell, or give personalised
              financial advice — and it only knows about assets and funds already
              in AlphaSwarm's own data.
            </p>
          </section>
          <section className="flex flex-col gap-3">
            <h3 className="text-base font-bold tracking-[-0.01em] text-forest-900">How information is collected</h3>
            <p className="text-sm leading-relaxed text-brand-muted-fg">
              Ask AlphaSwarm does not rely on the AI's memory alone. Depending on your
              question, information may come from AlphaSwarm's stored analysis and
              stock data, its methodology/glossary, approved authoritative educational
              sources, or verified live-data sources where available.
            </p>
            <p className="text-sm leading-relaxed text-brand-muted-fg">
              Sources are validated against AlphaSwarm's approved-source rules before
              being handed to the AI for narration — it explains the retrieved
              information rather than independently choosing an unapproved website.
            </p>
          </section>
        </PageExplanationDialog>
      )}
    </>
  )
}
