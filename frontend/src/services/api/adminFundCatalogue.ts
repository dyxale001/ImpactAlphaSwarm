/** Client for /api/admin/fund-catalogue.
 *
 * Separate from the public client because everything here needs a bearer token
 * and everything there is anonymous, and because these calls go to the backend
 * rather than to Supabase directly. The backend holds the service-role key and
 * runs the validators, so a form that wrote straight to the table would skip
 * the only checks that exist.
 *
 * There is no delete function. The tables grant no DELETE — a fund is retired
 * by clearing `is_active`, a fact sheet corrected by recording another one.
 */

import { supabase } from "../../lib/supabase";

const BASE = import.meta.env.VITE_API_BASE ?? "";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Not signed in");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** One problem the validators found, as the form should show it. */
export interface FieldProblem {
  field: string;
  message: string;
  severity: string;
}

/** A refusal carrying every problem, so a form can mark all its fields at once. */
export class ValidationError extends Error {
  problems: FieldProblem[];

  constructor(message: string, problems: FieldProblem[]) {
    super(message);
    this.name = "ValidationError";
    this.problems = problems;
  }
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/admin/fund-catalogue${path}`, {
    ...init,
    headers: await authHeaders(),
  });
  if (res.status === 422 || res.status === 409) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail ?? {};
    // A duplicate ISIN is refused with 409 and no per-field problems, but it is
    // a problem with one field and belongs on it — otherwise the message lands
    // in the form footer while the offending box looks fine.
    const problems: FieldProblem[] =
      detail.problems ??
      (res.status === 409
        ? [{ field: "isin", message: detail.message ?? "Already in the catalogue.", severity: "error" }]
        : []);
    throw new ValidationError(detail.message ?? "This row cannot be saved yet.", problems);
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

/** How old a fund's newest fact sheet is, and what the list calls that. */
export interface Staleness {
  as_of: string | null;
  age_days: number | null;
  status: "missing" | "unreadable" | "stale" | "ageing" | "current";
}

export interface AdminFund {
  id: string;
  isin: string;
  name: string;
  fund_house: string;
  manco: string;
  vehicle: string;
  is_index_tracker: boolean;
  jse_code: string | null;
  yahoo_symbol: string | null;
  asisa_geography: string;
  asisa_asset_class: string;
  asisa_category: string;
  tfsa_eligible: boolean;
  platforms: string[];
  mdd_page_url: string | null;
  curation_rule: string | null;
  is_active: boolean;
  updated_at: string | null;
  staleness: Staleness;
}

export interface AdminFundList {
  count: number;
  funds: AdminFund[];
  soft_stale_days: number;
  stale_days: number;
}

export interface FundInput {
  isin: string;
  name: string;
  fund_house: string;
  manco: string;
  vehicle: string;
  asisa_geography: string;
  asisa_asset_class: string;
  asisa_category: string;
  is_index_tracker?: boolean;
  jse_code?: string | null;
  yahoo_symbol?: string | null;
  tfsa_eligible?: boolean;
  platforms?: string[];
  mdd_page_url?: string | null;
  curation_rule?: string | null;
}

export interface SnapshotInput {
  as_of: string;
  mdd_url?: string | null;
  risk_indicator_raw?: string | null;
  risk_indicator_1to5?: number | null;
  recommended_min_term_years?: number | null;
  objective?: string | null;
  benchmark?: string | null;
  ter?: number | null;
  tc?: number | null;
  tic?: number | null;
  fund_size_zar?: number | null;
  min_lump_sum?: number | null;
  min_debit_order?: number | null;
  distribution_frequency?: string | null;
  /** Asset class → percent. Must account for the whole fund if given at all. */
  asset_allocation?: Record<string, number>;
  /** Period ("1y", "3y", …) → annualised percent, as the sheet prints them. */
  performance?: Record<string, number>;
}

interface Saved<T> {
  warnings: FieldProblem[];
  fund?: T;
  snapshot?: T;
}

/** What reading a fact sheet produced: values, their source text, and refusals. */
export interface Extraction {
  template: string;
  url: string;
  fields: Record<string, string | number>;
  /** The text each value was read from, so review is a comparison not a nod. */
  evidence: Record<string, string>;
  /** Fields the template would not read, and why. These arrive blank on
   *  purpose: a wrong value that looks right is worse than an empty box. */
  unresolved: Array<{ field: string; reason: string }>;
}

/** Read a fact sheet to pre-fill the form. Writes nothing. */
export async function extractFactsheet(url: string) {
  return send<Extraction>("/extract", { method: "POST", body: JSON.stringify({ url }) });
}

export async function listAdminFunds() {
  return send<AdminFundList>("/funds", { method: "GET" });
}

export async function createAdminFund(body: FundInput) {
  return send<Saved<AdminFund>>("/funds", { method: "POST", body: JSON.stringify(body) });
}

/** Edit a fund. Passing `is_active: false` retires it; there is no delete. */
export async function updateAdminFund(fundId: string, patch: Partial<FundInput> & { is_active?: boolean }) {
  return send<Saved<AdminFund>>(`/funds/${encodeURIComponent(fundId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Record a fact sheet. Also how a correction is made: the newer row wins. */
export async function addAdminSnapshot(fundId: string, body: SnapshotInput) {
  return send<Saved<unknown>>(`/funds/${encodeURIComponent(fundId)}/snapshots`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
