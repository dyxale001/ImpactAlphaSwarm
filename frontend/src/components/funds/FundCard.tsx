import { ExternalLink } from "lucide-react";
import RiskScale from "./RiskScale";
import {
  AS_AT,
  COST_LABEL,
  COST_TER_LABEL,
  FACT_SHEET_ACTION,
  MIN_TERM_LABEL,
  TFSA_BADGE,
  TRACKER_BADGE,
  VEHICLE_LABEL,
  formatAsAt,
  formatFundSize,
  formatMinTerm,
  formatPercent,
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
 * `reason` is present only for a matched fund and is written by the backend, so
 * the sentence that has to survive the advice test is reviewed in one place.
 */
export default function FundCard({
  fund,
  reason,
}: {
  fund: CatalogueFund | (FundMatch & Partial<CatalogueFund>);
  reason?: string;
}) {
  const cost = formatPercent(fund.tic ?? null);
  const expense = formatPercent(fund.ter ?? null);
  const asAt = formatAsAt(fund.as_of ?? null);
  const minTerm = formatMinTerm(fund.recommended_min_term_years ?? null);
  const size = formatFundSize((fund as CatalogueFund).fund_size_zar ?? null);
  const factSheetUrl = (fund as CatalogueFund).mdd_page_url ?? null;

  return (
    <article className="soft-card flex flex-col gap-4 p-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-brand-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-secondary">
            {VEHICLE_LABEL[fund.vehicle] ?? fund.vehicle}
          </span>
          {fund.is_index_tracker && (
            <span className="rounded-full bg-brand-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-secondary">
              {TRACKER_BADGE}
            </span>
          )}
          {fund.tfsa_eligible && (
            <span className="rounded-full bg-brand-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-primary">
              {TFSA_BADGE}
            </span>
          )}
        </div>
        <h3 className="text-[15px] font-bold leading-snug text-brand-primary">{fund.name}</h3>
        {/* The management company, not just the brand: it is the party that
            issues the fact sheet, and for a co-named boutique fund the two are
            different companies. */}
        <p className="text-xs leading-relaxed text-brand-secondary/80">{fund.manco}</p>
        <p className="text-xs leading-relaxed text-brand-secondary">{fund.asisa_category}</p>
      </header>

      <RiskScale
        level={fund.risk_level ?? null}
        label={fund.risk_label ?? null}
        note={(fund as CatalogueFund).risk_note ?? null}
      />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        {cost ? (
          <div className="flex flex-col">
            <dt className="text-brand-secondary/70">{COST_LABEL}</dt>
            <dd className="font-semibold text-brand-primary">{cost} a year</dd>
          </div>
        ) : expense ? (
          <div className="flex flex-col">
            <dt className="text-brand-secondary/70">{COST_TER_LABEL}</dt>
            <dd className="font-semibold text-brand-primary">{expense} a year</dd>
          </div>
        ) : null}
        {minTerm && (
          <div className="flex flex-col">
            <dt className="text-brand-secondary/70">{MIN_TERM_LABEL}</dt>
            <dd className="font-semibold text-brand-primary">{minTerm}</dd>
          </div>
        )}
        {size && (
          <div className="flex flex-col">
            <dt className="text-brand-secondary/70">Fund size</dt>
            <dd className="font-semibold text-brand-primary">{size}</dd>
          </div>
        )}
        {fund.distribution_frequency && (
          <div className="flex flex-col">
            <dt className="text-brand-secondary/70">Distributions</dt>
            <dd className="font-semibold text-brand-primary">{fund.distribution_frequency}</dd>
          </div>
        )}
      </dl>

      {reason && (
        <p className="rounded-md bg-brand-bg/70 p-3 text-xs leading-relaxed text-brand-secondary">
          {reason}
        </p>
      )}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-brand-border/40 pt-3">
        {asAt ? (
          <span className="text-[11px] text-brand-secondary/70">
            {AS_AT} {asAt}
          </span>
        ) : (
          <span />
        )}
        {factSheetUrl && (
          <a
            href={factSheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-primary hover:underline"
          >
            {FACT_SHEET_ACTION}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </footer>
    </article>
  );
}
