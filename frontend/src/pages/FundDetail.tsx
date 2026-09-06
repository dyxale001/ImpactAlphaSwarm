import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import RiskScale from "../components/funds/RiskScale";
import FundsSkeleton from "../components/funds/FundsSkeleton";
import FundPriceChart from "../components/funds/FundPriceChart";
import FundAllocation from "../components/funds/FundAllocation";
import FundPerformance from "../components/funds/FundPerformance";
import { useFundDetail, useFundPrices } from "../hooks/useFundCatalogue";
import {
  AS_AT,
  COST_LABEL,
  COST_TER_LABEL,
  DETAIL_BACK,
  DETAIL_BENCHMARK_LABEL,
  DETAIL_COSTS_LEAD,
  DETAIL_COSTS_TITLE,
  DETAIL_DISTRIBUTION_LABEL,
  DETAIL_FACTS_TITLE,
  DETAIL_HISTORY_LEAD,
  DETAIL_HISTORY_TITLE,
  DETAIL_ISIN_LABEL,
  DETAIL_JSE_LABEL,
  DETAIL_MANCO_LABEL,
  DETAIL_NOT_FOUND_LEAD,
  DETAIL_NOT_FOUND_TITLE,
  DETAIL_NO_FACTSHEET,
  DETAIL_OBJECTIVE_ATTRIB,
  DETAIL_OBJECTIVE_TITLE,
  DETAIL_PLATFORM_FEE_NOTE,
  DETAIL_PROVENANCE_GAPS,
  DETAIL_PROVENANCE_MANUAL,
  DETAIL_PROVENANCE_TITLE,
  DETAIL_SIZE_LABEL,
  DETAIL_TC_LABEL,
  DETAIL_WHY_TITLE,
  FACT_SHEET_ACTION,
  FACT_SHEET_PAGE_ACTION,
  MIN_TERM_LABEL,
  TFSA_BADGE,
  TRACKER_BADGE,
  VEHICLE_LABEL,
  formatAsAt,
  formatFundSize,
  formatMinTerm,
  formatPercent,
} from "../utils/fundsCopy";

/**
 * One fund, in full, from its own fact sheet.
 *
 * The page is built around a single constraint: a reader must be able to tell
 * where every number came from. So each figure sits next to the date of the
 * document it was read off, the management company is named rather than only
 * the brand, and the provenance section says plainly that the figures were
 * transcribed by hand.
 *
 * Sections appear only when their data does. The asset allocation and holdings
 * are published as charts that nothing reads yet, so those sections are absent
 * rather than empty — and the provenance note explains that an absent section
 * is a gap in our reading, not in the fund. Rendering a stub would quietly
 * imply the fund had nothing to disclose.
 *
 * Costs lead over returns for the same reason they do on the card: the total
 * investment charge is the most comparable figure across every fund and the one
 * a beginner cannot read unaided.
 */
export default function FundDetailPage() {
  const { fundId } = useParams<{ fundId: string }>();
  const { fund, isLoading, error, notFound } = useFundDetail(fundId);
  // Asked for only when the fund is exchange-traded. The vehicle is the cheap
  // check the client can make; the backend's `listed` flag is the authority,
  // and the chart renders nothing when it is false — so a mislabelled fund
  // costs one wasted request, never a fabricated line.
  const { prices } = useFundPrices(fundId, fund?.vehicle === "etf");

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-20">
        <FundsSkeleton />
      </div>
    );
  }

  if (notFound || (!fund && !error)) {
    return (
      <div className="max-w-4xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-20 space-y-4">
        <BackLink />
        <div className="soft-card p-6">
          <h1 className="text-lg font-bold text-brand-primary">{DETAIL_NOT_FOUND_TITLE}</h1>
          <p className="mt-2 text-sm leading-relaxed text-brand-secondary">{DETAIL_NOT_FOUND_LEAD}</p>
        </div>
      </div>
    );
  }

  if (error || !fund) {
    return (
      <div className="max-w-4xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-20 space-y-4">
        <BackLink />
        <div className="soft-card p-6">
          <p className="text-sm leading-relaxed text-brand-secondary">{error}</p>
        </div>
      </div>
    );
  }

  const snapshot = fund.snapshot;
  const asAt = formatAsAt(fund.as_of);
  const tic = formatPercent(fund.tic);
  const ter = formatPercent(fund.ter);
  const tc = formatPercent(snapshot?.tc ?? null);
  const size = formatFundSize(fund.fund_size_zar);
  const minTerm = formatMinTerm(fund.recommended_min_term_years);
  // The dated document first; the manager's listing page is a fallback that
  // says so, because it lands on an index of hundreds rather than this fund.
  const factSheetUrl = fund.mdd_url ?? fund.mdd_page_url;
  const linksToDocument = Boolean(fund.mdd_url);

  return (
    <div className="max-w-4xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-20 space-y-6 animate-fade-in-up">
      <BackLink />

      {/* ── Identity ── */}
      <header className="soft-card space-y-3 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{VEHICLE_LABEL[fund.vehicle] ?? fund.vehicle}</Badge>
          {fund.is_index_tracker && <Badge>{TRACKER_BADGE}</Badge>}
          {fund.tfsa_eligible && <Badge accent>{TFSA_BADGE}</Badge>}
        </div>
        <h1 className="text-xl font-bold leading-snug text-brand-primary lg:text-2xl">
          {fund.name}
        </h1>
        <p className="text-sm text-brand-secondary">{fund.asisa_category}</p>
        {fund.vehicle_note && (
          <p className="text-xs leading-relaxed text-brand-secondary/75">{fund.vehicle_note}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-brand-border/40 pt-3 text-[11px] text-brand-secondary/70">
          {asAt && (
            <span>
              {AS_AT} {asAt}
            </span>
          )}
          {fund.available_on && <span>{fund.available_on}</span>}
          {factSheetUrl && (
            <a
              href={factSheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-brand-primary hover:underline"
            >
              {linksToDocument ? FACT_SHEET_ACTION : FACT_SHEET_PAGE_ACTION}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </header>

      {!snapshot && (
        <section className="soft-card p-6">
          <p className="text-sm leading-relaxed text-brand-secondary">{DETAIL_NO_FACTSHEET}</p>
        </section>
      )}

      {/* ── Risk, as the manager publishes it ── */}
      {snapshot && (
        <section className="soft-card p-6">
          <RiskScale level={fund.risk_level} label={fund.risk_label} note={fund.risk_note} />
        </section>
      )}

      {/* ── What it closed at, for a listed fund only ── */}
      {prices && <FundPriceChart prices={prices} />}

      {/* ── The manager's own figures, when someone has transcribed them.
             Absent rather than stubbed: both are charts on the sheet, so a
             missing one means nobody has read it yet, which the provenance
             block below says outright. ── */}
      <FundPerformance performance={snapshot?.performance ?? null} asAt={asAt} />
      <FundAllocation allocation={snapshot?.asset_allocation ?? null} />

      {/* ── The manager's own objective ── */}
      {snapshot?.objective && (
        <section className="soft-card space-y-2 p-6">
          <h2 className="text-sm font-bold text-brand-primary">{DETAIL_OBJECTIVE_TITLE}</h2>
          <blockquote className="border-l-2 border-brand-accent/50 pl-3 text-sm leading-relaxed text-brand-secondary">
            The fund aims {snapshot.objective}.
          </blockquote>
          {asAt && (
            <p className="text-[11px] text-brand-secondary/60">
              {DETAIL_OBJECTIVE_ATTRIB} {asAt}.
            </p>
          )}
        </section>
      )}

      {/* ── Costs ── */}
      {(tic || ter) && (
        <section className="soft-card space-y-3 p-6">
          <h2 className="text-sm font-bold text-brand-primary">{DETAIL_COSTS_TITLE}</h2>
          <p className="text-xs leading-relaxed text-brand-secondary/80">{DETAIL_COSTS_LEAD}</p>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Figure label={COST_TER_LABEL} value={ter} />
            <Figure label={DETAIL_TC_LABEL} value={tc} />
            <Figure label={COST_LABEL} value={tic} emphasis />
          </dl>
          <p className="text-[11px] leading-relaxed text-brand-secondary/60">
            {DETAIL_PLATFORM_FEE_NOTE}
          </p>
        </section>
      )}

      {/* ── The published facts ── */}
      <section className="soft-card space-y-3 p-6">
        <h2 className="text-sm font-bold text-brand-primary">{DETAIL_FACTS_TITLE}</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
          <Row label={DETAIL_MANCO_LABEL} value={fund.manco} />
          <Row label="Managed by" value={fund.fund_house} />
          <Row label={DETAIL_ISIN_LABEL} value={fund.isin} mono />
          {fund.jse_code && <Row label={DETAIL_JSE_LABEL} value={fund.jse_code} mono />}
          {snapshot?.benchmark && (
            <Row label={DETAIL_BENCHMARK_LABEL} value={snapshot.benchmark} />
          )}
          {size && <Row label={DETAIL_SIZE_LABEL} value={size} />}
          {fund.distribution_frequency && (
            <Row label={DETAIL_DISTRIBUTION_LABEL} value={fund.distribution_frequency} />
          )}
          {minTerm && <Row label={MIN_TERM_LABEL} value={minTerm} />}
        </dl>
      </section>

      {/* ── Why it appears, in the backend's words ── */}
      {fund.why_this_appears && (
        <section className="soft-card space-y-2 p-6">
          <h2 className="text-sm font-bold text-brand-primary">{DETAIL_WHY_TITLE}</h2>
          <p className="text-sm leading-relaxed text-brand-secondary">{fund.why_this_appears}</p>
          {fund.curation_rule && (
            <p className="text-[11px] leading-relaxed text-brand-secondary/60">
              {fund.curation_rule}
            </p>
          )}
        </section>
      )}

      {/* ── Every dated sheet on file ── */}
      {fund.snapshot_history.length > 0 && (
        <section className="soft-card space-y-3 p-6">
          <h2 className="text-sm font-bold text-brand-primary">{DETAIL_HISTORY_TITLE}</h2>
          <p className="text-xs leading-relaxed text-brand-secondary/80">{DETAIL_HISTORY_LEAD}</p>
          <ul className="space-y-1.5">
            {fund.snapshot_history.map((entry) => (
              <li
                key={entry.as_of}
                className="flex items-center justify-between gap-3 border-b border-brand-border/30 pb-1.5 text-xs last:border-0"
              >
                <span className="text-brand-secondary">{formatAsAt(entry.as_of) ?? entry.as_of}</span>
                {entry.mdd_url && (
                  <a
                    href={entry.mdd_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-brand-primary hover:underline"
                  >
                    {FACT_SHEET_ACTION}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Provenance and the honest limits ── */}
      <section className="soft-card space-y-2 p-6">
        <h2 className="text-sm font-bold text-brand-primary">{DETAIL_PROVENANCE_TITLE}</h2>
        <p className="text-xs leading-relaxed text-brand-secondary">{DETAIL_PROVENANCE_MANUAL}</p>
        <p className="text-xs leading-relaxed text-brand-secondary">{DETAIL_PROVENANCE_GAPS}</p>
      </section>

      {/* ── The statements the documents themselves require ── */}
      <footer className="space-y-2 px-1 text-[11px] leading-relaxed text-brand-secondary/60">
        <p>{fund.disclaimer}</p>
        <p>{fund.not_licensed}</p>
      </footer>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/funds"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-secondary hover:text-brand-primary"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {DETAIL_BACK}
    </Link>
  );
}

function Badge({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
        accent ? "bg-brand-accent/15 text-brand-primary" : "bg-brand-bg text-brand-secondary"
      }`}
    >
      {children}
    </span>
  );
}

/** One cost, shown only when the sheet states it. */
function Figure({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string | null;
  emphasis?: boolean;
}) {
  if (!value) return null;
  return (
    <div
      className={`flex flex-col rounded-md p-3 ${emphasis ? "bg-brand-accent/10" : "bg-brand-bg/60"}`}
    >
      <dt className="text-[11px] text-brand-secondary/70">{label}</dt>
      <dd
        className={`font-semibold text-brand-primary ${emphasis ? "text-base" : "text-sm"}`}
      >
        {value} a year
      </dd>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-brand-secondary/70">{label}</dt>
      <dd className={`font-semibold text-brand-primary ${mono ? "font-mono text-[11px]" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
