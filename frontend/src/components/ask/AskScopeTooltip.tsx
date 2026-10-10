import { useId, useState } from 'react'
import { HelpCircle } from 'lucide-react'

// Scope disclosure for Ask AlphaSwarm: tells the user what kinds of
// questions actually resolve, so they aren't left guessing after an
// "I'm not sure what you mean" response to a question outside the
// assistant's supported intents (specific assets, their own watchlist/
// analysis, comparisons, investing concepts, platform methodology, and —
// where enabled — individual funds). Mirrors AskInfoTooltip's hover/focus
// popover pattern so the two sit together as a matched pair.
export default function AskScopeTooltip() {
  const [open, setOpen] = useState(false)
  const tooltipId = useId()

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-describedby={tooltipId}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center gap-1 text-[11px] text-brand-muted-fg hover:text-brand-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5 shrink-0" />
        What can I ask?
      </button>

      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 rounded-xl border border-brand-border/60 bg-brand-card p-3 shadow-lg text-left"
        >
          <p className="text-[11px] font-bold text-brand-fg mb-1.5">Ask AlphaSwarm can answer</p>
          <ul className="text-[11px] text-brand-fg leading-relaxed list-disc pl-4 space-y-1">
            <li>A specific stock — "Tell me about NVDA", "What's AAPL's RSI?"</li>
            <li>Your watchlist or latest analysis run</li>
            <li>Comparing assets you're tracking</li>
            <li>Investing/finance concepts — "What is beta?", "What's a TFSA?"</li>
            <li>A specific fund, where the fund catalogue is enabled</li>
            <li>How AlphaSwarm's own ranking and data work</li>
          </ul>
          <p className="text-[11px] font-medium text-brand-fg leading-relaxed mt-2">
            It won't predict prices, pick what to buy/sell, or give personalised
            financial advice — and it only knows about assets and funds already
            in AlphaSwarm's own data.
          </p>
        </div>
      )}
    </span>
  )
}
