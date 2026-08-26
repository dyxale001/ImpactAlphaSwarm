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
import { formatDay } from "./postDays";

// Score and volume share one plot: the day is the unit, and splitting it across
// two panels made the reader do the join themselves.
//
// They are still different measures, so the overlay is built to stop them being
// compared. Volume is scaled into the bottom third of the plot (VOLUME_HEADROOM)
// and drawn behind the line in a recessive forest tone, so it reads as ground the
// line travels over rather than a second series at the same rank. Only the score
// owns the 0 to 100 axis a reader will actually measure against.
//
// The panel is forest, not the page's light card, because the neon line needs a
// dark ground: on white it is unreadable, and it is the brand's accent precisely
// against this background.

const LINE_COLOR = "#c7f269"; // lime-500, the neon accent
const BAR_COLOR = "#3e6258"; // forest-500, recessive against the forest panel
const SPARK_COLOR = "#3e6258"; // the sparkline sits on a LIGHT card, so it stays forest
const AXIS_TEXT = "rgba(255,255,255,0.55)";
const GRID_LINE = "rgba(255,255,255,0.12)";
const NEUTRAL_LINE = "rgba(255,255,255,0.28)";
const AXIS_WIDTH = 34;
const MARGIN = { top: 8, right: 4, left: 0, bottom: 0 };

// Bars are scaled to a third of the plot height, which is what keeps volume
// subordinate to the score line no matter how busy the busiest day was.
const VOLUME_HEADROOM = 3;

// The selected day's bar, lifted out of the recessive tone so the chart shows
// which day the posts below it belong to.
const BAR_SELECTED = "#8fb08a";

// A ticker needs a few real days before a line says anything.
const MIN_DAYS_TO_PLOT = 3;

// One tooltip for the day, not one per series: the bar and the line are two
// readings of the same column, so Recharts is given a single Tooltip on the
// composed chart and it renders both from the shared datum.
function TrendTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point: SentimentHistoryPoint = payload[0].payload;

  return (
    <div
      className="rounded-xl px-3 py-2 text-xs"
      style={{
        background: "rgba(16, 34, 30, 0.96)",
        border: "1px solid rgba(255,255,255,0.14)",
        color: "#f4f7f2",
      }}
    >
      <div className="font-semibold mb-1">{formatDay(point.date)}</div>
      {point.score === null ? (
        <div style={{ color: AXIS_TEXT }}>No posts that day</div>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: LINE_COLOR }}
            />
            Sentiment {point.score}
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
    </div>
  );
}

interface Props {
  points: SentimentHistoryPoint[];
  daysWithData: number;
  isLoading: boolean;
  error: string | null;
  days?: number;
  // The day whose posts are showing below the chart, highlighted here so the
  // two read as one selection. Null means every day.
  selectedDay?: string | null;
  // Supplied by pages that list posts underneath. Absent elsewhere, and the
  // chart stays inert rather than offering a click that does nothing.
  onSelectDay?: (day: string) => void;
}

export function SentimentTrendChart({
  points,
  daysWithData,
  isLoading,
  error,
  days = 7,
  selectedDay = null,
  onSelectDay,
}: Props) {
  if (isLoading) {
    return <div className="h-56 rounded-lg bg-brand-muted/10 animate-pulse" />;
  }

  if (error) {
    return <p className="text-sm text-brand-muted-fg py-8 text-center">{error}</p>;
  }

  // A fresh ticker returns a full window of empty days. Say that plainly, rather
  // than drawing an empty grid that looks like a failure.
  if (daysWithData < MIN_DAYS_TO_PLOT) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-brand-fg font-medium">Building history</p>
        <p className="text-xs text-brand-muted-fg mt-1">
          {daysWithData === 0
            ? "No social posts collected for this asset yet."
            : `${daysWithData} of ${days} days collected so far.`}{" "}
          The trend appears once there are a few days to compare.
        </p>
      </div>
    );
  }

  const busiestDay = Math.max(...points.map((p) => p.post_count), 1);

  return (
    <div>
      <div className="hero-card overflow-hidden p-4">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={points}
              margin={MARGIN}
              // The whole column is the target, not the bar alone: a quiet day's
              // bar is a few pixels tall, and on those days the click matters
              // most. `activeLabel` is the date under the pointer.
              onClick={(state: any) => {
                if (onSelectDay && state?.activeLabel) {
                  onSelectDay(state.activeLabel);
                }
              }}
              style={onSelectDay ? { cursor: "pointer" } : undefined}
            >
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
              <YAxis
                yAxisId="score"
                domain={[0, 100]}
                ticks={[0, 50, 100]}
                width={AXIS_WIDTH}
                tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              {/* Volume gets its own scale, headroomed so the tallest bar reaches
                  a third of the plot. The axis is hidden: a lone unlabelled
                  number floating beside the plot reads as a stray figure rather
                  than a scale, and exact counts are on hover anyway. */}
              <YAxis
                yAxisId="volume"
                orientation="right"
                domain={[0, busiestDay * VOLUME_HEADROOM]}
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
              {/* Bars first: in a ComposedChart, paint order is declaration
                  order, and the line has to sit on top of the volume. */}
              <Bar
                yAxisId="volume"
                dataKey="post_count"
                fill={BAR_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={38}
                // Per-bar colour through `shape` rather than <Cell>, which this
                // version of Recharts deprecates.
                shape={(props: any) => (
                  <Rectangle
                    {...props}
                    radius={[4, 4, 0, 0]}
                    fill={
                      props.payload?.date === selectedDay
                        ? BAR_SELECTED
                        : BAR_COLOR
                    }
                  />
                )}
              />
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
      </div>

      <p className="text-xs text-brand-muted-fg mt-2">
        The line is the daily social sentiment score from StockTwits, 0 to 100 with
        50 neutral. The bars behind it show how busy each day was relative to the
        others; hover any day for its exact post count.
        {onSelectDay ? " Click a day to read that day's posts." : ""}
      </p>
    </div>
  );
}

// Compact form for the asset page, where the trend is a prompt to look closer
// rather than the thing being studied. Deliberately no axes or tooltip: at this
// size they would be unreadable, and the full chart is one click away.
export function SentimentSparkline({
  points,
  daysWithData,
}: {
  points: SentimentHistoryPoint[];
  daysWithData: number;
}) {
  if (daysWithData < MIN_DAYS_TO_PLOT) return null;

  const plotted = points.filter((p) => p.score !== null);
  const first = plotted[0]?.score ?? 50;
  const last = plotted[plotted.length - 1]?.score ?? 50;
  const width = 120;
  const height = 28;

  const step = points.length > 1 ? width / (points.length - 1) : width;
  // One polyline per unbroken run, so a quiet day leaves a gap here too.
  const runs: string[][] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.score === null) {
      if (current.length) runs.push(current);
      current = [];
      return;
    }
    const x = index * step;
    const y = height - (point.score / 100) * height;
    current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (current.length) runs.push(current);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Social sentiment moved from ${Math.round(first)} to ${Math.round(last)} over the last ${points.length} days`}
    >
      <line
        x1={0}
        x2={width}
        y1={height / 2}
        y2={height / 2}
        stroke="var(--color-brand-border)"
        strokeDasharray="3 3"
      />
      {runs.map((run, index) => (
        <polyline
          key={index}
          points={run.join(" ")}
          fill="none"
          stroke={SPARK_COLOR}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
