// How long a discovered company keeps its "Discovered" badge after the
// asset-discovery agent first picked it up.
export const NEW_COMPANY_DAYS = 7;

/** Discovered by the agent, and recently enough for that to still be news.
 *
 * The window is the whole point. `origin` records how an asset first entered the
 * dictionary and never changes again, so testing it alone badged household names
 * like MU or GOOG as "Discovered" months after the agent happened to surface
 * them. The badge's own tooltip calls the asset "a fresh candidate beyond the
 * curated list", which stops being true within about a week. */
export function isRecentlyDiscovered(row: {
  origin?: string | null;
  first_discovered_at?: string | null;
}): boolean {
  if (row.origin !== "discovered" || !row.first_discovered_at) return false;
  const days =
    (Date.now() - new Date(row.first_discovered_at).getTime()) / 86_400_000;
  return days >= 0 && days <= NEW_COMPANY_DAYS;
}

// Human-readable provenance for an asset the discovery agent surfaced, derived
// from its `discovery_sources` (see backend asset_discovery / migration 009).
// Used as the tooltip on the "Discovered" badge.
export function discoveryProvenance(sources: string[] | null | undefined): string {
  const s = sources ?? [];
  const how: string[] = [];
  if (s.includes("stocktwits_trending")) how.push("trending on StockTwits");
  if (s.includes("llm")) how.push("an AI sector scan");
  if (s.includes("yfinance_screener")) how.push("a market-activity screen");
  const via = how.length ? how.join(" + ") : "the discovery agent";
  return `Surfaced by the discovery agent via ${via}, a fresh candidate beyond the curated list, validated before being analysed.`;
}
