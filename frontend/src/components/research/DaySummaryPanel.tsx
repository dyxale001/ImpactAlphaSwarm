import { BrainCircuit } from "lucide-react";
import { useDaySummary } from "../../hooks/useDaySummary";
import { dayLabel, todayKey } from "./sentimentDays";
import { sentimentVerdict } from "./sentimentDisplay";
import type { SentimentHistoryPoint } from "../../services/api/analysis";
import type { NewsDay } from "./newsDaily";

// The written account of one day on the trend chart.
//
// It sits on the light page rather than inside the chart's forest panel, unlike the
// tooltip. A tooltip is three numbers read in a glance and belongs on the ground it
// annotates; this is four or five sentences of prose, and prose is read, not glanced
// at. The dark ground that suits a chart is the wrong ground for a paragraph.
//
// The numbers along the top are the same ones the bar above was drawn from, passed in
// rather than refetched, so the header cannot disagree with the chart. Only the prose
// is fetched here.

interface Props {
  ticker: string;
  /** The selected day, YYYY-MM-DD, or null when nothing is selected. */
  day: string | null;
  /** That day's social point, for the header figures. */
  point?: SentimentHistoryPoint;
  /** That day's news, when the chart has a news series. */
  newsDay?: NewsDay;
}

export function DaySummaryPanel({ ticker, day, point, newsDay }: Props) {
  const { summary, isLoading, error } = useDaySummary(ticker, day);

  if (!day) return null;

  const verdict = sentimentVerdict(point?.score ?? null);
  // The panel says "so far today" off the server's own answer where it has one, and
  // falls back to the date only while the first request is still in flight. The server
  // is the authority here: it decides what counts as still open, and a client deciding
  // separately would disagree with it for two hours around midnight UTC.
  const provisional = summary ? !summary.is_final : day === todayKey();

  return (
    // The neon-lime border and forest-toned ground are the reasoning-trace boxes'
    // own styling, so a written account of one day reads as the same kind of object
    // as the reasoning trace on the ranking tab: an AI-written paragraph about the
    // run, framed the same way wherever it appears.
    <div className="rounded-2xl border border-brand-accent bg-brand-bg/55 p-4">
      {/* The heading sits between the chart above and the AI summary box below: it
          names the day the chart selection points at, and carries the two badges
          that qualify the reading. */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-brand-fg">{dayLabel(day)}</h4>
          {provisional && (
            <span
              className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand-primary text-white font-semibold"
              title="This day is still being collected. The summary is written from what has arrived so far and is replaced once the day closes."
            >
              So far today
            </span>
          )}
        </div>
        {point?.score != null && (
          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand-accent text-brand-primary font-semibold">
            {verdict.label}
          </span>
        )}
      </div>

      <p className="text-[11px] text-brand-muted-fg mt-1">
        <DayFigures point={point} newsDay={newsDay} />
      </p>

      {/* The AI summary box. The brain logo lives here rather than on the heading,
          so the machine-written prose is the thing marked as machine-written. */}
      <div className="mt-3 rounded-xl border border-brand-border/60 bg-brand-surface/70 p-3">
        <div className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-2 flex items-center gap-1.5">
          <BrainCircuit className="w-3 h-3 text-brand-primary" />
          AI summary
        </div>
        {isLoading ? (
          <Skeleton />
        ) : error ? (
          <p className="text-sm text-brand-muted-fg italic">{error}</p>
        ) : summary?.summary ? (
          <>
            <p className="text-sm text-brand-fg leading-relaxed">{summary.summary}</p>
            {/* Said plainly, once, and never in a tone that asks to be trusted. A
                generated paragraph that does not announce itself is the one thing this
                panel could get seriously wrong. */}
            <p className="text-[10px] text-brand-muted-fg mt-2">
              Written by AI from that day's posts and articles. It describes the
              sentiment readings only, not the share price.
            </p>
          </>
        ) : (
          <p className="text-sm text-brand-muted-fg italic">
            {point && point.post_count === 0 && !newsDay?.count
              ? "Nothing was collected for this day, so there is nothing to summarise."
              : "No summary for this day yet."}
          </p>
        )}
      </div>
    </div>
  );
}

// The day's figures, in the order the chart draws them.
//
// Split out so the null handling stays in one place. A null score and a zero count mean
// opposite things throughout this feature, and the panel has to make the same
// distinction the chart's gap does: "no posts" is silence, not a reading of zero.
function DayFigures({
  point,
  newsDay,
}: {
  point?: SentimentHistoryPoint;
  newsDay?: NewsDay;
}) {
  const parts: string[] = [];

  if (point?.score != null) {
    parts.push(`Social ${point.score}`);
  }
  if (point) {
    parts.push(point.post_count === 1 ? "1 post" : `${point.post_count} posts`);
  }
  if (newsDay?.score != null) {
    parts.push(`news ${newsDay.score}`);
  }
  if (newsDay) {
    parts.push(newsDay.count === 1 ? "1 article" : `${newsDay.count} articles`);
  }

  if (!parts.length) return <>No readings for this day.</>;
  return <>{parts.join(" · ")}</>;
}

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse" aria-label="Loading this day's summary">
      <div className="h-3 rounded bg-brand-muted/15" />
      <div className="h-3 rounded bg-brand-muted/15" />
      <div className="h-3 rounded bg-brand-muted/15 w-4/5" />
    </div>
  );
}
