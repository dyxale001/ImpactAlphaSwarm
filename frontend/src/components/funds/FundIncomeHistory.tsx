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
}: {
  distributions: Record<string, number> | null;
}) {
  if (!distributions || Object.keys(distributions).length === 0) return null;

  // Newest first. The keys are "YYYY-MM", so a string sort is a date sort.
  const entries = Object.entries(distributions)
    .map(([month, cents]) => ({ month, cents: Number(cents) }))
    .filter((d) => Number.isFinite(d.cents))
    .sort((a, b) => b.month.localeCompare(a.month));

  if (entries.length === 0) return null;

  return (
    <section className="soft-card space-y-3 p-6">
      <h2 className="text-sm font-bold text-brand-primary">{DETAIL_INCOME_TITLE}</h2>
      <p className="text-xs leading-relaxed text-brand-secondary/80">{DETAIL_INCOME_LEAD}</p>
      <ul className="space-y-1.5">
        {entries.map((entry) => (
          <li
            key={entry.month}
            className="flex items-center justify-between gap-3 border-b border-brand-border/30 pb-1.5 text-xs last:border-0"
          >
            <span className="text-brand-secondary">
              {formatDistributionMonth(entry.month)}
            </span>
            <span className="font-semibold text-brand-primary">
              {entry.cents.toFixed(2)}c
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
