import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Landmark, Layers, Search, SlidersHorizontal } from "lucide-react";
import FundCard from "../components/funds/FundCard";
import FundFilters from "../components/funds/FundFilters";
import FundsNotice from "../components/funds/FundsNotice";
import FundsSkeleton from "../components/funds/FundsSkeleton";
import CategoryNavigator from "../components/funds/CategoryNavigator";
import CompleteProfilePrompt from "../components/funds/CompleteProfilePrompt";
import MatchInputs from "../components/funds/MatchInputs";
import TiersMotif from "../components/funds/TiersMotif";
import { useFundCatalogue, useFundCatalogueMeta, useFundMatches } from "../hooks/useFundCatalogue";
import {
  BROWSE_LEAD,
  BROWSE_TITLE,
  CIS_DISCLAIMER,
  EMPTY_CATALOGUE,
  EMPTY_CATALOGUE_TITLE,
  EMPTY_FILTERED,
  EMPTY_FILTERED_TITLE,
  FILTER_CLEAR_ALL,
  FOOTER_NOT_LICENSED,
  FUNDS_HEADER_EYEBROW,
  FUNDS_HEADER_STRIP,
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

/** The anchor the matched-empty state sends a reader to. */
const BROWSE_ID = "browse-funds";

/**
 * South African unit trusts and JSE-listed ETFs, matched to the user's profile.
 *
 * Two sections, and the order is the argument. First the funds whose published
 * risk label fits what the user told us, each with the sentence saying who
 * classified it, as what, when, and which of their own answers the filter used.
 * Then the whole classification, browsable — because a reader who can see what
 * they were not shown can tell a filter from a recommendation.
 *
 * ## Why the second section sits on a different ground
 *
 * The distinction between "these few are matched to you" and "the rest you can
 * explore" is the page's whole point, and it used to be carried by nothing but
 * a 24px gap — the same gap that separated the header from the card below it.
 * Two similar grids of similar cards, one after the other, read as one long
 * list in two halves.
 *
 * So the matched cards sit directly on the page and everything to do with
 * browsing is wrapped in one tinted container: the navigator, the filters, the
 * count and the grid, as a single reference area that is visibly subordinate.
 * The rhythm between the two is 40px rather than 24px, which is the sort of
 * thing that only works alongside the change of ground.
 *
 * The footer carries three things that are not decoration: how the list was
 * chosen, what this page does not cover, and the statement that the product is
 * not licensed to advise. The first pre-empts "why these funds", and the other
 * two are the honest limits of a catalogue transcribed from published
 * documents. It renders whether or not the catalogue request succeeded, which
 * it did not used to: gated on the response, a failed fetch took the
 * not-licensed statement off the page along with the funds.
 *
 * Reached only when VITE_FUNDS_ENABLED is set. Its data needs the backend's own
 * flag as well, so the two are set together.
 */
export default function FundsPage() {
  const [filters, setFilters] = useState<CatalogueFilters>({});
  const [showAll, setShowAll] = useState(false);
  const meta = useFundCatalogueMeta();
  const { data, funds, isLoading, error } = useFundCatalogue(filters);
  const matchState = useFundMatches();

  const filtersActive = Object.values(filters).some(
    (value) => value !== undefined && value !== "" && value !== false,
  );

  // The server's own count for this query rather than the length of what came
  // back, so the number beside the grid is the catalogue's answer and not a
  // count of what this page happens to be holding.
  const count = data?.count ?? funds.length;

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

  const goToBrowse = () => {
    const target = document.getElementById(BROWSE_ID);
    if (!target) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  };

  return (
    <div className="animate-fade-up mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      {/* ── Header ── */}
      <div className="hero-card overflow-hidden px-5 pb-10 pt-8 sm:px-7">
        <TiersMotif className="h-full" />
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
              conversion — the question a reader of an asset page could not
              answer. */}
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-brand-bg/60">
            {meta.meta?.header.strip ?? FUNDS_HEADER_STRIP}
          </p>
        </div>
      </div>

      {/* ── What the match is filtered on ──
          Under the header on purpose: the reader meets the answers before the
          funds those answers chose. Absent when no bracket came back, since
          CompleteProfilePrompt already speaks to that state. */}
      {matchState.bracket && (
        <div className="mt-6">
          <MatchInputs bracket={matchState.bracket} />
        </div>
      )}

      {/* ── Matched to the user's profile ── */}
      <section className="mt-10 flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-bold text-brand-primary">
            {matchState.sectionTitle ?? MATCHED_SECTION_TITLE}
          </h2>
          {matchState.matches.length > 0 && (
            <p className="text-[11px] tabular-nums text-brand-muted-fg" aria-live="polite">
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
                  <FundCard
                    key={match.fund_id}
                    fund={match}
                    reason={match.reason}
                    variant="matched"
                  />
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

      {/* ── Browse everything ──
          One container, one ground: the navigator, the filters, the count and
          the grid are all the same act, and reading them as one area is what
          keeps the section above it looking personal. */}
      <section
        id={BROWSE_ID}
        className="mt-10 flex scroll-mt-6 flex-col gap-4 rounded-brand border border-brand-border/40 bg-brand-bg/60 p-4 lg:p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 text-sm font-bold text-brand-primary">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-brand-accent" />
            {BROWSE_TITLE}
          </h2>
          <p className="max-w-3xl text-xs leading-relaxed text-brand-secondary">{BROWSE_LEAD}</p>
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
            <p className="text-[11px] tabular-nums text-brand-muted-fg" aria-live="polite">
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
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-brand border border-brand-border/60 bg-brand-surface/70 px-4 py-2.5 text-xs font-semibold text-brand-secondary transition-colors hover:border-brand-primary/40 hover:text-brand-primary"
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

      {/* ── What this page is, and is not ──
          Never gated on the response. The two paragraphs that describe the
          catalogue drop out with it; the two that describe the product do not,
          because a page that lists funds without saying it is not licensed to
          advise on them is the one state this footer exists to prevent. */}
      <footer className="soft-card mt-6 flex flex-col gap-3 p-5">
        {data && (
          <>
            <p className="text-xs leading-relaxed text-brand-secondary">{data.inclusion_rule}</p>
            <p className="text-xs leading-relaxed text-brand-secondary">{data.not_covered}</p>
          </>
        )}
        <p className="text-xs leading-relaxed text-brand-secondary/80">
          {data?.disclaimer ?? CIS_DISCLAIMER}
        </p>
        <p className="border-t border-brand-border/40 pt-3 text-xs leading-relaxed text-brand-secondary/80">
          {data?.not_licensed ?? FOOTER_NOT_LICENSED}
        </p>
      </footer>
    </div>
  );
}
