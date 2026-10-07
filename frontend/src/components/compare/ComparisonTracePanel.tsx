import type { ReactNode } from "react";
import { BrainCircuit } from "lucide-react";
import { useComparisonTrace } from "../../hooks/useComparisonTrace";
import { TRACE_DISCLOSURE, TRACE_EMPTY, TRACE_TITLE } from "../../data/compareCopy";
import type { QuantHorizon } from "../../data/quantExplainers";

// "What separates these": the written comparison, in the reasoning-trace box the
// Quant tab uses (lime edge, forest-toned ground, the "Reasoning trace" label),
// so a paragraph about a comparison reads as the same kind of object as the
// paragraph about one stock.
//
// It says who wrote it every time: the model, checked, or the template that
// stands in. And it hides entirely when the deployment has the feature off,
// rather than showing an empty box; the row notes still explain every row.

export default function ComparisonTracePanel({
  tickers,
  horizon,
  action,
}: {
  tickers: string[];
  horizon: QuantHorizon;
  /** The Ask AlphaSwarm button, set in the panel's header. */
  action?: ReactNode;
}) {
  const { trace, isLoading, error } = useComparisonTrace(tickers, horizon);
  if (trace && !trace.available) return null;

  const source = trace?.source ?? null;

  return (
    <section className="rounded-2xl border border-brand-accent bg-brand-bg/55 p-3 sm:p-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-brand-fg">{TRACE_TITLE}</h2>
          {source && (
            <span
              className="rounded-full bg-brand-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-primary"
              title={
                source === "model"
                  ? "Written by a language model from the figures below, then checked: every number in it appears in those figures, every stock is named, and verdict or advice wording fails it."
                  : "The model could not be used for these stocks, so this paragraph was assembled from the same figures by a fixed template."
              }
            >
              {source === "model" ? "AI written, checked" : "From template"}
            </span>
          )}
        </div>
        {action}
      </div>

      <div className="mt-3 rounded-xl border border-brand-border/60 bg-brand-surface/70 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
          <BrainCircuit className="h-3 w-3 text-brand-primary" />
          Reasoning trace
        </div>
        {isLoading || (!trace && !error) ? (
          <div className="space-y-2 animate-pulse" aria-label="Writing the comparison">
            <div className="h-3 rounded bg-brand-muted/15" />
            <div className="h-3 rounded bg-brand-muted/15" />
            <div className="h-3 w-3/5 rounded bg-brand-muted/15" />
          </div>
        ) : error ? (
          <p className="text-sm italic text-brand-muted-fg">{error}</p>
        ) : trace?.trace ? (
          <>
            <p className="max-w-3xl text-sm leading-relaxed text-brand-fg">{trace.trace}</p>
            <p className="mt-2 text-[10px] text-brand-muted-fg">{TRACE_DISCLOSURE}</p>
          </>
        ) : (
          <p className="text-sm italic text-brand-muted-fg">{TRACE_EMPTY}</p>
        )}
      </div>
    </section>
  );
}
