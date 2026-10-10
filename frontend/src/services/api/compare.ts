// Client for /api/compare. Only the written comparison lives here: every figure
// the page lines up comes from the endpoints the stock and fund pages already use.

import { supabase } from "../../lib/supabase";
import type { QuantHorizon } from "../../data/quantExplainers";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export interface ComparisonTraceResponse {
  /** In the order asked for. The store behind it ignores order. */
  tickers: string[];
  horizon: QuantHorizon;
  /** False when the deployment has not switched the feature on. */
  available: boolean;
  /** The paragraph, or null: none written yet, or the stored one is out of date. */
  trace: string | null;
  source: "model" | "template" | null;
  model: string | null;
  generated_at: string | null;
  /** Whether it explains the reader's own run, or covers prices only (no run). */
  personal: boolean;
  /** When the run it explains finished. */
  run_at: string | null;
}

// Personal (it explains the reader's own run), so both calls carry their token.
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** The reader's stored comparison, if it still describes the page. Never writes,
 *  never costs a model call, so the page asks on every visit. */
export async function getSavedComparison(tickers: string[], horizon: QuantHorizon) {
  const params = new URLSearchParams({ tickers: tickers.join(","), horizon });
  const res = await fetch(`${BASE}/api/compare/trace?${params.toString()}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ComparisonTraceResponse>;
}

/** Writes the reader's comparison now. What the button calls. */
export async function explainComparison(tickers: string[], horizon: QuantHorizon) {
  const res = await fetch(`${BASE}/api/compare/trace`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ tickers, horizon }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ComparisonTraceResponse>;
}
