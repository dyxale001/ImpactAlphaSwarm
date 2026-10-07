// The Compare page keeps its whole state in the URL: what kind of thing is being
// compared, which ones, and over what window. That is what makes a comparison
// shareable and back-button safe without a table of saved comparisons, and what
// lets "Compare with…" on a stock or fund page open this page already filled.
//
// Pure, so it is tested without a router: parse what is there, tolerate junk,
// and always write back the same canonical form.

import {
  DEFAULT_QUANT_HORIZON,
  QUANT_HORIZONS,
  type QuantHorizon,
} from "../data/quantExplainers";

export type CompareKind = "stocks" | "funds";

export const MAX_COMPARE = 3;

export interface CompareState {
  kind: CompareKind;
  /** Tickers (upper-cased) for stocks, fund ids for funds, in the order picked. */
  ids: string[];
  horizon: QuantHorizon;
}

const TICKER = /^[A-Z0-9][A-Z0-9.-]{0,9}$/;
// Fund ids are uuids today; anything id-shaped is let through and the fund
// request decides whether it exists.
const FUND_ID = /^[A-Za-z0-9-]{1,64}$/;

/** One id cleaned for its kind, or null when it cannot be one. */
export function cleanId(raw: string, kind: CompareKind): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (kind === "stocks") {
    const upper = value.toUpperCase();
    return TICKER.test(upper) ? upper : null;
  }
  return FUND_ID.test(value) ? value : null;
}

/** De-duplicated, in order, and never more than three. */
export function cleanIds(raw: string[], kind: CompareKind): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const id = cleanId(r, kind);
    if (id && !out.includes(id)) out.push(id);
    if (out.length === MAX_COMPARE) break;
  }
  return out;
}

export function parseCompareParams(params: URLSearchParams): CompareState {
  const kind: CompareKind = params.get("kind") === "funds" ? "funds" : "stocks";
  const ids = cleanIds((params.get("ids") ?? "").split(","), kind);
  const h = (params.get("h") ?? "").toUpperCase();
  const horizon = (QUANT_HORIZONS as string[]).includes(h)
    ? (h as QuantHorizon)
    : DEFAULT_QUANT_HORIZON;
  return { kind, ids, horizon };
}

/** The canonical query string. The horizon is left out for funds, which have none,
 *  and when it is the default, so the plain link stays short. */
export function buildCompareParams(state: CompareState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("kind", state.kind);
  if (state.ids.length) params.set("ids", state.ids.join(","));
  if (state.kind === "stocks" && state.horizon !== DEFAULT_QUANT_HORIZON) {
    params.set("h", state.horizon);
  }
  return params;
}

/** The link "Compare with…" uses from a stock or fund page. */
export function compareHref(kind: CompareKind, ids: string[] = []): string {
  return `/compare?${buildCompareParams({ kind, ids: cleanIds(ids, kind), horizon: DEFAULT_QUANT_HORIZON }).toString()}`;
}
