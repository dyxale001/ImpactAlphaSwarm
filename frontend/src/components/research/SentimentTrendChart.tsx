import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SentimentHistoryPoint } from "../../services/api/analysis";
import { SOCIAL_HISTORY_DAYS } from "../../data/sentimentMethodology";
import { formatDay, isWeekend } from "./sentimentDays";
import { newsDaysWithData, type NewsDay } from "./newsDaily";

// Score and volume share one plot: the day is the unit, and splitting it across two
// panels made the reader do the join themselves.
//
// They are still different measures, so the overlay is built to stop them being
// compared. Volume is scaled into the bottom third of the plot (VOLUME_HEADROOM) and
// drawn behind the line in a recessive forest tone, so it reads as ground the line
// travels over rather than a second series at the same rank. Only the score owns the
// 0 to 100 axis a reader will actually measure against.
//
// The panel is forest, not the page's light card, because the neon line needs a dark
// ground: on white it is unreadable, and it is the brand's accent precisely against
// this background.

const LINE_COLOR = "#c7f269"; // lime-500, the neon accent
// The news line, drawn only when the caller supplies per-day news. forest-100: a white
// carrying the brand's green cast rather than a flat white, which reads as a palette
// colour on this panel instead of an absence of one. Its green is cool, where the
// lime's is yellow, so the two separate by hue as well as by lightness.
//
// Both lines are still light on a dark ground, so this one is dashed and dotted while
// the social line is solid and undotted. Shape carries the distinction where lightness
// alone is thin, and it doubles as a signal that this series is the sparser, derived
// one. The tooltip names both outright.
const NEWS_LINE_COLOR = "#e4ece9";
const NEWS_LINE_DASH = "5 3";
const BAR_COLOR = "#3e6258"; // forest-500, recessive against the forest panel
const AXIS_TEXT = "rgba(255,255,255,0.55)";
const GRID_LINE = "rgba(255,255,255,0.12)";
const NEUTRAL_LINE = "rgba(255,255,255,0.28)";
const AXIS_WIDTH = 34;
const MARGIN = { top: 8, right: 4, left: 0, bottom: 0 };

// Bars are scaled to a third of the plot height, which is what keeps volume
// subordinate to the score line no matter how busy the busiest day was.
const VOLUME_HEADROOM = 3;

// The selected day's bar, lifted out of the recessive tone so the chart shows which
// day the posts below it belong to.
const BAR_SELECTED = "#8fb08a";

// Weekend columns, when the market is shut.
//
// Since the window became seven consecutive days rather than five trading ones, two
// of every seven bars are Saturday and Sunday, and they are reliably the quietest.
// Without saying why, a reader reasonably concludes interest collapsed. It is drawn
// as ground rather than as a series: a wash behind the whole column, dimmer than the
// volume bars in front of it, so it reads as "nothing was open here" rather than as a
// fourth thing to measure.
const WEEKEND_BAND = "rgba(255,255,255,0.055)";

// A ticker needs a few real days before a line says anything.
const MIN_DAYS_TO_PLOT = 3;

// What the chart actually plots: a history point plus the fields derived here. The
// news pair is optional and present only when the caller passed newsDays, which is how
// every news addition below stays invisible to callers that did not ask for one.
type PlottedPoint = SentimentHistoryPoint & {
  weekendBand: number;
  newsScore?: number | null;
  newsCount?: number;
};

// One series' reading, as a row rather than a sentence.
//
// The three values are a label, a score and a volume, and they are the same three for
// both series, so they line up in columns instead of running together into prose. Read
// down, two rows of aligned numbers answer "which is higher" at a glance; read as two
// sentences, as this was, they do not.
//
// The two swatches are not decoration and are not interchangeable. A round dot in the
// line's colour marks the score, which is plotted as a line. A square in the bar's
// colour marks a count that is plotted as a bar, and it is the same square the legend
// puts beside "Posts per day". Only social has one, because the volume bars are social
// posts and nothing else: the article count is a number the chart never draws.
//
// Columns alone cannot say that. Putting "64 posts" and "2 articles" in one column with
// no swatches, which is what this looked like before, reads as two measurements of the
// same bar and invites exactly the wrong conclusion about what the bar's height means.
function TooltipRow({
  colour,
  label,
  score,
  volume,
  volumeSwatch,
}: {
  colour: string;
  label: string;
  score: number | null | undefined;
  volume: string;
  /** The bar colour, for a count the chart plots as a bar. Omitted for one it does
   *  not plot at all, which leaves the slot empty rather than filling it with a mark
   *  that would claim a bar exists. */
  volumeSwatch?: string;
}) {
  return (
    <>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ background: colour }}
        />
        {label}
      </span>
      <span className="font-mono tabular-nums font-semibold text-right">
        {score ?? "—"}
      </span>
      <span
        className="flex items-center gap-1.5 whitespace-nowrap"
        style={{ color: AXIS_TEXT }}
      >
        {/* Rendered either way, so the counts stay aligned whether or not the series
            has a bar. Empty when it does not. */}
        <span
          className="inline-block w-2 h-2 rounded-sm shrink-0"
          style={volumeSwatch ? { background: volumeSwatch } : undefined}
        />
        {volume}
      </span>
    </>
  );
}

// One tooltip for the day, not one per series: the bar and the line are two readings
// of the same column, so Recharts is given a single Tooltip on the composed chart and
// it renders both from the shared datum.
function TrendTooltip({ active, payload, variant = "social" }: any) {
  if (!active || !payload?.length) return null;
  const point: PlottedPoint = payload[0].payload;
  const closed = isWeekend(point.date);
  // Undefined, not null: a day with news enabled but no articles carries null, and
  // that still earns a "no articles" line. Only an absent field means this chart has
  // no news series at all.
  const hasNews = point.newsCount !== undefined;
  // On the news page the one series IS news, plotted through the same fields the
  // social series uses, so the copy has to name articles rather than posts.
  const unit = variant === "news" ? "article" : "post";
  const unitPlural = variant === "news" ? "articles" : "posts";

  return (
    <div
      // No max-width any more. It existed to stop the loudest post's ninety characters
      // running off the panel; with that gone every line is short and fixed length, and
      // a cap only forces the aligned columns to wrap out of alignment.
      className="rounded-xl px-3 py-2 text-xs"
      style={{
        background: "rgba(16, 34, 30, 0.96)",
        border: "1px solid rgba(255,255,255,0.14)",
        color: "#f4f7f2",
      }}
    >
      <div className="font-semibold mb-1 flex items-center gap-1.5">
        {formatDay(point.date)}
        {closed ? (
          <span
            className="font-normal rounded-full px-1.5 py-px text-[10px]"
            style={{ background: "rgba(255,255,255,0.1)", color: AXIS_TEXT }}
          >
            Market closed
          </span>
        ) : null}
      </div>
      {/* Three columns, so the two series' numbers sit under each other. The gap-x is
          what used to be a "·" separator doing the same job in less legible form. */}
      <div className="grid grid-cols-[auto_auto_auto] items-baseline gap-x-2.5 gap-y-1">
        {point.score === null ? (
          // Just the fact now. This used to add a sentence about chatter thinning out
          // while the market is shut, so that a quiet weekend was not read as collapsing
          // interest, but the "Market closed" badge one line above already says exactly
          // that and says it on every weekend day rather than only the empty ones.
          <span className="col-span-3" style={{ color: AXIS_TEXT }}>
            No {unitPlural} that day
          </span>
        ) : (
          <TooltipRow
            // The dot matches the line: lime for social, forest-100 for news.
            colour={variant === "news" ? NEWS_LINE_COLOR : LINE_COLOR}
            // Named "Social" only where there is a news line to tell it apart from.
            // On its own it is the only sentiment in the panel, and qualifying it
            // there would invite the reader to look for the other one.
            label={hasNews ? "Social" : variant === "news" ? "News" : "Sentiment"}
            score={point.score}
            volume={`${point.post_count} ${point.post_count === 1 ? unit : unitPlural}`}
            // The only count on this chart with a bar behind it.
            volumeSwatch={BAR_COLOR}
          />
        )}

        {/* News sits outside the branch above, because a day can carry coverage while
            nobody posted about it. Nesting it under the social score is what would
            hide the news reading on exactly the quiet days it is most worth having. */}
        {hasNews &&
          (typeof point.newsScore === "number" ? (
            <TooltipRow
              colour={NEWS_LINE_COLOR}
              label="News"
              score={Math.round(point.newsScore)}
              volume={`${point.newsCount} ${point.newsCount === 1 ? "article" : "articles"}`}
            />
          ) : (
            <span className="col-span-3" style={{ color: AXIS_TEXT }}>
              No articles that day
            </span>
          ))}
      </div>

      {/* The bullish and bearish split, demoted to a footnote rather than trailing the
          post count on its own line. The score above already says which way the day
          leaned; this only says how divided it was, which is worth having and is not
          worth the width it was taking at full size.

          The loudest post that used to sit here is gone. At ninety characters it wrapped
          to three lines and was most of the tooltip's height, which is what made the
          whole thing feel crowded, and it was the least load bearing thing in it: the
          social page lists a day's posts properly when you click its bar. */}
      {point.score !== null && (point.bullish > 0 || point.bearish > 0) ? (
        <div className="mt-1.5 text-[11px]" style={{ color: AXIS_TEXT }}>
          {point.bullish} bullish, {point.bearish} bearish
        </div>
      ) : null}
    </div>
  );
}

interface Props {
  points: SentimentHistoryPoint[];
  daysWithData: number;
  isLoading: boolean;
  error: string | null;
  // True while the backend is walking this ticker's history for the first time. It
  // has already answered; the walk is happening behind the response.
  isSeeding?: boolean;
  days?: number;
  // The day whose detail is showing below the chart, highlighted here so the two
  // read as one selection. Null means every day.
  selectedDay?: string | null;
  // Supplied by pages that show something for the selected day underneath. Absent
  // elsewhere, and the chart stays inert rather than offering a click that does nothing.
  onSelectDay?: (day: string) => void;
  // What the legend promises a click will do. Defaults to the source pages' wording,
  // since they were the only callers first; the sentiment tab opens a written summary
  // instead and says so. Ignored without onSelectDay, which prints no hint at all.
  selectHint?: string;
  // Per-day news, keyed by the same YYYY-MM-DD as the points. Optional on purpose:
  // this chart is also the whole of the social sentiment page, where a news line
  // would be off-topic, so every news element below renders only when this is passed.
  newsDays?: Map<string, NewsDay>;
  // "social" (the default) plots social chatter, optionally with a second news line.
  // "news" is the news sentiment page: the caller has already reshaped its news
  // series into `points`, so this only switches the copy from posts to articles and
  // suppresses the separate news line, which would otherwise double the series.
  variant?: "social" | "news";
}

export function SentimentTrendChart({
  points,
  daysWithData,
  isLoading,
  error,
  isSeeding = false,
  days = SOCIAL_HISTORY_DAYS,
  selectedDay = null,
  onSelectDay,
  selectHint,
  newsDays,
  variant = "social",
}: Props) {
  const unitPlural = variant === "news" ? "articles" : "posts";
  const isNews = variant === "news";
  if (isLoading) {
    return <div className="h-56 rounded-lg bg-brand-muted/10 animate-pulse" />;
  }

  if (error) {
    return <p className="text-sm text-brand-muted-fg py-8 text-center">{error}</p>;
  }

  // A ticker nobody has opened before returns a full window of empty days. Say that
  // plainly rather than drawing an empty grid that looks like a failure, and separate
  // the two reasons it can be empty: a walk that is happening right now is a wait, and
  // a ticker nobody posts about is not.
  const newsPlottable = newsDays ? newsDaysWithData(newsDays) : 0;

  // The panel needs a few real days before a line says anything. Where news is
  // supplied that test counts news days too: a ticker with a week of coverage and no
  // chatter has a chart well worth drawing, and gating on social alone would hide the
  // news line on exactly the tickers nobody posts about.
  if (daysWithData < MIN_DAYS_TO_PLOT && newsPlottable < MIN_DAYS_TO_PLOT) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-brand-fg font-medium">
          {isSeeding ? "Fetching history" : "Building history"}
        </p>
        <p className="text-xs text-brand-muted-fg mt-1">
          {isSeeding
            ? `Reading the last ${days} days of ${unitPlural} for this asset. This takes a few seconds.`
            : daysWithData === 0
              ? isNews
                ? "No news articles collected for this asset yet."
                : "No social posts collected for this asset yet."
              : `${daysWithData} of ${days} days collected so far. The trend appears once there are a few days to compare.`}
        </p>
      </div>
    );
  }

  const busiestDay = Math.max(...points.map((p) => p.post_count), 1);
  const volumeCeiling = busiestDay * VOLUME_HEADROOM;
  // The band is a full height value on the volume scale, so it reaches the top of the
  // plot whatever the busiest day was. Weekdays carry 0, which draws nothing.
  const plotted: PlottedPoint[] = points.map((point) => {
    const base = {
      ...point,
      weekendBand: isWeekend(point.date) ? volumeCeiling : 0,
    };
    // Left off entirely rather than set to null when there is no news series, so the
    // tooltip can tell "this chart has no news" from "this day had no articles".
    if (!newsDays) return base;
    const day = newsDays.get(point.date);
    return {
      ...base,
      newsScore: day?.score ?? null,
      // The day's real total, not the length of the articles it carries: a stored day
      // keeps only its most influential few.
      newsCount: day?.count ?? 0,
    };
  });

  return (
    <div>
      <div className="hero-card overflow-hidden p-4">
        {/* Recharts 3 makes the chart and its bars keyboard focusable, so clicking a
            day focused them and the browser drew its default outline: a box around the
            whole plot and another around the bar. Suppressed for pointer focus only.
            Keyboard focus still shows a ring, because a chart you can tab into and
            operate needs to say where you are. */}
        <div className="h-56 [&_*:focus:not(:focus-visible)]:outline-none">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={plotted}
              margin={MARGIN}
              // The weekend wash is meant to read as the whole column being shut, so
              // it fills its band edge to edge. The volume bars keep their shape
              // regardless, because maxBarSize caps them well below the band width.
              barCategoryGap={0}
              // The whole column is the target, not the bar alone: a quiet day's bar
              // is a few pixels tall, and on those days the click matters most.
              // `activeLabel` is the date under the pointer.
              onClick={(state: any) => {
                if (onSelectDay && state?.activeLabel) {
                  onSelectDay(state.activeLabel);
                }
              }}
              style={onSelectDay ? { cursor: "pointer" } : undefined}
            >
              {/* First child, because paint order is declaration order and this is
                  the backdrop: the grid, the bars and the line all sit on top of it. */}
              <Bar
                xAxisId="weekend"
                yAxisId="volume"
                dataKey="weekendBand"
                fill={WEEKEND_BAND}
                isAnimationActive={false}
                // Wide enough that the band always fills its column however the plot
                // is resized. maxBarSize is a ceiling, not a width.
                maxBarSize={9999}
              />
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={GRID_LINE}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDay}
                tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              {/* A second, hidden category axis carrying the same days, purely so the
                  weekend band is its own bar group. Two Bar series on one x-axis are
                  laid out side by side, which would halve the volume bars to make room
                  for a backdrop. On its own axis the band gets the full column and the
                  volume bars are left exactly as they were. */}
              <XAxis xAxisId="weekend" dataKey="date" hide />
              <YAxis
                yAxisId="score"
                domain={[0, 100]}
                ticks={[0, 50, 100]}
                width={AXIS_WIDTH}
                tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              {/* Volume gets its own scale, headroomed so the tallest bar reaches a
                  third of the plot. The axis is hidden: a lone unlabelled number
                  floating beside the plot reads as a stray figure rather than a
                  scale, and exact counts are on hover anyway. */}
              <YAxis
                yAxisId="volume"
                orientation="right"
                domain={[0, volumeCeiling]}
                hide
              />
              {/* 50 is neutral, so polarity is read by position rather than by
                  colouring the line, which would tie hue to value. */}
              <ReferenceLine
                yAxisId="score"
                y={50}
                stroke={NEUTRAL_LINE}
                strokeDasharray="4 4"
              />
              <Tooltip
                content={<TrendTooltip variant={variant} />}
                cursor={{ fill: "rgba(255,255,255,0.06)" }}
              />
              {/* Bars first: in a ComposedChart, paint order is declaration order,
                  and the line has to sit on top of the volume. */}
              <Bar
                yAxisId="volume"
                dataKey="post_count"
                fill={BAR_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={38}
                // Per-bar colour through `shape` rather than <Cell>, which this
                // version of Recharts deprecates.
                //
                // Only geometry is passed through, never the whole prop bag: spreading
                // it forwards Recharts' own stroke and layout props into the Rectangle,
                // which is a standing invitation for a stray outline.
                shape={(props: any) => (
                  <Rectangle
                    x={props.x}
                    y={props.y}
                    width={props.width}
                    height={props.height}
                    radius={[4, 4, 0, 0]}
                    stroke="none"
                    fill={
                      props.payload?.date === selectedDay
                        ? BAR_SELECTED
                        : BAR_COLOR
                    }
                  />
                )}
              />
              {/* News before social, so the established lime line stays on top where
                  the two cross. Drawn at all only when the caller supplied news. */}
              {newsDays && (
                <Line
                  yAxisId="score"
                  type="monotone"
                  dataKey="newsScore"
                  stroke={NEWS_LINE_COLOR}
                  strokeWidth={2}
                  strokeDasharray={NEWS_LINE_DASH}
                  // Dotted, unlike the social line. Coverage is sparse for most
                  // tickers, so a day flanked by two days without articles is a
                  // segment of zero length: with dot={false} it would draw nothing at
                  // all and the day would look like no news rather than one article.
                  // The dot is what makes gapping viable on a series this patchy.
                  dot={{ r: 2, fill: NEWS_LINE_COLOR, strokeWidth: 0 }}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "#10221e" }}
                  connectNulls={false}
                />
              )}
              <Line
                yAxisId="score"
                type="monotone"
                dataKey="score"
                // On the news page this one line IS the news series, so it takes the
                // news line's look: forest-100 rather than lime, dashed, and dotted
                // because coverage is patchy enough that a lone day between two blanks
                // would otherwise draw nothing.
                stroke={isNews ? NEWS_LINE_COLOR : LINE_COLOR}
                strokeWidth={isNews ? 2 : 2.5}
                strokeDasharray={isNews ? NEWS_LINE_DASH : undefined}
                dot={isNews ? { r: 2, fill: NEWS_LINE_COLOR, strokeWidth: 0 } : false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#10221e" }}
                // Quiet days are gaps in the record, not a sentiment of zero, so the
                // line breaks rather than bridging them.
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* A key, not a paragraph. It sits inside the panel rather than under it so
            each swatch is the colour actually drawn: the lime is unreadable on the
            light page behind this card, and the neutral line is white at 28%, which
            on white is nothing at all. */}
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-[11px]"
          style={{ color: AXIS_TEXT }}
        >
          <span className="flex items-center gap-1.5">
            {/* Matches whatever the line is actually drawn as: a solid lime rule for
                social, a dashed forest-100 one for news. */}
            {isNews ? (
              <span
                className="inline-block w-3.5"
                style={{ borderTop: `2px dashed ${NEWS_LINE_COLOR}` }}
              />
            ) : (
              <span
                className="inline-block w-3.5 rounded-full"
                style={{ height: 2.5, background: LINE_COLOR }}
              />
            )}
            {/* Same rule as the tooltip: only qualified as "social" where there is a
                news line to distinguish it from. */}
            {newsDays ? "Social sentiment" : isNews ? "News sentiment" : "Sentiment"}
          </span>
          {newsDays && (
            <span
              className="flex items-center gap-1.5"
              title="The influence-weighted average sentiment of that day's articles. Not the news sub-score, which weights reliability tiers across the whole window rather than day by day."
            >
              {/* Dashed swatch, because the line is dashed. A solid swatch for a
                  dashed series is the legend quietly misdescribing the one thing it
                  exists to identify. */}
              <span
                className="inline-block w-3.5"
                style={{ borderTop: `2px dashed ${NEWS_LINE_COLOR}` }}
              />
              News sentiment
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ background: BAR_COLOR }}
            />
            {isNews ? "Articles per day" : "Posts per day"}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3.5"
              style={{ borderTop: `1px dashed ${NEUTRAL_LINE}` }}
            />
            Neutral 50
          </span>
          {/* The gap is the one thing here that has no swatch, and it is the thing
              most easily misread: a break means nobody posted, not a score of zero. */}
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-[3px]">
              <span
                className="inline-block w-1.5 rounded-full"
                style={{ height: 2.5, background: isNews ? NEWS_LINE_COLOR : LINE_COLOR }}
              />
              <span
                className="inline-block w-1.5 rounded-full"
                style={{
                  height: 2.5,
                  background: isNews ? NEWS_LINE_COLOR : LINE_COLOR,
                  opacity: 0.35,
                }}
              />
            </span>
            {newsDays
              ? "Gap means no posts or news"
              : `Gap means no ${unitPlural}`}
          </span>
          {/* Without this the two quietest columns of every week look like collapsing
              interest rather than a shut market. The swatch is bordered because the
              wash alone is too faint to identify at legend size. */}
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{
                background: WEEKEND_BAND,
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            />
            Market closed
          </span>
          {/* What a click actually does differs by page: the source pages open that
              day's list, the sentiment tab opens its written summary. The chart cannot
              know which, and a hint that promises the wrong thing is worse than none,
              so the caller that wires the click supplies the words for it. */}
          {onSelectDay ? (
            <span className="sm:ml-auto">
              {selectHint ??
                (newsDays
                  ? "Click a day to read its news and posts"
                  : isNews
                    ? "Click a day to read its articles"
                    : "Click a day to read its posts")}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
