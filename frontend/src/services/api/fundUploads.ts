/** Client for /api/fund-uploads: a reader's own fact sheets.
 *
 * Two steps, as on the server: `readFactSheet` sends the PDF and gets back
 * every field the model read, with a signed review token; `saveUploadedFund`
 * sends the reviewed values with that token. Every call is personal, so every
 * call carries the reader's token.
 */

import { supabase } from "../../lib/supabase";
import type { ComparisonTraceResponse } from "./compare";
import type { FundTraceResponse } from "./fundCatalogue";

const BASE = import.meta.env.VITE_API_BASE ?? "";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** What the reader made of one field. */
export type FieldStatus = "confirmed" | "check" | "missing";

/** A field's value as the server types it: a number, a yes/no, text or nothing. */
export type FieldValue = string | number | boolean | null;

export interface ReadField {
  field: string;
  value: FieldValue;
  status: FieldStatus;
  /** The line it was read from, as printed. Null for a missing field. */
  quote: string | null;
  page: number | null;
  /** "graphic" when it was read off a chart or shaded scale. */
  source: "text" | "graphic" | null;
  /** Why it is flagged, or why it is missing. */
  reasons: string[];
}

export interface FactSheetReading {
  review_token: string;
  file_sha256: string;
  model: string;
  prompt_version: string;
  cached: boolean;
  fields: ReadField[];
  counts: Record<FieldStatus, number>;
  /** The reader's fund this sheet will be added to, when they already have it. */
  existing_fund: { id: string; name: string | null } | null;
}

/** How one saved figure got there. */
export interface FieldProvenance {
  read?: FieldStatus;
  by?: "model" | "person" | null;
  quote?: string | null;
  page?: number | null;
  source?: "text" | "graphic" | null;
  /** What the model read, kept when the person changed or cleared it. */
  model_value?: FieldValue;
  reasons?: string[];
  derived_from?: string;
}

export interface UploadedSheet {
  id?: string;
  uploaded_fund_id: string;
  as_of: string;
  file_sha256: string;
  /** Under the catalogue snapshot's column names (ter, tic, risk_indicator_raw…). */
  figures: Record<string, FieldValue>;
  provenance: Record<string, FieldProvenance>;
  model: string | null;
  prompt_version: string | null;
  confirmed_at?: string;
}

export interface UploadedFund {
  id: string;
  name: string;
  fund_house: string | null;
  isin: string | null;
  jse_code: string | null;
  vehicle: "unit_trust" | "etf" | null;
  asisa_category: string | null;
  created_at?: string;
  updated_at?: string;
}

/** A fund in the reader's list, with its newest sheet. */
export interface UploadedFundSummary extends UploadedFund {
  sheet: UploadedSheet | null;
}

/** One fund with every sheet, newest first. */
export interface UploadedFundDetail extends UploadedFund {
  sheets: UploadedSheet[];
}

export interface SaveRequest {
  review_token: string;
  values: Record<string, FieldValue>;
  confirmed: string[];
  vehicle?: "unit_trust" | "etf" | null;
  fund_house?: string | null;
}

export interface SaveResponse {
  fund: UploadedFundDetail;
  warnings: Array<{ field: string; message: string }>;
}

/** A refusal the reader can act on, with whatever the server said about which
 *  fields. `status` 0 means the request never reached the server. */
export class UploadApiError extends Error {
  status: number;
  needsReview: string[];
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, needsReview: string[] = [], fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "UploadApiError";
    this.status = status;
    this.needsReview = needsReview;
    this.fieldErrors = fieldErrors;
  }
}

/** Turn a failed response into an UploadApiError, keeping the server's own
 *  message where it sent one. FastAPI sends `{detail: {...}}` for the service's
 *  refusals and `{detail: [...]}` for a request it could not parse. */
export async function errorFrom(res: Response, fallback: string): Promise<UploadApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Not JSON (a proxy's error page, say): the fallback says enough.
  }
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as { message?: string; needs_review?: string[]; fields?: Record<string, string> };
    return new UploadApiError(res.status, d.message ?? fallback, d.needs_review ?? [], d.fields ?? {});
  }
  if (typeof detail === "string") return new UploadApiError(res.status, detail);
  return new UploadApiError(res.status, fallback);
}

async function send(path: string, init: RequestInit, fallback: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/fund-uploads${path}`, {
      ...init,
      headers: { ...(await authHeaders()), ...(init.headers ?? {}) },
    });
  } catch {
    throw new UploadApiError(0, fallback);
  }
  if (!res.ok) throw await errorFrom(res, fallback);
  return res;
}

export async function readFactSheet(file: File, fallback: string): Promise<FactSheetReading> {
  const body = new FormData();
  body.append("file", file);
  const res = await send("/read", { method: "POST", body }, fallback);
  return res.json();
}

export async function saveUploadedFund(request: SaveRequest, fallback: string): Promise<SaveResponse> {
  const res = await send(
    "",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) },
    fallback,
  );
  return res.json();
}

export async function listUploadedFunds(fallback: string): Promise<UploadedFundSummary[]> {
  const res = await send("", { method: "GET" }, fallback);
  return res.json();
}

export async function getUploadedFund(id: string, fallback: string): Promise<UploadedFundDetail> {
  const res = await send(`/${encodeURIComponent(id)}`, { method: "GET" }, fallback);
  return res.json();
}

export async function deleteUploadedFund(id: string, fallback: string): Promise<void> {
  await send(`/${encodeURIComponent(id)}`, { method: "DELETE" }, fallback);
}

/** The fund page's reasoning trace for one of the reader's own funds, by its
 *  upload id. The same answer shape as the catalogue's, so the same panel
 *  shows it. */
export async function explainUploadedFundTrace(uploadId: string): Promise<FundTraceResponse> {
  const res = await send(`/${encodeURIComponent(uploadId)}/trace`, { method: "POST" }, "");
  return res.json();
}

/** Compare's written comparison for a set holding one of the reader's own
 *  funds (as `mine-<id>`). Written each time and never stored. */
export async function explainComparisonWithUploads(fundIds: string[]): Promise<ComparisonTraceResponse> {
  const res = await send(
    "/compare",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fund_ids: fundIds }) },
    "",
  );
  return res.json();
}
