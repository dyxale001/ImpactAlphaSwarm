import type { NewsTier } from "../../data/sentimentMethodology";

// One reliability tier and the fixed share of the news sub-score it contributes.
export default function TierShareRow({ tier }: { tier: NewsTier }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-3">
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tier.badgeCls}`}
      >
        Tier {tier.tier}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-brand-fg">{tier.label}</p>
        <p className="truncate text-[11px] text-brand-muted-fg">
          {tier.examples}
        </p>
      </div>
      <span className="shrink-0 font-mono text-sm font-semibold text-brand-fg">
        {tier.sharePct}%
      </span>
    </div>
  );
}
