import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
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
  /** The figures line, from data the tab already has, so it cannot disagree with it.
   *  Left out where the same figures already sit in tiles right above the box. */
  figures?: ReactNode;
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
    // The soft box with the lime Sparkles mark that every AI-written paragraph on the
    // stock page uses: the reasoning trace, the day summary and the Quant trace.
    <div className="as-inset p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-forest-900">
          <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-lime-500 text-forest-800">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          {trace?.as_of
            ? `${headingPrefix} ${formatDate(trace.as_of)}`
            : fallbackHeading}
          {age && (
            <span className="chip chip-dark" title={ageTitle}>
              {age}
            </span>
          )}
        </p>
        <span className="chip chip-accent">{badge}</span>
      </div>

      {figures ? <p className="mt-1 text-xs text-brand-muted-fg">{figures}</p> : null}

      <div className="mt-3">
        {isLoading ? (
          <Skeleton />
        ) : error ? (
          <p className="text-sm text-brand-muted-fg italic">{error}</p>
        ) : trace?.trace ? (
          <>
            <p className="text-sm text-forest-900 leading-relaxed">{trace.trace}</p>
            <p className="mt-2 text-xs leading-relaxed text-brand-muted-fg">
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
