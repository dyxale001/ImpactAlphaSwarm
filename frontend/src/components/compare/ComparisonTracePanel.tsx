import type { ReactNode } from "react";
import { BrainCircuit, Sparkles } from "lucide-react";
import { useComparisonTrace, type TraceKind } from "../../hooks/useComparisonTrace";
import {
  TRACE_BUTTON,
  TRACE_DISCLOSURE,
  TRACE_DISCLOSURE_FUNDS,
  TRACE_DISCLOSURE_FUNDS_NO_PROFILE,
  TRACE_DISCLOSURE_PRICES,
  TRACE_INVITE,
  TRACE_INVITE_FUNDS,
  TRACE_INVITE_NO_RUN,
  TRACE_TITLE,
  TRACE_WRITING,
  traceFromRun,
} from "../../data/compareCopy";
import type { QuantHorizon } from "../../data/quantExplainers";
import { formatFullDate } from "../research/quantSeries";

// "What separates these": the written comparison, at the top of the page, in the
// reasoning-trace box the Quant tab uses (lime edge, forest-toned ground, the
// "Reasoning trace" label), so a paragraph about a comparison reads as the same
// kind of object as the paragraph about one stock.
//
// Personal and on request. Until the reader presses the button the panel says
// what they would get; the rows below and the template under "Your analysis"
// explain the page meanwhile, so nothing goes unexplained for a reader who never
// presses it. A paragraph the reader already asked for is shown straight away for
// as long as it still describes the page.
//
// It says who wrote it every time: the model, checked, or the template that
// stands in. And it hides entirely when the deployment has the feature off.

function localDay(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return timestamp;
  const pad = (n: number) => String(n).padStart(2, "0");
  return formatFullDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}

export default function ComparisonTracePanel({
  kind = "stocks",
  ids,
  horizon = null,
  hasRun,
  followUp,
}: {
  kind?: TraceKind;
  /** Tickers for stocks, fund ids for funds, in the order picked. */
  ids: string[];
  /** The price window; stocks only. */
  horizon?: QuantHorizon | null;
  /** Whether the reader has a completed run, for what the invitation promises. */
  hasRun: boolean;
  /** The Ask AlphaSwarm button, offered once there is a paragraph to follow up on. */
  followUp?: ReactNode;
}) {
  const { trace, isLoading, isWriting, error, explain } = useComparisonTrace(kind, ids, horizon);
  const funds = kind === "funds";
  if (trace && !trace.available) return null;

  const text = trace?.trace ?? null;
  const source = text ? trace?.source ?? null : null;

  return (
    <section
      className="rounded-2xl border border-brand-accent bg-brand-bg/55 p-3 sm:p-4"
      aria-live="polite"
      aria-busy={isLoading || isWriting}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-brand-fg">{TRACE_TITLE}</h2>
          {source && (
            <span
              className="rounded-full bg-brand-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-primary"
              title={
                source === "model"
                  ? "Written by a language model from the figures on this page, then checked: every number in it appears in those figures, every stock is named, and verdict, advice or suitability wording fails it."
                  : "The model could not be used just now, so this paragraph was assembled from the same figures by a fixed template."
              }
            >
              {source === "model" ? "AI written, checked" : "From template"}
            </span>
          )}
        </div>
        {text && followUp}
      </div>

      <div className="mt-3 rounded-xl border border-brand-border/60 bg-brand-surface/70 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
          <BrainCircuit className="h-3 w-3 text-brand-primary" />
          Reasoning trace
        </div>

        {isLoading || isWriting ? (
          <div className="space-y-2" aria-label={isWriting ? TRACE_WRITING : "Loading"}>
            {isWriting && <p className="text-xs font-semibold text-brand-muted-fg">{TRACE_WRITING}</p>}
            <div className="space-y-2 animate-pulse">
              <div className="h-3 rounded bg-brand-muted/15" />
              <div className="h-3 rounded bg-brand-muted/15" />
              <div className="h-3 w-3/5 rounded bg-brand-muted/15" />
            </div>
          </div>
        ) : text ? (
          <>
            <p className="text-sm leading-relaxed text-brand-fg">{text}</p>
            <p className="mt-2 text-[10px] text-brand-muted-fg">
              {!funds && trace?.personal && trace.run_at ? `${traceFromRun(localDay(trace.run_at))}. ` : ""}
              {funds
                ? trace?.personal
                  ? TRACE_DISCLOSURE_FUNDS
                  : TRACE_DISCLOSURE_FUNDS_NO_PROFILE
                : trace?.personal
                  ? TRACE_DISCLOSURE
                  : TRACE_DISCLOSURE_PRICES}
            </p>
          </>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex-1 text-sm leading-relaxed text-brand-muted-fg">
              {funds ? TRACE_INVITE_FUNDS : hasRun ? TRACE_INVITE : TRACE_INVITE_NO_RUN}
            </p>
            <button
              type="button"
              onClick={explain}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-brand-bg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            >
              <Sparkles className="h-3.5 w-3.5 text-brand-accent" />
              {TRACE_BUTTON}
            </button>
          </div>
        )}
        {error && !isWriting && <p className="mt-2 text-xs text-brand-muted-fg">{error}</p>}
      </div>
    </section>
  );
}
