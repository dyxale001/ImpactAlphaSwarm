import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { DETAIL_ALLOCATION_TITLE } from "../../utils/fundsCopy";

/**
 * What the fund holds, as its own sheet breaks it down.
 *
 * Rendered only when an allocation was recorded. Many tracker sheets print none
 * — the index is the answer — and a fund's breakdown is a chart on the page
 * rather than text, so it has to be read by a person and typed in. An absent
 * donut therefore means nobody has transcribed one yet, which the provenance
 * block on the page says outright.
 *
 * The legend carries the percentages rather than leaving them to hover: this is
 * a document's figures, and a reader should be able to check them against the
 * sheet without a mouse.
 */

// Distinguishable at small sizes and in the page's light palette. Ordered so the
// first few — which take the largest slices — are the most separable.
const SLICE_COLORS = [
  "#3e6258",
  "#c7f269",
  "#7fa99b",
  "#e4b363",
  "#5b7c99",
  "#b58db6",
  "#d98880",
  "#a3b18a",
];

export default function FundAllocation({
  allocation,
}: {
  allocation: Record<string, number> | null;
}) {
  if (!allocation || Object.keys(allocation).length === 0) return null;

  const data = Object.entries(allocation)
    .map(([name, value]) => ({ name, value: Number(value) }))
    .filter((d) => Number.isFinite(d.value) && d.value > 0)
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) return null;

  return (
    <section className="soft-card space-y-3 p-6">
      <h2 className="text-sm font-bold text-brand-primary">{DETAIL_ALLOCATION_TITLE}</h2>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="h-40 w-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="90%"
                paddingAngle={1}
                isAnimationActive={false}
              >
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={SLICE_COLORS[index % SLICE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => [`${v}%`, ""]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex-1 space-y-1.5 text-xs">
          {data.map((entry, index) => (
            <li key={entry.name} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: SLICE_COLORS[index % SLICE_COLORS.length] }}
              />
              <span className="flex-1 text-brand-secondary">{entry.name}</span>
              <span className="font-semibold text-brand-primary">{entry.value}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
