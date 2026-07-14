// Shared display helper for the news transparency list on the full analysis
// page. Keeps the reliability-tier styling in one place.

export function tierMeta(tier: number | null | undefined): {
  label: string;
  cls: string;
} {
  switch (tier) {
    case 1:
      return { label: "Tier 1", cls: "bg-emerald-500/10 text-emerald-600" };
    case 2:
      return { label: "Tier 2", cls: "bg-amber-500/10 text-amber-600" };
    case 3:
      return { label: "Tier 3", cls: "bg-slate-400/15 text-slate-500" };
    default:
      return { label: "Other", cls: "bg-slate-400/15 text-slate-500" };
  }
}

// Styling for a per-item sentiment score badge (0-100). Colour tracks the same
// positive / neutral / negative thresholds used to label each article or post.
export function scoreMeta(score: number | null | undefined): {
  cls: string;
} {
  if (score == null) return { cls: "bg-slate-400/15 text-slate-500" };
  if (score >= 55) return { cls: "bg-emerald-500/10 text-emerald-600" };
  if (score <= 45) return { cls: "bg-rose-500/10 text-rose-600" };
  return { cls: "bg-slate-400/15 text-slate-500" };
}
