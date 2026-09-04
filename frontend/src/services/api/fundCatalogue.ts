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

export async function getCatalogueFund(fundId: string) {
  const res = await fetch(`${BASE}/api/fund-catalogue/${encodeURIComponent(fundId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CatalogueFund & Record<string, unknown>>;
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
