// Client for /api/compare. Only the written comparison lives here: every figure
// the page lines up comes from the endpoints the stock and fund pages already use.

import type { QuantHorizon } from "../../data/quantExplainers";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export interface ComparisonTraceResponse {
  /** In the order asked for. The cache behind it ignores order. */
  tickers: string[];
  horizon: QuantHorizon;
  /** False when the deployment has not switched the feature on. */
  available: boolean;
  /** The paragraph, or null for every quiet reason at once. */
  trace: string | null;
  source: "model" | "template" | null;
  model: string | null;
  generated_at: string | null;
}

// Generated the first time a set is asked for today and read back from a table
// after that. Informational and the same for every reader, so no token.
export async function getComparisonTrace(tickers: string[], horizon: QuantHorizon) {
  const params = new URLSearchParams({ tickers: tickers.join(","), horizon });
  const res = await fetch(`${BASE}/api/compare/trace?${params.toString()}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ComparisonTraceResponse>;
}
