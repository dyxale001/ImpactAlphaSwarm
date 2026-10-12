import { Link } from "react-router-dom";
import { ArrowRight, Upload } from "lucide-react";
import type { UploadedFundSummary } from "../../../services/api/fundUploads";
import { formatFieldValue } from "../../../utils/fundUploads";
import { COST_TER_LABEL, splitAsisaCategory } from "../../../utils/fundsCopy";
import { UPLOADED_AS_AT, UPLOADED_BADGE, UPLOADED_OPEN } from "../../../utils/fundUploadsCopy";
import RiskScale from "../RiskScale";
import StalenessChip from "../StalenessChip";

/** One of the reader's uploaded funds in their list. Built like a catalogue
 *  card, with a badge saying whose it is, so the two are never confused. */
export default function UploadedFundCard({ fund }: { fund: UploadedFundSummary }) {
  const sheet = fund.sheet;
  const figures = sheet?.figures ?? {};
  const tiers = fund.asisa_category ? splitAsisaCategory(fund.asisa_category) : null;
  const ter = formatFieldValue("ter", figures.ter);
  const level = typeof figures.risk_indicator_1to5 === "number" ? figures.risk_indicator_1to5 : null;
  const riskWords = typeof figures.risk_indicator_raw === "string" ? figures.risk_indicator_raw : null;
  const href = `/funds/mine/${fund.id}`;

  return (
    <article className="soft-card flex flex-col gap-4 p-5 transition-colors hover:border-brand-primary/30">
      <header className="flex flex-col gap-2">
        <span className="chip w-fit gap-1 bg-brand-bg text-forest-600">
          <Upload className="h-3 w-3" aria-hidden />
          {UPLOADED_BADGE}
        </span>
        <h3 className="text-base font-bold leading-snug tracking-[-0.01em] text-brand-primary">
          <Link to={href} className="underline-offset-[3px] hover:underline">
            {fund.name}
          </Link>
        </h3>
        {fund.fund_house && <p className="text-[13px] font-semibold text-forest-600">{fund.fund_house}</p>}
        {(tiers || fund.asisa_category) && (
          <p className="text-xs leading-snug text-forest-600">
            {tiers ? `${tiers.geography} · ${tiers.assetClass} · ${tiers.focus}` : fund.asisa_category}
          </p>
        )}
      </header>

      {(level !== null || riskWords) && (
        <RiskScale level={level} label={riskWords} note={level === null ? riskWords : null} compact />
      )}

      {ter && (
        <div className="flex items-baseline gap-2 border-t border-brand-border/40 pt-3.5">
          <span className="text-2xl font-extrabold leading-none tracking-[-0.02em] tabular-nums text-brand-primary">
            {ter}
          </span>
          <span className="text-xs text-forest-500">{COST_TER_LABEL}</span>
        </div>
      )}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-brand-border/40 pt-3">
        {sheet && (
          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-forest-500">
            {UPLOADED_AS_AT.replace("{date}", formatFieldValue("as_of", sheet.as_of))}
            <StalenessChip asOf={sheet.as_of} />
          </span>
        )}
        <Link to={href} className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-primary hover:underline">
          {UPLOADED_OPEN}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </footer>
    </article>
  );
}
