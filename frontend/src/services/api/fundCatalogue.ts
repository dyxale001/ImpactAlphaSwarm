/** Client for /api/fund-catalogue.
 *
 * Named "catalogue" throughout, and so are its types. `getTopFunds`,
 * `useTopFunds` and `FundHolding` already exist and mean 13F institutional
 * holdings — somebody else's positions, not something anyone can invest in. Two
 * different things called Fund in one frontend is a bug waiting to be written.
 */

import { supabase } from "../../lib/supabase";

const BASE = import.meta.env.VITE_API_BASE ?? "";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

/** A fund's identity and the figures from its newest fact sheet. */
export interface CatalogueFund {
  fund_id: string;
  isin: string;
  name: string;
  vehicle: "unit_trust" | "etf";
  fund_house: string;
  manco: string;
  is_index_tracker: boolean;
  jse_code: string | null;
  asisa_geography: string;
  asisa_asset_class: string;
  asisa_category: string;
  tfsa_eligible: boolean;
  platforms: string[];
  curation_rule: string | null;
  /** The dated document the figures came from. Prefer this over the page. */
  mdd_url: string | null;
  /** The manager's listing page, used only when no dated document is on file. */
  mdd_page_url: string | null;
  as_of: string | null;
  risk_level: number | null;
  risk_label: string | null;
  /** Set when the manager publishes no risk indicator, explaining why this
   *  fund can be browsed but never matched. */
  risk_note: string | null;
  ter: number | null;
  tic: number | null;
  recommended_min_term_years: number | null;
  distribution_frequency: string | null;
  fund_size_zar: number | null;
  has_factsheet: boolean;
}

/** One dated fact sheet, exactly as it was transcribed. */
export interface FundSnapshot {
  as_of: string;
  mdd_url: string | null;
  risk_indicator_raw: string | null;
  risk_indicator_1to5: number | null;
  recommended_min_term_years: number | null;
  objective: string | null;
  benchmark: string | null;
  ter: number | null;
  tc: number | null;
  tic: number | null;
  min_lump_sum: number | null;
  min_debit_order: number | null;
  distribution_frequency: string | null;
  fund_size_zar: number | null;
  /** Null across the whole seed today: the allocation is a pie chart on the
   *  page and nothing reads it yet. Typed so the page can show it the day it
   *  arrives rather than needing a change then. */
  asset_allocation: Record<string, number> | null;
  performance: Record<string, number> | null;
  top_holdings: Record<string, number> | null;
  /** How the row got here — `manual` for everything transcribed by hand. */
  source: string | null;
  entered_by: string | null;

  // ── the regulated common core ────────────────────────────────────────────
  // Everything below is read off the manager's own document and stored dated.

  /** Cents per unit, as the manager priced it, with the day it was struck.
   *  For a unit trust this is the ONLY price there is: `fund_prices` is fed
   *  from a JSE symbol, so it covers listed ETFs and nothing else.
   *
   *  Display only. Deriving a return from a series of these is forbidden the
   *  same way it is for `fund_prices` — one monthly observation is not a
   *  performance history, and the manager's own published figures are the only
   *  performance this page shows. */
  nav_cpu: number | null;
  nav_date: string | null;

  /** Which period `ter`, `tc`, `tic` and `annual_management_fee` cover —
   *  `"1y"` or `"3y"`. Managers print both columns and the figures differ, so
   *  a cost shown without its period invites a comparison between two
   *  different measures. Null on rows transcribed before this was recorded. */
  fee_period: string | null;

  inception_date: string | null;
  /** The manager's own cut, which sits inside the TER. Worth its own line
   *  because two funds with the same TER are different propositions if one's
   *  is mostly management fee and the other's mostly trading. */
  annual_management_fee: number | null;

  /** The best and worst year the fund has had, as published — the most useful
   *  volatility figure here, because a beginner cannot act on "Moderate" and
   *  can act on "its worst year was -8%".
   *
   *  `return_extremes_basis` is not decoration: Satrix publishes rolling
   *  one-year periods (`"rolling_12m"`) and FundRock publishes calendar years
   *  (`"calendar_year"`). They answer the same question and are not the same
   *  statistic, so showing one fund's beside another's without saying which is
   *  the same not-like-for-like error the fee columns caused once already. */
  return_high_12m: number | null;
  return_low_12m: number | null;
  return_extremes_basis: string | null;

  /** The manager's own plain English, quoted and never paraphrased. Absent for
   *  the Satrix ETFs, which draw the risk profile as a graphic with no prose. */
  risk_narrative: string | null;
  /** The horizon in words, which sheets state far more often than they state a
   *  number — only five of nineteen give `recommended_min_term_years`. */
  horizon_words: string | null;

  portfolio_manager: string | null;
  /** Printed on unit trust sheets, absent from ETF sheets — so null means "the
   *  document does not say", not "no". Shown as a published fact and
   *  deliberately not used to filter matches. */
  regulation_28: boolean | null;
  /** Cents per unit by month, as the distribution table prints it. A month the
   *  sheet leaves as a dash is omitted; a month it prints as 0.00 is kept, and
   *  the two mean different things. */
  income_distribution: Record<string, number> | null;
}

/** One fund, its newest fact sheet, and the dates it has been published on. */
export interface CatalogueFundDetail extends CatalogueFund {
  snapshot: FundSnapshot | null;
  /** One entry per fact-sheet date, newest first. A corrected transcription
   *  supersedes rather than adding a second entry for the same date. */
  snapshot_history: Array<{ as_of: string; mdd_url: string | null }>;
  /** Our stored copy, used only when the manager's own link has rotted. */
  archived_mdd_url: string | null;
  vehicle_note: string | null;
  available_on: string | null;
  /** The templated sentence saying who classified this fund, as what, and when.
   *  Null when no fact sheet is on file, because there is then nothing to say. */
  why_this_appears: string | null;
  disclaimer: string;
  not_licensed: string;
}

export interface CatalogueResponse {
  asisa_version: string;
  count: number;
  funds: CatalogueFund[];
  inclusion_rule: string;
  not_covered: string;
  disclaimer: string;
  not_licensed: string;
}

export interface CatalogueCategory {
  code: string;
  tier1: string;
  tier2: string;
  tier3: string;
  name: string;
}

export interface CatalogueMeta {
  asisa_version: string;
  /** geography → asset class → focus, for the browse tree. */
  tree: Record<string, Record<string, string[]>>;
  categories: CatalogueCategory[];
  vehicles: Array<{ value: string; label: string; note: string }>;
  risk_scale: Array<{ level: number; label: string }>;
  mancos: string[];
  header: { eyebrow: string; title: string; strip: string };
}

export interface CatalogueBracket {
  risk_tolerance: string;
  effective: string;
  ceiling: number;
  ceiling_label: string | null;
  categories: Array<{ code: string; name: string }>;
  tracker_only: string[];
  horizon_years: number | null;
  horizon_band: string | null;
  purpose: string | null;
}

export interface FundMatch {
  fund_id: string;
  isin: string;
  name: string;
  vehicle: "unit_trust" | "etf";
  fund_house: string;
  manco: string;
  asisa_category: string;
  as_of: string;
  /** The dated document the reason sentence cites. */
  mdd_url: string | null;
  risk_level: number;
  risk_label: string | null;
  recommended_min_term_years: number | null;
  ter: number | null;
  tic: number | null;
  tfsa_eligible: boolean;
  is_index_tracker: boolean;
  rules_applied: string[];
  /** The sentence naming who classified the fund, as what, when, and which of
   *  the user's own answers the filter used. Rendered on the server so the
   *  wording is reviewed in one place. */
  reason: string;
}

export interface FundMatchesResponse {
  profile_found: boolean;
  bracket: CatalogueBracket | null;
  matches: FundMatch[];
  rules_applied: string[];
  fallback_risk_only: boolean;
  notice: string | null;
  section_title: string;
  not_licensed: string;
}

export interface CatalogueFilters {
  vehicle?: string;
  geography?: string;
  asset_class?: string;
  category?: string;
  manco?: string;
  tfsa?: boolean;
  q?: string;
}

function query(filters: CatalogueFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || value === false) continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export async function getFundCatalogue(filters: CatalogueFilters = {}) {
  const res = await fetch(`${BASE}/api/fund-catalogue${query(filters)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CatalogueResponse>;
}

export async function getFundCatalogueMeta() {
  const res = await fetch(`${BASE}/api/fund-catalogue/meta`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CatalogueMeta>;
}

/** What a set of unsaved onboarding answers maps to. */
export interface BracketPreview {
  bracket: CatalogueBracket | null;
  matches: FundMatch[];
  /** How many funds qualify in total; `matches` is a short sample of them. */
  match_count: number;
  notice: string | null;
  panel: string;
  not_licensed: string;
}

/** Preview a bracket from answers that have not been saved.
 *
 * Unauthenticated, and writes nothing: the answers travel with the request, so
 * a user who abandons onboarding leaves no trace. Runs the same matcher the
 * signed-in page runs, so the two cannot disagree.
 */
export async function previewBracket(
  riskTolerance: string,
  goals: Record<string, string> | null,
) {
  const res = await fetch(`${BASE}/api/fund-catalogue/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ risk_tolerance: riskTolerance, goals: goals ?? null }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<BracketPreview>;
}

/** A listed fund's closing prices. Empty for a unit trust, which has none. */
export interface FundPrices {
  fund_id: string;
  /** False for a unit trust: it is not on an exchange, so there is no price to
   *  draw. Distinguishes "no market price exists" from "not fetched yet". */
  listed: boolean;
  currency: "ZAR";
  closes: Array<{ date: string; close_zar: number }>;
  /** Says this is a closing price and not a return. Rendered with the chart. */
  note: string;
}

export async function getFundPrices(fundId: string) {
  const res = await fetch(
    `${BASE}/api/fund-catalogue/${encodeURIComponent(fundId)}/prices`,
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<FundPrices>;
}

export async function getCatalogueFund(fundId: string) {
  const res = await fetch(`${BASE}/api/fund-catalogue/${encodeURIComponent(fundId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CatalogueFundDetail>;
}

/** The caller's own matches. Authenticated: the user is taken from the token,
 *  never from a parameter, so nobody can ask for anyone else's. */
export async function getFundMatches() {
  const token = await getToken();
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`${BASE}/api/fund-catalogue/matches`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<FundMatchesResponse>;
}
