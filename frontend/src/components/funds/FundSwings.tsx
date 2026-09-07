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
}: {
  high: number | null;
  low: number | null;
  basis: string | null;
}) {
  const strongest = formatSignedPercent(high);
  const weakest = formatSignedPercent(low);
  const note = formatExtremesBasis(basis);

  // A figure whose basis we cannot name is a figure nobody can use.
  if (!note) return null;
  if (!strongest && !weakest) return null;

  return (
    <section className="soft-card space-y-3 p-6">
      <h2 className="text-sm font-bold text-brand-primary">{DETAIL_SWINGS_TITLE}</h2>
      <p className="text-xs leading-relaxed text-brand-secondary/80">{DETAIL_SWINGS_LEAD}</p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {strongest && (
          <div className="rounded-xl border border-brand-border/40 p-3">
            <dt className="text-[11px] uppercase tracking-wide text-brand-secondary/70">
              {DETAIL_SWINGS_HIGH_LABEL}
            </dt>
            <dd className="mt-1 text-lg font-bold text-brand-primary">{strongest}</dd>
          </div>
        )}
        {weakest && (
          <div className="rounded-xl border border-brand-border/40 p-3">
            <dt className="text-[11px] uppercase tracking-wide text-brand-secondary/70">
              {DETAIL_SWINGS_LOW_LABEL}
            </dt>
            <dd
              className={`mt-1 text-lg font-bold ${
                (low ?? 0) < 0 ? "text-[#c0705f]" : "text-brand-primary"
              }`}
            >
              {weakest}
            </dd>
          </div>
        )}
      </dl>
      <p className="text-[11px] leading-relaxed text-brand-secondary/60">{note}</p>
    </section>
  );
}
