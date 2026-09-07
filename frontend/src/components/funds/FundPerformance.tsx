import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { DETAIL_PERFORMANCE_NOTE, DETAIL_PERFORMANCE_TITLE } from "../../utils/fundsCopy";

/**
 * The returns the manager publishes, for the periods its own sheet prints.
 *
 * These are the only performance figures on this page. The price chart above is
 * a series of closes and no return is derived from it, because a number we
 * calculated would sit beside these and look identical to them while meaning
 * something different.
 *
 * Bars are anchored at zero and negatives are drawn below it in a different
 * colour. A performance chart that floats its baseline flatters a bad period,
 * which is the one distortion a reader of this page cannot be expected to
 * catch — the figures are quoted, so the drawing has to be honest too.
 *
 * The note is mandatory rather than decorative: the fact sheets themselves
 * insist past returns do not predict future ones, and it is the claim the
 * documents most consistently make.
 */

const POSITIVE = "#3e6258";
const NEGATIVE = "#c0705f";

// Longest first is how a fact sheet reads, and it puts the least noisy figure
// first. Anything the sheet prints that is not in this list still renders,
// after the known periods, in whatever order it arrived.
//
// "inception" is last rather than first despite being the longest period: it
// covers a different span for every fund, so putting it beside the fixed
// periods at the head of the row would read as one more comparable column.
const PERIOD_ORDER = ["10y", "5y", "3y", "1y", "inception"];

export default function FundPerformance({
  performance,
  asAt,
}: {
  performance: Record<string, number> | null;
  asAt: string | null;
}) {
  if (!performance || Object.keys(performance).length === 0) return null;

  const entries = Object.entries(performance)
    .map(([period, value]) => ({ period, value: Number(value) }))
    .filter((d) => Number.isFinite(d.value));

  if (entries.length === 0) return null;

  entries.sort((a, b) => {
    const ai = PERIOD_ORDER.indexOf(a.period);
    const bi = PERIOD_ORDER.indexOf(b.period);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <section className="soft-card space-y-3 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-brand-primary">{DETAIL_PERFORMANCE_TITLE}</h2>
        {asAt && <span className="text-[11px] text-brand-secondary/70">to {asAt}</span>}
      </div>

      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={entries} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: "rgba(0,0,0,0.55)" }}
              tickLine={false}
              axisLine={false}
            />
            {/* Zero is always in view, so a negative period is visibly negative. */}
            <YAxis hide domain={[(min: number) => Math.min(0, min), "auto"]} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {entries.map((entry) => (
                <Cell key={entry.period} fill={entry.value < 0 ? NEGATIVE : POSITIVE} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                formatter={(v: number) => `${v}%`}
                style={{ fontSize: 11, fill: "rgba(0,0,0,0.65)" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] leading-relaxed text-brand-secondary/60">
        {DETAIL_PERFORMANCE_NOTE}
      </p>
    </section>
  );
}
