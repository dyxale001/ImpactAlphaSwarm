import {
  DETAIL_INCOME_LEAD,
  DETAIL_INCOME_TITLE,
  formatDistributionMonth,
} from "../../utils/fundsCopy";

/**
 * What the fund has actually paid out, in cents a unit.
 *
 * Kept because "income" means a payment schedule to a reader and a category to
 * a classification, and the schedule is the half the classification cannot
 * show. A user whose stated purpose at onboarding is income is already
 * identified, and "Pays income: Monthly" tells them the rhythm without telling
 * them the size.
 *
 * A month the sheet leaves as a dash is absent from the data rather than stored
 * as zero, because the two are different statements — one manager prints "0.00"
 * for a month it declared nothing and another prints "-", and only the first is
 * a declared figure. So this renders what is present and does not fill gaps.
 */
export default function FundIncomeHistory({
  distributions,
  className = "",
}: {
  distributions: Record<string, number> | null;
  className?: string;
}) {
  const entries = months(distributions);
  if (entries.length === 0) return null;

  const largest = Math.max(...entries.map((entry) => entry.cents), 0);

  return (
    <section className={`as-card flex flex-col gap-3 p-5 sm:p-6 ${className}`}>
      <h2 className="text-base font-bold text-brand-primary">{DETAIL_INCOME_TITLE}</h2>
      <p className="text-xs leading-relaxed text-forest-500">{DETAIL_INCOME_LEAD}</p>
      {/* A bar per payment, scaled to the largest, so a reader sees whether the
          income has been steady without comparing decimals down a column. */}
      <ul className="grid grid-cols-[5rem_minmax(0,1fr)_4.5rem] items-center gap-x-3.5 gap-y-3 text-[13px]">
        {entries.map((entry) => (
          <li key={entry.month} className="contents">
            <span className="text-forest-900">{formatDistributionMonth(entry.month)}</span>
            <span className="h-2 overflow-hidden rounded-full bg-forest-900/5" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-forest-500"
                style={{ width: `${largest > 0 ? (Math.max(entry.cents, 0) / largest) * 100 : 0}%` }}
              />
            </span>
            <span className="text-right font-bold tabular-nums text-brand-primary">
              {entry.cents.toFixed(2)}c
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Newest first. The keys are "YYYY-MM", so a string sort is a date sort. */
function months(distributions: Record<string, number> | null | undefined) {
  if (!distributions) return [];
  return Object.entries(distributions)
    .map(([month, cents]) => ({ month, cents: Number(cents) }))
    .filter((d) => Number.isFinite(d.cents))
    .sort((a, b) => b.month.localeCompare(a.month));
}

/** Whether there is anything here to draw.
 *
 *  Exported because the fund page has to know whether a whole tab would be
 *  empty before it renders the tab's label, and answering that with a second
 *  copy of the condition above is how the two would eventually disagree. The
 *  component and the page now ask the same function. */
export function hasIncome(distributions: Record<string, number> | null | undefined) {
  return months(distributions).length > 0;
}
