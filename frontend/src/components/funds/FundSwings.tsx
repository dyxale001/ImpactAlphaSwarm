import {
  DETAIL_SWINGS_HIGH_LABEL,
  DETAIL_SWINGS_LEAD,
  DETAIL_SWINGS_LOW_LABEL,
  DETAIL_SWINGS_TITLE,
  formatExtremesBasis,
  formatSignedPercent,
} from "../../utils/fundsCopy";

/**
 * The strongest and weakest year the manager has published.
 *
 * This is the most useful volatility figure on the page for someone new to
 * investing. A risk label describes a fund in the abstract — "Moderate" is a
 * word, and two funds carrying it can behave very differently — while "its
 * weakest year was -44.86%" is a year that happened.
 *
 * **The basis is rendered, not hidden, and the section refuses to draw without
 * it.** Managers do not publish this on one basis: Satrix reports the highest
 * and lowest annual *rolling* return over separate twelve-month periods,
 * FundRock reports the highest and lowest *calendar year* since inception. Both
 * answer "how bumpy is this", neither is the same statistic, and a page that
 * put one fund's rolling extreme beside another's calendar extreme with no note
 * would be manufacturing a comparison. That is the same not-like-for-like
 * mistake the fee columns made before `fee_period` existed, so the rule here is
 * the strict one: no basis, no section.
 */

export default function FundSwings({
  high,
  low,
  basis,
  className = "",
}: {
  high: number | null;
  low: number | null;
  basis: string | null;
  className?: string;
}) {
  const strongest = formatSignedPercent(high);
  const weakest = formatSignedPercent(low);
  const note = formatExtremesBasis(basis);

  // A figure whose basis we cannot name is a figure nobody can use.
  if (!note) return null;
  if (!strongest && !weakest) return null;

  return (
    <section className={`as-card flex flex-col gap-3 p-5 sm:p-6 ${className}`}>
      <h2 className="text-base font-bold text-brand-primary">{DETAIL_SWINGS_TITLE}</h2>
      <p className="text-xs leading-relaxed text-forest-500">{DETAIL_SWINGS_LEAD}</p>
      {/* Side by side, without a box each: two figures in one card do not need
          a card of their own, and the boxes made the tile the only one on the
          page drawing borders inside borders. */}
      <dl className="grid grid-cols-2 gap-4">
        {strongest && (
          <div>
            <dt className="text-xs font-semibold text-forest-500">{DETAIL_SWINGS_HIGH_LABEL}</dt>
            <dd className="mt-1 text-2xl font-extrabold leading-none tracking-[-0.02em] tabular-nums text-brand-primary">
              {strongest}
            </dd>
          </div>
        )}
        {weakest && (
          <div>
            <dt className="text-xs font-semibold text-forest-500">{DETAIL_SWINGS_LOW_LABEL}</dt>
            <dd
              className={`mt-1 text-2xl font-extrabold leading-none tracking-[-0.02em] tabular-nums ${
                (low ?? 0) < 0 ? "text-[#c0705f]" : "text-brand-primary"
              }`}
            >
              {weakest}
            </dd>
          </div>
        )}
      </dl>
      {high != null && low != null && <SwingRange high={high} low={low} />}
      <p className="mt-auto text-xs leading-relaxed text-forest-500">{note}</p>
    </section>
  );
}

/** The two years as one range with zero marked, so a reader sees how much of
 *  the spread is below zero. Drawn only when both ends were published. */
function SwingRange({ high, low }: { high: number; low: number }) {
  const floor = Math.min(low, 0);
  const span = Math.max(high, 0) - floor;
  if (span <= 0) return null;
  const zero = ((0 - floor) / span) * 100;
  return (
    <div className="relative h-9" aria-hidden="true">
      <span className="absolute inset-x-0 top-1.5 h-2 rounded-full bg-forest-900/5" />
      {zero > 0 && (
        <span
          className="absolute left-0 top-1.5 h-2 rounded-l-full bg-[#c0705f]/45"
          style={{ width: `${zero}%` }}
        />
      )}
      <span
        className="absolute right-0 top-1.5 h-2 rounded-r-full bg-forest-500/55"
        style={{ left: `${zero}%` }}
      />
      <span
        className="absolute top-0 h-5 w-0.5 -translate-x-1/2 bg-forest-900"
        style={{ left: `${zero}%` }}
      />
      <span
        className="absolute top-5 -translate-x-1/2 text-xs font-bold text-forest-900"
        style={{ left: `${zero}%` }}
      >
        0%
      </span>
    </div>
  );
}

/** Whether there is anything here to draw.
 *
 *  Exported because the fund page has to know whether a whole tab would be
 *  empty before it renders the tab's label, and answering that with a second
 *  copy of the condition above is how the two would eventually disagree. The
 *  component and the page now ask the same function. */
export function hasSwings(
  high: number | null | undefined,
  low: number | null | undefined,
  basis: string | null | undefined,
) {
  // The basis first, because it is the strict half: a figure whose basis we
  // cannot name is a figure nobody can use, whatever its value.
  if (!formatExtremesBasis(basis)) return false;
  return Boolean(formatSignedPercent(high) || formatSignedPercent(low));
}
