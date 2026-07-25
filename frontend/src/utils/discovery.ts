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
  return `Surfaced by the discovery agent via ${via} — a fresh candidate beyond the curated list, validated before being analysed.`;
}
