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

// One tooltip for the day, not one per series: the bar and the line are two readings
// of the same column, so Recharts is given a single Tooltip on the composed chart and
// it renders both from the shared datum.
function TrendTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point: PlottedPoint = payload[0].payload;
  const loudest = point.top_posts?.[0];
  const closed = isWeekend(point.date);
  // Undefined, not null: a day with news enabled but no articles carries null, and
  // that still earns a "no articles" line. Only an absent field means this chart has
  // no news series at all.
  const hasNews = point.newsCount !== undefined;

  return (
    <div
      className="rounded-xl px-3 py-2 text-xs max-w-[15rem]"
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
      {point.score === null ? (
        // On a weekday an empty day is genuinely no chatter. On a weekend it is
        // mostly just the market being shut, and saying only "no posts" invites the
        // reader to read a collapse in interest into a public holiday.
        <div style={{ color: AXIS_TEXT }}>
          {closed
            ? "No posts. Chatter usually thins out while the market is closed."
            : "No posts that day"}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: LINE_COLOR }}
            />
            {/* Named "Social" only where there is a news line to tell it apart from.
                On its own it is the only sentiment in the panel, and qualifying it
                there would invite the reader to look for the other one. */}
            {hasNews ? "Social" : "Sentiment"} {point.score}
          </div>
          <div className="flex items-center gap-1.5" style={{ color: AXIS_TEXT }}>
            <span
              className="inline-block w-2 h-2 rounded-sm"
              style={{ background: BAR_COLOR }}
            />
            {point.post_count} {point.post_count === 1 ? "post" : "posts"}
            {" · "}
            {point.bullish} bullish, {point.bearish} bearish
          </div>
        </>
      )}

      {/* News sits outside the branch above, because a day can carry coverage while
          nobody posted about it. Nesting it under the social score is what would hide
          the news reading on exactly the quiet days it is most worth having. */}
      {hasNews &&
        (typeof point.newsScore === "number" ? (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: NEWS_LINE_COLOR }}
            />
            News {Math.round(point.newsScore)}
            {" · "}
            {point.newsCount}{" "}
            {point.newsCount === 1 ? "article" : "articles"}
          </div>
        ) : (
          <div style={{ color: AXIS_TEXT }}>No articles that day</div>
        ))}

      {loudest?.text ? (
        <div
          className="mt-1.5 pt-1.5 border-t leading-snug"
          style={{ borderColor: "rgba(255,255,255,0.14)", color: AXIS_TEXT }}
        >
          Loudest: "{loudest.text.slice(0, 90)}
          {loudest.text.length > 90 ? "…" : ""}"
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
  // The day whose posts are showing below the chart, highlighted here so the two
  // read as one selection. Null means every day.
  selectedDay?: string | null;
  // Supplied by pages that list posts underneath. Absent elsewhere, and the chart
  // stays inert rather than offering a click that does nothing.
  onSelectDay?: (day: string) => void;
  // Per-day news, keyed by the same YYYY-MM-DD as the points. Optional on purpose:
  // this chart is also the whole of the social sentiment page, where a news line
  // would be off-topic, so every news element below renders only when this is passed.
  newsDays?: Map<string, NewsDay>;
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
  newsDays,
}: Props) {
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
            ? `Reading the last ${days} days of posts for this asset. This takes a few seconds.`
            : daysWithData === 0
              ? "No social posts collected for this asset yet."
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
                content={<TrendTooltip />}
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
                stroke={LINE_COLOR}
                strokeWidth={2.5}
                dot={false}
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
            <span
              className="inline-block w-3.5 rounded-full"
              style={{ height: 2.5, background: LINE_COLOR }}
            />
            {/* Same rule as the tooltip: only qualified as "social" where there is a
                news line to distinguish it from. */}
            {newsDays ? "Social sentiment" : "Sentiment"}
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
            Posts per day
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
                style={{ height: 2.5, background: LINE_COLOR }}
              />
              <span
                className="inline-block w-1.5 rounded-full"
                style={{ height: 2.5, background: LINE_COLOR, opacity: 0.35 }}
              />
            </span>
            {newsDays ? "Gap means no posts or news" : "Gap means no posts"}
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
          {onSelectDay ? (
            <span className="sm:ml-auto">
              {newsDays
                ? "Click a day to read its news and posts"
                : "Click a day to read its posts"}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
