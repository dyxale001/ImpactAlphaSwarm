import { BrainCircuit, Sparkles } from "lucide-react";
import { useFundTrace } from "../../hooks/useFundTrace";
import {
  FUND_TRACE_BADGE_MODEL,
  FUND_TRACE_BADGE_TEMPLATE,
  FUND_TRACE_BUTTON,
  FUND_TRACE_DISCLOSURE,
  FUND_TRACE_DISCLOSURE_NO_PROFILE,
  FUND_TRACE_INVITE,
  FUND_TRACE_LABEL,
  FUND_TRACE_MODEL_NOTE,
  FUND_TRACE_TEMPLATE_NOTE,
  FUND_TRACE_TITLE,
  FUND_TRACE_WRITING,
} from "../../utils/fundsCopy";

// "This fund and your profile": one fund's reasoning trace, above the fund
// page's tabs, in the same reasoning-trace box the Compare page and the Quant tab
// use (lime edge, forest-toned ground, the "Reasoning trace" label), so a
// paragraph about one fund reads as the same kind of object as the paragraph
// about a comparison.
//
// Personal and written on command. Until the reader presses the button the panel
// says what they would get; the tabs below explain the fund meanwhile, so nothing
// goes unexplained for a reader who never presses it. Nothing is stored: the
// paragraph lasts until the reader leaves the page.
//
// It says who wrote it every time: the model, checked, or the template that
// stands in. The text runs the full width of the card, and the card grows to
// hold however much there is.

export default function FundTracePanel({ fundId }: { fundId: string }) {
  const { trace, isWriting, error, explain } = useFundTrace(fundId);
  // Only an answer saying the feature is off hides the panel.
  if (trace && !trace.available) return null;

  const text = trace?.trace ?? null;
  const source = text ? trace?.source ?? null : null;

  return (
    <section
      className="rounded-2xl border border-brand-accent bg-brand-bg/55 p-3 sm:p-4"
      aria-live="polite"
      aria-busy={isWriting}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-brand-fg">{FUND_TRACE_TITLE}</h2>
        {source && (
          <span
            className="rounded-full bg-brand-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-primary"
            title={source === "model" ? FUND_TRACE_MODEL_NOTE : FUND_TRACE_TEMPLATE_NOTE}
          >
            {source === "model" ? FUND_TRACE_BADGE_MODEL : FUND_TRACE_BADGE_TEMPLATE}
          </span>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-brand-border/60 bg-brand-surface/70 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-forest-500">
          <BrainCircuit className="h-3 w-3 text-brand-primary" />
          {FUND_TRACE_LABEL}
        </div>

        {isWriting ? (
          <div className="space-y-2" aria-label={FUND_TRACE_WRITING}>
            <p className="text-xs font-semibold text-forest-500">{FUND_TRACE_WRITING}</p>
            <div className="animate-pulse space-y-2">
              <div className="h-3 rounded bg-brand-muted/15" />
              <div className="h-3 rounded bg-brand-muted/15" />
              <div className="h-3 w-3/5 rounded bg-brand-muted/15" />
            </div>
          </div>
        ) : text ? (
          <>
            <p className="w-full whitespace-pre-line break-words text-sm leading-relaxed text-brand-fg">{text}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-forest-500">
              {trace?.personal ? FUND_TRACE_DISCLOSURE : FUND_TRACE_DISCLOSURE_NO_PROFILE}
            </p>
          </>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-forest-600">{FUND_TRACE_INVITE}</p>
            <button
              type="button"
              onClick={explain}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-brand-bg transition-opacity hover:opacity-90 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            >
              <Sparkles className="h-3.5 w-3.5 text-brand-accent" />
              {FUND_TRACE_BUTTON}
            </button>
          </div>
        )}
        {error && !isWriting && <p className="mt-2 text-xs text-forest-500">{error}</p>}
      </div>
    </section>
  );
}
