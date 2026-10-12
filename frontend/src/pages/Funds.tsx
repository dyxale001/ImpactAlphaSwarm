import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  Info,
  Landmark,
  Layers,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import AboutFundModal from "../components/funds/AboutFundModal";
import FundCard from "../components/funds/FundCard";
import FundFilters from "../components/funds/FundFilters";
import FundsNotice from "../components/funds/FundsNotice";
import FundsSkeleton from "../components/funds/FundsSkeleton";
import CategoryNavigator from "../components/funds/CategoryNavigator";
import CompleteProfilePrompt from "../components/funds/CompleteProfilePrompt";
import MatchInputs from "../components/funds/MatchInputs";
import TiersMotif from "../components/funds/TiersMotif";
import MyFundsPanel from "../components/funds/uploads/MyFundsPanel";
import { useFundCatalogue, useFundCatalogueMeta, useFundMatches } from "../hooks/useFundCatalogue";
import { useUploadedFunds } from "../hooks/useFundUploads";
import { COMPARE_ENABLED } from "../utils/compareFlags";
import { FUND_UPLOADS_ENABLED } from "../utils/fundsFlags";
import { MY_FUNDS_TAB } from "../utils/fundUploadsCopy";
import {
  BROWSE_LEAD,
  BROWSE_TITLE,
  EMPTY_CATALOGUE,
  EMPTY_CATALOGUE_TITLE,
  EMPTY_FILTERED,
  EMPTY_FILTERED_TITLE,
  FILTER_CLEAR_ALL,
  FUND_ABOUT_BUTTON,
  FUNDS_HEADER_EYEBROW,
  FUNDS_HEADER_STRIP,
  FUNDS_TABS_LABEL,
  FUNDS_TAB_BROWSE,
  FUNDS_TAB_MATCHED,
  FUNDS_PAGE_LEAD,
  FUNDS_PAGE_TITLE,
  LOAD_FAILED,
  LOAD_FAILED_TITLE,
  MATCHED_EMPTY_ACTION,
  MATCHED_EMPTY_BODY,
  MATCHED_EMPTY_TITLE,
  MATCHED_SECTION_TITLE,
  MATCHES_LOAD_FAILED_TITLE,
  SHOW_ALL_ACTION,
  SHOW_FEWER_ACTION,
  formatFundCount,
  splitAsisaCategory,
} from "../utils/fundsCopy";
import type { CatalogueFilters } from "../services/api/fundCatalogue";

/** How many browse cards render before the grid asks to be opened. Twelve is
 *  four full rows at the widest breakpoint and six at the middle one. */
const INITIAL_CARDS = 12;

/** The browse tab's panel, which the tab button points at. */
const BROWSE_ID = "browse-funds";

/**
 * South African unit trusts and JSE-listed ETFs, matched to the user's profile.
 *
 * Two tabs, and the order is the argument. First the funds whose published
 * risk label fits what the user told us, with the answers the filter used shown
 * above them. Then the whole classification, browsable — because a reader who
 * can see what they were not shown can tell a filter from a recommendation.
 *
 * ## Why tabs
 *
 * The distinction between "these few are matched to you" and "the rest you can
 * explore" is the page's whole point. Stacked, it was carried by a change of
 * ground and a 40px gap, and the reader still scrolled through every match to
 * reach the catalogue, or through a long catalogue to find out it was not the
 * personal list. As tabs, each half is one choice away and says how many funds
 * it holds. The browse panel stays mounted while hidden, so filters and search
 * survive a look at the matches.
 *
 * Why each fund matched is no longer printed on its card. It is explained on
 * the fund's own page, in the reasoning trace that reads the reader's answers.
 *
 * Reached only when VITE_FUNDS_ENABLED is set. Its data needs the backend's own
 * flag as well, so the two are set together.
 */
export default function FundsPage() {
  const [filters, setFilters] = useState<CatalogueFilters>({});
  const [showAll, setShowAll] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const closeAbout = useCallback(() => setShowAbout(false), []);
  const meta = useFundCatalogueMeta();
  const { data, funds, isLoading, error } = useFundCatalogue(filters);
  const matchState = useFundMatches();
  // "?tab=mine" opens on the reader's own funds, which is where an uploaded
  // fund's page links back to.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<"matched" | "browse" | "mine">(() =>
    FUND_UPLOADS_ENABLED && searchParams.get("tab") === "mine" ? "mine" : "matched",
  );
  const uploads = useUploadedFunds(FUND_UPLOADS_ENABLED);
  const categoryNames = useMemo(() => meta.meta?.categories.map((c) => c.name) ?? [], [meta.meta]);

  const filtersActive = Object.values(filters).some(
    (value) => value !== undefined && value !== "" && value !== false,
  );

  // The server's own count for this query rather than the length of what came
  // back, so the number beside the grid is the catalogue's answer and not a
  // count of what this page happens to be holding.
  const count = data?.count ?? funds.length;

  // The browse tab's count is the whole catalogue, so it is taken from an
  // unfiltered answer and kept while filters narrow the grid: a tab label that
  // shrank as the reader searched would read as the catalogue changing.
  const [catalogueTotal, setCatalogueTotal] = useState<number | null>(null);
  if (!filtersActive && data && data.count !== catalogueTotal) {
    setCatalogueTotal(data.count);
  }

  // What the count is counting, in the classification's own words. A category
  // is stored as its full three-tier name; the tiers read better separated.
  const scope = useMemo(() => {
    if (filters.category) {
      const tiers = splitAsisaCategory(filters.category);
      return tiers
        ? `${tiers.geography} · ${tiers.assetClass} · ${tiers.focus}`
        : filters.category;
    }
    return [filters.geography, filters.asset_class].filter(Boolean).join(" · ") || null;
  }, [filters.category, filters.geography, filters.asset_class]);

  const visible = showAll ? funds : funds.slice(0, INITIAL_CARDS);

  const patch = (next: Partial<CatalogueFilters>) =>
    setFilters((prev) => ({ ...prev, ...next }));

  const clearAll = () => setFilters({});

  // The matched tab's way out when it has nothing to show.
  const goToBrowse = () => setTab("browse");

  return (
    <div className="animate-fade-up mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      {/* ── Header ── */}
      <div className="hero-card overflow-hidden px-5 pb-10 pt-8 sm:px-7">
        {/* h-10 on a phone keeps the branches inside the pb-10 band under the
            copy. Stretched to h-full on a card that narrow, they ran up through
            the lead paragraph. */}
        <TiersMotif className="h-10 sm:h-full" />
        <div className="relative">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-accent">
            {meta.meta?.header.eyebrow ?? FUNDS_HEADER_EYEBROW}
          </span>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold text-brand-bg lg:text-3xl">
            <Landmark className="h-7 w-7 shrink-0 text-brand-accent" />
            {meta.meta?.header.title ?? FUNDS_PAGE_TITLE}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-bg/75">
            {FUNDS_PAGE_LEAD}
          </p>
          {/* Which market, which currency, and whether the rand figure is a
              conversion — the question a reader of a stock page could not
              answer. */}
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-brand-bg/60">
            {meta.meta?.header.strip ?? FUNDS_HEADER_STRIP}
          </p>
          {/* The same About pill as Compare and Market News, opening this page's
              explainer. */}
          <button
            type="button"
            onClick={() => setShowAbout(true)}
            aria-haspopup="dialog"
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-brand-accent px-3 py-1.5 text-[11px] font-bold text-brand-fg transition-transform duration-[120ms] hover:bg-lime-400 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
            {FUND_ABOUT_BUTTON}
          </button>
        </div>
      </div>

      <AboutFundModal open={showAbout} onClose={closeAbout} compareEnabled={COMPARE_ENABLED} />

      {/* ── The two halves, one at a time ──
          Each tab carries its count, so a reader can see how much is on the
          other side before switching. */}
      <div
        role="tablist"
        aria-label={FUNDS_TABS_LABEL}
        className="mt-6 inline-flex max-w-full flex-wrap items-center gap-0.5 self-start rounded-full border border-brand-border/60 bg-brand-surface p-1"
      >
        <TabButton
          id="funds-tab-matched"
          panel="funds-panel-matched"
          selected={tab === "matched"}
          onSelect={() => setTab("matched")}
          label={FUNDS_TAB_MATCHED}
          count={matchState.isLoading ? null : matchState.matches.length}
        />
        <TabButton
          id="funds-tab-browse"
          panel={BROWSE_ID}
          selected={tab === "browse"}
          onSelect={() => setTab("browse")}
          label={FUNDS_TAB_BROWSE}
          count={catalogueTotal}
        />
        {FUND_UPLOADS_ENABLED && (
          <TabButton
            id="funds-tab-mine"
            panel="funds-panel-mine"
            selected={tab === "mine"}
            onSelect={() => setTab("mine")}
            label={MY_FUNDS_TAB}
            count={uploads.isLoading ? null : uploads.funds.length}
          />
        )}
      </div>

      {tab === "matched" && (
        <div
          id="funds-panel-matched"
          role="tabpanel"
          aria-labelledby="funds-tab-matched"
          className="mt-5 flex flex-col gap-7"
        >
          {/* ── What the match is filtered on ──
              Above the funds on purpose: the reader meets the answers before
              the funds those answers chose. Absent when no bracket came back,
              since CompleteProfilePrompt already speaks to that state. */}
          {matchState.bracket && <MatchInputs bracket={matchState.bracket} />}

          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-xl font-bold tracking-[-0.01em] text-brand-primary">
                {matchState.sectionTitle ?? MATCHED_SECTION_TITLE}
              </h2>
              {matchState.matches.length > 0 && (
                <p
                  className="rounded-full bg-brand-accent px-2.5 py-0.5 text-xs font-bold tabular-nums text-brand-fg"
                  aria-live="polite"
                >
                  {formatFundCount(matchState.matches.length)}
                </p>
              )}
            </div>

            {matchState.isLoading && <FundsSkeleton count={3} />}

            {!matchState.isLoading && matchState.error && (
              <FundsNotice
                icon={AlertTriangle}
                tone="warning"
                title={MATCHES_LOAD_FAILED_TITLE}
                body={matchState.error}
                actionLabel={MATCHED_EMPTY_ACTION}
                onAction={goToBrowse}
              />
            )}

            {!matchState.isLoading && !matchState.error && (
              <>
                {(matchState.fallbackRiskOnly || !matchState.profileFound) && (
                  <CompleteProfilePrompt notice={matchState.notice} />
                )}

                {matchState.matches.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {matchState.matches.map((match) => (
                      <FundCard key={match.fund_id} fund={match} />
                    ))}
                  </div>
                ) : (
                  /* The profile resolved and nothing came back. The notice is the
                     server's own words where it sent one; without it this section
                     used to render a heading over empty space, which is the one
                     state the page could not express. */
                  matchState.profileFound &&
                  !matchState.fallbackRiskOnly && (
                    <FundsNotice
                      icon={Layers}
                      title={MATCHED_EMPTY_TITLE}
                      body={matchState.notice ?? MATCHED_EMPTY_BODY}
                      actionLabel={MATCHED_EMPTY_ACTION}
                      onAction={goToBrowse}
                    />
                  )
                )}
              </>
            )}
          </section>
        </div>
      )}

      {/* ── Browse everything ──
          One container, one ground: the navigator, the filters, the count and
          the grid are all the same act. Kept mounted while the other tab shows,
          so the reader's filters and search survive a trip to their matches. */}
      <section
        id={BROWSE_ID}
        role="tabpanel"
        aria-labelledby="funds-tab-browse"
        hidden={tab !== "browse"}
        className="mt-5 flex flex-col gap-4 rounded-brand border border-brand-border/40 bg-brand-bg/60 p-3 sm:p-5 lg:p-6"
      >
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-[-0.01em] text-brand-primary">
            <SlidersHorizontal className="h-[18px] w-[18px] shrink-0 text-lime-700" />
            {BROWSE_TITLE}
          </h2>
          <p className="max-w-[60ch] text-[13px] leading-relaxed text-forest-500">{BROWSE_LEAD}</p>
        </div>

        <CategoryNavigator
          meta={meta.meta}
          isLoading={meta.isLoading}
          error={meta.error}
          filters={filters}
          onSelect={setFilters}
          onRetry={meta.reload}
        />

        <div className="border-t border-brand-border/40 pt-4">
          <FundFilters
            meta={meta.meta}
            filters={filters}
            onPatch={patch}
            onClearAll={clearAll}
          />
        </div>

        {isLoading && <FundsSkeleton />}

        {!isLoading && error && (
          <FundsNotice
            icon={AlertTriangle}
            tone="warning"
            title={LOAD_FAILED_TITLE}
            body={LOAD_FAILED}
          />
        )}

        {!isLoading && !error && funds.length === 0 && (
          <FundsNotice
            icon={Search}
            title={filtersActive ? EMPTY_FILTERED_TITLE : EMPTY_CATALOGUE_TITLE}
            body={filtersActive ? EMPTY_FILTERED : EMPTY_CATALOGUE}
            actionLabel={filtersActive ? FILTER_CLEAR_ALL : undefined}
            onAction={filtersActive ? clearAll : undefined}
          />
        )}

        {!isLoading && !error && funds.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold tabular-nums text-forest-500" aria-live="polite">
              {formatFundCount(count, scope)}
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((fund) => (
                <FundCard key={fund.fund_id} fund={fund} />
              ))}
            </div>
            {funds.length > INITIAL_CARDS && (
              <button
                type="button"
                onClick={() => setShowAll((open) => !open)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-brand border border-brand-border/60 bg-brand-surface px-4 py-2.5 text-[13px] font-bold text-brand-primary transition-colors hover:border-brand-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
              >
                {showAll
                  ? SHOW_FEWER_ACTION
                  : SHOW_ALL_ACTION.replace("{count}", formatFundCount(funds.length))}
                <ChevronDown className={`h-3.5 w-3.5 ${showAll ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── The reader's own funds ──
          Kept mounted while hidden, like the browse panel, so a review in
          progress survives a look at the catalogue. */}
      {FUND_UPLOADS_ENABLED && (
        <section
          id="funds-panel-mine"
          role="tabpanel"
          aria-labelledby="funds-tab-mine"
          hidden={tab !== "mine"}
          className="mt-5"
        >
          <MyFundsPanel uploads={uploads} categories={categoryNames} />
        </section>
      )}
    </div>
  );
}

/** One of the page's tabs, with its count. A count still loading is left
 *  off rather than shown as a zero. */
function TabButton({
  id,
  panel,
  selected,
  onSelect,
  label,
  count,
}: {
  id: string;
  panel: string;
  selected: boolean;
  onSelect: () => void;
  label: string;
  count: number | null;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={panel}
      aria-selected={selected}
      onClick={onSelect}
      className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary ${
        selected
          ? "bg-brand-accent font-bold text-brand-fg"
          : "font-semibold text-forest-500 hover:bg-forest-50 hover:text-brand-fg"
      }`}
    >
      {label}
      {count !== null && (
        <span
          className={`rounded-full px-2 py-px text-[11px] font-bold tabular-nums ${
            selected ? "bg-brand-primary text-brand-accent" : "bg-forest-50 text-forest-500"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
