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
import { formatAxisDate, formatChange, formatFullDate, priceDomain } from "../research/quantSeries";
import { changeSeries, type Rebasable } from "../../utils/compareStocks";
import {
  CHART_AXIS_TEXT,
  CHART_GRID_LINE,
  CHART_NEUTRAL_LINE,
  CHART_TOOLTIP_GROUND,
  seriesFor,
} from "./compareSeries";
import { Swatch } from "./CompareGrid";
import { CHART_EMPTY, CHART_NOTE, CHART_TITLE } from "../../data/compareCopy";
import { QUANT_HORIZONS, type QuantHorizon } from "../../data/quantExplainers";
import PanelToggle from "./PanelToggle";

// Every picked stock's percent change since the start of the window, one line each.
//
// The quant chart's ground, axes and palette, so the two read as the same kind of
// object; the only change is that this one carries several lines told apart by
// colour and dash, and no RSI panel (RSI has its own row below, per stock).
// Percentages and lines carry no good or bad colour, as on the quant chart.
//
// The window toggle sits on the chart it changes, as on the stock page's Quant
// tab. The written comparison above the tabs follows it too, and says which
// window it describes. The frame and toggle stay up while a new window loads or
// when a window is too short to draw, so the reader can always switch back.

const AXIS_TEXT = CHART_AXIS_TEXT;
const GRID_LINE = CHART_GRID_LINE;
const NEUTRAL_LINE = CHART_NEUTRAL_LINE;
const MARGIN = { top: 8, right: 8, left: 0, bottom: 0 };

// "+20%", "0%", "−10%": whole percents on the axis, the Change row's minus sign.
function axisPercent(v: number): string {
  const r = Math.round(v);
  if (r === 0) return "0%";
  return `${r > 0 ? "+" : "−"}${Math.abs(r)}%`;
}

export default function CompareChart({
  series,
  horizon,
  onHorizon,
  isLoading,
  available,
}: {
  series: Rebasable[];
  horizon: QuantHorizon;
  onHorizon: (h: QuantHorizon) => void;
  isLoading: boolean;
  available: boolean;
}) {
  if (!available) return null;

  const rows = isLoading ? [] : changeSeries(series);
  const drawn = series.filter((s) => s.points.length >= 2);
  const drawable = !isLoading && rows.length >= 5 && drawn.length >= 2;

  const values = rows.flatMap((r) =>
    series.map((s) => r[s.ticker]).filter((v): v is number => typeof v === "number"),
  );
  const domain = priceDomain(values);

  return (
    <figure className="hero-card overflow-hidden p-4">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
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
          <PanelToggle
            label="Price window"
            value={horizon}
            options={QUANT_HORIZONS.map((h) => ({ id: h, label: h }))}
            onChange={onHorizon}
          />
        </span>
      </figcaption>

      <div className="mt-3 h-56 [&_*:focus:not(:focus-visible)]:outline-none">
        {isLoading ? (
          <div className="h-full rounded-xl bg-white/5 animate-pulse" aria-label="Loading prices" />
        ) : !drawable ? (
          <p className="pt-2 text-sm" style={{ color: AXIS_TEXT }}>
            {CHART_EMPTY}
          </p>
        ) : (
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
                width={48}
                tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                tickFormatter={axisPercent}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine y={0} stroke={NEUTRAL_LINE} strokeDasharray="4 4" />
              <Tooltip
                cursor={{ stroke: NEUTRAL_LINE }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white shadow-lg"
                        style={{ background: CHART_TOOLTIP_GROUND }}
                      >
                      <p className="mb-1 text-[11px] text-white/60">{formatFullDate(String(label))}</p>
                      {series.map((s, i) => {
                        const v = payload.find((p) => p.dataKey === s.ticker)?.value;
                        return (
                          <p key={s.ticker} className="flex items-center justify-between gap-4 tabular-nums">
                            <span className="flex items-center gap-1.5 font-mono font-semibold">
                              <Swatch index={i} />
                              {s.ticker}
                            </span>
                            <span>{typeof v === "number" ? formatChange(v) : "—"}</span>
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
                    activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_TOOLTIP_GROUND }}
                    connectNulls
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed" style={{ color: AXIS_TEXT }}>
        {CHART_NOTE}
      </p>
    </figure>
  );
}
