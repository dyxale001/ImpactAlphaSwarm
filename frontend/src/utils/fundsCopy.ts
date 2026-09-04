/** Page furniture for the funds section, and the same forbidden-term scan.
 *
 * Only the chrome lives here. Every sentence that describes a fund or explains a
 * match is rendered by the backend, deliberately: the wording is what keeps this
 * feature on the right side of the line between information and advice, and it
 * has to be reviewable in one place rather than split across two languages.
 *
 * What this module does own is the scan, mirrored from the backend so a string
 * added to a component is checked by the same rule. A test scans everything
 * exported here.
 */

/** Wording that turns information into a proposal, a ranking or a promise. */
export const FORBIDDEN_TERMS = [
  "recommend",
  "suitable",
  "should",
  "best",
  "top pick",
  "ideal",
  "outperform",
  "buy",
  "safe",
  "guaranteed",
  "for you",
] as const;

/** Word-boundary patterns, so "safety" and "buyer" pass while "safest" and
 *  "buying" do not. Kept in step with `backend/src/funds/copy.py`. */
const FORBIDDEN_PATTERNS: Array<[string, RegExp]> = [
  ["recommend", /\brecommend\w*/i],
  ["suitable", /\bsuitab\w*/i],
  ["should", /\bshould\b/i],
  ["best", /\bbest\b/i],
  ["top pick", /\btop\s+picks?\b/i],
  ["ideal", /\bideal(?:ly)?\b/i],
  ["outperform", /\boutperform\w*/i],
  ["buy", /\bbuy(?:s|ing)?\b|\bbought\b/i],
  ["safe", /\bsafe(?:r|st)?\b/i],
  ["guaranteed", /\bguarantee\w*/i],
  ["for you", /\bfor\s+you\b/i],
];

export function findForbiddenTerms(text: string): string[] {
  return FORBIDDEN_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([term]) => term);
}

export const FUNDS_NAV_LABEL = "Funds";

export const FUNDS_PAGE_TITLE = "Funds";

export const FUNDS_PAGE_LEAD =
  "South African unit trusts and JSE-listed exchange traded funds, described from the fact sheets their managers publish.";

/** Answers the question a reader of an asset page could not answer: which
 *  market, which currency, and whether the rand figure is a conversion. */
export const FUNDS_HEADER_STRIP =
  "South African funds, JSE-listed where they are exchange traded. Priced in rand, not converted from another currency.";

export const BROWSE_TITLE = "Browse every category we cover";

export const BROWSE_LEAD =
  "Grouped by the classification the industry uses: where a fund invests, what it holds, and its focus within that.";

export const FILTER_ALL = "All";

export const FILTER_VEHICLE = "Fund type";
export const FILTER_GEOGRAPHY = "Where it invests";
export const FILTER_ASSET_CLASS = "What it holds";
export const FILTER_MANAGER = "Management company";
export const FILTER_TFSA = "Tax-free eligible only";
export const FILTER_SEARCH_PLACEHOLDER = "Search by fund, manager or ISIN";

export const EMPTY_CATALOGUE =
  "No funds are loaded yet. The catalogue is transcribed from published fact sheets, and this page fills up as they are added.";

export const EMPTY_FILTERED =
  "No fund in the catalogue matches those filters. Clear one and the list widens.";

export const LOAD_FAILED = "Unable to load the funds catalogue right now.";

export const MATCHES_LOAD_FAILED =
  "Unable to work out which categories your profile maps to right now. Every category we cover is listed below.";

export const COMPLETE_PROFILE_TITLE = "Two more answers sharpens this";

export const COMPLETE_PROFILE_LEAD =
  "Add your time horizon and what the money is for, and this list narrows to the categories that fit those answers as well as your risk profile.";

export const COMPLETE_PROFILE_ACTION = "Update your profile";

export const RISK_SCALE_TITLE = "Risk profile, as the manager publishes it";

export const FACT_SHEET_ACTION = "Read the fact sheet";

export const AS_AT = "Fact sheet as at";

export const COST_LABEL = "Total investment charge";

export const COST_TER_LABEL = "Total expense ratio";

export const MIN_TERM_LABEL = "Minimum term stated";

export const TFSA_BADGE = "Tax-free eligible";

export const TRACKER_BADGE = "Index tracker";

export const VEHICLE_LABEL: Record<string, string> = {
  unit_trust: "Unit trust",
  etf: "Exchange traded fund",
};

/** Every string this module can put on screen, for the scan test. */
export function allStrings(): string[] {
  return [
    FUNDS_NAV_LABEL,
    FUNDS_PAGE_TITLE,
    FUNDS_PAGE_LEAD,
    FUNDS_HEADER_STRIP,
    BROWSE_TITLE,
    BROWSE_LEAD,
    FILTER_ALL,
    FILTER_VEHICLE,
    FILTER_GEOGRAPHY,
    FILTER_ASSET_CLASS,
    FILTER_MANAGER,
    FILTER_TFSA,
    FILTER_SEARCH_PLACEHOLDER,
    EMPTY_CATALOGUE,
    EMPTY_FILTERED,
    LOAD_FAILED,
    MATCHES_LOAD_FAILED,
    COMPLETE_PROFILE_TITLE,
    COMPLETE_PROFILE_LEAD,
    COMPLETE_PROFILE_ACTION,
    RISK_SCALE_TITLE,
    FACT_SHEET_ACTION,
    AS_AT,
    COST_LABEL,
    COST_TER_LABEL,
    MIN_TERM_LABEL,
    TFSA_BADGE,
    TRACKER_BADGE,
    ...Object.values(VEHICLE_LABEL),
  ];
}

/** Render a percentage the way a fact sheet prints it: 1.26%, 0.4%, 12%. */
export function formatPercent(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const trimmed = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  return `${trimmed}%`;
}

/** Render a fund size in rand at readable scale. */
export function formatFundSize(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value) || value <= 0) return null;
  if (value >= 1_000_000_000) return `R${Number((value / 1_000_000_000).toFixed(1))}bn`;
  if (value >= 1_000_000) return `R${Number((value / 1_000_000).toFixed(0))}m`;
  return `R${value.toLocaleString("en-ZA")}`;
}

/** "31 July 2026" from a stored "2026-07-31", or the raw value if it is not a
 *  date we recognise. A wrong date beside a figure is worse than an ugly one. */
export function formatAsAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const [, year, month, day] = match;
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const name = months[Number(month) - 1];
  if (!name) return value;
  return `${Number(day)} ${name} ${year}`;
}

/** The stated minimum term, in words. */
export function formatMinTerm(years: number | null | undefined): string | null {
  if (years === null || years === undefined || Number.isNaN(years) || years <= 0) return null;
  if (years < 1) {
    const months = Math.round(years * 12);
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  const rounded = Number(years.toFixed(1));
  return `${rounded} year${rounded === 1 ? "" : "s"}`;
}
