import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Info, Search, Trash2, Upload } from "lucide-react";
import FundsNotice from "../components/funds/FundsNotice";
import FundDetailSkeleton from "../components/funds/FundDetailSkeleton";
import FundMinimums, { hasMinimums } from "../components/funds/FundMinimums";
import FundSwings, { hasSwings } from "../components/funds/FundSwings";
import RiskScale from "../components/funds/RiskScale";
import StalenessChip from "../components/funds/StalenessChip";
import { useUploadedFund } from "../hooks/useFundUploads";
import {
  UploadApiError,
  deleteUploadedFund,
  type FieldValue,
  type UploadedFundDetail,
  type UploadedSheet,
} from "../services/api/fundUploads";
import { FIELD_META, FIELD_NAMES, GROUPS, describeSource, formatFieldValue, labelFor } from "../utils/fundUploads";
import { splitAsisaCategory } from "../utils/fundsCopy";
import {
  DELETE_FAILED,
  DETAIL_BACK,
  DETAIL_COLUMN_FIGURE,
  DETAIL_COLUMN_SOURCE,
  DETAIL_COLUMN_VALUE,
  DETAIL_DELETE,
  DETAIL_DELETE_CONFIRM,
  DETAIL_FIGURES_TITLE,
  DETAIL_HISTORY_TITLE,
  DETAIL_LOAD_FAILED,
  DETAIL_NOT_FOUND_BODY,
  DETAIL_NOT_FOUND_TITLE,
  DETAIL_NOTICE,
  DETAIL_SOURCES_LEAD,
  DETAIL_SOURCES_TITLE,
  DETAIL_WORDS_TITLE,
  UPLOADED_AS_AT,
  UPLOADED_BADGE,
} from "../utils/fundUploadsCopy";

const MY_FUNDS = "/funds?tab=mine";

/** Where an identity field's saved value lives: on the fund, not the sheet. */
const IDENTITY: Record<string, keyof UploadedFundDetail> = {
  fund_name: "name",
  isin: "isin",
  jse_code: "jse_code",
  asisa_category: "asisa_category",
};

/**
 * One of the reader's uploaded funds.
 *
 * Its own page rather than the catalogue's: the catalogue page explains why a
 * fund is listed and whether it matches, and neither question applies to a
 * fund the reader brought. What this page has instead is the record of how
 * every figure got here, which is what makes a figure read by AI something a
 * person can stand behind.
 */
export default function UploadedFundDetailPage() {
  const { uploadId } = useParams<{ uploadId: string }>();
  const { fund, isLoading, error, notFound } = useUploadedFund(uploadId);

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
        <FundsNotice icon={Search} title={DETAIL_NOT_FOUND_TITLE} body={DETAIL_NOT_FOUND_BODY} />
      </Shell>
    );
  }
  if (error || !fund) {
    return (
      <Shell>
        <BackLink />
        <FundsNotice icon={AlertTriangle} tone="warning" title={DETAIL_LOAD_FAILED} body={error ?? ""} />
      </Shell>
    );
  }
  return <Loaded fund={fund} />;
}

function Loaded({ fund }: { fund: UploadedFundDetail }) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const sheet = fund.sheets[0] ?? null;
  const f = sheet?.figures ?? {};
  const num = (key: string) => (typeof f[key] === "number" ? (f[key] as number) : null);
  const text = (key: string) => (typeof f[key] === "string" ? (f[key] as string) : null);
  const tiers = fund.asisa_category ? splitAsisaCategory(fund.asisa_category) : null;

  const remove = async () => {
    if (!window.confirm(DETAIL_DELETE_CONFIRM.replace("{name}", fund.name))) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteUploadedFund(fund.id, DELETE_FAILED);
      navigate(MY_FUNDS);
    } catch (e) {
      setDeleteError(e instanceof UploadApiError ? e.message : DELETE_FAILED);
      setDeleting(false);
    }
  };

  const costs = ["ter", "tc", "tic", "annual_management_fee", "fee_period"].filter((k) => f[k] !== undefined && f[k] !== null);
  const facts = ["fund_size_zar", "nav_cpu", "nav_date", "inception_date", "distribution_frequency", "recommended_min_term_years", "benchmark", "portfolio_manager", "regulation_28"].filter(
    (k) => f[k] !== undefined && f[k] !== null,
  );
  const words = (["objective", "risk_narrative", "horizon_words"] as const).filter((k) => text(k));

  return (
    <Shell>
      <BackLink />

      <header className="soft-card flex flex-col gap-3 p-5 sm:p-6">
        <span className="chip w-fit gap-1 bg-brand-bg text-forest-600">
          <Upload className="h-3 w-3" aria-hidden />
          {UPLOADED_BADGE}
        </span>
        <h1 className="text-2xl font-bold leading-tight tracking-[-0.01em] text-brand-primary">{fund.name}</h1>
        <div className="flex flex-col gap-0.5 text-[13px] text-forest-600">
          {fund.fund_house && <span className="font-semibold">{fund.fund_house}</span>}
          {(tiers || fund.asisa_category) && (
            <span>{tiers ? `${tiers.geography} · ${tiers.assetClass} · ${tiers.focus}` : fund.asisa_category}</span>
          )}
        </div>
        {sheet && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-forest-500">
            {UPLOADED_AS_AT.replace("{date}", formatFieldValue("as_of", sheet.as_of))}
            <StalenessChip asOf={sheet.as_of} />
          </p>
        )}
        {(num("risk_indicator_1to5") !== null || text("risk_indicator_raw")) && (
          <RiskScale
            level={num("risk_indicator_1to5")}
            label={text("risk_indicator_raw")}
            note={num("risk_indicator_1to5") === null ? text("risk_indicator_raw") : null}
          />
        )}
        <p className="flex items-start gap-2 rounded-lg bg-brand-bg px-3 py-2.5 text-xs leading-relaxed text-forest-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {DETAIL_NOTICE}
        </p>
      </header>

      {(costs.length > 0 || facts.length > 0) && (
        <Tile title={DETAIL_FIGURES_TITLE}>
          <dl className="m-0 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {[...costs, ...facts].map((key) => (
              <Row key={key} label={labelFor(key)} value={formatFieldValue(key, f[key])} />
            ))}
          </dl>
        </Tile>
      )}

      {(hasSwings(num("return_high_12m"), num("return_low_12m"), text("return_extremes_basis")) ||
        hasMinimums(num("min_lump_sum"), num("min_debit_order"))) && (
        <div className="flex flex-col gap-4 lg:flex-row">
          {hasSwings(num("return_high_12m"), num("return_low_12m"), text("return_extremes_basis")) && (
            <FundSwings
              high={num("return_high_12m")}
              low={num("return_low_12m")}
              basis={text("return_extremes_basis")}
              className="min-w-0 flex-1"
            />
          )}
          {hasMinimums(num("min_lump_sum"), num("min_debit_order")) && (
            <FundMinimums lumpSum={num("min_lump_sum")} debitOrder={num("min_debit_order")} className="min-w-0 flex-1" />
          )}
        </div>
      )}

      {words.length > 0 && (
        <Tile title={DETAIL_WORDS_TITLE}>
          <div className="flex flex-wrap gap-6">
            {words.map((key) => (
              <figure key={key} className="m-0 min-w-0 flex-1 basis-64">
                <figcaption className="text-xs font-bold text-forest-500">{labelFor(key)}</figcaption>
                <blockquote className="mt-2 max-w-[65ch] border-l-2 border-brand-accent pl-3.5 text-sm leading-relaxed text-forest-600">
                  {text(key)}
                </blockquote>
              </figure>
            ))}
          </div>
        </Tile>
      )}

      {sheet && <Sources fund={fund} sheet={sheet} />}

      <Tile title={DETAIL_HISTORY_TITLE}>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {fund.sheets.map((s) => (
            <li key={`${s.as_of}-${s.file_sha256}`} className="flex items-center gap-2 text-[13px] text-brand-primary">
              {formatFieldValue("as_of", s.as_of)}
              <StalenessChip asOf={s.as_of} />
            </li>
          ))}
        </ul>
      </Tile>

      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-warning/50 bg-brand-surface px-4 py-2 text-[13px] font-bold text-warning-strong transition-colors hover:bg-warning/10 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {DETAIL_DELETE}
        </button>
        {deleteError && (
          <p className="text-xs text-warning-strong" role="alert">
            {deleteError}
          </p>
        )}
      </div>
    </Shell>
  );
}

/** Every saved (or deliberately cleared) figure, grouped, with the line it
 *  came from and who set it. */
function Sources({ fund, sheet }: { fund: UploadedFundDetail; sheet: UploadedSheet }) {
  const value = (key: string): FieldValue => {
    if (key === "as_of") return sheet.as_of;
    if (IDENTITY[key]) return (fund[IDENTITY[key]] as FieldValue) ?? null;
    return sheet.figures[key] ?? null;
  };
  const rows = FIELD_NAMES.filter((key) => describeSource(key, sheet.provenance[key]));

  return (
    <Tile title={DETAIL_SOURCES_TITLE}>
      <p className="text-xs text-forest-500">{DETAIL_SOURCES_LEAD}</p>
      {GROUPS.map(([group, title]) => {
        const inGroup = rows.filter((key) => FIELD_META[key]?.group === group);
        if (inGroup.length === 0) return null;
        return (
          <div key={group} className="flex flex-col gap-1">
            <h3 className="text-xs font-bold uppercase tracking-[0.06em] text-forest-500">{title}</h3>
            <table className="w-full table-fixed border-collapse text-left text-xs">
              <thead className="sr-only">
                <tr>
                  <th>{DETAIL_COLUMN_FIGURE}</th>
                  <th>{DETAIL_COLUMN_VALUE}</th>
                  <th>{DETAIL_COLUMN_SOURCE}</th>
                </tr>
              </thead>
              <tbody>
                {inGroup.map((key) => {
                  const p = sheet.provenance[key];
                  const shown = formatFieldValue(key, value(key));
                  return (
                    <tr key={key} className="border-t border-brand-border/40 align-top">
                      <th scope="row" className="w-1/4 py-2 pr-3 font-semibold text-forest-500">
                        {labelFor(key)}
                      </th>
                      <td className="w-1/4 break-words py-2 pr-3 font-semibold text-brand-primary">
                        {shown.length > 80 ? `${shown.slice(0, 80)}…` : shown || "—"}
                      </td>
                      <td className="py-2 text-forest-600">
                        <span className={p?.by === "person" || p?.by === null ? "font-semibold text-brand-primary" : ""}>
                          {describeSource(key, p)}
                        </span>
                        {p?.quote && (
                          <span className="mt-0.5 block break-words text-[11px] text-forest-500">“{p.quote}”</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </Tile>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade-up mx-auto flex max-w-6xl flex-col gap-4 px-4 pb-20 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      {children}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to={MY_FUNDS}
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-forest-500 transition-colors hover:text-brand-primary"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {DETAIL_BACK}
    </Link>
  );
}

function Tile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="soft-card flex flex-col gap-3 p-5 sm:p-6">
      <h2 className="text-base font-bold text-brand-primary">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-brand-border/30 py-1">
      <dt className="text-[11px] text-forest-500">{label}</dt>
      <dd className="m-0 min-w-0 text-right text-xs font-semibold text-brand-primary">{value}</dd>
    </div>
  );
}
