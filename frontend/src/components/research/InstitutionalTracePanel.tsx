import { BrainCircuit } from "lucide-react";
import { useInstitutionalTrace } from "../../hooks/useInstitutionalTrace";
import { filingAge, formatDate } from "./whaleFormat";

// The written account of the Big investors tab, laid out exactly like the Sentiment
// tab's day summary (DaySummaryPanel): a heading naming what it describes, a line of
// the figures it was written from, then the AI summary box with one paragraph and a
// footnote saying who wrote it.
//
// The figures along the top are the ones the tiles above already show, passed in
// rather than refetched, so the header cannot disagree with them. Only the prose is
// fetched here.
//
// The paragraph is generated from the filing and checked before it is stored. It ends
// with a "So this means" sentence saying what the reader can look into next, never what
// to do with the shares.

interface Props {
  ticker: string;
  /** Fractions, as the ownership endpoint returns them (0.863 is 86.3%). */
  institutionsPct: number | null;
  institutionsCount: number | null;
  insidersPct: number | null;
}

export function InstitutionalTracePanel({
  ticker,
  institutionsPct,
  institutionsCount,
  insidersPct,
}: Props) {
  const { trace, isLoading, error } = useInstitutionalTrace(ticker);

  // Off for this deployment: no box at all rather than an empty one.
  if (trace && !trace.enabled) return null;

  const age = filingAge(trace?.as_of ?? null);
  const templated = trace?.source === "template";

  return (
    // The neon lime border and forest toned ground are the reasoning trace boxes' own
    // styling, the same frame the day summary and the Quant trace use.
    <div className="rounded-2xl border border-brand-accent bg-brand-bg/55 p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-brand-fg">
            {trace?.as_of
              ? `Holdings as of ${formatDate(trace.as_of)}`
              : "Latest 13F filing"}
          </h4>
          {age && (
            <span
              className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand-primary text-white font-semibold"
              title="Funds report once a quarter, up to 45 days after it ends, so they may have traded since."
            >
              {age}
            </span>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand-accent text-brand-primary font-semibold">
          13F filing
        </span>
      </div>

      <p className="text-[11px] text-brand-muted-fg mt-1">
        <FilingFigures
          institutionsPct={institutionsPct}
          institutionsCount={institutionsCount}
          insidersPct={insidersPct}
        />
      </p>

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
              {templated
                ? "Assembled from this stock's latest 13F filing by a fixed template, because the AI summary could not be written. It describes who reported owning the stock, not the share price."
                : "Written by AI from this stock's latest 13F filing. It describes who reported owning the stock, not the share price."}
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

// The filing's headline figures, in the order the tiles above show them.
function FilingFigures({
  institutionsPct,
  institutionsCount,
  insidersPct,
}: Omit<Props, "ticker">) {
  const parts: string[] = [];
  if (institutionsPct != null) {
    parts.push(`${(institutionsPct * 100).toFixed(1)}% held by institutions`);
  }
  if (institutionsCount != null) {
    parts.push(
      `${institutionsCount.toLocaleString("en-US")} ${institutionsCount === 1 ? "institution" : "institutions"}`,
    );
  }
  if (insidersPct != null) {
    parts.push(`insiders ${(insidersPct * 100).toFixed(1)}%`);
  }
  if (!parts.length) return <>No headline figures in this filing.</>;
  return <>{parts.join(" · ")}</>;
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
