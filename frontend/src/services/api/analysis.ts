import { supabase } from "../../lib/supabase";
import type { SocialPost } from "../../components/research/SocialPosts";
import type { NewsArticle } from "../../components/research/NewsArticles";
import type { AnalysisStatus } from "../../types/analysisLifecycle";

const BASE = import.meta.env.VITE_API_BASE ?? "";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export interface StartAnalysisResponse {
  run_id: string;
  /**
   * True when a run was already in flight for this user and the id below is that
   * existing run rather than a new one. Callers poll it the same way either way.
   */
  already_running?: boolean;
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
    throw new Error("No auth token, user may not be logged in");
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
  return res.json() as Promise<StartAnalysisResponse>;
}

export async function getStatus(runId: string) {
  const res = await fetch(`${BASE}/api/analysis/status/${runId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AnalysisStatus>;
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

export async function deactivateOwnAccount() {
  const token = await getToken();
  if (!token) throw new Error("No auth token");

  const res = await fetch(`${BASE}/api/account/deactivate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function reactivateOwnAccount() {
  const token = await getToken();
  if (!token) throw new Error("No auth token");

  const res = await fetch(`${BASE}/api/account/reactivate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export interface SentimentHistoryPoint {
  date: string;
  /** 0-100, or null on a day with no posts. Null is a gap, not a zero. */
  score: number | null;
  post_count: number;
  bullish: number;
  bearish: number;
  /** That day's most influential posts, same shape as SocialPost. */
  top_posts: SocialPost[];
  /**
   * Always null. A column on social_sentiment_daily that nothing writes.
   * The generated day summary lives in its own table and is fetched separately,
   * by getDaySummary below, because it covers news and social together and this
   * row knows only about social.
   */
  summary: string | null;

  // ── news, present only when NEWS_HISTORY_ENABLED is on ──────────────────
  // Optional rather than required, because the field decides the question at the
  // point of use: absent means this deployment stores no news history and the chart
  // draws no news line, while null on a present field means this particular day had
  // no coverage. Collapsing the two would make a switched-off feature look like a
  // universally silent one.
  //
  // This is NOT the news sub-score per day. The sub-score decays across the whole
  // window; a day's score has decay switched off within the day, exactly as the
  // social series does. See backend/src/utils/ns_daily.py.
  /** 0-100, or null on a day with no articles. */
  news_score?: number | null;
  news_count?: number;
  news_bullish?: number;
  news_bearish?: number;
  /** That day's article counts by reliability tier, keyed "1" | "2" | "3". */
  news_tier_counts?: Record<string, number>;
  /** That day's most influential articles, same shape as NewsArticle. */
  top_articles?: NewsArticle[];
}

export interface SentimentHistoryResponse {
  ticker: string;
  points: SentimentHistoryPoint[];
  /**
   * True when this ticker has never had its history walked and the backend has just
   * started doing so, having already answered this request. The walk takes a few
   * seconds; poll again rather than concluding there is no data.
   */
  seeding?: boolean;
}

// Daily social sentiment for the trend chart. Reads rows the runs already wrote, so
// it never touches StockTwits on the way to a response and never waits on an AI run.
// Informational, so no auth token is needed.
export async function getSentimentHistory(ticker: string, days = 7) {
  const res = await fetch(
    `${BASE}/api/assets/${encodeURIComponent(ticker)}/sentiment-history?days=${days}`,
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<SentimentHistoryResponse>;
}

export interface DaySummaryResponse {
  ticker: string;
  /** The day asked for, YYYY-MM-DD. */
  day: string;
  /**
   * The generated paragraph, or null when there is nothing to show. Null covers
   * every uninteresting reason at once: summaries switched off, a day outside the
   * stored window, a day nothing was collected on, or a generation that failed.
   * They all render the same quiet fallback, because to a reader they are the same
   * thing and none of them is an error.
   */
  summary: string | null;
  /**
   * False while the day is still in progress, so the paragraph describes a partial
   * day and will be rewritten. True once the day has closed, after which it never
   * changes again.
   */
  is_final: boolean;
  generated_at: string | null;
}

// The written summary for one day of the trend chart. Served from a stored row, and
// generated on the spot only the first time a day is asked for, so this is usually a
// single indexed read and occasionally a couple of seconds. Informational, so no auth
// token is needed.
export async function getDaySummary(ticker: string, day: string) {
  const res = await fetch(
    `${BASE}/api/assets/${encodeURIComponent(ticker)}/sentiment-summary?day=${encodeURIComponent(day)}`,
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<DaySummaryResponse>;
}

// When sentiment was last written, across every ticker. "Last AI run" is a per-user
// timestamp for a full analysis; this is separate because the intraday tick and the
// lazy chart seed both write sentiment outside any run, so a run can be hours old while
// the sentiment behind it was topped up an hour ago. Global rather than per ticker, and
// unauthenticated like the other informational endpoints.
export async function getSentimentLastUpdated() {
  const res = await fetch(`${BASE}/api/sentiment/last-updated`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ updated_at: string | null }>;
}
