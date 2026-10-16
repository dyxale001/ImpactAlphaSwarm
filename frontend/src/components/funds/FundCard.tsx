import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import RiskScale from "./RiskScale";
import StalenessChip from "./StalenessChip";
import {
  AS_AT,
  COST_LABEL,
  COST_PER_YEAR,
  COST_TER_LABEL,
  DETAIL_MANCO_LABEL,
  DISTRIBUTIONS_LABEL,
  FACT_SHEET_ACTION,
  FACT_SHEET_PAGE_ACTION,
  FUND_SIZE_LABEL,
  MIN_TERM_LABEL,
  NOT_STATED,
  RISK_NO_SHEET_NOTE,
  RISK_UNPUBLISHED_NOTE,
  TFSA_BADGE,
  TRACKER_BADGE,
  VEHICLE_LABEL,
  formatAsAt,
  formatFundSize,
  formatMinTerm,
  formatPercent,
  splitAsisaCategory,
} from "../../utils/fundsCopy";
import type { CatalogueFund, FundMatch } from "../../services/api/fundCatalogue";

/**
 * One fund, described entirely from its own fact sheet.
 *
 * Every figure on this card is attributed and dated. That is not decoration:
 * the product is not licensed to give advice, so what makes a fund card
 * defensible is that a reader can see who said each thing and when. Hence the
 * management company on the card rather than only the brand, and the fact-sheet
 * date beside the numbers rather than in a footnote.
 *
 * Costs lead over performance deliberately, and now in size as well as order.
 * The total investment charge is the most comparable disclosed figure across
 * every fund and the one a beginner cannot read; past returns are the least
 * comparable and the most likely to be mistaken for a forecast.
 *
 * ## One card on both tabs
 *
 * The matched card used to carry the "Why this appears" sentence and drop fund
 * size and distributions to make room for it, so the two tabs drew two shapes
 * of card. The sentence is gone from the card: it was the longest block on it,
 * and why a fund is among a reader's matches is now explained on the fund's own
 * page, in the reasoning trace that reads the reader's answers. A match now
 * carries the same figures as a catalogue row, so every card states all four,
 * printing "Not stated" where the sheet is silent rather than dropping the row —
 * on a card whose purpose is comparison, a quietly missing figure reads as a
 * shorter answer instead of a silent document.
 */
export default function FundCard({
  fund,
}: {
  fund: CatalogueFund | (FundMatch & Partial<CatalogueFund>);
}) {
  const catalogue = fund as Partial<CatalogueFund>;
  const cost = formatPercent(fund.tic ?? null);
  const expense = formatPercent(fund.ter ?? null);
  const asAt = formatAsAt(fund.as_of ?? null);
  const minTerm = formatMinTerm(fund.recommended_min_term_years ?? null);
  const size = formatFundSize(catalogue.fund_size_zar ?? null);
  const distributions = catalogue.distribution_frequency ?? null;
  const tiers = splitAsisaCategory(fund.asisa_category);
  const separateManco = fund.manco && fund.manco !== fund.fund_house ? fund.manco : null;
  const factSheetUrl = fund.mdd_url ?? catalogue.mdd_page_url ?? null;
  const linksToDocument = Boolean(fund.mdd_url);
  const riskNote =
    catalogue.risk_note ??
    (catalogue.has_factsheet === false ? RISK_NO_SHEET_NOTE : RISK_UNPUBLISHED_NOTE);

  return (
    <article className="soft-card flex flex-col gap-4 p-5 transition-colors hover:border-brand-primary/30">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Three badges saying three unrelated things, so they are drawn
              three ways. The accent fill is spent on tax-free eligibility
              alone: it is the only one of the three with a consequence. */}
          <span className="chip bg-brand-bg text-forest-600">
            {VEHICLE_LABEL[fund.vehicle] ?? fund.vehicle}
          </span>
          {fund.is_index_tracker && (
            <span className="chip border border-dashed border-brand-border bg-transparent text-forest-500">
              {TRACKER_BADGE}
            </span>
          )}
          {fund.tfsa_eligible && (
            <span className="chip bg-brand-accent text-brand-fg">{TFSA_BADGE}</span>
          )}
        </div>
        {/* The name is the way in to the full sheet. Only the name is a link:
            making the whole card clickable would swallow the fact-sheet link in
            the footer, which goes somewhere else entirely. */}
        <h3 className="text-base font-bold leading-snug tracking-[-0.01em] text-brand-primary">
          {fund.fund_id ? (
            <Link
              to={`/funds/${fund.fund_id}`}
              className="underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            >
              {fund.name}
            </Link>
          ) : (
            fund.name
          )}
        </h3>
        <div className="flex flex-col gap-0.5">
          <p className="text-[13px] font-semibold leading-snug text-forest-600">{fund.fund_house}</p>
          {separateManco && (
            <p className="text-[11px] leading-snug text-forest-500">
              {DETAIL_MANCO_LABEL} {separateManco}
            </p>
          )}
          {/* The three tiers, with the geography carrying the weight. A reader
              cannot tell a South African fund from a global one by its name,
              and the classification is the only place the page says so. */}
          <p className="text-xs leading-snug text-forest-600">
            {tiers ? (
              <>
                <span className="font-bold text-brand-primary">{tiers.geography}</span>
                {" · "}
                {tiers.assetClass}
                {" · "}
                {tiers.focus}
              </>
            ) : (
              fund.asisa_category
            )}
          </p>
        </div>
      </header>

      {/* The field the whole match rests on, so it leads the figures rather
          than sitting among them. A fund whose manager publishes no indicator
          gets the reason why instead: `RiskScale` returns null in that case,
          which silently collapsed this band and made a designed outcome look
          like a rendering fault. */}
      {fund.risk_level != null ? (
        <RiskScale level={fund.risk_level} label={fund.risk_label ?? null} />
      ) : (
        <p className="rounded-lg bg-brand-bg px-3 py-2.5 text-xs leading-relaxed text-forest-600">
          {riskNote}
        </p>
      )}

      {/* One number leads, because one number is comparable across every fund.
          The rest sit under it at one level. */}
      {(cost || expense) && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-brand-border/40 pt-3.5">
          <span className="text-2xl font-extrabold leading-none tracking-[-0.02em] tabular-nums text-brand-primary">
            {cost ?? expense}
          </span>
          <span className="text-xs text-forest-500">
            {cost ? COST_LABEL : COST_TER_LABEL} · {COST_PER_YEAR}
          </span>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <Figure label={MIN_TERM_LABEL} value={minTerm ?? NOT_STATED} muted={!minTerm} />
        <Figure label={FUND_SIZE_LABEL} value={size ?? NOT_STATED} muted={!size} />
        {distributions && (
          <div className="col-span-2">
            <Figure label={DISTRIBUTIONS_LABEL} value={distributions} />
          </div>
        )}
      </dl>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-brand-border/40 pt-3">
        {asAt ? (
          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-forest-500">
            <span className="tabular-nums">
              {AS_AT} {asAt}
            </span>
            <StalenessChip asOf={fund.as_of ?? null} />
          </span>
        ) : (
          <span />
        )}
        {factSheetUrl && (
          <a
            href={factSheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-brand-primary hover:underline"
          >
            {linksToDocument ? FACT_SHEET_ACTION : FACT_SHEET_PAGE_ACTION}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </footer>
    </article>
  );
}

function Figure({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] text-forest-500">{label}</dt>
      <dd
        className={`mt-0.5 text-[13px] tabular-nums ${
          muted ? "font-semibold text-forest-400" : "font-bold text-brand-primary"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
