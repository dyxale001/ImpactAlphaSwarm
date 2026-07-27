import { supabase } from "../../lib/supabase";

const BASE = import.meta.env.VITE_API_BASE ?? "";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export async function startAnalysis(payload: {
  universes: string[];
  watchlist?: string[];
  risk_tolerance?: string;
  expertise_level?: string;
}) {
  const token = await getToken();
  console.log("Token from session:", token ? "✓ exists" : "✗ null");

  if (!token) {
    throw new Error("No auth token — user may not be logged in");
  }

  const res = await fetch(`${BASE}/api/analysis/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getStatus(runId: string) {
  const res = await fetch(`${BASE}/api/analysis/status/${runId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getResult(runId: string) {
  const res = await fetch(`${BASE}/api/analysis/result/${runId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getUsdZarExchangeRate() {
  const res = await fetch(`${BASE}/api/analysis/fx-rate/usd-zar`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    base_currency: string;
    quote_currency: string;
    rate: number;
    source: string;
  }>;
}

export interface WhaleTransactionDTO {
  name: string;
  role?: string | null;
  type: "buy" | "sell";
  shares: number;
  price: number | null;
  value: number | null;
  transaction_date: string | null;
  filing_date: string | null;
  transaction_code?: string | null;
}

export interface WhaleActivityResponse {
  ticker: string;
  transactions: WhaleTransactionDTO[];
  source: string | null;
  cached?: boolean;
  fetched_at?: string | null;
}

// Informational insider-dealings feed. Not tied to the recommendation, so it
// needs no auth token — it's public reference data.
export async function getWhaleActivity(ticker: string) {
  const res = await fetch(`${BASE}/api/whales/${encodeURIComponent(ticker)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<WhaleActivityResponse>;
}

export interface InstitutionalHolderDTO {
  holder: string;
  pct_held: number | null;
  shares: number | null;
  value: number | null;
  pct_change: number | null;
  date_reported: string | null;
}

export interface InstitutionalOwnershipResponse {
  ticker: string;
  institutions_pct: number | null;
  insiders_pct: number | null;
  institutions_count: number | null;
  holders: InstitutionalHolderDTO[];
  source: string | null;
  cached?: boolean;
  fetched_at?: string | null;
}

// Institutional ownership (13F). Informational reference data, no auth needed.
export async function getInstitutionalHolders(ticker: string) {
  const res = await fetch(
    `${BASE}/api/institutions/${encodeURIComponent(ticker)}`,
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<InstitutionalOwnershipResponse>;
}

export interface FundPosition {
  ticker: string;
  universe: string | null;
  pct_held: number | null;
  value: number | null;
  pct_change: number | null;
}

export interface FundHolding {
  fund: string;
  total_value: number;
  // Plain-English blurb of who the fund is. Sourced from the backend so the
  // wording is editable without a frontend redeploy. May be absent on older
  // cached payloads.
  description?: string | null;
  positions: FundPosition[];
}

export interface TopFundsResponse {
  funds: FundHolding[];
  cached?: boolean;
  fetched_at?: string | null;
}

// Institutional data inverted to per-fund holdings across all tracked assets.
export async function getTopFunds() {
  const res = await fetch(`${BASE}/api/funds`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<TopFundsResponse>;
}

// One insider dealing, tagged with the company it belongs to. Same shape as
// WhaleTransactionDTO plus company context, since the overview feed mixes
// companies together and each row has to say which one it is.
export interface ActivityFeedItem extends WhaleTransactionDTO {
  ticker: string;
  company: string | null;
  universe: string | null;
}

export interface AccumulationHighlight {
  ticker: string;
  company: string | null;
  universe: string | null;
  /**
   * Median change in stake across the company's reporting funds at the last
   * filing. Median rather than mean because one fund moving from a token
   * position to a real one skews the average past +100%.
   */
  median_pct_change: number;
  holders: number;
}

export interface NewCompany {
  ticker: string;
  company: string | null;
  universe: string | null;
  first_discovered_at: string | null;
}

export interface WhaleOverviewResponse {
  feed: ActivityFeedItem[];
  highlights: {
    biggest_buy: ActivityFeedItem | null;
    biggest_sell: ActivityFeedItem | null;
    most_accumulated: AccumulationHighlight | null;
    most_reduced: AccumulationHighlight | null;
  };
  counts: {
    companies: number;
    transactions: number;
    new_companies: number;
    companies_with_insider_data: number;
  };
  new_companies: NewCompany[];
  fetched_at: string | null;
}

// Cross-company whale activity for the Whale Watching landing page. Aggregated
// from caches the backend already holds, so it is a fast single call.
export async function getWhaleOverview() {
  const res = await fetch(`${BASE}/api/whales/activity`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<WhaleOverviewResponse>;
}
