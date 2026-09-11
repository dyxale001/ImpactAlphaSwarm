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

/** The eyebrow over the page title. The server sends it; this was written
 *  inline in the page, which is how one of the header's three strings ended up
 *  outside the file that scans them. */
export const FUNDS_HEADER_EYEBROW = "South African funds";

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

/** The navigator's three tiers, which are the classification itself.
 *
 *  The geography and asset-class labels are shared with the filter row they
 *  replaced: the words are the reader's way in to the same two columns, and
 *  having two names for one column is how the page ended up offering both a
 *  tree and a select that wrote the same filter and disagreed about it. */
export const BROWSE_FOCUS_LABEL = "Within {assetClass}";

/** Named as an action rather than a state, because it is a button. Promised by
 *  the filtered-empty copy since that state was written, and absent until now:
 *  the only way back out of a dead filter was to undo each control by hand. */
export const FILTER_CLEAR_ALL = "Clear all";

export const FILTER_CLEAR_SEARCH = "Clear search";

/** The tree's own failure, which used to render as nothing at all.
 *
 *  `useFundCatalogueMeta` returns `isLoading` and `error` and the page discarded
 *  both, so a failed meta request produced a page with no navigator, no message
 *  and no hint that a section was missing. The second sentence is the one that
 *  matters: the grid below does not depend on this request. */
export const BROWSE_META_FAILED_TITLE = "The category list did not load";

export const BROWSE_META_FAILED_BODY =
  "Browsing by category is unavailable right now. Every fund we cover is still listed below.";

export const RETRY_ACTION = "Try again";

/** The browse grid opens at four rows and says how many more there are. The
 *  count is substituted rather than concatenated so the whole sentence is one
 *  scanned string. */
export const SHOW_ALL_ACTION = "Show all {count}";

export const SHOW_FEWER_ACTION = "Show fewer";

/* ── The states that are not a list of funds ──────────────────────────────
 *
 * Five of them, each with a title and a body, because all five rendered as the
 * same untitled grey paragraph in a card and three of them are different
 * situations with different ways out. The titles say what happened; the bodies
 * say what still works, which on this page is usually "the catalogue below".
 */

export const EMPTY_CATALOGUE_TITLE = "No funds are loaded yet";

export const EMPTY_CATALOGUE =
  "The catalogue is transcribed from published fact sheets, and this page fills up as they are added.";

export const EMPTY_FILTERED_TITLE = "Nothing matches those filters";

export const EMPTY_FILTERED =
  "Clear one and the list widens. Every category we cover is still browsable.";

export const LOAD_FAILED_TITLE = "The fund list did not load";

export const LOAD_FAILED = "Unable to load the funds catalogue right now.";

export const MATCHES_LOAD_FAILED_TITLE = "Your matches did not load";

export const MATCHES_LOAD_FAILED =
  "Unable to work out which categories your profile maps to right now. Every category we cover is listed below.";

/** The state the page could not express at all.
 *
 *  When the matcher ran, found the profile, and returned nothing with no notice
 *  attached, the section rendered its heading over empty space. It is a real
 *  outcome of a small catalogue rather than a fault, so it says so and points at
 *  the only thing left to do. */
export const MATCHED_EMPTY_TITLE = "No fund carries a published risk label at or below yours";

export const MATCHED_EMPTY_BODY =
  "Your answers map to the categories browsable below, and no fund in them publishes a label that clears your profile yet.";

export const MATCHED_EMPTY_ACTION = "Browse every category";

/* ── The two statements that may not go missing ───────────────────────────
 *
 * The footer's four paragraphs come off the catalogue response, and the whole
 * footer was rendered only when that response arrived — so a failed request
 * took the not-licensed statement off the page along with the list it was
 * about. These two are the ones that are about the product rather than about
 * the list, so they are also here and the footer always renders.
 *
 * Mirrored from `backend/src/funds/copy.py`, the same way the forbidden-term
 * scan above is, and kept in step by a test that reads that file. The other
 * two paragraphs have no fallback on purpose: the inclusion rule and the
 * not-covered list describe a catalogue, and describing a catalogue that
 * failed to load is describing nothing.
 */
export const FOOTER_NOT_LICENSED =
  "AlphaSwarm is not a licensed financial services provider and does not give " +
  "advice. Fund categories, risk labels, costs and performance figures on this " +
  "page are the fund managers' own, taken from the Minimum Disclosure Document " +
  "each fund is required to publish.";

export const CIS_DISCLAIMER =
  "Collective investment schemes are medium- to long-term investments. Past " +
  "performance does not predict future returns. Fund values move with the " +
  "markets and with exchange rates, and charges reduce what you earn.";

/** The verbatim section heading, from the design note. The server sends it and
 *  this is the fallback; it was written inline in the page, which put the one
 *  string the design fixes word for word outside the file that scans them. */
export const MATCHED_SECTION_TITLE =
  "Funds whose published risk label matches your profile";

/** The block under the header that shows what the match is filtered on.
 *
 *  Here because a reader asking "why these funds" deserves to see the three
 *  answers doing the filtering rather than infer them. Every value in it is
 *  something the user said or something their answers scored to, so the panel
 *  describes a filter and never a proposal. */
export const MATCH_INPUTS_TITLE = "What this list is filtered on";

export const MATCH_INPUTS_LEAD =
  "Three of your answers decide which funds appear above, weighed against the risk label each manager publishes. Nothing else from your account is used.";

export const MATCH_INPUT_RISK_LABEL = "Your risk profile";
export const MATCH_INPUT_HORIZON_LABEL = "When you need the money";
export const MATCH_INPUT_PURPOSE_LABEL = "What the money is for";
export const MATCH_INPUT_CEILING_LABEL = "Highest published risk label shown";

export const MATCH_INPUT_UNANSWERED = "Not answered yet";

/** Shown only when the horizon or the purpose narrowed the bracket below what
 *  the risk answers alone scored to. Worth saying plainly: a reader who sees
 *  "Aggressive" beside a short list would otherwise think the page was wrong.
 *
 *  Deliberately about the CATEGORIES and not the ceiling. A short horizon caps
 *  which categories are in play and leaves the risk ceiling where the risk
 *  answers put it; only an emergency fund lowers both. An earlier draft said
 *  "that is why the list stops at {ceiling}", which read as true and was wrong
 *  in the commoner of the two cases. */
export const MATCH_INPUTS_NARROWED =
  "Your risk answers score as {answered}. The other two narrow which fund categories are in play to the {effective} set, so this list is shorter than your risk profile alone would give.";

export const MATCH_INPUTS_ACTION = "Change these answers";

/** The applied rating, which is the number that actually decides the list.
 *
 *  Emphasised over the answered one because they are not always the same and
 *  the difference is the page's most confusing moment: a reader who answered
 *  Aggressive and sees cautious funds needs the applied rating to be the loud
 *  one, with the drop shown rather than left to be inferred. */
export const MATCH_APPLIED_LABEL = "Applied to this list";

export const MATCH_ANSWERED_LABEL = "Your risk answers score";

export const MATCH_APPLIED_UNCHANGED = "Your risk answers are applied as they scored.";

/** Only two things can lower the applied rating, and they are named separately
 *  because the reason is more useful than the fact. `test_only_two_rules_can
 *  _change_the_applied_bracket` on the backend is what keeps this pair
 *  complete. */
export const MATCH_NARROWED_BY_HORIZON =
  "Lowered from {answered} by your time horizon: needing the money sooner narrows which fund categories are in play, whatever risk you told us you can take.";

export const MATCH_NARROWED_BY_PURPOSE =
  "Lowered from {answered} because this money is an emergency fund: money you may need at short notice is a question about access before it is one about risk.";

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

/** The reason sentence's own heading, which the card omitted.
 *
 *  It is the tallest and most variable block on a matched card and it sat there
 *  unlabelled, so it read as prose about the fund rather than as the answer to
 *  the question the section poses. The wording is the design note's own. */
export const WHY_APPEARS_LABEL = "Why this appears";

/** Follows a charge figure: "1.79% a year". Was inline in the card, which put
 *  it outside the scan. */
export const COST_PER_YEAR = "a year";

export const FUND_SIZE_LABEL = "Fund size";

export const DISTRIBUTIONS_LABEL = "Distributions";

/** Printed where a fact sheet does not state a figure the card has a slot for.
 *
 *  The slot is kept rather than dropped: on a catalogue card the four figures
 *  are the comparison, and a card that quietly omits one is a card that looks
 *  like it has a shorter answer rather than a document that is silent. Only the
 *  minimum term uses it, because it is the field managers most often leave out —
 *  five of nineteen sheets stated it. */
export const NOT_STATED = "Not stated";

/** Why a fund can be browsed and never matched.
 *
 *  The backend sends `risk_note` for a fund it knows about; this is the fallback
 *  for one whose sheet simply carries no indicator. Until now `RiskScale`
 *  returned null in that case and the card's whole middle band vanished, which
 *  made a designed outcome look like a rendering fault. */
export const RISK_UNPUBLISHED_NOTE =
  "This manager publishes no risk indicator on its fact sheet, so this fund can be browsed but is never matched to a profile.";

export const RISK_NO_SHEET_NOTE =
  "No fact sheet is on file for this fund yet, so there is no published risk label to show.";

/* ── How old the figures are ──────────────────────────────────────────────
 *
 * A fact sheet is a monthly document, so a date alone does not tell a reader
 * whether they are looking at this quarter's figures or the ones from three
 * quarters ago. Three of the eleven funds live today are 313 to 466 days old
 * and the card presented all three exactly as it presented the current ones.
 *
 * The words describe the document and not the reader's next move: "out of date"
 * is a fact about a sheet, where anything in the shape of an instruction would
 * be this page telling somebody what to do about a fund.
 */

export const STALENESS_CURRENT = "current";

export const STALENESS_AGEING = "worth re-checking";

export const STALENESS_STALE = "sheet is out of date";

export const VEHICLE_LABEL: Record<string, string> = {
  unit_trust: "Unit trust",
  etf: "Exchange traded fund",
};

/* ── Fund detail page ────────────────────────────────────────────────────── */

/* The three questions the page answers, one per tab.
 *
 * Named after what a reader wants rather than after our data model: "The
 * figures" is the returns and the payouts, "The document" is the identity and
 * the provenance. A tab whose panel would be empty is not rendered at all, so
 * on a sheet nobody has finished reading the strip is itself a statement about
 * how much is known. */
export const DETAIL_TABS_LABEL = "Fund sections";

export const DETAIL_TAB_OVERVIEW = "Overview";

export const DETAIL_TAB_FIGURES = "The figures";

export const DETAIL_TAB_DOCUMENT = "The document";

/** The small facts that answer "how does this fund work" without a chart. */
export const DETAIL_GLANCE_TITLE = "At a glance";

/** The manager's quoted prose, gathered into one tile.
 *
 *  Objective, risk narrative and horizon were three separate cards saying the
 *  same kind of thing in the same voice: the manager's, quoted. Together they
 *  read as a passage from the document, which is what they are. */
export const DETAIL_WORDS_TITLE = "In the manager's own words";

export const DETAIL_MANAGED_BY_LABEL = "Managed by";

export const DETAIL_ERROR_TITLE = "This fund did not load";

export const DETAIL_NO_FACTSHEET_TITLE = "No fact sheet on file yet";

/* ── The largest holdings ─────────────────────────────────────────────────
 *
 * Transcribed for seven sheets, typed in the public DTO, selected by the
 * repository, passed through by `service.py`, editable in admin — and shown to
 * nobody until now. The reader was the only party on the page who could not
 * see it.
 *
 * The note is the load-bearing part. A holdings list invites the reading "this
 * is what the fund owns", and it is not: it is the ten largest positions the
 * sheet chose to print, on the sheet's own date, out of a portfolio that may
 * hold hundreds.
 */
export const DETAIL_HOLDINGS_TITLE = "Its largest holdings";

export const DETAIL_HOLDINGS_LEAD =
  "The biggest positions this sheet lists, as a share of the fund.";

export const DETAIL_HOLDINGS_NOTE =
  "The largest holdings the sheet prints, not the whole portfolio, and as at the date on it.";

/* ── What it takes to start ───────────────────────────────────────────────
 *
 * Also transcribed and also never rendered. Shown only where the figure is
 * above zero: `min_lump_sum` is non-blank on fifteen of twenty-six sheets and
 * twelve of those are `0`, all of them FundRock boutique funds carrying
 * `0`/`0`, which reads as one bulk seed default rather than twelve separate
 * readings. Printing "R0" would turn that default into a claim that a reader
 * can start with nothing, which is an invented fact on a page whose whole
 * argument is that it invents none.
 *
 * The note carries the same caveat `DETAIL_PLATFORM_FEE_NOTE` makes about
 * fees, for the same reason: the sheet states the manager's terms, and almost
 * nobody in this catalogue's audience buys directly from the manager.
 */
export const DETAIL_MINIMUMS_TITLE = "What it takes to start";

export const DETAIL_MIN_LUMP_LABEL = "Lump sum";

export const DETAIL_MIN_DEBIT_LABEL = "Monthly debit order";

export const DETAIL_MINIMUMS_NOTE =
  "The manager's own minimums, from this sheet. A platform may set different ones.";


export const DETAIL_BACK = "Back to funds";

/** Shown only to an admin, linking this fund to the screen that edits it.
 *
 *  Here rather than inline in the page because every other string on the fund
 *  detail page comes from this catalogue and is scanned for advice language.
 *  This one is staff-facing and could not fail that scan, but a reader looking
 *  for where the page's words live should find all of them in one file. */
export const DETAIL_ADMIN_EDIT = "Edit this fund";

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

/** The same words the card uses, aliased rather than repeated. */
export const DETAIL_SIZE_LABEL = FUND_SIZE_LABEL;

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

/* ── The dashboard tile ──────────────────────────────────────────────────
 *
 * The one place the funds section touches the rest of the product: a tile
 * named for the BRACKET and not for any fund. A dashboard is the most-read
 * surface in the app, and a tile that named funds there would be the product
 * choosing, which is the line the whole section is built to stay behind. So
 * the tile shows the rating the answers score to, the ceiling that rating
 * puts on a manager's published label, and the categories in play — and
 * sends the reader to the page that lists the funds under that rule.
 *
 * Every value it prints comes off the same server bracket the funds page
 * shows, so the two never disagree about what the answers map to.
 */
export const FUND_BRACKET_APPLIED_LABEL = "Risk bracket applied";

export const FUND_BRACKET_CATEGORIES_LABEL = "Fund categories in play";

/** Appended to a category where the curation rule admits index trackers only. */
export const FUND_BRACKET_TRACKER_ONLY = "index trackers only";

export const FUND_BRACKET_NONE =
  "No fund carries a published risk label at or below yours yet.";

/** Shown in place of the bracket when the risk questionnaire has not been
 *  answered. States what the tile will show, not what the reader ought to do. */
export const FUND_BRACKET_NO_PROFILE =
  "Answer the risk questions in your profile and this tile shows the fund categories whose published risk labels sit at or below yours.";

export const FUND_BRACKET_LOAD_FAILED =
  "Unable to work out which fund categories your profile maps to right now.";

export const FUND_BRACKET_ACTION = "See the funds in your bracket";

/** The attribution a tile that shows risk labels has to carry, in one line. */
export const FUND_BRACKET_PROVENANCE =
  "Risk labels are the fund managers' own, from each fund's Minimum Disclosure Document.";

/** "3 funds carry a published risk label at or below it." — the count the
 *  tile leads its link with. Zero is a real outcome of a small catalogue and
 *  gets its own sentence rather than "0 funds carry", which reads as a fault. */
export function formatBracketCount(count: number): string {
  if (count <= 0) return FUND_BRACKET_NONE;
  const verb = count === 1 ? "carries" : "carry";
  return `${formatFundCount(count)} ${verb} a published risk label at or below it.`;
}

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
    EMPTY_CATALOGUE_TITLE,
    EMPTY_CATALOGUE,
    EMPTY_FILTERED_TITLE,
    EMPTY_FILTERED,
    LOAD_FAILED_TITLE,
    MATCHES_LOAD_FAILED_TITLE,
    MATCHED_EMPTY_TITLE,
    MATCHED_EMPTY_BODY,
    MATCHED_EMPTY_ACTION,
    MATCHED_SECTION_TITLE,
    FOOTER_NOT_LICENSED,
    CIS_DISCLAIMER,
    BROWSE_FOCUS_LABEL,
    FILTER_CLEAR_ALL,
    FILTER_CLEAR_SEARCH,
    BROWSE_META_FAILED_TITLE,
    BROWSE_META_FAILED_BODY,
    RETRY_ACTION,
    SHOW_ALL_ACTION,
    SHOW_FEWER_ACTION,
    FUNDS_HEADER_EYEBROW,
    WHY_APPEARS_LABEL,
    COST_PER_YEAR,
    FUND_SIZE_LABEL,
    DISTRIBUTIONS_LABEL,
    NOT_STATED,
    RISK_UNPUBLISHED_NOTE,
    RISK_NO_SHEET_NOTE,
    STALENESS_CURRENT,
    STALENESS_AGEING,
    STALENESS_STALE,
    LOAD_FAILED,
    MATCHES_LOAD_FAILED,
    MATCH_INPUTS_TITLE,
    MATCH_INPUTS_LEAD,
    MATCH_INPUT_RISK_LABEL,
    MATCH_INPUT_HORIZON_LABEL,
    MATCH_INPUT_PURPOSE_LABEL,
    MATCH_INPUT_CEILING_LABEL,
    MATCH_INPUT_UNANSWERED,
    MATCH_INPUTS_NARROWED,
    MATCH_INPUTS_ACTION,
    MATCH_APPLIED_LABEL,
    MATCH_ANSWERED_LABEL,
    MATCH_APPLIED_UNCHANGED,
    MATCH_NARROWED_BY_HORIZON,
    MATCH_NARROWED_BY_PURPOSE,
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
    DETAIL_TABS_LABEL,
    DETAIL_TAB_OVERVIEW,
    DETAIL_TAB_FIGURES,
    DETAIL_TAB_DOCUMENT,
    DETAIL_GLANCE_TITLE,
    DETAIL_WORDS_TITLE,
    DETAIL_MANAGED_BY_LABEL,
    DETAIL_ERROR_TITLE,
    DETAIL_NO_FACTSHEET_TITLE,
    DETAIL_HOLDINGS_TITLE,
    DETAIL_HOLDINGS_LEAD,
    DETAIL_HOLDINGS_NOTE,
    DETAIL_MINIMUMS_TITLE,
    DETAIL_MIN_LUMP_LABEL,
    DETAIL_MIN_DEBIT_LABEL,
    DETAIL_MINIMUMS_NOTE,
    DETAIL_ADMIN_EDIT,
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
    // Both grammatical numbers, because the singular and the plural are
    // separate strings once a formatter builds them.
    formatFundCount(1),
    formatFundCount(3),
    // The dashboard tile.
    FUND_BRACKET_APPLIED_LABEL,
    FUND_BRACKET_CATEGORIES_LABEL,
    FUND_BRACKET_TRACKER_ONLY,
    FUND_BRACKET_NONE,
    FUND_BRACKET_NO_PROFILE,
    FUND_BRACKET_LOAD_FAILED,
    FUND_BRACKET_ACTION,
    FUND_BRACKET_PROVENANCE,
    formatBracketCount(0),
    formatBracketCount(1),
    formatBracketCount(3),
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

/** A whole-rand amount, thousands grouped with a space: "R5 000".
 *
 *  Grouped with a space rather than a comma because the fact sheets do it that
 *  way ("39 242 370") and because `formatPercent` beside it renders "1.79%"
 *  with a point, so a comma would mix separators inside one tile.
 *
 *  **Zero and below return null, and that is the point rather than tidiness.**
 *  Twelve of the fifteen transcribed minimums are `0`, all FundRock boutique
 *  funds carrying `0`/`0` — a bulk seed default, not twelve readings. "R0" on
 *  a minimum reads as "you can start with nothing", which is a claim the
 *  document never made.
 */
export function formatRandAmount(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value) || value <= 0) return null;
  const whole = Math.round(value).toString();
  return `R${whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")}`;
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

/** An ASISA category split back into the three tiers it is built from.
 *
 *  The stored name is the classification's own, verbatim — "South African -
 *  Multi Asset - High Equity" — and v1 shows those words rather than friendlier
 *  labels of our invention. This does not rename anything: it separates the
 *  three tiers so the geography can be given weight on a card, which the design
 *  note asks for by name because a panel could not tell where a fund invested.
 *
 *  Null when the name is not three tiers, in which case a caller prints it as
 *  it is stored. A category we cannot parse is still a category we must show.
 */
export function splitAsisaCategory(
  name: string | null | undefined,
): { geography: string; assetClass: string; focus: string } | null {
  if (!name) return null;
  const parts = name.split(" - ").map((part) => part.trim());
  if (parts.length !== 3 || parts.some((part) => !part)) return null;
  const [geography, assetClass, focus] = parts;
  return { geography, assetClass, focus };
}

/** "3 funds", "1 fund", and with a scope "3 funds in South African · Equity".
 *
 *  A formatter rather than an inline ternary because the singular was written
 *  in the page, which put two of the page's most-rendered words outside the
 *  scan. The scope is category names off the API and is never our wording. */
export function formatFundCount(count: number, scope?: string | null): string {
  const noun = count === 1 ? "fund" : "funds";
  return scope ? `${count} ${noun} in ${scope}` : `${count} ${noun}`;
}

/** How many days ago a fact sheet was dated, or null if there is no usable date.
 *
 *  Both dates are taken at midnight UTC. A fact-sheet date is a month end with
 *  no time on it, so comparing it against a local `Date` would put a sheet in
 *  Johannesburg two hours into the previous day and move an age across a
 *  threshold on the boundary. A future date returns 0 rather than a negative
 *  number: it means somebody typed next month's date, which is a data question
 *  and not something to render as "-12 days".
 */
export function factSheetAgeDays(asOf: string | null | undefined, today?: Date): number | null {
  if (!asOf) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOf.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const sheet = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(sheet)) return null;
  const now = today ?? new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((midnight - sheet) / 86_400_000));
}
