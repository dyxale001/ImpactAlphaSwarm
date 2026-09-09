import {
  DETAIL_HOLDINGS_LEAD,
  DETAIL_HOLDINGS_NOTE,
  DETAIL_HOLDINGS_TITLE,
} from "../../utils/fundsCopy";

/**
 * The largest positions the fact sheet prints, as a share of the fund.
 *
 * Transcribed for seven of twenty-six sheets, typed in the public DTO,
 * selected by the repository and editable in admin — and rendered nowhere
 * until now. The reader was the only party on the page who could not see it.
 *
 * ## Why a bar list rather than a chart
 *
 * Ten rows of a single measure need no library and no axis: the bar is a
 * comparison between the rows, and the figure beside it is the fact. A pie of
 * ten positions that sum to about a quarter of the fund would be the wrong
 * drawing entirely — it would imply the slices were the whole.
 *
 * The bars are scaled to the largest holding, not to 100%. At Coronation
 * Balanced Plus's real numbers — a top position of 3.1% — bars drawn against
 * 100 would be ten identical hairlines, which says less than the text does.
 * Scaling to the leader makes the shape of the concentration readable, and the
 * note says what the list is so the scale cannot be misread as "share held".
 *
 * ## The note is load-bearing
 *
 * A holdings list invites the reading "this is what the fund owns", and it is
 * not: it is the positions the sheet chose to print, on the sheet's own date,
 * out of a portfolio that may hold hundreds. Satrix 40's ten largest come to
 * 57% of an index fund; Coronation's come to 21% of a balanced one. Neither is
 * the portfolio.
 */
export default function FundHoldings({
  holdings,
  className = "",
}: {
  holdings: Record<string, number> | null;
  className?: string;
}) {
  const rows = positions(holdings);
  if (rows.length === 0) return null;

  // The leader sets the scale. Guarded against a zero so a sheet that printed
  // all-zero shares cannot divide by it.
  const largest = Math.max(...rows.map((row) => row.share), 0) || 1;

  return (
    <section className={`soft-card flex flex-col gap-3 p-5 ${className}`}>
      <h2 className="text-sm font-bold text-brand-primary">{DETAIL_HOLDINGS_TITLE}</h2>
      <p className="text-xs leading-relaxed text-brand-secondary/80">{DETAIL_HOLDINGS_LEAD}</p>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
            <span className="min-w-0 truncate text-[11.5px] text-brand-secondary" title={row.name}>
              {row.name}
            </span>
            <span className="text-[11.5px] font-semibold tabular-nums text-brand-primary">
              {formatShare(row.share)}
            </span>
            <span
              className="col-span-2 h-1 overflow-hidden rounded-full bg-brand-border/25"
              aria-hidden="true"
            >
              <span
                className="block h-full rounded-full bg-forest-500"
                style={{ width: `${(row.share / largest) * 100}%` }}
              />
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-auto text-[11px] leading-relaxed text-brand-secondary/60">
        {DETAIL_HOLDINGS_NOTE}
      </p>
    </section>
  );
}

/** The positions, largest first. One function, so the predicate and the list
 *  cannot disagree about whether there are holdings to draw. */
function positions(holdings: Record<string, number> | null | undefined) {
  if (!holdings) return [];
  return Object.entries(holdings)
    .map(([name, share]) => ({ name, share: Number(share) }))
    .filter((row) => Number.isFinite(row.share) && row.share > 0)
    .sort((a, b) => b.share - a.share);
}

/**
 * Whether there is anything here to draw.
 *
 * Exported because the fund page has to know whether a whole tab would be
 * empty before it renders that tab's label, and answering that with a second
 * copy of the condition above is how the two would eventually disagree.
 */
export function hasHoldings(holdings: Record<string, number> | null | undefined) {
  return positions(holdings).length > 0;
}

/** A share the way the sheet prints it: 9.16%, 3.1%, 1.5%. */
function formatShare(share: number): string {
  const trimmed = Number.isInteger(share) ? String(share) : String(Number(share.toFixed(2)));
  return `${trimmed}%`;
}
