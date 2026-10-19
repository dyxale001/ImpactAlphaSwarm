import { Link } from "react-router-dom";
import { Upload } from "lucide-react";
import type { UploadedFundSummary } from "../../../services/api/fundUploads";
import { formatFieldValue } from "../../../utils/fundUploads";
import {
  CARD_COST_LABEL,
  CARD_MIN_TERM_LABEL,
  CARD_SHEET_LABEL,
  CARD_TER_LABEL,
  COST_LABEL,
  COST_PER_YEAR,
  COST_TER_LABEL,
  FUND_SIZE_LABEL,
  MIN_TERM_LABEL,
  NOT_STATED,
  VEHICLE_LABEL,
  formatFundSize,
  formatMinTerm,
  formatPercent,
  splitAsisaCategory,
} from "../../../utils/fundsCopy";
import { UPLOADED_BADGE } from "../../../utils/fundUploadsCopy";
import RiskScale from "../RiskScale";
import StalenessChip from "../StalenessChip";

/** One of the reader's uploaded funds in their list, drawn exactly like a
 *  catalogue card (FundCard) so the two compare at a glance, with a badge saying
 *  whose it is so they are never confused. The whole card opens the fund. */
export default function UploadedFundCard({ fund }: { fund: UploadedFundSummary }) {
  const sheet = fund.sheet;
  const figures = sheet?.figures ?? {};
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const tiers = fund.asisa_category ? splitAsisaCategory(fund.asisa_category) : null;
  const category = tiers ? `${tiers.geography} · ${tiers.assetClass} · ${tiers.focus}` : fund.asisa_category;
  const tic = formatPercent(num(figures.tic));
  const ter = formatPercent(num(figures.ter));
  const size = formatFundSize(num(figures.fund_size_zar));
  const minTerm = formatMinTerm(num(figures.recommended_min_term_years));
  const level = num(figures.risk_indicator_1to5);
  const riskWords = typeof figures.risk_indicator_raw === "string" ? figures.risk_indicator_raw : null;
  const href = `/funds/mine/${fund.id}`;

  return (
    <article className="as-card group relative flex flex-col gap-4 p-5 transition-shadow hover:shadow-float focus-within:shadow-float">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="chip chip-line gap-1">
          <Upload className="h-3 w-3" aria-hidden />
          {UPLOADED_BADGE}
        </span>
        {fund.vehicle && <span className="chip">{VEHICLE_LABEL[fund.vehicle] ?? fund.vehicle}</span>}
      </div>

      <div>
        <h3 className="text-base font-bold leading-snug tracking-[-0.01em] text-forest-900">
          <Link
            to={href}
            className="after:absolute after:inset-0 after:rounded-[20px] after:content-[''] group-hover:underline underline-offset-[3px] focus-visible:outline-none"
          >
            {fund.name}
          </Link>
        </h3>
        {(fund.fund_house || category) && (
          <p className="mt-1 text-xs leading-snug text-brand-muted-fg">
            {[fund.fund_house, category].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {(level !== null || riskWords) && (
        <RiskScale
          level={level}
          label={level !== null ? `${level} of 5${riskWords ? ` · ${riskWords}` : ""}` : riskWords}
          note={level === null ? riskWords : null}
        />
      )}

      <dl className="grid grid-cols-[1.2fr_1fr_1fr] items-end gap-3 border-t border-forest-900/8 pt-4">
        <div className="flex flex-col-reverse" title={`${tic ? COST_LABEL : COST_TER_LABEL}, ${COST_PER_YEAR}`}>
          <dt className="text-xs text-brand-muted-fg">{tic ? CARD_COST_LABEL : CARD_TER_LABEL}</dt>
          <dd className={`text-xl font-bold leading-none tabular-nums tracking-[-0.01em] ${tic || ter ? "text-forest-900" : "text-sm text-forest-400"}`}>
            {tic ?? ter ?? NOT_STATED}
          </dd>
        </div>
        <div className="flex flex-col-reverse">
          <dt className="text-xs text-brand-muted-fg">{FUND_SIZE_LABEL}</dt>
          <dd className={`text-sm tabular-nums ${size ? "font-bold text-forest-900" : "font-semibold text-forest-400"}`}>{size ?? NOT_STATED}</dd>
        </div>
        <div className="flex flex-col-reverse" title={MIN_TERM_LABEL}>
          <dt className="text-xs text-brand-muted-fg">{CARD_MIN_TERM_LABEL}</dt>
          <dd className={`text-sm tabular-nums ${minTerm ? "font-bold text-forest-900" : "font-semibold text-forest-400"}`}>{minTerm ?? NOT_STATED}</dd>
        </div>
      </dl>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-forest-900/8 pt-3">
        {sheet ? (
          <span className="text-xs tabular-nums text-brand-muted-fg">
            {CARD_SHEET_LABEL} {formatFieldValue("as_of", sheet.as_of)}
          </span>
        ) : (
          <span />
        )}
        {sheet && <StalenessChip asOf={sheet.as_of} />}
      </footer>
    </article>
  );
}
