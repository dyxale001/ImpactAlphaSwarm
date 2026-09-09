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
  className = "",
}: {
  allocation: Record<string, number> | null;
  className?: string;
}) {
  const data = slices(allocation);
  if (data.length === 0) return null;

  return (
    <section className={`soft-card flex flex-col gap-3 p-5 ${className}`}>
      <h2 className="text-sm font-bold text-brand-primary">{DETAIL_ALLOCATION_TITLE}</h2>
      <div className="flex flex-col items-center gap-4 xl:flex-row xl:items-start">
        <div className="h-36 w-36 shrink-0">
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
                formatter={(value: unknown) => [`${Number(value)}%`, ""]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="w-full min-w-0 flex-1 space-y-1.5 text-xs">
          {data.map((entry, index) => (
            <li key={entry.name} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: SLICE_COLORS[index % SLICE_COLORS.length] }}
              />
              <span className="min-w-0 flex-1 truncate text-brand-secondary" title={entry.name}>
                {entry.name}
              </span>
              <span className="font-semibold text-brand-primary">{entry.value}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The slices, largest first. One function, so the predicate and the donut
 *  cannot disagree about whether there is an allocation. */
function slices(allocation: Record<string, number> | null | undefined) {
  if (!allocation) return [];
  return Object.entries(allocation)
    .map(([name, value]) => ({ name, value: Number(value) }))
    .filter((d) => Number.isFinite(d.value) && d.value > 0)
    .sort((a, b) => b.value - a.value);
}

/** Whether there is anything here to draw.
 *
 *  Exported because the fund page has to know whether a whole tab would be
 *  empty before it renders the tab's label, and answering that with a second
 *  copy of the condition above is how the two would eventually disagree. The
 *  component and the page now ask the same function. */
export function hasAllocation(allocation: Record<string, number> | null | undefined) {
  return slices(allocation).length > 0;
}
