import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  CHART_AXIS_TEXT,
  CHART_GRID_LINE,
  CHART_NEUTRAL_LINE,
  CHART_TOOLTIP_GROUND,
  SERIES,
} from '../compare/compareSeries';

// The pieces the three calculators share, so they read as one family with the rest
// of the platform: the field classes, the dark result card, the dark chart (the
// forest panel every chart on the stock and Compare pages sits on) and the
// "How this is worked out" fold for the assumptions and limits.

export const FIELD_LABEL = 'block text-sm font-semibold text-forest-900';
export const FIELD_INPUT =
  'h-11 w-full min-w-0 rounded-[12px] border border-forest-900/15 bg-white px-3.5 text-sm tabular-nums text-forest-900 transition-colors hover:border-forest-900/30 focus:border-forest-700 focus:outline-none aria-[invalid=true]:border-down';
export const FIELD_RANGE = 'h-6 w-full cursor-pointer accent-forest-700';
export const FIELD_HINT = 'text-xs leading-relaxed text-brand-muted-fg';
export const FIELD_ERROR = 'text-xs text-down';
/** The calculator card itself. */
export const TOOL_CARD = 'as-card min-w-0 space-y-6 p-5 sm:p-6';
/** The dark card the answer sits on. */
export const RESULT_CARD = 'min-w-0 self-start space-y-4 rounded-[20px] bg-forest-800 p-5 text-white sm:p-6';
export const RESULT_LABEL = 'text-xs font-semibold text-white/70';

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
const compactCurrency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', notation: 'compact', maximumFractionDigits: 1 });

export type ToolSeries = { key: string; name: string };

/**
 * A calculator's chart on the forest panel. The first series is the projection
 * (lime, solid), the second what was put in (dashed). An optional target is a
 * dashed reference line.
 */
export function ToolChart({ title, data, series, target, label, caption }: {
  title: string;
  data: { year: number }[];
  series: ToolSeries[];
  target?: number;
  /** The chart's text alternative. */
  label: string;
  caption?: ReactNode;
}) {
  return (
    <figure className="hero-card min-w-0 overflow-hidden p-4 sm:p-5">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-sm font-bold text-white">{title}</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: CHART_AXIS_TEXT }}>
          {series.map((s, i) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <svg width="18" height="4" aria-hidden="true">
                <line x1="1" y1="2" x2="17" y2="2" stroke={SERIES[i].stroke} strokeWidth="2.5" strokeDasharray={SERIES[i].dash} strokeLinecap="round" />
              </svg>
              <span className="text-white/85">{s.name}</span>
            </span>
          ))}
          {target !== undefined && (
            <span className="flex items-center gap-1.5">
              <svg width="18" height="4" aria-hidden="true">
                <line x1="1" y1="2" x2="17" y2="2" stroke={CHART_NEUTRAL_LINE} strokeWidth="2" strokeDasharray="4 4" />
              </svg>
              <span className="text-white/85">Target</span>
            </span>
          )}
        </span>
      </figcaption>
      <div className="mt-3 h-64 w-full min-w-0 sm:h-72 [&_*:focus:not(:focus-visible)]:outline-none" role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={CHART_GRID_LINE} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="year" tickFormatter={year => `Year ${year}`} minTickGap={25} tick={{ fill: CHART_AXIS_TEXT, fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis width={72} tickFormatter={value => compactCurrency.format(value)} tick={{ fill: CHART_AXIS_TEXT, fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ stroke: CHART_NEUTRAL_LINE }}
              labelFormatter={year => `Year ${year}`}
              formatter={(value, name) => [currency.format(Number(value)), name]}
              contentStyle={{ background: CHART_TOOLTIP_GROUND, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12, color: '#fff' }}
              labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
              itemStyle={{ color: '#fff' }}
            />
            {target !== undefined && (
              <ReferenceLine y={target} ifOverflow="extendDomain" stroke={CHART_NEUTRAL_LINE} strokeDasharray="4 4" />
            )}
            {series.map((s, i) => (
              <Line key={s.key} name={s.name} dataKey={s.key} stroke={SERIES[i].stroke} strokeDasharray={SERIES[i].dash}
                strokeWidth={i === 0 ? 2.5 : 2} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {caption && <p className="mt-2 text-xs leading-relaxed" style={{ color: CHART_AXIS_TEXT }}>{caption}</p>}
    </figure>
  );
}

/** The assumptions and limits, folded away under one heading, wording unchanged. */
export function HowWorkedOut({ children }: { children: ReactNode }) {
  return (
    <details className="group as-inset p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-forest-900 [&::-webkit-details-marker]:hidden">
        How this is worked out, and its limits
        <ChevronDown className="h-4 w-4 shrink-0 text-forest-700 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-3 space-y-2 text-xs leading-relaxed text-brand-muted-fg">{children}</div>
    </details>
  );
}
