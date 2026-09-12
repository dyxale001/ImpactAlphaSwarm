import { BrainCircuit } from "lucide-react";
import { useQuantTrace } from "../../hooks/useQuantTrace";
import { conversionNote } from "./quantSeries";
import {
  QUANT_HORIZON_LABELS,
  QUANT_TRACE_DISCLOSURE,
  type QuantHorizon,
} from "../../data/quantExplainers";

// The Quant tab's own reasoning trace: the written account of one window.
//
// D-125 gives each tab a trace of its own, and this is the quant one. It sits at the top
// of the tab, where the ranking tab's trace sits, and takes the reasoning-trace boxes'
// own styling (the neon-lime border and the forest-toned ground) so a paragraph about
// the price window reads as the same kind of object as the paragraph about the ranking:
// an AI-written account of the run, framed the same way wherever it appears.
//
// Two things it says about itself, always. Which horizon it describes, because the same
// ticker has four of these and a reader switching between them needs the heading to
// move with the chart. And who wrote it: a model, checked against the figures it was
// given, or the deterministic template that stands in when the model could not. A
// templated paragraph passed off as a written one is the one thing this panel could get
// seriously wrong.

interface Props {
  ticker: string;
  horizon: QuantHorizon;
  /** Whether the tab is showing. The paragraph is fetched only while it is. */
  active: boolean;
}

export function QuantTracePanel({ ticker, horizon, active }: Props) {
  const { trace, isLoading, error } = useQuantTrace(ticker, horizon, active);

  // Off for this deployment: say nothing at all rather than an empty box. The chart
  // under it already explains that the historical view is not enabled.
  if (trace && !trace.available) return null;

  const source = trace?.source ?? null;
  // The paragraph states its own currency, but a reader skimming to the numbers may
  // miss the sentence, so the panel says it again in small type under the paragraph.
  const listing = trace?.listing_currency ?? "";
  const shownIn = trace?.currency ?? "";
  const note = trace?.trace
    ? conversionNote(listing, shownIn, trace?.fx_rate ?? null, Boolean(listing) && listing !== shownIn)
    : null;

  return (
    <div className="rounded-2xl border border-brand-accent bg-brand-bg/55 p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h4 className="text-sm font-semibold text-brand-fg">
          What the price did over {QUANT_HORIZON_LABELS[horizon]}
        </h4>
        {source && (
          <span
            className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand-accent text-brand-primary font-semibold"
            title={
              source === "model"
                ? "Written by a language model from the window's figures, then checked: every number in it appears in those figures, and advice or forward-looking wording fails it."
                : "The model could not be used for this window, so this paragraph was assembled from the same figures by a fixed template."
            }
          >
            {source === "model" ? "AI written, checked" : "From template"}
          </span>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-brand-border/60 bg-brand-surface/70 p-3">
        <div className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-2 flex items-center gap-1.5">
          <BrainCircuit className="w-3 h-3 text-brand-primary" />
          Reasoning trace
        </div>
        {isLoading || (!trace && !error) ? (
          <Skeleton />
        ) : error ? (
          <p className="text-sm text-brand-muted-fg italic">{error}</p>
        ) : trace?.trace ? (
          <>
            <p className="text-sm text-brand-fg leading-relaxed">{trace.trace}</p>
            {/* Said plainly, once, and never in a tone that asks to be trusted. */}
            <p className="text-[10px] text-brand-muted-fg mt-2">
              {note ? `${note} ` : ""}
              {QUANT_TRACE_DISCLOSURE}
            </p>
          </>
        ) : (
          <p className="text-sm text-brand-muted-fg italic">
            No written summary for this window yet.
          </p>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse" aria-label="Loading the written summary">
      <div className="h-3 rounded bg-brand-muted/15" />
      <div className="h-3 rounded bg-brand-muted/15" />
      <div className="h-3 rounded bg-brand-muted/15 w-4/5" />
    </div>
  );
}
