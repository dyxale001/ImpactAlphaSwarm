import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SentimentHistoryPoint } from "../../services/api/analysis";

// Score and post volume are different measures on different scales, so they get
// their own panels rather than a shared plot with two y-axes. A second axis would
// invite the reader to compare heights that mean nothing to each other, and to
// read crossings between the line and the bars as events.
//
// The two panels share one x-axis and one hover (Recharts `syncId`), so a day
// still reads as a single column across both.

const LINE_COLOR = "#3e6258"; // forest-500
const BAR_COLOR = "#6a8b82"; // forest-400
const AXIS_WIDTH = 34; // identical on both panels, or the dates fall out of step
const MARGIN = { top: 4, right: 8, left: 0, bottom: 0 };

// A ticker needs a few real days before a line says anything.
const MIN_DAYS_TO_PLOT = 3;

function formatDay(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function TrendTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point: SentimentHistoryPoint = payload[0].payload;

  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{
        background: "var(--color-brand-card)",
        border: "1px solid var(--color-brand-border)",
        color: "var(--color-brand-fg)",
      }}
    >
      <div className="font-semibold mb-1">{formatDay(point.date)}</div>
      {point.score === null ? (
        <div className="text-brand-muted-fg">No posts that day</div>
      ) : (
        <>
          <div>Sentiment {point.score}</div>
          <div className="text-brand-muted-fg">
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
}

export function SentimentTrendChart({
  points,
  daysWithData,
  isLoading,
  error,
  days = 14,
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
      {/* Sentiment score, 0 to 100 */}
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={MARGIN} syncId="sentiment-history">
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-brand-border)"
              opacity={0.3}
              vertical={false}
            />
            <XAxis dataKey="date" hide />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              width={AXIS_WIDTH}
              tick={{ fill: "var(--color-brand-muted-fg)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            {/* 50 is neutral, so polarity is read by position rather than by
                colouring the line, which would tie hue to value. */}
            <ReferenceLine
              y={50}
              stroke="var(--color-brand-border)"
              strokeDasharray="4 4"
            />
            <Tooltip
              content={<TrendTooltip />}
              cursor={{ stroke: "var(--color-brand-border)", strokeWidth: 1 }}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke={LINE_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-brand-card)" }}
              // Quiet days are gaps in the record, not a sentiment of zero, so the
              // line breaks rather than bridging them.
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Post volume: the context that stops a 90 from three posts reading like a
          90 from three hundred. */}
      <div className="h-16 mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={MARGIN} syncId="sentiment-history">
            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              tick={{ fill: "var(--color-brand-muted-fg)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              domain={[0, busiestDay]}
              ticks={[busiestDay]}
              width={AXIS_WIDTH}
              tick={{ fill: "var(--color-brand-muted-fg)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<TrendTooltip />}
              cursor={{ fill: "var(--color-brand-border)", opacity: 0.25 }}
            />
            <Bar dataKey="post_count" fill={BAR_COLOR} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-brand-muted-fg mt-2">
        Daily social sentiment from StockTwits, 0 to 100 with 50 neutral. Bars show
        how many posts each day's score is based on.
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
          stroke={LINE_COLOR}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
