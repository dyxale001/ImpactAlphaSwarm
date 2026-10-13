import LearnMore from '../components/learning/LearnMore';
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Columns2,
  ExternalLink,
  FileText,
  Pencil,
  Search,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import FundTracePanel from "../components/funds/FundTracePanel";
import RiskScale from "../components/funds/RiskScale";
import StalenessChip from "../components/funds/StalenessChip";
import FundsNotice from "../components/funds/FundsNotice";
import FundDetailSkeleton from "../components/funds/FundDetailSkeleton";
import FundPriceChart, { hasPrices } from "../components/funds/FundPriceChart";
import FundAllocation, { hasAllocation } from "../components/funds/FundAllocation";
import FundHoldings, { hasHoldings } from "../components/funds/FundHoldings";
import FundMinimums, { hasMinimums } from "../components/funds/FundMinimums";
import FundPerformance, { hasPerformance } from "../components/funds/FundPerformance";
import FundSwings, { hasSwings } from "../components/funds/FundSwings";
import FundIncomeHistory, { hasIncome } from "../components/funds/FundIncomeHistory";
import { useFundDetail, useFundPrices } from "../hooks/useFundCatalogue";
import { COMPARE_ENABLED } from "../utils/compareFlags";
import { compareHref } from "../utils/compareUrl";
import {
  AS_AT,
  COST_LABEL,
  COST_PER_YEAR,
  COST_TER_LABEL,
  DETAIL_ADMIN_EDIT,
  DETAIL_AMF_LABEL,
  DETAIL_AMF_NOTE,
  DETAIL_BACK,
  DETAIL_BENCHMARK_LABEL,
  DETAIL_COSTS_TITLE,
  DETAIL_DISTRIBUTION_LABEL,
  DETAIL_ERROR_TITLE,
  DETAIL_FACTS_TITLE,
  DETAIL_HISTORY_LEAD,
  DETAIL_HISTORY_TITLE,
  DETAIL_HORIZON_WORDS_LABEL,
  DETAIL_INCEPTION_LABEL,
  DETAIL_KEY_FACTS_LABEL,
  DETAIL_ISIN_LABEL,
  DETAIL_JSE_LABEL,
  DETAIL_MANAGED_BY_LABEL,
  DETAIL_MANAGER_LABEL,
  DETAIL_MANCO_LABEL,
  DETAIL_NAV_LABEL,
  DETAIL_NAV_NOTE,
  DETAIL_NOT_FOUND_LEAD,
  DETAIL_NOT_FOUND_TITLE,
  DETAIL_NO_FACTSHEET,
  DETAIL_NO_FACTSHEET_TITLE,
  DETAIL_OBJECTIVE_ATTRIB,
  DETAIL_OBJECTIVE_TITLE,
  DETAIL_PLATFORM_FEE_NOTE,
  DETAIL_PROVENANCE_GAPS,
  DETAIL_PROVENANCE_MANUAL,
  DETAIL_PROVENANCE_TITLE,
  DETAIL_REG28_LABEL,
  DETAIL_REG28_NO,
  DETAIL_REG28_YES,
  DETAIL_RISK_WORDS_TITLE,
  DETAIL_SEE_FIGURES,
  DETAIL_SIZE_LABEL,
  DETAIL_TABS_LABEL,
  DETAIL_TAB_DOCUMENT,
  DETAIL_TAB_FIGURES,
  DETAIL_TAB_OVERVIEW,
  DETAIL_TC_LABEL,
  DETAIL_WHY_TITLE,
  DETAIL_WORDS_TITLE,
  FACT_SHEET_ACTION,
  FACT_SHEET_PAGE_ACTION,
  LOAD_FAILED,
  MIN_TERM_LABEL,
  RISK_NO_SHEET_NOTE,
  RISK_UNPUBLISHED_NOTE,
  TFSA_BADGE,
  TRACKER_BADGE,
  VEHICLE_LABEL,
  formatAsAt,
  formatFeePeriod,
  formatFundSize,
  formatMinTerm,
  formatNav,
  formatPercent,
  splitAsisaCategory,
} from "../utils/fundsCopy";
import type {
  CatalogueFundDetail,
  FundPrices,
  FundWhyPart,
} from "../services/api/fundCatalogue";

/**
 * One fund, in full, from its own fact sheet.
 *
 * The page is built around a single constraint: a reader must be able to tell
 * where every number came from. So each figure sits next to the date of the
 * document it was read off, the management company is named rather than only
 * the brand, and the provenance section says plainly that the figures were
 * transcribed by hand.
 *
 * Costs lead over returns for the same reason they do on the card: the total
 * investment charge is the most comparable figure across every fund and the one
 * a beginner cannot read unaided.
 *
 * ## Why tabs over tiles, rather than one column
 *
 * Twelve sections used to stack in a single `max-w-4xl` column, every one the
 * same width with the same padding and the same heading, so a fund's cost, its
 * worst year and its ISIN all arrived at the same volume. Nothing told a reader
 * which of those they had come for.
 *
 * They are now three questions — what the fund is, what it has done, where that
 * came from — with the answers as tiles sized to what they hold. The Overview
 * tab opens with the trace and then the data, which is the shape D-125 settled
 * for the equity page.
 *
 * ## The layout is derived from the data, not fixed
 *
 * This is the part that matters. Of twenty-six transcribed sheets only eleven
 * carry any of the regulated common core: Coronation Balanced Plus fills every
 * tile and Satrix Divi Plus has five fields in total. So two rules keep a thin
 * fund from reading as a broken page.
 *
 * **A tab with no tiles is not rendered and its label does not appear.** Each
 * data component exports the same predicate it uses internally — `hasSwings`,
 * `hasAllocation` and the rest — so the question "would this panel be empty" is
 * answered by the function that decides the tile, rather than by a second copy
 * of the condition that would drift from it. On a sheet nobody has finished
 * reading, the tab strip is then itself an honest statement of how much is
 * known.
 *
 * **Spans are drawn only from {2, 3, 4, 6} of six columns, and the grid is
 * dense.** An absent tile reflows instead of leaving a hole where a chart would
 * have been, which is what lets the arrangement be fixed while the content is
 * not.
 *
 * Sections still appear only when their data does, and the provenance note says
 * that an absent section is a gap in our reading rather than in the fund.
 */

/** Six-column spans, the only four the bento uses. `.bento-grid` is six columns
 *  at every width, so each one carries its own stacking behaviour. */
const SPAN = {
  full: "col-span-6",
  wide: "col-span-6 lg:col-span-4",
  half: "col-span-6 lg:col-span-3",
  third: "col-span-6 md:col-span-3 lg:col-span-2",
} as const;

type TabKey = "overview" | "figures" | "document";

const TAB_LABELS: Record<TabKey, string> = {
  overview: DETAIL_TAB_OVERVIEW,
  figures: DETAIL_TAB_FIGURES,
  document: DETAIL_TAB_DOCUMENT,
};

export default function FundDetailPage() {
  const { fundId } = useParams<{ fundId: string }>();
  const { fund, isLoading, error, notFound } = useFundDetail(fundId);
  // The same check `AdminRoute` makes, so one place decides who is an admin.
  // This only reveals a link: the screen it points at is itself behind
  // `AdminRoute`, and the write behind that is behind the backend's admin
  // guard, so a non-admin who guesses the URL still gets nowhere.
  const isAdmin = useAuthStore((state) => state.profile?.role) === "admin";
  // Asked for only when the fund is exchange-traded. The vehicle is the cheap
  // check the client can make; the backend's `listed` flag is the authority,
  // and the chart renders nothing when it is false — so a mislabelled fund
  // costs one wasted request, never a fabricated line.
  const { prices } = useFundPrices(fundId, fund?.vehicle === "etf");

  if (isLoading) {
    return (
      <Shell>
        <FundDetailSkeleton />
      </Shell>
    );
  }

  if (notFound || (!fund && !error)) {
    return (
      <Shell>
        <BackLink />
        <FundsNotice icon={Search} title={DETAIL_NOT_FOUND_TITLE} body={DETAIL_NOT_FOUND_LEAD} />
      </Shell>
    );
  }

  if (error || !fund) {
    return (
      <Shell>
        <BackLink />
        <FundsNotice
          icon={AlertTriangle}
          tone="warning"
          title={DETAIL_ERROR_TITLE}
          body={error ?? LOAD_FAILED}
        />
      </Shell>
    );
  }

  return (
    <FundDetailView
      fund={fund}
      prices={prices}
      // The reader's own explanation of this fund, above the tabs it explains.
      // Only for a fund with a sheet on file: without one there is nothing
      // dated to explain, and the page's notice already says so.
      trace={fund.snapshot && fundId ? <FundTracePanel fundId={fundId} /> : null}
      compareTo={COMPARE_ENABLED ? compareHref("funds", [fund.fund_id]) : null}
      adminHref={isAdmin && fundId ? `/admin/funds/${fundId}` : null}
    />
  );
}

/**
 * The fund page itself, for any fund in the catalogue's shape: the hero with
 * its key facts, the reasoning trace, and the Overview / Figures / Document
 * tabs. The catalogue's page and a reader's uploaded fund (UploadedFundDetail)
 * both render it, so the two read as one kind of page; what differs is passed
 * in rather than branched on inside.
 */
export function FundDetailView({
  fund,
  prices,
  trace,
  compareTo,
  adminHref = null,
  back,
  badge,
  provenance,
  after,
}: {
  fund: CatalogueFundDetail;
  prices: FundPrices | null;
  /** The reasoning-trace panel above the tabs, or null. */
  trace: React.ReactNode;
  /** Where "Compare with…" goes, or null to leave it off. */
  compareTo: string | null;
  adminHref?: string | null;
  back?: { to: string; label: string };
  /** An extra chip beside the vehicle badge. */
  badge?: React.ReactNode;
  /** Replaces the hand-transcription note in "The document" tab. */
  provenance?: React.ReactNode;
  /** After the tabs, before the regulatory footer. */
  after?: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  const snapshot = fund.snapshot;
  const asAt = formatAsAt(fund.as_of);

  // Which panels have anything in them. Every one of these is the component's
  // own predicate, so a tab label can never promise a panel that renders empty.
  const overviewFilled =
    Boolean(fund.why_this_appears) ||
    fund.tic != null ||
    fund.ter != null ||
    hasMinimums(snapshot?.min_lump_sum, snapshot?.min_debit_order) ||
    hasAllocation(snapshot?.asset_allocation) ||
    hasHoldings(snapshot?.top_holdings) ||
    Boolean(snapshot?.objective || snapshot?.risk_narrative || snapshot?.horizon_words);

  const figuresFilled =
    hasPerformance(snapshot?.performance) ||
    hasSwings(snapshot?.return_high_12m, snapshot?.return_low_12m, snapshot?.return_extremes_basis) ||
    hasPrices(prices) ||
    hasIncome(snapshot?.income_distribution) ||
    formatNav(snapshot?.nav_cpu) !== null;

  // The document panel always has something: the identity is on the fund row
  // rather than on a sheet, and the provenance admissions are about the page.
  const available: TabKey[] = [
    ...(overviewFilled ? (["overview"] as const) : []),
    ...(figuresFilled ? (["figures"] as const) : []),
    "document",
  ];
  const active = available.includes(tab) ? tab : available[0];

  return (
    <Shell>
      <BackLink to={back?.to} label={back?.label} />

      <Hero fund={fund} asAt={asAt} compareTo={compareTo} adminHref={adminHref} badge={badge} />
      <LearnMore context={`fund.${active}`} />

      {/* A fund with no sheet on file is not a thin page, it is a different
          statement, and it is made once at the top rather than implied by
          eight absent tiles. */}
      {!snapshot && (
        <FundsNotice icon={FileText} title={DETAIL_NO_FACTSHEET_TITLE} body={DETAIL_NO_FACTSHEET} />
      )}

      {trace}

      {available.length > 1 && (
        <div
          role="tablist"
          aria-label={DETAIL_TABS_LABEL}
          // self-start, not just inline-flex: a flex child stretches to the
          // full line width unless told otherwise, which turns the pill into a
          // page-wide bar.
          className="inline-flex flex-wrap items-center gap-0.5 self-start rounded-full border border-brand-border/60 bg-brand-surface p-[3px]"
        >
          {available.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active === key}
              onClick={() => setTab(key)}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary ${
                active === key
                  ? "bg-brand-accent font-bold text-brand-fg"
                  : "text-forest-500 hover:text-brand-fg"
              }`}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>
      )}

      {active === "overview" && (
        <Overview
          fund={fund}
          asAt={asAt}
          onSeeFigures={available.includes("figures") ? () => setTab("figures") : undefined}
        />
      )}
      {active === "figures" && <Figures fund={fund} asAt={asAt} prices={prices} />}
      {active === "document" && <Document fund={fund} provenance={provenance} />}

      {after}

      {/* ── The statements the documents themselves require ──
          Outside the tabs, on every tab. A page listing what a fund costs and
          what it returned, with the statement that we are not licensed to
          advise on it one click away, is the state the funds-list footer was
          un-gated to prevent. The provenance block is in "The document"
          because it explains the data; these two are not explanations. */}
      <footer className="flex max-w-[90ch] flex-col gap-2 px-1 pt-2 text-xs leading-relaxed text-forest-500">
        <p>{fund.disclaimer}</p>
        <p>{fund.not_licensed}</p>
      </footer>
    </Shell>
  );
}

/* ── The page's frame ────────────────────────────────────────────────────── */

/** Wider than the old `max-w-4xl`: three tiles across need the room, and the
 *  funds page this is reached from is `max-w-7xl`. */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade-up mx-auto flex max-w-6xl flex-col gap-4 px-4 pb-20 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      {children}
    </div>
  );
}

export function BackLink({ to = "/funds", label = DETAIL_BACK }: { to?: string; label?: string }) {
  return (
    <Link
      to={to}
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-forest-500 transition-colors hover:text-brand-primary"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

/**
 * The identity, the classification, and the figures a reader came to check.
 *
 * On the same forest ground as the funds hub this page is reached from, so the
 * two read as one section rather than as two products. The risk scale leads
 * the panel beside the name because it is the only field the matcher reads,
 * and a reader who came from a matched card arrives asking about exactly that.
 *
 * The cost, size, term and Regulation 28 sit with it. They used to be an "At a
 * glance" tile a third of the way down the Overview, so the page opened on a
 * name and a paragraph and the figures that answer "what is this fund" came
 * after both. Each one is still dated, by the strip under the panel.
 */
function Hero({
  fund,
  asAt,
  compareTo,
  adminHref,
  badge,
}: {
  fund: CatalogueFundDetail;
  asAt: string | null;
  compareTo: string | null;
  adminHref: string | null;
  badge?: React.ReactNode;
}) {
  const tiers = fund.asisa_category ? splitAsisaCategory(fund.asisa_category) : null;
  // House and classification, whichever are known: a reader's uploaded fund
  // may carry neither.
  const classification = tiers
    ? `${tiers.geography} · ${tiers.assetClass} · ${tiers.focus}`
    : fund.asisa_category;
  // The dated document first; the manager's listing page is a fallback that
  // says so, because it lands on an index of hundreds rather than this fund.
  const factSheetUrl = fund.mdd_url ?? fund.mdd_page_url;
  const linksToDocument = Boolean(fund.mdd_url);

  return (
    <header className="hero-card overflow-hidden px-4 pb-5 pt-6 sm:px-8 sm:pt-8">
      <div className="relative flex flex-col gap-5">
        {/* The same three badges the fund card carries, styled the same way
            round: vehicle plain, tracker outlined, the accent fill spent on
            tax-free eligibility alone. Regulation 28 is a published fact and
            lives with the other published facts, not up here twice. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {badge}
          {fund.vehicle && (
            <span className="chip bg-white/12 text-lime-100">
              {VEHICLE_LABEL[fund.vehicle] ?? fund.vehicle}
            </span>
          )}
          {fund.is_index_tracker && (
            <span className="chip border border-dashed border-lime-100/40 text-lime-100">
              {TRACKER_BADGE}
            </span>
          )}
          {fund.tfsa_eligible && (
            <span className="chip bg-brand-accent text-brand-fg">{TFSA_BADGE}</span>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-x-8 gap-y-6">
          <div className="flex min-w-0 flex-[3_1_26rem] flex-col gap-2">
            <h1 className="text-balance text-2xl font-bold leading-tight tracking-[-0.02em] text-white lg:text-[32px]">
              {fund.name}
            </h1>

            {/* The geography carries the weight: a reader cannot tell a South
                African fund from a global one by its name, and the classification
                is the only place this page says so. */}
            {(fund.fund_house || classification) && (
              <p className="text-sm font-semibold text-lime-100/85">
                {fund.fund_house}
                {classification && (
                  <span className="font-normal text-lime-100/65">
                    {fund.fund_house ? ` · ${classification}` : classification}
                  </span>
                )}
              </p>
            )}

            {fund.vehicle_note && (
              <p className="mt-1 max-w-[60ch] text-[13px] leading-relaxed text-lime-100/65">
                {fund.vehicle_note}
              </p>
            )}

            {/* The fact sheet is the page's source, so reading it is the main
                action rather than a link in the footer strip. Compare sits
                beside it in the stock page's words, set for the dark header. */}
            {(factSheetUrl || compareTo) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {factSheetUrl && (
                  <a
                    href={factSheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-accent px-4 py-2 text-[13px] font-bold text-brand-fg transition-colors hover:bg-lime-400 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {linksToDocument ? FACT_SHEET_ACTION : FACT_SHEET_PAGE_ACTION}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {compareTo && (
                  <Link
                    to={compareTo}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-lime-100/30 bg-white/5 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:border-brand-accent/60 hover:bg-white/10 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
                  >
                    <Columns2 className="h-4 w-4 text-brand-accent" />
                    Compare with…
                  </Link>
                )}
              </div>
            )}
          </div>

          <KeyFacts fund={fund} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-lime-100/15 pt-3.5 text-xs text-lime-100/70">
          {asAt && (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="tabular-nums">
                {AS_AT} {asAt}
              </span>
              <StalenessChip asOf={fund.as_of} onDark />
            </span>
          )}
          {fund.available_on && <span>{fund.available_on}</span>}
          {adminHref && (
            <Link
              to={adminHref}
              className="inline-flex items-center gap-1 font-bold text-brand-accent hover:underline"
            >
              <Pencil className="h-3 w-3" />
              {DETAIL_ADMIN_EDIT}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** The risk scale and the published headline figures, beside the fund's name.
 *  Each figure appears only when the sheet states it, so a thin sheet gives a
 *  shorter panel rather than a grid of dashes. */
function KeyFacts({ fund }: { fund: CatalogueFundDetail }) {
  const snapshot = fund.snapshot;
  const tic = formatPercent(fund.tic);
  const ter = formatPercent(fund.ter);
  const size = formatFundSize(fund.fund_size_zar);
  const minTerm = formatMinTerm(fund.recommended_min_term_years);
  const reg28 =
    snapshot?.regulation_28 == null
      ? null
      : snapshot.regulation_28
        ? DETAIL_REG28_YES
        : DETAIL_REG28_NO;

  const headline: { label: string; value: string; suffix?: string; accent?: boolean }[] = [];
  if (tic || ter) {
    headline.push({
      label: tic ? COST_LABEL : COST_TER_LABEL,
      value: (tic ?? ter) as string,
      suffix: COST_PER_YEAR,
      accent: true,
    });
  }
  if (size) headline.push({ label: DETAIL_SIZE_LABEL, value: size });

  const plain: { label: string; value: string }[] = [];
  if (minTerm) plain.push({ label: MIN_TERM_LABEL, value: minTerm });
  if (reg28) plain.push({ label: DETAIL_REG28_LABEL, value: reg28 });
  if (fund.distribution_frequency) {
    plain.push({ label: DETAIL_DISTRIBUTION_LABEL, value: fund.distribution_frequency });
  }

  return (
    <section
      aria-label={DETAIL_KEY_FACTS_LABEL}
      className="flex min-w-0 flex-[2_1_20rem] flex-col gap-4 rounded-xl border border-lime-100/12 bg-white/5 p-5"
    >
      <RiskScale
        level={fund.risk_level}
        label={fund.risk_label}
        note={fund.risk_note ?? (snapshot ? RISK_UNPUBLISHED_NOTE : RISK_NO_SHEET_NOTE)}
        onDark
      />
      {headline.length + plain.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-lime-100/12 pt-4">
          {headline.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-[11px] text-lime-100/65">{fact.label}</dt>
              <dd
                className={`mt-1 text-2xl font-bold leading-none tracking-[-0.02em] tabular-nums ${
                  fact.accent ? "text-brand-accent" : "text-white"
                }`}
              >
                {fact.value}
                {fact.suffix && (
                  <span className="ml-1 text-xs font-medium tracking-normal text-lime-100/65">
                    {fact.suffix}
                  </span>
                )}
              </dd>
            </div>
          ))}
          {plain.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-[11px] text-lime-100/65">{fact.label}</dt>
              <dd className="mt-1 text-[15px] font-bold text-white">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/* ── Panel one: what the fund is ─────────────────────────────────────────── */

function Overview({
  fund,
  asAt,
  onSeeFigures,
}: {
  fund: CatalogueFundDetail;
  asAt: string | null;
  /** Opens "The figures" tab. Absent when that tab has nothing in it. */
  onSeeFigures?: () => void;
}) {
  const snapshot = fund.snapshot;
  const tic = formatPercent(fund.tic);
  const ter = formatPercent(fund.ter);
  const tc = formatPercent(snapshot?.tc ?? null);
  const amf = formatPercent(snapshot?.annual_management_fee ?? null);
  // The period the cost figures cover. Absent rather than assumed: managers
  // print 1-Year and 3-Year columns and the figures differ, so naming the wrong
  // one is worse than naming none.
  const feePeriod = formatFeePeriod(snapshot?.fee_period ?? null);

  // "What it is" quotes the objective, which the manager's-words tile further
  // down quotes again in full, so as a row it would be the same sentence twice.
  const whyRows = fund.why_parts?.filter((part) => part.key !== "what") ?? null;
  const hasWhy = whyRows ? whyRows.length > 0 : Boolean(fund.why_this_appears);
  const hasCosts = Boolean(tic || ter);
  const hasMins = hasMinimums(snapshot?.min_lump_sum, snapshot?.min_debit_order);

  return (
    <div className="bento-grid grid-flow-row-dense">
      {/* The trace, then the data — the order D-125 settled for the equity
          page. It is one sentence here rather than one per tab, because a fund
          has one reason for appearing. */}
      {hasWhy && (
        <Tile span={hasCosts || hasMins ? SPAN.wide : SPAN.full} title={DETAIL_WHY_TITLE}>
          {whyRows ? (
            <WhyRows rows={whyRows} onSeeFigures={onSeeFigures} />
          ) : (
            // An older backend, or the unavailable notice: one paragraph.
            <p className="text-sm leading-relaxed text-forest-600">{fund.why_this_appears}</p>
          )}
          {fund.curation_rule && <Fine rule>{fund.curation_rule}</Fine>}
        </Tile>
      )}

      {/* The cost and the minimums share the column beside the trace, so the
          first row closes without the hole the "At a glance" tile used to fill. */}
      {(hasCosts || hasMins) && (
        <div
          className={`flex flex-col gap-4 ${
            hasWhy ? "col-span-6 md:flex-row lg:col-span-2 lg:flex-col" : "col-span-6 md:flex-row"
          }`}
        >
          {hasCosts && (
            <Tile span="min-w-0 flex-1" title={DETAIL_COSTS_TITLE}>
              {/* One number leads, because one number is comparable across every
                  fund in the catalogue. The parts of it follow. */}
              <div>
                <p className="text-4xl font-extrabold leading-none tracking-[-0.03em] tabular-nums text-brand-primary">
                  {tic ?? ter}
                </p>
                <p className="mt-1.5 text-xs text-forest-500">
                  {tic ? COST_LABEL : COST_TER_LABEL} · {COST_PER_YEAR}
                </p>
              </div>
              {tic && ter && tc && <CostSplit tic={fund.tic} ter={fund.ter} />}
              {(tic && (ter || tc)) || amf ? (
                <dl className="flex flex-col gap-2.5 pt-1">
                  {tic && ter && <CostRow label={COST_TER_LABEL} value={ter} swatch="bg-brand-primary" />}
                  {amf && <CostRow label={DETAIL_AMF_LABEL} value={amf} sub />}
                  {tic && tc && (
                    <CostRow
                      label={DETAIL_TC_LABEL}
                      value={tc}
                      swatch="bg-brand-accent ring-1 ring-inset ring-forest-900/15"
                    />
                  )}
                </dl>
              ) : null}
              <Fine rule>
                {feePeriod ? `All ${feePeriod}. ` : ""}
                {amf ? `${DETAIL_AMF_NOTE} ` : ""}
                {DETAIL_PLATFORM_FEE_NOTE}
              </Fine>
            </Tile>
          )}

          <FundMinimums
            lumpSum={snapshot?.min_lump_sum ?? null}
            debitOrder={snapshot?.min_debit_order ?? null}
            className="min-w-0 flex-1"
          />
        </div>
      )}

      <FundAllocation
        allocation={snapshot?.asset_allocation ?? null}
        asOf={snapshot?.allocation_as_of ?? null}
        sheetAsOf={snapshot?.as_of ?? null}
        className={SPAN.half}
      />
      <FundHoldings
        holdings={snapshot?.top_holdings ?? null}
        asOf={snapshot?.holdings_as_of ?? null}
        sheetAsOf={snapshot?.as_of ?? null}
        className={SPAN.half}
      />

      {/* ── The manager's own prose, quoted and attributed ──
          Three cards said the same kind of thing in the same voice; together
          they read as a passage from the document, which is what they are.
          Never paraphrased: the wording is the manager's regulated disclosure,
          and we are not licensed to characterise a fund in our own voice. */}
      {(snapshot?.objective || snapshot?.risk_narrative || snapshot?.horizon_words) && (
        <Tile span={SPAN.full} title={DETAIL_WORDS_TITLE}>
          <div className="flex flex-wrap gap-x-8 gap-y-5">
            {/* Quoted bare. This used to render as "The fund aims {objective}",
                which assumed every transcription began with an infinitive —
                thirteen of twenty-six do not, and those read "The fund aims
                Balanced Plus aims to achieve…". Prefixing our words to a
                quotation also made it look like our summary. */}
            {snapshot.objective && (
              <Quote label={DETAIL_OBJECTIVE_TITLE}>{snapshot.objective}</Quote>
            )}
            {snapshot.risk_narrative && (
              <Quote label={DETAIL_RISK_WORDS_TITLE}>{snapshot.risk_narrative}</Quote>
            )}
            {/* Far more sheets state a horizon in words than state a number, so
                for most funds this is the only horizon there is. */}
            {snapshot.horizon_words && (
              <Quote label={DETAIL_HORIZON_WORDS_LABEL}>{snapshot.horizon_words}</Quote>
            )}
          </div>
          {asAt && <Fine rule>{`${DETAIL_OBJECTIVE_ATTRIB} ${asAt}.`}</Fine>}
        </Tile>
      )}
    </div>
  );
}

/** "Why this appears" as labelled rows, which a reader can scan for the one
 *  they came for. One paragraph of five "label: sentence" pairs could only be
 *  read from the top. */
function WhyRows({
  rows,
  onSeeFigures,
}: {
  rows: FundWhyPart[];
  onSeeFigures?: () => void;
}) {
  return (
    <dl className="flex flex-col">
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex flex-wrap gap-x-5 gap-y-1 border-t border-brand-border/40 py-3 first:border-t-0 first:pt-1"
        >
          <dt className="w-32 shrink-0 text-[13px] font-semibold text-forest-500">{row.label}</dt>
          <dd className="min-w-0 max-w-[65ch] flex-1 basis-72 text-sm leading-relaxed text-forest-900">
            {row.text}
            {row.key === "performance" && onSeeFigures && (
              <button
                type="button"
                onClick={onSeeFigures}
                className="ml-1.5 inline-flex items-center gap-1 text-[13px] font-bold text-brand-primary underline decoration-brand-primary/35 underline-offset-[3px] transition-colors hover:decoration-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
              >
                {DETAIL_SEE_FIGURES}
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The total charge as one bar, split into the expense ratio and the trading
 *  costs, so a reader sees which part is the larger without doing the sum. */
function CostSplit({ tic, ter }: { tic: number | null; ter: number | null }) {
  if (tic == null || ter == null || tic <= 0 || ter > tic) return null;
  return (
    <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
      <span className="bg-brand-primary" style={{ width: `${(ter / tic) * 100}%` }} />
      <span className="flex-1 bg-brand-accent" />
    </div>
  );
}

/** One part of the cost, with the swatch that matches its share of the bar.
 *  `sub` marks a part inside the row above it, as the manager's fee is. */
function CostRow({
  label,
  value,
  swatch,
  sub = false,
}: {
  label: string;
  value: string;
  swatch?: string;
  sub?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${sub ? "pl-[18px]" : ""}`}>
      {swatch && <span className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${swatch}`} aria-hidden="true" />}
      <dt className={`flex-1 ${sub ? "text-xs text-forest-500" : "text-[13px] text-forest-900"}`}>
        {label}
      </dt>
      <dd
        className={`tabular-nums ${
          sub ? "text-[13px] font-semibold text-forest-500" : "text-sm font-bold text-brand-primary"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/* ── Panel two: what it has done ─────────────────────────────────────────── */

function Figures({
  fund,
  asAt,
  prices,
}: {
  fund: CatalogueFundDetail;
  asAt: string | null;
  prices: FundPrices | null;
}) {
  const snapshot = fund.snapshot;
  const nav = formatNav(snapshot?.nav_cpu ?? null);
  const navDate = formatAsAt(snapshot?.nav_date ?? null);

  return (
    <div className="bento-grid grid-flow-row-dense">
      <FundPerformance
        performance={snapshot?.performance ?? null}
        asAt={asAt}
        inceptionDate={snapshot?.inception_date ?? null}
        className={SPAN.wide}
      />
      <FundSwings
        high={snapshot?.return_high_12m ?? null}
        low={snapshot?.return_low_12m ?? null}
        basis={snapshot?.return_extremes_basis ?? null}
        className={SPAN.third}
      />
      {prices && <FundPriceChart prices={prices} className={SPAN.full} />}
      <FundIncomeHistory
        distributions={snapshot?.income_distribution ?? null}
        className={SPAN.half}
      />

      {/* For a unit trust this is the only price there is: `fund_prices` is fed
          from a JSE symbol, so the chart above covers listed ETFs and nothing
          else. Shown with its own date rather than the sheet's, because a
          manager can strike a price on a different day. */}
      {nav && (
        <Tile span={SPAN.half} title={DETAIL_NAV_LABEL}>
          <p className="text-[28px] font-bold leading-none tracking-[-0.02em] tabular-nums text-brand-primary">
            {nav}
          </p>
          {navDate && <p className="text-[11px] text-forest-500">{`Struck on ${navDate}`}</p>}
          <Fine rule>{DETAIL_NAV_NOTE}</Fine>
        </Tile>
      )}
    </div>
  );
}

/* ── Panel three: where this came from ──────────────────────────────────── */

function Document({ fund, provenance }: { fund: CatalogueFundDetail; provenance?: React.ReactNode }) {
  const snapshot = fund.snapshot;
  const inception = formatAsAt(snapshot?.inception_date ?? null);

  return (
    <div className="bento-grid grid-flow-row-dense">
      <Tile span={SPAN.wide} title={DETAIL_FACTS_TITLE}>
        <dl className="flex flex-col gap-2.5">
          {/* The management company, not just the brand: it is the party that
              issues the fact sheet, and for a co-named boutique fund the two
              are different companies. */}
          {fund.manco && <Row label={DETAIL_MANCO_LABEL} value={fund.manco} />}
          {fund.fund_house && <Row label={DETAIL_MANAGED_BY_LABEL} value={fund.fund_house} />}
          {snapshot?.portfolio_manager && (
            <Row label={DETAIL_MANAGER_LABEL} value={snapshot.portfolio_manager} />
          )}
          {fund.isin && <Row label={DETAIL_ISIN_LABEL} value={fund.isin} mono />}
          {fund.jse_code && <Row label={DETAIL_JSE_LABEL} value={fund.jse_code} mono />}
          {snapshot?.benchmark && (
            <Row label={DETAIL_BENCHMARK_LABEL} value={snapshot.benchmark} />
          )}
          {inception && <Row label={DETAIL_INCEPTION_LABEL} value={inception} />}
        </dl>
      </Tile>

      {fund.snapshot_history.length > 0 && (
        <Tile span={SPAN.third} title={DETAIL_HISTORY_TITLE}>
          <ul className="flex flex-col">
            {fund.snapshot_history.map((entry) => (
              <li
                key={entry.as_of}
                className="flex items-center justify-between gap-3 border-b border-brand-border/30 py-1.5 text-xs last:border-0"
              >
                <span className="tabular-nums text-forest-600">
                  {formatAsAt(entry.as_of) ?? entry.as_of}
                </span>
                {entry.mdd_url && (
                  <a
                    href={entry.mdd_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-primary hover:underline"
                  >
                    {FACT_SHEET_ACTION}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
          <Fine rule>{DETAIL_HISTORY_LEAD}</Fine>
        </Tile>
      )}

      {provenance ?? (
        <Tile span={SPAN.full} title={DETAIL_PROVENANCE_TITLE}>
          <p className="text-xs leading-relaxed text-forest-600">{DETAIL_PROVENANCE_MANUAL}</p>
          <p className="text-xs leading-relaxed text-forest-600">{DETAIL_PROVENANCE_GAPS}</p>
        </Tile>
      )}
    </div>
  );
}

/* ── Tile furniture ─────────────────────────────────────────────────────── */

function Tile({
  span,
  title,
  children,
}: {
  span: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`soft-card flex flex-col gap-3 p-5 sm:p-6 ${span}`}>
      <h2 className="text-base font-bold text-brand-primary">{title}</h2>
      {children}
    </section>
  );
}

/** The fine print under a tile. `rule` pins it to the bottom with a hairline
 *  above, so tiles in one row end on the same line however tall they are. */
function Fine({ children, rule = false }: { children: React.ReactNode; rule?: boolean }) {
  return (
    <p
      className={`text-xs leading-relaxed text-forest-500 ${
        rule ? "mt-auto border-t border-brand-border/40 pt-3" : ""
      }`}
    >
      {children}
    </p>
  );
}

/** One quoted passage from the sheet, labelled with what it answers. Side by
 *  side with the others on a wide screen, stacked on a phone. */
function Quote({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="m-0 min-w-0 flex-1 basis-64">
      <figcaption className="text-xs font-bold text-forest-500">{label}</figcaption>
      <blockquote className="mt-2 max-w-[65ch] border-l-2 border-brand-accent pl-3.5 text-sm leading-relaxed text-forest-600">
        {children}
      </blockquote>
    </figure>
  );
}

/** A label and its value on one line, for a tile's list of published facts. */
function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[11px] text-forest-500">{label}</dt>
      <dd
        className={`min-w-0 text-right text-xs font-semibold text-brand-primary ${
          mono ? "font-mono text-[11px]" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
