import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAxisDate, formatFullDate, priceDomain } from "../research/quantSeries";
import { rebaseSeries, type Rebasable } from "../../utils/compareStocks";
import { seriesFor } from "./compareSeries";
import { Swatch } from "./CompareGrid";
import { CHART_NOTE, CHART_TITLE } from "../../data/compareCopy";
import type { QuantHorizon } from "../../data/quantExplainers";

// Every picked stock's price as an index starting at 100, one line each.
//
// The quant chart's ground, axes and palette, so the two read as the same kind of
// object; the only change is that this one carries several lines told apart by
// colour and dash, and no RSI panel (RSI has its own row below, per stock).
// Percentages and lines carry no good or bad colour, as on the quant chart.

const AXIS_TEXT = "rgba(255,255,255,0.55)";
const GRID_LINE = "rgba(255,255,255,0.12)";
const NEUTRAL_LINE = "rgba(255,255,255,0.28)";
const MARGIN = { top: 8, right: 8, left: 0, bottom: 0 };

export default function CompareChart({
  series,
  horizon,
  isLoading,
  available,
}: {
  series: Rebasable[];
  horizon: QuantHorizon;
  isLoading: boolean;
  available: boolean;
}) {
  if (!available) return null;
  if (isLoading) {
    return <div className="h-64 rounded-[var(--radius-brand)] bg-brand-muted/10 animate-pulse" />;
  }

  const rows = rebaseSeries(series);
  const drawn = series.filter((s) => s.points.length >= 2);
  if (rows.length < 5 || drawn.length < 2) return null;

  const values = rows.flatMap((r) =>
    series.map((s) => r[s.ticker]).filter((v): v is number => typeof v === "number"),
  );
  const domain = priceDomain(values);

  return (
    <figure className="hero-card overflow-hidden p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-brand-accent">
          {CHART_TITLE}
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: AXIS_TEXT }}>
          {series.map((s, i) => (
            <span key={s.ticker} className="flex items-center gap-1.5">
              <Swatch index={i} />
              <span className="font-mono font-semibold text-white">{s.ticker}</span>
            </span>
          ))}
        </span>
      </figcaption>

      <div className="mt-3 h-56 [&_*:focus:not(:focus-visible)]:outline-none">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_LINE} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => formatAxisDate(d, horizon)}
              tick={{ fill: AXIS_TEXT, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              domain={domain}
              width={40}
              tick={{ fill: AXIS_TEXT, fontSize: 11 }}
              tickFormatter={(v: number) => String(Math.round(v))}
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine y={100} stroke={NEUTRAL_LINE} strokeDasharray="4 4" />
            <Tooltip
              cursor={{ stroke: NEUTRAL_LINE }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-xl border border-white/10 bg-[#10221e] px-3 py-2 text-xs text-white shadow-lg">
                    <p className="mb-1 text-[11px] text-white/60">{formatFullDate(String(label))}</p>
                    {series.map((s, i) => {
                      const v = payload.find((p) => p.dataKey === s.ticker)?.value;
                      return (
                        <p key={s.ticker} className="flex items-center justify-between gap-4 tabular-nums">
                          <span className="flex items-center gap-1.5 font-mono font-semibold">
                            <Swatch index={i} />
                            {s.ticker}
                          </span>
                          <span>{typeof v === "number" ? v.toFixed(1) : "—"}</span>
                        </p>
                      );
                    })}
                  </div>
                );
              }}
            />
            {series.map((s, i) => {
              const style = seriesFor(i);
              return (
                <Line
                  key={s.ticker}
                  type="monotone"
                  dataKey={s.ticker}
                  name={s.ticker}
                  stroke={style.stroke}
                  strokeWidth={2.25}
                  strokeDasharray={style.dash}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "#10221e" }}
                  connectNulls
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed" style={{ color: AXIS_TEXT }}>
        {CHART_NOTE}
      </p>
    </figure>
  );
}
