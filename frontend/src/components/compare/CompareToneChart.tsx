import { useState } from "react";
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
import type { SentimentHistoryPoint } from "../../services/api/analysis";
import { formatDay } from "../research/sentimentDays";
import { sentimentVerdict } from "../research/sentimentDisplay";
import { hasNewsHistory, toneRows, type ToneSource } from "../../utils/compareStocks";
import {
  CHART_AXIS_TEXT,
  CHART_GRID_LINE,
  CHART_NEUTRAL_LINE,
  CHART_TOOLTIP_GROUND,
  seriesFor,
} from "./compareSeries";
import { Swatch } from "./CompareGrid";
import PanelToggle from "./PanelToggle";
import {
  TONE_CHART_BUILDING,
  TONE_CHART_EMPTY,
  TONE_CHART_NOTE,
  TONE_CHART_TITLE,
  TONE_SOURCE_NEWS,
  TONE_SOURCE_SOCIAL,
} from "../../data/compareCopy";

// Every picked stock's tone over the last seven days, one line each, on the same
// forest ground, line styles and swatches as the price chart, so a column is the
// same line in both. Social or news, one at a time: six lines on one plot would
// be a tangle, and the stock page draws the two sources apart for the same reason.
//
// The score axis runs 0 to 100 with 50 marked as neutral. A day with nothing
// written is a gap, never a zero, and each day is dotted so a stock with a
// single day of tone still shows.

const AXIS_TEXT = CHART_AXIS_TEXT;
const GRID_LINE = CHART_GRID_LINE;
const NEUTRAL_LINE = CHART_NEUTRAL_LINE;
const MARGIN = { top: 8, right: 8, left: 0, bottom: 0 };

export interface ToneSeries {
  ticker: string;
  points: SentimentHistoryPoint[];
}

export default function CompareToneChart({
  series,
  isLoading,
  isSeeding,
}: {
  series: ToneSeries[];
  isLoading: boolean;
  isSeeding: boolean;
}) {
  const [picked, setPicked] = useState<ToneSource>("social");
  const withNews = hasNewsHistory(series);
  const source: ToneSource = withNews ? picked : "social";

  if (isLoading) {
    return <div className="h-64 rounded-[var(--radius-brand)] bg-brand-muted/10 animate-pulse" />;
  }

  const rows = toneRows(series, source);
  const plotted = series.some((s) => rows.some((r) => typeof r[s.ticker] === "number"));

  // ds-allow-hardcode:start text-[11px] is the platform's caption size, as on the price and quant charts
  return (
    <figure className="hero-card overflow-hidden p-4">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-brand-accent">
          {TONE_CHART_TITLE}
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            {series.map((s, i) => (
              <span key={s.ticker} className="flex items-center gap-1.5">
                <Swatch index={i} />
                <span className="font-mono font-semibold text-white">{s.ticker}</span>
              </span>
            ))}
          </span>
          {withNews && (
            <PanelToggle
              label="Tone source"
              value={source}
              options={[
                { id: "social", label: TONE_SOURCE_SOCIAL },
                { id: "news", label: TONE_SOURCE_NEWS },
              ]}
              onChange={setPicked}
            />
          )}
        </span>
      </figcaption>

      {plotted ? (
        <div className="mt-3 h-56 [&_*:focus:not(:focus-visible)]:outline-none">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_LINE} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => formatDay(d)}
                tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 50, 100]}
                width={32}
                tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine y={50} stroke={NEUTRAL_LINE} strokeDasharray="4 4" />
              <Tooltip
                cursor={{ stroke: NEUTRAL_LINE }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div
                      className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white shadow-lg"
                      style={{ background: CHART_TOOLTIP_GROUND }}
                    >
                      <p className="mb-1 text-[11px] text-white/60">{formatDay(String(label))}</p>
                      {series.map((s, i) => {
                        const v = payload.find((p) => p.dataKey === s.ticker)?.value;
                        const score = typeof v === "number" ? v : null;
                        return (
                          <p key={s.ticker} className="flex items-center justify-between gap-4 tabular-nums">
                            <span className="flex items-center gap-1.5 font-mono font-semibold">
                              <Swatch index={i} />
                              {s.ticker}
                            </span>
                            <span>
                              {score === null
                                ? "Nothing written"
                                : `${Math.round(score)} · ${sentimentVerdict(score).label}`}
                            </span>
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
                    dot={{ r: 3, fill: style.stroke, strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_TOOLTIP_GROUND }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-3 text-sm" style={{ color: AXIS_TEXT }}>
          {isSeeding ? TONE_CHART_BUILDING : TONE_CHART_EMPTY}
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed" style={{ color: AXIS_TEXT }}>
        {TONE_CHART_NOTE}
      </p>
    </figure>
  );
  // ds-allow-hardcode:end
}
