import type { NewsTier } from "../../data/sentimentMethodology";
import { tierMeta } from "../research/sentimentDisplay";

// One reliability tier and the fixed share of the news sub-score it contributes.
//
// The pill is tierMeta's, the one every article list on the platform wears, so a
// reader who meets "Tier 2" in a lime pill on the news page meets the same pill here.
// The publisher list wraps rather than truncating: it is the whole point of the row.
export default function TierShareRow({ tier }: { tier: NewsTier }) {
  const meta = tierMeta(tier.tier);
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-3">
      <span
        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}
      >
        {meta.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-brand-fg">{tier.label}</p>
        <p className="text-[11px] leading-relaxed text-brand-muted-fg">
          {tier.examples}
        </p>
      </div>
      <span className="shrink-0 font-mono text-sm font-semibold text-brand-fg">
        {tier.sharePct}%
      </span>
    </div>
  );
}
