import { BrainCircuit } from "lucide-react";
import { useDayDrivers } from "../../hooks/useDaySummary";
import { SOCIAL_HISTORY_DAYS } from "../../data/sentimentMethodology";
import { dayLabel, formatDay, todayKey } from "./sentimentDays";
import { sentimentVerdict } from "./sentimentDisplay";
import type { SentimentHistoryPoint } from "../../services/api/analysis";
import type { NewsDay } from "./newsDaily";

// The written account of one day on the trend chart: "What's driving the sentiment".
//
// It sits on the light page rather than inside the chart's forest panel, unlike the
// tooltip. A tooltip is three numbers read in a glance and belongs on the ground it
// annotates; this is a paragraph of prose, and prose is read, not glanced at. The dark
// ground that suits a chart is the wrong ground for a paragraph.
//
// The numbers along the top are the same ones the bar above was drawn from, passed in
// rather than refetched, so the header cannot disagree with the chart. Only the prose
// is fetched here.
//
// One paragraph. It used to sit under a separate "AI summary" of the day's readings;
// that was retired in favour of this one, which explains the news behind the day from
// every stored article and closes with how the chatter moved alongside it. The summary
// endpoint still exists on the server but nothing here calls it.

interface Props {
  ticker: string;
  /** The selected day, YYYY-MM-DD, or null when nothing is selected. */
  day: string | null;
  /** That day's social point, for the header figures. */
  point?: SentimentHistoryPoint;
  /** That day's news, when the chart has a news series. */
  newsDay?: NewsDay;
  /** Every day of the chart's news series, to check what the empty state claims. */
  newsDays?: Map<string, NewsDay>;
}

export function DaySummaryPanel({ ticker, day, point, newsDay, newsDays }: Props) {
  const { summary, isLoading, error } = useDayDrivers(ticker, day);

  if (!day) return null;

  // Whether the chart holds no news at all on or before this day. Only then is it true
  // that there was nothing to explain; an empty answer otherwise means the paragraph
  // has not been written yet, or failed, and the panel must not claim more than that.
  const noNewsUpToDay =
    newsDays !== undefined &&
    ![...newsDays.values()].some((d) => d.date <= day && d.count > 0);

  const verdict = sentimentVerdict(point?.score ?? null);
  // Many tickers go days without an article. On such a day the server answers with the
  // paragraph of the latest earlier day that had news, and `source_day` names it.
  const carriedFrom =
    summary?.summary && summary.source_day && summary.source_day !== day
      ? summary.source_day
      : null;
  // "So far today" off the server's own answer where it describes this day, and off
  // the date otherwise: while the request is in flight, and when the paragraph shown
  // belongs to an earlier, settled day. The server is the authority on what counts as
  // still open; a client deciding separately would disagree with it for two hours
  // around midnight UTC.
  //
  // Only an answer that actually carries a paragraph counts. The server answers every
  // empty case (summaries off, no news, a failed generation) with is_final false, and
  // reading that as "still open" put "So far today" on days that ended long ago.
  const provisional =
    summary?.summary && !carriedFrom ? !summary.is_final : day === todayKey();

  return (
    // The neon-lime border and forest-toned ground are the reasoning-trace boxes'
    // own styling, so a written account of one day reads as the same kind of object
    // as the reasoning trace on the ranking tab: an AI-written paragraph about the
    // run, framed the same way wherever it appears.
    <div className="rounded-2xl border border-brand-accent bg-brand-bg/55 p-4">
      {/* The heading names the day the chart selection points at, and carries the two
          badges that qualify the reading. */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-brand-fg">{dayLabel(day)}</h4>
          {provisional && (
            <span
              className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand-primary text-white font-semibold"
              title="This day is still being collected. The paragraph is written from what has arrived so far and is replaced once the day closes."
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

      {/* The AI box. The brain logo lives here rather than on the heading, so the
          machine-written prose is the thing marked as machine-written. The heading
          follows the day: a day still in progress is what IS driving the sentiment, a
          settled one is what DROVE it, and a day without news names the earlier day
          whose paragraph it is showing, so last Tuesday's news is never read as
          today's. */}
      <div className="mt-3 rounded-xl border border-brand-border/60 bg-brand-surface/70 p-3">
        <div className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-2 flex items-center gap-1.5">
          <BrainCircuit className="w-3 h-3 text-brand-primary" />
          {carriedFrom
            ? `What drove the sentiment on ${formatDay(carriedFrom)}`
            : provisional
              ? "What's driving the sentiment"
              : "What drove the sentiment that day"}
        </div>
        {carriedFrom && !isLoading && !error && (
          <p className="text-[11px] text-brand-muted-fg mb-1.5">
            No news articles on this day, so this is the latest day that had some.
          </p>
        )}
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
            <ul className="mt-2 space-y-1 text-[10px] text-brand-muted-fg">
              <li>
                Written by AI from that day's news articles and how much people posted.
                It describes the sentiment readings only, not the share price.
              </li>
              <li>
                Sources can be biased or promotional. The summary weighs them but
                cannot check that what they say is true.
              </li>
              <li>
                This looks at the last {SOCIAL_HISTORY_DAYS} days, so a short burst of
                news may not last.
              </li>
            </ul>
          </>
        ) : (
          <p className="text-sm text-brand-muted-fg italic">
            {noNewsUpToDay
              ? `No news articles in the last ${SOCIAL_HISTORY_DAYS} days up to this day, so there is nothing to explain.`
              : "Not available for this day yet."}
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
    // Rounded: the stored series is whole numbers already, but the fallback derived on
    // the client from the article list is a weighted mean with every decimal it has.
    parts.push(`news ${Math.round(newsDay.score)}`);
  }
  if (newsDay) {
    parts.push(newsDay.count === 1 ? "1 article" : `${newsDay.count} articles`);
  }

  if (!parts.length) return <>No readings for this day.</>;
  return <>{parts.join(" · ")}</>;
}

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse" aria-label="Loading what drove this day's sentiment">
      <div className="h-3 rounded bg-brand-muted/15" />
      <div className="h-3 rounded bg-brand-muted/15" />
      <div className="h-3 rounded bg-brand-muted/15 w-4/5" />
    </div>
  );
}
