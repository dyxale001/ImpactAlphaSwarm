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
  WHY_APPEARS_LABEL,
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
 * Costs lead over performance deliberately. The total investment charge is the
 * most comparable disclosed figure across every fund and the one a beginner
 * cannot read; past returns are the least comparable and the most likely to be
 * mistaken for a forecast.
 *
 * ## Why there are two variants
 *
 * The page shows this card in two places that are answering different
 * questions, and one shape was serving both badly. `FundMatch` carries no fund
 * size, distribution frequency or risk note, so a matched card filled two of
 * four figure slots and a browse card filled four — the same component at two
 * materially different heights, by accident rather than by choice.
 *
 * So the difference is now declared. `matched` states the two figures both DTOs
 * carry and spends the height it saves on the reason sentence, which is the
 * only thing on the card the reader cannot get from the fund itself.
 * `catalogue` states all four, printing "Not stated" where the sheet is silent
 * rather than dropping the row — on a card whose purpose is comparison, a
 * quietly missing figure reads as a shorter answer instead of a silent
 * document.
 *
 * `reason` is written by the backend, so the sentence that has to survive the
 * advice test is reviewed in one place. It is labelled here with the design
 * note's own heading: unlabelled, the tallest and most variable block on the
 * card read as prose about the fund rather than as the answer to the question
 * the section above it poses.
 */
export default function FundCard({
  fund,
  reason,
  variant = "catalogue",
}: {
  fund: CatalogueFund | (FundMatch & Partial<CatalogueFund>);
  reason?: string;
  variant?: "matched" | "catalogue";
}) {
  const catalogue = fund as Partial<CatalogueFund>;
  const cost = formatPercent(fund.tic ?? null);
  const expense = formatPercent(fund.ter ?? null);
  const asAt = formatAsAt(fund.as_of ?? null);
  const minTerm = formatMinTerm(fund.recommended_min_term_years ?? null);
  const size = formatFundSize(catalogue.fund_size_zar ?? null);
  const tiers = splitAsisaCategory(fund.asisa_category);
  // The brand and the company that issues the sheet are usually the same name
  // and sometimes are not: a co-named boutique fund is run by one house and
  // issued by another, and the second is the party whose document this is.
  // Both, then, but only when they differ — printed twice it looks like a bug.
  const separateManco = fund.manco && fund.manco !== fund.fund_house ? fund.manco : null;

  // The dated document first, the manager's listing page only as a fallback.
  // Linking the listing page under "Read the fact sheet" sends a reader to an
  // index of hundreds of funds instead of the one whose figures they are
  // looking at, so the label changes with the destination.
  const factSheetUrl = fund.mdd_url ?? catalogue.mdd_page_url ?? null;
  const linksToDocument = Boolean(fund.mdd_url);

  // Why this fund can be browsed and never matched. `risk_note` is the
  // backend's own sentence where it has one; the two fallbacks distinguish a
  // sheet that carries no indicator from a fund with no sheet on file at all,
  // which are different facts about different things.
  const riskNote =
    catalogue.risk_note ??
    (catalogue.has_factsheet === false ? RISK_NO_SHEET_NOTE : RISK_UNPUBLISHED_NOTE);

  return (
    <article className="soft-card flex flex-col gap-4 p-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Three badges saying three unrelated things, so they are drawn
              three ways. Vehicle and tracker were styled identically, which
              made "unit trust" and "index tracker" look like one fact stated
              twice. The accent fill is spent on tax-free eligibility alone:
              it is the only one of the three with a consequence attached. */}
          <span className="chip bg-brand-bg text-brand-secondary">
            {VEHICLE_LABEL[fund.vehicle] ?? fund.vehicle}
          </span>
          {fund.is_index_tracker && (
            <span className="chip border border-dashed border-brand-border text-forest-500">
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
        <h3 className="text-[15px] font-bold leading-snug tracking-[-0.01em] text-brand-primary">
          {fund.fund_id ? (
            <Link to={`/funds/${fund.fund_id}`} className="hover:underline">
              {fund.name}
            </Link>
          ) : (
            fund.name
          )}
        </h3>

        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-semibold leading-snug text-brand-secondary">
            {fund.fund_house}
          </p>
          {separateManco && (
            <p className="text-[11px] leading-snug text-brand-secondary/70">
              {DETAIL_MANCO_LABEL} {separateManco}
            </p>
          )}
          {/* The three tiers, with the geography carrying the weight. A reader
              cannot tell a South African fund from a global one by its name,
              and the classification is the only place the page says so. */}
          <p className="text-xs leading-snug text-brand-secondary">
            {tiers ? (
              <>
                <span className="font-semibold text-brand-primary">{tiers.geography}</span>
                <span className="text-brand-secondary/50"> · </span>
                {tiers.assetClass}
                <span className="text-brand-secondary/50"> · </span>
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
        <p className="rounded-md border-l-2 border-brand-border bg-brand-bg px-3 py-2 text-[11px] leading-relaxed text-brand-secondary">
          {riskNote}
        </p>
      )}

      <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 text-xs sm:grid-cols-2">
        {cost ? (
          <Figure label={COST_LABEL} value={`${cost} ${COST_PER_YEAR}`} />
        ) : expense ? (
          <Figure label={COST_TER_LABEL} value={`${expense} ${COST_PER_YEAR}`} />
        ) : null}

        {/* Stated on a browse card even when the sheet is silent, because four
            cards side by side are a comparison and a dropped row makes a
            silent document look like a shorter answer. A matched card keeps
            the height for the reason sentence instead. */}
        {minTerm ? (
          <Figure label={MIN_TERM_LABEL} value={minTerm} />
        ) : variant === "catalogue" ? (
          <Figure label={MIN_TERM_LABEL} value={NOT_STATED} muted />
        ) : null}

        {variant === "catalogue" && size && <Figure label={FUND_SIZE_LABEL} value={size} />}
        {variant === "catalogue" && fund.distribution_frequency && (
          <Figure label={DISTRIBUTIONS_LABEL} value={fund.distribution_frequency} />
        )}
      </dl>

      {variant === "matched" && reason && (
        <div className="rounded-md bg-brand-bg/70 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-brand-muted-fg">
            {WHY_APPEARS_LABEL}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-brand-secondary">{reason}</p>
        </div>
      )}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-brand-border/40 pt-3">
        {asAt ? (
          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-brand-secondary/70">
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
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-brand-primary hover:underline"
          >
            {linksToDocument ? FACT_SHEET_ACTION : FACT_SHEET_PAGE_ACTION}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </footer>
    </article>
  );
}

/** One published figure, label over value.
 *
 *  `muted` is for a figure the sheet does not state. It stays in the grid and
 *  says so, which is a different claim from a blank cell: the document is
 *  silent, the fund is not missing something. */
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
      <dt className="text-[11px] text-brand-muted-fg">{label}</dt>
      <dd
        className={`text-[13px] font-bold tabular-nums ${
          muted ? "text-brand-secondary/60" : "text-brand-primary"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
