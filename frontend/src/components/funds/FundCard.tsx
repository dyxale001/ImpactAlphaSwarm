import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import RiskScale from "./RiskScale";
import StalenessChip from "./StalenessChip";
import {
  CARD_COST_LABEL,
  CARD_MIN_TERM_LABEL,
  CARD_SHEET_LABEL,
  CARD_TER_LABEL,
  COST_LABEL,
  COST_PER_YEAR,
  COST_TER_LABEL,
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
 * manager beside the name and the fact-sheet date at the foot.
 *
 * Laid out the way the conservative redesign drew it: badges, name, manager and
 * classification on one line, the published risk, then one row of three figures
 * with the cost leading (the most comparable disclosed figure across every fund,
 * and the one a beginner cannot read), and the sheet's date with its freshness.
 * Fewer facts than before (the issuer, distributions and the fact-sheet link now
 * live on the fund's own page), so the cards compare at a glance.
 *
 * The whole card opens the fund's page: the name's link is stretched over it, so
 * it is still one named link for a screen reader. A figure the sheet leaves out
 * prints "Not stated" rather than vanishing, because on a card made for
 * comparison a missing figure would read as a shorter answer.
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
  const tiers = splitAsisaCategory(fund.asisa_category);
  const category = tiers
    ? `${tiers.geography} · ${tiers.assetClass} · ${tiers.focus}`
    : fund.asisa_category;
  const factSheetUrl = fund.mdd_url ?? catalogue.mdd_page_url ?? null;
  const linksToDocument = Boolean(fund.mdd_url);
  const riskNote =
    catalogue.risk_note ??
    (catalogue.has_factsheet === false ? RISK_NO_SHEET_NOTE : RISK_UNPUBLISHED_NOTE);
  const riskWords =
    fund.risk_level != null
      ? `${fund.risk_level} of 5${fund.risk_label ? ` · ${fund.risk_label}` : ""}`
      : null;

  return (
    <article className="as-card group relative flex flex-col gap-4 p-5 transition-shadow hover:shadow-float focus-within:shadow-float">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* The accent fill is spent on tax-free eligibility alone: it is the only
            badge of the three with a consequence. */}
        <span className="chip">{VEHICLE_LABEL[fund.vehicle] ?? fund.vehicle}</span>
        {fund.is_index_tracker && (
          <span className="chip border border-dashed border-forest-500/60 bg-transparent text-forest-600">
            {TRACKER_BADGE}
          </span>
        )}
        {fund.tfsa_eligible && <span className="chip chip-accent">{TFSA_BADGE}</span>}
      </div>

      <div>
        <h3 className="text-base font-bold leading-snug tracking-[-0.01em] text-forest-900">
          {fund.fund_id ? (
            <Link
              to={`/funds/${fund.fund_id}`}
              className="after:absolute after:inset-0 after:rounded-[20px] after:content-[''] group-hover:underline underline-offset-[3px] focus-visible:outline-none"
            >
              {fund.name}
            </Link>
          ) : (
            fund.name
          )}
        </h3>
        {/* Who manages it and the classification, with the geography first: a
            reader cannot tell a South African fund from a global one by its name. */}
        <p className="mt-1 text-xs leading-snug text-brand-muted-fg">
          {fund.fund_house} · {category}
        </p>
      </div>

      {/* The field the whole match rests on. A fund whose manager publishes no
          indicator gets the reason why instead of an empty band. */}
      {riskWords ? (
        <RiskScale level={fund.risk_level!} label={riskWords} />
      ) : (
        <p className="as-inset px-3 py-2.5 text-xs leading-relaxed text-brand-muted-fg">{riskNote}</p>
      )}

      <dl className="grid grid-cols-[1.2fr_1fr_1fr] items-end gap-3 border-t border-forest-900/8 pt-4">
        <div className="flex flex-col-reverse" title={`${cost ? COST_LABEL : COST_TER_LABEL}, ${COST_PER_YEAR}`}>
          <dt className="text-xs text-brand-muted-fg">{cost ? CARD_COST_LABEL : CARD_TER_LABEL}</dt>
          <dd className={`text-xl font-bold leading-none tabular-nums tracking-[-0.01em] ${cost || expense ? "text-forest-900" : "text-sm text-forest-400"}`}>
            {cost ?? expense ?? NOT_STATED}
          </dd>
        </div>
        <Figure label={FUND_SIZE_LABEL} value={size ?? NOT_STATED} muted={!size} />
        <Figure label={CARD_MIN_TERM_LABEL} title={MIN_TERM_LABEL} value={minTerm ?? NOT_STATED} muted={!minTerm} />
      </dl>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-forest-900/8 pt-3">
        {asAt ? (
          <span className="text-xs tabular-nums text-brand-muted-fg">
            {CARD_SHEET_LABEL} {asAt}
          </span>
        ) : (
          <span />
        )}
        <StalenessChip asOf={fund.as_of ?? null} />
        {/* Only a card with no page of its own links out to the sheet directly. */}
        {!fund.fund_id && factSheetUrl && (
          <a
            href={factSheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-bold text-forest-700 hover:underline"
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
  title,
}: {
  label: string;
  value: string;
  muted?: boolean;
  /** The full wording, where the label is a short form of it. */
  title?: string;
}) {
  return (
    <div className="flex flex-col-reverse" title={title}>
      <dt className="text-xs text-brand-muted-fg">{label}</dt>
      <dd className={`text-sm tabular-nums ${muted ? "font-semibold text-forest-400" : "font-bold text-forest-900"}`}>
        {value}
      </dd>
    </div>
  );
}
