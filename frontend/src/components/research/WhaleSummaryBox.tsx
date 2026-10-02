import type { ReactNode } from "react";
import { BrainCircuit } from "lucide-react";
import type { WhaleTraceResponse } from "../../services/api/analysis";
import { filingAge, formatDate } from "./whaleFormat";

// The AI summary box both whale tabs use, laid out like the Sentiment tab's day summary
// (DaySummaryPanel): a heading naming what it describes, a line of the figures it was
// written from, then the AI summary with one paragraph and a footnote saying who wrote
// it. The tab supplies the words; the box is the same on both.

interface Props {
  trace: WhaleTraceResponse | null;
  isLoading: boolean;
  error: string | null;
  /** Prefixes the as-of date: "Holdings as of", "Dealings filed up to". */
  headingPrefix: string;
  /** Shown before the date is known. */
  fallbackHeading: string;
  /** Tooltip on the age badge, saying why the date matters. */
  ageTitle: string;
  /** The lime pill on the right, naming the source: "13F filing", "Form 4 filings". */
  badge: string;
  /** The figures line, from data the tab already has, so it cannot disagree with it. */
  figures: ReactNode;
  footnote: { model: string; template: string };
}

export function WhaleSummaryBox({
  trace,
  isLoading,
  error,
  headingPrefix,
  fallbackHeading,
  ageTitle,
  badge,
  figures,
  footnote,
}: Props) {
  // Off for this deployment: no box at all rather than an empty one.
  if (trace && !trace.enabled) return null;

  const age = filingAge(trace?.as_of ?? null);

  return (
    // The neon lime border and forest toned ground are the reasoning trace boxes' own
    // styling, the same frame the day summary and the Quant trace use.
    <div className="rounded-2xl border border-brand-accent bg-brand-bg/55 p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-brand-fg">
            {trace?.as_of
              ? `${headingPrefix} ${formatDate(trace.as_of)}`
              : fallbackHeading}
          </h4>
          {age && (
            <span
              className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand-primary text-white font-semibold"
              title={ageTitle}
            >
              {age}
            </span>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand-accent text-brand-primary font-semibold">
          {badge}
        </span>
      </div>

      <p className="text-[11px] text-brand-muted-fg mt-1">{figures}</p>

      {/* The AI summary box. The brain logo lives here rather than on the heading, so
          the machine-written prose is the thing marked as machine-written. */}
      <div className="mt-3 rounded-xl border border-brand-border/60 bg-brand-surface/70 p-3">
        <div className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-2 flex items-center gap-1.5">
          <BrainCircuit className="w-3 h-3 text-brand-primary" />
          AI summary
        </div>
        {isLoading ? (
          <Skeleton />
        ) : error ? (
          <p className="text-sm text-brand-muted-fg italic">{error}</p>
        ) : trace?.trace ? (
          <>
            <p className="text-sm text-brand-fg leading-relaxed">{trace.trace}</p>
            <p className="text-[10px] text-brand-muted-fg mt-2">
              {trace.source === "template" ? footnote.template : footnote.model}
            </p>
          </>
        ) : (
          <p className="text-sm text-brand-muted-fg italic">
            No summary for this stock yet.
          </p>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse" aria-label="Loading the summary">
      <div className="h-3 rounded bg-brand-muted/15" />
      <div className="h-3 rounded bg-brand-muted/15" />
      <div className="h-3 rounded bg-brand-muted/15 w-4/5" />
    </div>
  );
}
