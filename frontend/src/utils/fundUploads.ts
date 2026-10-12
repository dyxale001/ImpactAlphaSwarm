/** The rules of the review screen, kept out of the components so they can be
 *  tested without a DOM.
 *
 *  The one rule that matters most: a value the reader flagged ("check") cannot
 *  be saved until the person has decided about it, by confirming it, correcting
 *  it or clearing it. The server enforces the same rule against the signed
 *  review (src/funds/upload_service.py); this side exists so Save is disabled,
 *  and the reason shown, before anyone presses it.
 */

import type { CatalogueFund, CatalogueFundDetail, FundSnapshot } from "../services/api/fundCatalogue";
import type {
  FactSheetReading,
  FieldProvenance,
  FieldStatus,
  FieldValue,
  ReadField,
  UploadedFund,
  UploadedFundDetail,
  UploadedSheet,
} from "../services/api/fundUploads";
import { CIS_DISCLAIMER, FOOTER_NOT_LICENSED, formatAsAt, formatNav, formatPercent, formatRandAmount } from "./fundsCopy";
import {
  DETAIL_RISK_NONE,
  DETAIL_RISK_OFF_SCALE,
  FILE_EMPTY,
  FILE_NOT_PDF,
  FILE_TOO_LARGE,
  REVIEW_PENDING_MANY,
  REVIEW_PENDING_ONE,
  REVIEW_READY,
  REVIEW_REQUIRED_MISSING,
  SOURCE_CLEARED,
  SOURCE_CORRECTED,
  SOURCE_DERIVED,
  SOURCE_READ,
  SOURCE_READ_CHECKED,
  SOURCE_READ_GRAPHIC,
  SOURCE_READ_NO_PAGE,
  SOURCE_TYPED,
  VALUE_NO,
  VALUE_YES,
} from "./fundUploadsCopy";

/** The server's limit, repeated so a file that is plainly too big is refused
 *  before it is sent. FUND_UPLOAD_MAX_BYTES in backend/src/funds/config.py. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type FieldKind = "text" | "longtext" | "percent" | "rand" | "cents" | "years" | "date" | "choice" | "yesno";

export type FieldGroup = "identity" | "costs" | "risk" | "size" | "minimums" | "about" | "words";

export interface FieldMeta {
  label: string;
  kind: FieldKind;
  group: FieldGroup;
  /** For `choice`: the stored value and how it reads. */
  choices?: Array<[string, string]>;
  /** A short note under the input, where the unit is not obvious. */
  hint?: string;
}

/** Every field the reader asks for, in backend/src/funds/reading.py's FIELDS
 *  order. fundUploads.test.ts reads that file and fails if the two drift. */
export const FIELD_META: Record<string, FieldMeta> = {
  fund_name: { label: "Fund name", kind: "text", group: "identity" },
  as_of: { label: "Fact sheet date", kind: "date", group: "identity" },
  risk_indicator_raw: { label: "Risk rating", kind: "text", group: "risk", hint: "In the sheet's own words." },
  isin: { label: "ISIN", kind: "text", group: "identity" },
  jse_code: { label: "JSE code", kind: "text", group: "identity" },
  asisa_category: { label: "ASISA category", kind: "text", group: "identity" },
  benchmark: { label: "Benchmark", kind: "text", group: "about" },
  objective: { label: "Objective", kind: "longtext", group: "words" },
  ter: { label: "Total expense ratio (TER)", kind: "percent", group: "costs" },
  tc: { label: "Transaction costs (TC)", kind: "percent", group: "costs" },
  tic: { label: "Total investment charge (TIC)", kind: "percent", group: "costs" },
  annual_management_fee: { label: "Annual management fee", kind: "percent", group: "costs" },
  fee_period: {
    label: "Fees measured over",
    kind: "choice",
    group: "costs",
    choices: [["1y", "One year"], ["3y", "Three years"]],
  },
  fund_size_zar: { label: "Fund size", kind: "rand", group: "size" },
  nav_cpu: { label: "Price per unit (NAV)", kind: "cents", group: "size", hint: "In cents: R9.23 is 923." },
  nav_date: { label: "NAV date", kind: "date", group: "size" },
  inception_date: { label: "Launch date", kind: "date", group: "about" },
  distribution_frequency: { label: "Income distributions", kind: "text", group: "minimums" },
  recommended_min_term_years: { label: "Minimum term", kind: "years", group: "risk" },
  min_lump_sum: { label: "Minimum lump sum", kind: "rand", group: "minimums" },
  min_debit_order: { label: "Minimum debit order", kind: "rand", group: "minimums" },
  return_high_12m: { label: "Highest 12-month return", kind: "percent", group: "risk" },
  return_low_12m: { label: "Lowest 12-month return", kind: "percent", group: "risk" },
  return_extremes_basis: {
    label: "Returns measured over",
    kind: "choice",
    group: "risk",
    choices: [["rolling_12m", "Rolling twelve months"], ["calendar_year", "Calendar years"]],
  },
  risk_narrative: { label: "Risk, in the manager's words", kind: "longtext", group: "words" },
  horizon_words: { label: "Time horizon, in the manager's words", kind: "longtext", group: "words" },
  portfolio_manager: { label: "Portfolio manager", kind: "text", group: "about" },
  regulation_28: { label: "Regulation 28 compliant", kind: "yesno", group: "about" },
};

export const FIELD_NAMES = Object.keys(FIELD_META);

export const GROUPS: Array<[FieldGroup, string]> = [
  ["identity", "The fund"],
  ["costs", "Costs"],
  ["risk", "Risk and returns"],
  ["size", "Size and price"],
  ["minimums", "Minimums and income"],
  ["about", "About the fund"],
  ["words", "In the manager's words"],
];

/** A sheet cannot be saved without these: the fund needs a name, and every
 *  figure is dated by the sheet. REQUIRED in upload_service.py. */
export const REQUIRED_FIELDS = ["fund_name", "as_of"];

export function labelFor(field: string): string {
  return FIELD_META[field]?.label ?? field.replace(/_/g, " ");
}

// ── the file ────────────────────────────────────────────────────────────────

/** Why a chosen file cannot be sent, or null if it can. The server checks
 *  again; this only spares a round trip for the obvious cases. */
export function fileProblem(file: { name: string; type: string; size: number }): string | null {
  if (file.size === 0) return FILE_EMPTY;
  const looksPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksPdf) return FILE_NOT_PDF;
  if (file.size > MAX_UPLOAD_BYTES) return FILE_TOO_LARGE;
  return null;
}

// ── the review state ────────────────────────────────────────────────────────

export type Decision = "none" | "confirmed" | "cleared";

export interface FieldState {
  field: string;
  status: FieldStatus;
  /** What the model read, as the server typed it. */
  original: FieldValue;
  /** What is in the input now. */
  input: string;
  decision: Decision;
  read: ReadField;
}

export type ReviewState = Record<string, FieldState>;

/** A typed value as the text an input shows. */
export function toInput(value: FieldValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

export function initialReview(reading: Pick<FactSheetReading, "fields">): ReviewState {
  const state: ReviewState = {};
  for (const read of reading.fields) {
    state[read.field] = {
      field: read.field,
      status: read.status,
      original: read.value,
      input: toInput(read.value),
      decision: "none",
      read,
    };
  }
  return state;
}

const NUMERIC_KINDS: FieldKind[] = ["percent", "rand", "cents", "years"];

function asNumber(text: string): number | null {
  let cleaned = text.replace(/[%R\s, ]/g, "");
  const bracketed = /^\((.+)\)$/.exec(cleaned);
  if (bracketed) cleaned = `-${bracketed[1]}`;
  if (cleaned === "") return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

/** Whether the input says something different from what was read. "1.15",
 *  "1.15%" and " 1.150 " are the same TER; a value typed back to what was read
 *  is not a correction. */
export function isChanged(state: FieldState): boolean {
  const before = toInput(state.original).trim();
  const after = state.input.trim();
  const kind = FIELD_META[state.field]?.kind;
  if (kind && NUMERIC_KINDS.includes(kind)) {
    const a = asNumber(before);
    const b = asNumber(after);
    if (a !== null && b !== null) return a !== b;
  }
  return before.replace(/\s+/g, " ") !== after.replace(/\s+/g, " ");
}

/** Whether a field has the decision it needs. Only a flagged field needs one. */
export function isDecided(state: FieldState): boolean {
  if (state.status !== "check") return true;
  return state.decision === "confirmed" || state.decision === "cleared" || isChanged(state);
}

export function setInput(review: ReviewState, field: string, input: string): ReviewState {
  const current = review[field];
  if (!current) return review;
  return { ...review, [field]: { ...current, input, decision: "none" } };
}

/** "Looks right": the value as read, decided. */
export function confirmField(review: ReviewState, field: string): ReviewState {
  const current = review[field];
  if (!current) return review;
  return { ...review, [field]: { ...current, input: toInput(current.original), decision: "confirmed" } };
}

export function clearField(review: ReviewState, field: string): ReviewState {
  const current = review[field];
  if (!current) return review;
  return { ...review, [field]: { ...current, input: "", decision: "cleared" } };
}

/** Back to the value as read, undecided. */
export function undoField(review: ReviewState, field: string): ReviewState {
  const current = review[field];
  if (!current) return review;
  return { ...review, [field]: { ...current, input: toInput(current.original), decision: "none" } };
}

export interface ReviewProgress {
  flagged: number;
  decided: number;
  /** Flagged fields still waiting for a decision, in field order. */
  pending: string[];
  /** Required fields that are empty. */
  missingRequired: string[];
  canSave: boolean;
  /** One line saying what still stands between the person and Save. */
  summary: string;
}

export function reviewProgress(review: ReviewState): ReviewProgress {
  const states = FIELD_NAMES.map((name) => review[name]).filter(Boolean) as FieldState[];
  const flagged = states.filter((s) => s.status === "check");
  const pending = flagged.filter((s) => !isDecided(s)).map((s) => s.field);
  const missingRequired = REQUIRED_FIELDS.filter((name) => !(review[name]?.input ?? "").trim());
  let summary = REVIEW_READY;
  if (pending.length === 1) summary = REVIEW_PENDING_ONE;
  else if (pending.length > 1) summary = REVIEW_PENDING_MANY.replace("{count}", String(pending.length));
  else if (missingRequired.length)
    summary = REVIEW_REQUIRED_MISSING.replace(
      "{fields}",
      missingRequired.map((name) => labelFor(name).toLowerCase()).join(" and "),
    );
  return {
    flagged: flagged.length,
    decided: flagged.length - pending.length,
    pending,
    missingRequired,
    canSave: pending.length === 0 && missingRequired.length === 0,
    summary,
  };
}

/** The three sections of the review screen, each in field order: flagged
 *  first, because those are the ones that need the person; then what the sheet
 *  did not state, required ones first; then what was read cleanly. */
export function reviewSections(review: ReviewState) {
  const states = FIELD_NAMES.map((name) => review[name]).filter(Boolean) as FieldState[];
  const missing = states.filter((s) => s.status === "missing");
  return {
    flagged: states.filter((s) => s.status === "check"),
    missing: [
      ...missing.filter((s) => REQUIRED_FIELDS.includes(s.field)),
      ...missing.filter((s) => !REQUIRED_FIELDS.includes(s.field)),
    ],
    confirmed: states.filter((s) => s.status === "confirmed"),
  };
}

/** The value to send for a field the person typed into. A yes/no goes as a
 *  boolean; everything else as text, which the server types and checks. */
function fromInput(field: string, input: string): FieldValue {
  if (FIELD_META[field]?.kind === "yesno") {
    if (input === "yes") return true;
    if (input === "no") return false;
  }
  return input.trim();
}

/** What Save sends. Unchanged values go back exactly as the server typed them,
 *  so it can tell an accepted value from a typed one. */
export function buildSaveValues(review: ReviewState): { values: Record<string, FieldValue>; confirmed: string[] } {
  const values: Record<string, FieldValue> = {};
  const confirmed: string[] = [];
  for (const name of FIELD_NAMES) {
    const state = review[name];
    if (!state) continue;
    const hadValue = state.original !== null && state.original !== "";
    const empty = state.input.trim() === "";
    if (state.decision === "cleared" || empty) {
      // Clearing a read value is a decision, sent as null; an empty field the
      // sheet never stated is simply left out.
      if (hadValue) values[name] = null;
      continue;
    }
    if (!isChanged(state)) {
      values[name] = state.original;
      if (state.status === "check" && state.decision === "confirmed") confirmed.push(name);
      continue;
    }
    values[name] = fromInput(name, state.input);
  }
  return { values, confirmed };
}

// ── showing a value ─────────────────────────────────────────────────────────

/** A saved or read value as the fund page prints it. */
export function formatFieldValue(field: string, value: FieldValue | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const meta = FIELD_META[field];
  if (typeof value === "boolean") return value ? VALUE_YES : VALUE_NO;
  if (!meta) return String(value);
  if (typeof value === "number") {
    if (meta.kind === "percent") return formatPercent(value) ?? String(value);
    if (meta.kind === "rand") return formatRandAmount(value) ?? String(value);
    if (meta.kind === "cents") return formatNav(value) ?? String(value);
    if (meta.kind === "years") return `${value} ${value === 1 ? "year" : "years"}`;
    return String(value);
  }
  if (meta.kind === "date") return formatAsAt(value) ?? value;
  if (meta.kind === "choice") return meta.choices?.find(([v]) => v === value)?.[1] ?? value;
  return value;
}

/** One line saying how a saved figure got there, for an uploaded fund's page. */
export function describeSource(field: string, p: FieldProvenance | undefined): string | null {
  if (!p) return null;
  if (p.derived_from) return SOURCE_DERIVED;
  const page = p.page ? String(p.page) : null;
  const read = formatFieldValue(field, p.model_value ?? null) || "—";
  if (p.by === "person") return p.read === "missing" ? SOURCE_TYPED : SOURCE_CORRECTED.replace("{value}", read);
  if (p.by === null || p.by === undefined) {
    return p.read && p.read !== "missing" ? SOURCE_CLEARED.replace("{value}", read) : null;
  }
  // Accepted as read.
  if (!page) return SOURCE_READ_NO_PAGE;
  if (p.read === "check") {
    return (p.source === "graphic" ? SOURCE_READ_GRAPHIC : SOURCE_READ_CHECKED).replace("{page}", page);
  }
  return SOURCE_READ.replace("{page}", page);
}

// ── an uploaded fund in the catalogue's shape ───────────────────────────────

/** How an uploaded fund is named beside catalogue funds: in a Compare link and
 *  a comparison's ids. UPLOAD_PREFIX in backend/src/funds/upload_service.py. A
 *  catalogue id is a bare UUID, so the two can never collide, and "mine-<uuid>"
 *  passes Compare's own id check (letters, digits and dashes). */
export const UPLOAD_COMPARE_PREFIX = "mine-";

export function uploadCompareId(uploadId: string): string {
  return `${UPLOAD_COMPARE_PREFIX}${uploadId}`;
}

/** The upload's own id from a Compare id, or null for a catalogue fund. */
export function uploadIdOf(compareId: string): string | null {
  return compareId.startsWith(UPLOAD_COMPARE_PREFIX) ? compareId.slice(UPLOAD_COMPARE_PREFIX.length) : null;
}

const num = (v: FieldValue | undefined): number | null => (typeof v === "number" ? v : null);
const str = (v: FieldValue | undefined): string | null => (typeof v === "string" && v ? v : null);

function snapshotOf(sheet: UploadedSheet): FundSnapshot {
  const f = sheet.figures;
  return {
    as_of: sheet.as_of,
    mdd_url: null,
    risk_indicator_raw: str(f.risk_indicator_raw),
    risk_indicator_1to5: num(f.risk_indicator_1to5),
    recommended_min_term_years: num(f.recommended_min_term_years),
    objective: str(f.objective),
    benchmark: str(f.benchmark),
    ter: num(f.ter),
    tc: num(f.tc),
    tic: num(f.tic),
    min_lump_sum: num(f.min_lump_sum),
    min_debit_order: num(f.min_debit_order),
    distribution_frequency: str(f.distribution_frequency),
    fund_size_zar: num(f.fund_size_zar),
    // The reader reads none of these off a sheet (they are charts and tables).
    asset_allocation: null,
    performance: null,
    top_holdings: null,
    source: "uploaded",
    entered_by: null,
    nav_cpu: num(f.nav_cpu),
    nav_date: str(f.nav_date),
    fee_period: str(f.fee_period),
    inception_date: str(f.inception_date),
    annual_management_fee: num(f.annual_management_fee),
    return_high_12m: num(f.return_high_12m),
    return_low_12m: num(f.return_low_12m),
    return_extremes_basis: str(f.return_extremes_basis),
    risk_narrative: str(f.risk_narrative),
    horizon_words: str(f.horizon_words),
    portfolio_manager: str(f.portfolio_manager),
    regulation_28: typeof f.regulation_28 === "boolean" ? f.regulation_28 : null,
    income_distribution: null,
  };
}

/** An uploaded fund as a catalogue card or search row reads it, under its
 *  Compare id. What no sheet states (tax-free eligibility, index tracking,
 *  platforms) is false or empty, and nothing that reads this shape shows those
 *  as claims about an upload: the page and Compare label it as yours. */
export function asCatalogueFund(fund: UploadedFund, sheet: UploadedSheet | null): CatalogueFund {
  const snap = sheet ? snapshotOf(sheet) : null;
  const level = snap?.risk_indicator_1to5 ?? null;
  const raw = snap?.risk_indicator_raw ?? null;
  const tiers = (fund.asisa_category ?? "").split(" - ");
  return {
    fund_id: uploadCompareId(fund.id),
    isin: fund.isin ?? "",
    name: fund.name,
    vehicle: (fund.vehicle ?? "") as CatalogueFund["vehicle"],
    fund_house: fund.fund_house ?? "",
    manco: "",
    is_index_tracker: false,
    jse_code: fund.jse_code,
    asisa_geography: tiers[0] ?? "",
    asisa_asset_class: tiers[1] ?? "",
    asisa_category: fund.asisa_category ?? "",
    tfsa_eligible: false,
    platforms: [],
    curation_rule: null,
    mdd_url: null,
    mdd_page_url: null,
    as_of: sheet?.as_of ?? null,
    risk_level: level,
    risk_label: raw,
    risk_note: level !== null ? null : raw ? DETAIL_RISK_OFF_SCALE.replace("{raw}", raw) : DETAIL_RISK_NONE,
    ter: snap?.ter ?? null,
    tic: snap?.tic ?? null,
    recommended_min_term_years: snap?.recommended_min_term_years ?? null,
    distribution_frequency: snap?.distribution_frequency ?? null,
    fund_size_zar: snap?.fund_size_zar ?? null,
    has_factsheet: Boolean(sheet),
  };
}

/** An uploaded fund as the fund page reads it: its newest sheet as the
 *  snapshot, every sheet in the history, and the catalogue's own regulatory
 *  statements, which hold for any collective investment scheme. */
export function asCatalogueDetail(fund: UploadedFundDetail): CatalogueFundDetail {
  const newest = fund.sheets[0] ?? null;
  return {
    ...asCatalogueFund(fund, newest),
    snapshot: newest ? snapshotOf(newest) : null,
    snapshot_history: fund.sheets.map((s) => ({ as_of: s.as_of, mdd_url: null })),
    archived_mdd_url: null,
    vehicle_note: null,
    available_on: null,
    why_this_appears: null,
    why_parts: null,
    disclaimer: CIS_DISCLAIMER,
    not_licensed: FOOTER_NOT_LICENSED,
  };
}
