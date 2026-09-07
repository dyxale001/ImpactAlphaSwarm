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

/** Used when only the manager's listing page is on file, not the dated document.
 *
 * A separate label because the first one promises the sheet whose figures are
 * on the card, and a manager without a per-fund page has a listing of hundreds.
 * Sending someone there under "Read the fact sheet" is a small dishonesty on a
 * page whose whole claim is that every figure is attributable. */
export const FACT_SHEET_PAGE_ACTION = "Find this fund on the manager's site";

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

/* ── Fund detail page ────────────────────────────────────────────────────── */

export const DETAIL_BACK = "Back to funds";

export const DETAIL_NOT_FOUND_TITLE = "That fund is not in the catalogue";

export const DETAIL_NOT_FOUND_LEAD =
  "The link may be old, or the fund may have been retired. Everything we cover is on the funds page.";

export const DETAIL_OBJECTIVE_TITLE = "What the fund says it aims to do";

/** Framed as a quotation rather than a description, because it is one: the
 *  sentence is the manager's, lifted off the fact sheet, not our summary. */
export const DETAIL_OBJECTIVE_ATTRIB = "In the manager's own words, from the fact sheet dated";

export const DETAIL_COSTS_TITLE = "What it costs each year";

export const DETAIL_COSTS_LEAD =
  "The total investment charge is what the fund deducts in a year. It is the expense ratio plus trading costs, and it is charged whether the fund gains or loses.";

export const DETAIL_TC_LABEL = "Transaction costs";

export const DETAIL_PLATFORM_FEE_NOTE =
  "A platform may add its own fee on top of these. Check before you invest.";

export const DETAIL_FACTS_TITLE = "The published facts";

export const DETAIL_BENCHMARK_LABEL = "Measured against";

export const DETAIL_SIZE_LABEL = "Fund size";

export const DETAIL_DISTRIBUTION_LABEL = "Pays income";

export const DETAIL_ISIN_LABEL = "ISIN";

export const DETAIL_MANCO_LABEL = "Issued by";

export const DETAIL_JSE_LABEL = "JSE code";

export const DETAIL_WHY_TITLE = "Why this fund appears here";

export const DETAIL_HISTORY_TITLE = "Fact sheets on file";

export const DETAIL_HISTORY_LEAD =
  "Each entry is one dated document. We keep every one, so a figure can always be traced to the sheet it came from.";

export const DETAIL_PROVENANCE_TITLE = "Where these figures come from";

/** The honest limits, stated on the page rather than in a footnote.
 *
 * Both sentences exist because someone will otherwise assume the opposite: that
 * a number this specific was fetched from somewhere authoritative, and that a
 * missing section means the fund lacks the thing rather than that we do. */
export const DETAIL_PROVENANCE_MANUAL =
  "Every figure on this page was read by hand off the manager's own fact sheet and dated by it. Nothing here is calculated by us, and nothing is taken from a platform's copy.";

export const DETAIL_PROVENANCE_GAPS =
  "Where a section is missing, the figure is not on the sheet in a form we read yet — the asset allocation and holdings are published as charts. An absent figure is a gap in our reading, not in the fund.";

export const DETAIL_NO_FACTSHEET =
  "No fact sheet is on file for this fund yet, so there is nothing dated to show. It stays listed because the fund exists; it cannot be matched to anyone until its published figures are recorded.";

export const DETAIL_PRICE_TITLE = "What it closed at on the JSE";

export const DETAIL_ALLOCATION_TITLE = "What it holds";

export const DETAIL_PERFORMANCE_TITLE = "Past returns, as published";

/** Shown with any performance figure. Required by the fact sheets themselves,
 *  and the one claim the documents most insist on. */
export const DETAIL_PERFORMANCE_NOTE =
  "Published by the manager for the period ending on the fact sheet date. Past returns do not predict future returns.";

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
    FACT_SHEET_PAGE_ACTION,
    DETAIL_BACK,
    DETAIL_NOT_FOUND_TITLE,
    DETAIL_NOT_FOUND_LEAD,
    DETAIL_OBJECTIVE_TITLE,
    DETAIL_OBJECTIVE_ATTRIB,
    DETAIL_COSTS_TITLE,
    DETAIL_COSTS_LEAD,
    DETAIL_TC_LABEL,
    DETAIL_PLATFORM_FEE_NOTE,
    DETAIL_FACTS_TITLE,
    DETAIL_BENCHMARK_LABEL,
    DETAIL_SIZE_LABEL,
    DETAIL_DISTRIBUTION_LABEL,
    DETAIL_ISIN_LABEL,
    DETAIL_MANCO_LABEL,
    DETAIL_JSE_LABEL,
    DETAIL_WHY_TITLE,
    DETAIL_HISTORY_TITLE,
    DETAIL_HISTORY_LEAD,
    DETAIL_PROVENANCE_TITLE,
    DETAIL_PROVENANCE_MANUAL,
    DETAIL_PROVENANCE_GAPS,
    DETAIL_NO_FACTSHEET,
    DETAIL_PRICE_TITLE,
    DETAIL_ALLOCATION_TITLE,
    DETAIL_PERFORMANCE_TITLE,
    DETAIL_PERFORMANCE_NOTE,
    // The regulated common core.
    DETAIL_NAV_LABEL,
    DETAIL_NAV_NOTE,
    DETAIL_INCEPTION_LABEL,
    DETAIL_MANAGER_LABEL,
    DETAIL_REG28_LABEL,
    DETAIL_REG28_YES,
    DETAIL_REG28_NO,
    DETAIL_AMF_LABEL,
    DETAIL_AMF_NOTE,
    DETAIL_SWINGS_TITLE,
    DETAIL_SWINGS_LEAD,
    DETAIL_SWINGS_HIGH_LABEL,
    DETAIL_SWINGS_LOW_LABEL,
    DETAIL_RISK_WORDS_TITLE,
    DETAIL_HORIZON_WORDS_LABEL,
    DETAIL_INCOME_TITLE,
    DETAIL_INCOME_LEAD,
    ...Object.values(VEHICLE_LABEL),
    // Sentences a formatter builds are shipped copy too, so they are scanned
    // rather than trusted for being generated. Every accepted value is listed:
    // a new fee period or a new measurement basis has to be added here, which
    // is the same tripwire the constants above get.
    ...["1y", "3y"].map(formatFeePeriod),
    ...["rolling_12m", "calendar_year"].map(formatExtremesBasis),
  ].filter((text): text is string => Boolean(text));
}

// ── the regulated common core, added with migration 025 ────────────────────
// Nothing here is our judgement about a fund. Each label names a figure the
// manager published, and each note says what the figure is and is not.

export const DETAIL_NAV_LABEL = "Price a unit";

export const DETAIL_NAV_NOTE =
  "The manager's own valuation on that date. A unit trust is not traded on an exchange, " +
  "so this is the price the manager struck rather than a market price, and one monthly " +
  "figure is not a return.";

export const DETAIL_INCEPTION_LABEL = "Started";

export const DETAIL_MANAGER_LABEL = "Run by";

export const DETAIL_REG28_LABEL = "Regulation 28";

export const DETAIL_REG28_YES = "Complies";

export const DETAIL_REG28_NO = "Does not comply";

export const DETAIL_AMF_LABEL = "Manager's fee";

export const DETAIL_AMF_NOTE =
  "The manager's own charge sits inside the total expense ratio rather than on top of it.";

export const DETAIL_SWINGS_TITLE = "Its strongest and weakest year";

export const DETAIL_SWINGS_LEAD =
  "How far this fund has moved in a single year, as the manager reports it. A risk word " +
  "describes a fund in the abstract; these are years it actually had.";

export const DETAIL_SWINGS_HIGH_LABEL = "Strongest year";

export const DETAIL_SWINGS_LOW_LABEL = "Weakest year";

export const DETAIL_RISK_WORDS_TITLE = "How the manager describes the risk";

export const DETAIL_HORIZON_WORDS_LABEL = "On how long to hold it, the sheet says";

export const DETAIL_INCOME_TITLE = "What it has paid out";

export const DETAIL_INCOME_LEAD =
  "Cents per unit, by the month the manager declared it. A month with no entry is a month " +
  "the sheet declared nothing.";

/** A fee period, as a phrase that can follow a figure. */
export function formatFeePeriod(period: string | null | undefined): string | null {
  if (period === "1y") return "measured over one year";
  if (period === "3y") return "measured over three years, annualised";
  return null;
}

/** How a strongest/weakest year was measured.
 *
 *  Spelled out rather than shown as a code, because the two are different
 *  statistics and a reader comparing two funds needs to know which they are
 *  looking at. Satrix reports rolling one-year periods and FundRock reports
 *  calendar years; a page that showed one beside the other without saying so
 *  would be inviting exactly the comparison it cannot support. */
export function formatExtremesBasis(basis: string | null | undefined): string | null {
  if (basis === "rolling_12m")
    return "Measured over separate twelve-month periods, as the sheet reports them.";
  if (basis === "calendar_year")
    return "Measured over calendar years since the fund started, as the sheet reports them.";
  return null;
}

/** A net asset value, stored in cents a unit, printed in rand.
 *
 *  Rand because that is how a reader holds the number in their head, and
 *  because the two managers in the catalogue print it both ways — Satrix in
 *  rand, FundRock in cents — so one of them is always being converted whichever
 *  way round it is stored. This is the only place that conversion happens.
 *
 *  The decimal point is a point, not a comma, even though `en-ZA` renders R5,00
 *  and South African convention would agree with it. Two reasons it loses here:
 *  the fact sheets themselves print "R9.23" and "183.63 cents", so a comma would
 *  no longer quote the document; and `formatPercent` alongside it renders
 *  "1.26%", so a comma would mix separators inside one card. Thousands are
 *  grouped with a space, which the sheets do use ("39 242 370"). */
export function formatNav(centsPerUnit: number | null | undefined): string | null {
  if (centsPerUnit === null || centsPerUnit === undefined || Number.isNaN(centsPerUnit)) {
    return null;
  }
  if (centsPerUnit <= 0) return null;
  const [whole, fraction] = (centsPerUnit / 100).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return `R${grouped}.${fraction}`;
}

/** A signed percentage, so a weak year reads as a loss rather than a number. */
export function formatSignedPercent(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const trimmed = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  return value > 0 ? `+${trimmed}%` : `${trimmed}%`;
}

/** "Jun 2026" from a stored "2026-06", for a distribution month. */
export function formatDistributionMonth(key: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!match) return key;
  const [, year, month] = match;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const name = months[Number(month) - 1];
  return name ? `${name} ${year}` : key;
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
