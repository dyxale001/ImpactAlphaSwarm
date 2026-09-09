import { useState } from "react";
import { Landmark } from "lucide-react";
import FundCard from "../components/funds/FundCard";
import FundFilters from "../components/funds/FundFilters";
import FundsSkeleton from "../components/funds/FundsSkeleton";
import AsisaTree from "../components/funds/AsisaTree";
import CompleteProfilePrompt from "../components/funds/CompleteProfilePrompt";
import MatchInputs from "../components/funds/MatchInputs";
import { useFundCatalogue, useFundCatalogueMeta, useFundMatches } from "../hooks/useFundCatalogue";
import {
  EMPTY_CATALOGUE,
  EMPTY_FILTERED,
  FUNDS_HEADER_STRIP,
  FUNDS_PAGE_LEAD,
  FUNDS_PAGE_TITLE,
} from "../utils/fundsCopy";
import type { CatalogueFilters } from "../services/api/fundCatalogue";

/**
 * South African unit trusts and JSE-listed ETFs, matched to the user's profile.
 *
 * Two sections, and the order is the argument. First the funds whose published
 * risk label fits what the user told us, each with the sentence saying who
 * classified it, as what, when, and which of their own answers the filter used.
 * Then the whole classification, browsable — because a reader who can see what
 * they were not shown can tell a filter from a recommendation.
 *
 * The footer carries three things that are not decoration: how the list was
 * chosen, what this page does not cover, and the statement that the product is
 * not licensed to advise. The first pre-empts "why these funds", and the other
 * two are the honest limits of a catalogue transcribed from published documents.
 *
 * Reached only when VITE_FUNDS_ENABLED is set. Its data needs the backend's own
 * flag as well, so the two are set together.
 */
export default function FundsPage() {
  const [filters, setFilters] = useState<CatalogueFilters>({});
  const { meta } = useFundCatalogueMeta();
  const { data, funds, isLoading, error } = useFundCatalogue(filters);
  const matchState = useFundMatches();

  const filtersActive = Object.values(filters).some((value) => value !== undefined && value !== "");

  return (
    <div className="max-w-7xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-20 space-y-6 animate-fade-in-up">
      {/* ── Header ── */}
      <div className="hero-card overflow-hidden px-5 sm:px-7 pt-8 pb-10">
        <div className="relative">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-accent">
            {meta?.header.eyebrow ?? "South African funds"}
          </span>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold text-brand-bg lg:text-3xl">
            <Landmark className="h-7 w-7 shrink-0 text-brand-accent" />
            {meta?.header.title ?? FUNDS_PAGE_TITLE}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-bg/75">
            {FUNDS_PAGE_LEAD}
          </p>
          {/* Which market, which currency, and whether the rand figure is a
              conversion — the question a reader of an asset page could not
              answer. */}
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-brand-bg/60">
            {meta?.header.strip ?? FUNDS_HEADER_STRIP}
          </p>
        </div>
      </div>

      {/* ── What the match is filtered on ──
          Under the header on purpose: the reader meets the answers before the
          funds those answers chose. Absent when no bracket came back, since
          CompleteProfilePrompt already speaks to that state. */}
      {matchState.bracket && <MatchInputs bracket={matchState.bracket} />}

      {/* ── Matched to the user's profile ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-brand-primary">
            {matchState.sectionTitle ?? "Funds whose published risk label matches your profile"}
          </h2>
          {/* The risk profile and ceiling used to be captioned here. They
              are in the panel above now, stated once and with the other two
              answers beside them. */}
        </div>

        {matchState.isLoading && <FundsSkeleton count={3} />}

        {!matchState.isLoading && matchState.error && (
          <p className="soft-card p-5 text-xs leading-relaxed text-brand-secondary">
            {matchState.error}
          </p>
        )}

        {!matchState.isLoading && !matchState.error && (
          <>
            {(matchState.fallbackRiskOnly || !matchState.profileFound) && (
              <CompleteProfilePrompt notice={matchState.notice} />
            )}

            {matchState.matches.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {matchState.matches.map((match) => (
                  <FundCard key={match.fund_id} fund={match} reason={match.reason} />
                ))}
              </div>
            ) : (
              matchState.profileFound &&
              !matchState.fallbackRiskOnly &&
              matchState.notice && (
                <p className="soft-card p-5 text-xs leading-relaxed text-brand-secondary">
                  {matchState.notice}
                </p>
              )
            )}
          </>
        )}
      </section>

      {/* ── Browse everything ── */}
      <AsisaTree meta={meta} filters={filters} onSelect={setFilters} />

      <section className="space-y-3">
        <FundFilters meta={meta} filters={filters} onChange={setFilters} />

        {isLoading && <FundsSkeleton />}

        {!isLoading && error && (
          <p className="soft-card p-5 text-xs leading-relaxed text-brand-secondary">{error}</p>
        )}

        {!isLoading && !error && funds.length === 0 && (
          <p className="soft-card p-5 text-xs leading-relaxed text-brand-secondary">
            {filtersActive ? EMPTY_FILTERED : EMPTY_CATALOGUE}
          </p>
        )}

        {!isLoading && !error && funds.length > 0 && (
          <>
            <p className="text-[11px] text-brand-secondary/70">
              {funds.length} {funds.length === 1 ? "fund" : "funds"}
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {funds.map((fund) => (
                <FundCard key={fund.fund_id} fund={fund} />
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── What this page is, and is not ── */}
      {data && (
        <footer className="soft-card space-y-3 p-5">
          <p className="text-xs leading-relaxed text-brand-secondary">{data.inclusion_rule}</p>
          <p className="text-xs leading-relaxed text-brand-secondary">{data.not_covered}</p>
          <p className="text-xs leading-relaxed text-brand-secondary/80">{data.disclaimer}</p>
          <p className="border-t border-brand-border/40 pt-3 text-xs leading-relaxed text-brand-secondary/80">
            {data.not_licensed}
          </p>
        </footer>
      )}
    </div>
  );
}
