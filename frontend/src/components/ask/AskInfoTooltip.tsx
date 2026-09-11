import { useId, useState } from 'react'
import { Info } from 'lucide-react'

// Small transparency element for Ask AlphaSwarm: not a new capability, just
// disclosure of the existing pipeline (retrieval -> validation -> grounded
// narration) already implemented in the backend. Hover- and focus-triggered
// so it's reachable by mouse and keyboard alike; a plain <details> element
// would also work but doesn't give the same "unobtrusive until asked for"
// affordance a small popover does.
export default function AskInfoTooltip() {
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
        <Info className="w-3.5 h-3.5 shrink-0" />
        How is this information collected?
      </button>

      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 rounded-xl border border-brand-border/60 bg-brand-card p-3 shadow-lg text-left"
        >
          <p className="text-[11px] font-semibold text-brand-fg mb-1.5">How information is collected</p>
          <p className="text-[11px] text-brand-muted-fg leading-relaxed">
            Ask AlphaSwarm does not rely on the AI's memory alone. Depending on your
            question, information may come from AlphaSwarm's stored analysis and
            asset data, its methodology/glossary, approved authoritative educational
            sources, or verified live-data sources where available.
          </p>
          <p className="text-[11px] text-brand-muted-fg leading-relaxed mt-1.5">
            Sources are validated against AlphaSwarm's approved-source rules before
            being handed to the AI for narration — it explains the retrieved
            information rather than independently choosing an unapproved website.
          </p>
        </div>
      )}
    </span>
  )
}
