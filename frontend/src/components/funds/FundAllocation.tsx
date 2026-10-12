import {
  ALLOCATION_ABROAD_LABEL,
  ALLOCATION_HOME_LABEL,
  DETAIL_ALLOCATION_TITLE,
  sectionAsAt,
} from "../../utils/fundsCopy";

/**
 * What the fund holds, as its own sheet breaks it down.
 *
 * Rendered only when an allocation was recorded. Many tracker sheets print none
 * — the index is the answer — and a fund's breakdown is a chart on the page
 * rather than text, so it has to be read by a person and typed in. An absent
 * tile therefore means nobody has transcribed one yet, which the provenance
 * block on the page says outright.
 *
 * One stacked bar rather than a donut. The donut needed eight colours to keep
 * its slices apart, and five of them (amber, blue, purple, pink, red) came from
 * nowhere else in the product. A bar can be read in two palette ramps.
 *
 * When every row says where it is held ("Domestic equities", "Foreign cash"),
 * the bar splits into South Africa in forest and offshore in lime, because
 * that split is the first thing a South African reader asks of a balanced
 * fund. Nothing is added up: the sheet's own rows are shown under each heading
 * and the reader sees the split from the bar. A sheet that breaks down by
 * sector or by bond term instead gets one ramp and one list.
 *
 * The legend carries the percentages rather than leaving them to hover: this is
 * a document's figures, and a reader should be able to check them against the
 * sheet without a mouse.
 */

const HOME_RAMP = ["#1b3530", "#3e6258", "#6a8b82", "#9db6af", "#c9d8d3"];
const ABROAD_RAMP = ["#7fa837", "#9fcc4a", "#c7f269", "#e1f8ac", "#edfacc"];
// The single list: forest first, then lime, so the largest rows are the most
// separable and every colour is one the product already uses.
const ONE_RAMP = [
  "#1b3530",
  "#3e6258",
  "#6a8b82",
  "#9db6af",
  "#7fa837",
  "#c7f269",
  "#e1f8ac",
  "#c9d8d3",
];
// Swatches this pale disappear on a white card without an outline.
const PALE = new Set(["#c9d8d3", "#e1f8ac", "#edfacc", "#9db6af"]);

const HOME = /^(domestic|local|sa)\b\s*/i;
const ABROAD = /^(foreign|international|offshore|global)\b\s*/i;

type Slice = { name: string; value: number };
type Row = Slice & { label: string; color: string };
type Group = { heading: string | null; rows: Row[] };

export default function FundAllocation({
  allocation,
  asOf = null,
  sheetAsOf = null,
  className = "",
}: {
  allocation: Record<string, number> | null;
  /** The date the sheet gives its allocation, when not its own. */
  asOf?: string | null;
  sheetAsOf?: string | null;
  className?: string;
}) {
  const data = slices(allocation);
  if (data.length === 0) return null;
  const dated = sectionAsAt(asOf, sheetAsOf);
  const groups = grouped(data);
  const rows = groups.flatMap((group) => group.rows);

  return (
    <section className={`soft-card flex flex-col gap-4 p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-bold text-brand-primary">{DETAIL_ALLOCATION_TITLE}</h2>
        {dated && <DatedChip>{dated}</DatedChip>}
      </div>
      {/* Hidden from screen readers: the list below states every figure, and a
          bar of unlabelled widths read aloud would be noise. */}
      <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {rows.map((row) => (
          <span
            key={row.name}
            style={{ flexGrow: row.value, flexBasis: 0, backgroundColor: row.color }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-5">
        {groups.map((group) => (
          <div key={group.heading ?? "all"} className="min-w-0 flex-1 basis-44">
            {group.heading && (
              <p className="mb-2 text-xs font-bold text-brand-primary">{group.heading}</p>
            )}
            <ul className="flex flex-col gap-2 text-[13px]">
              {group.rows.map((row) => (
                <li key={row.name} className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${
                      PALE.has(row.color) ? "ring-1 ring-inset ring-forest-900/15" : ""
                    }`}
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-forest-900" title={row.name}>
                    {row.label}
                  </span>
                  <span className="font-bold tabular-nums text-brand-primary">{row.value}%</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function DatedChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-forest-50 px-2 py-0.5 text-[11px] font-bold text-forest-500">
      {children}
    </span>
  );
}

/** South Africa and offshore when every row says which it is; one list when
 *  any row does not, so no row is filed under a guess. */
function grouped(data: Slice[]): Group[] {
  const home = data.filter((slice) => HOME.test(slice.name));
  const abroad = data.filter((slice) => ABROAD.test(slice.name));
  if (home.length > 0 && abroad.length > 0 && home.length + abroad.length === data.length) {
    return [
      { heading: ALLOCATION_HOME_LABEL, rows: colour(home, HOME_RAMP, HOME) },
      { heading: ALLOCATION_ABROAD_LABEL, rows: colour(abroad, ABROAD_RAMP, ABROAD) },
    ];
  }
  return [{ heading: null, rows: colour(data, ONE_RAMP, null) }];
}

/** Each row's colour, and its name with the heading's word taken off it:
 *  under "In South Africa", "Domestic equities" reads as "Equities". */
function colour(rows: Slice[], ramp: string[], prefix: RegExp | null): Row[] {
  return rows.map((row, index) => {
    const rest = prefix ? row.name.replace(prefix, "") : row.name;
    const label = rest ? rest[0].toUpperCase() + rest.slice(1) : row.name;
    return { ...row, label, color: ramp[index % ramp.length] };
  });
}

/** The slices, largest first. One function, so the predicate and the bar
 *  cannot disagree about whether there is an allocation. */
function slices(allocation: Record<string, number> | null | undefined): Slice[] {
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
