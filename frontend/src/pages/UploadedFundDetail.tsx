import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Info, Search, Trash2, Upload } from "lucide-react";
import FundsNotice from "../components/funds/FundsNotice";
import FundDetailSkeleton from "../components/funds/FundDetailSkeleton";
import FundTracePanel from "../components/funds/FundTracePanel";
import { useUploadedFund } from "../hooks/useFundUploads";
import {
  UploadApiError,
  deleteUploadedFund,
  explainUploadedFundTrace,
  type FieldValue,
  type UploadedFundDetail,
  type UploadedSheet,
} from "../services/api/fundUploads";
import { COMPARE_ENABLED } from "../utils/compareFlags";
import { compareHref } from "../utils/compareUrl";
import {
  FIELD_META,
  FIELD_NAMES,
  GROUPS,
  asCatalogueDetail,
  describeSource,
  formatFieldValue,
  labelFor,
  uploadCompareId,
} from "../utils/fundUploads";
import {
  DELETE_FAILED,
  DETAIL_BACK,
  DETAIL_COLUMN_FIGURE,
  DETAIL_COLUMN_SOURCE,
  DETAIL_COLUMN_VALUE,
  DETAIL_DELETE,
  DETAIL_DELETE_CONFIRM,
  DETAIL_LOAD_FAILED,
  DETAIL_NOTICE,
  DETAIL_NOT_FOUND_BODY,
  DETAIL_NOT_FOUND_TITLE,
  DETAIL_NOT_MATCHED,
  DETAIL_PROVENANCE_TITLE,
  DETAIL_PROVENANCE_UPLOADED,
  DETAIL_SOURCES_LEAD,
  DETAIL_SOURCES_TITLE,
  UPLOADED_BADGE,
} from "../utils/fundUploadsCopy";
import { BackLink, FundDetailView, Shell } from "./FundDetail";

const MY_FUNDS = "/funds?tab=mine";
const BACK = { to: MY_FUNDS, label: DETAIL_BACK };

/** Where an identity field's saved value lives: on the fund, not the sheet. */
const IDENTITY: Record<string, keyof UploadedFundDetail> = {
  fund_name: "name",
  isin: "isin",
  jse_code: "jse_code",
  asisa_category: "asisa_category",
};

/**
 * One of the reader's uploaded funds, on the same page as a catalogue fund.
 *
 * It renders the catalogue's own FundDetailView, so the hero, key facts, the
 * reasoning trace and the Overview / Figures / Document tabs are the same
 * page. Four things differ, each passed in rather than branched on there:
 * a badge saying whose fund this is; the trace, written by the upload
 * endpoint, which says plainly that an uploaded fund is never matched; the
 * Document tab's provenance, which is the record of how every figure got here
 * (read from page N, confirmed, corrected or typed) in place of the
 * catalogue's hand-transcription note; and a way to remove it.
 *
 * "Compare with…" opens Compare with this fund already picked, to set beside
 * funds in the catalogue.
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
        <BackLink {...BACK} />
        <FundsNotice icon={Search} title={DETAIL_NOT_FOUND_TITLE} body={DETAIL_NOT_FOUND_BODY} />
      </Shell>
    );
  }
  if (error || !fund) {
    return (
      <Shell>
        <BackLink {...BACK} />
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
  const shaped = useMemo(() => asCatalogueDetail(fund), [fund]);
  const sheet = fund.sheets[0] ?? null;

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

  return (
    <FundDetailView
      fund={shaped}
      prices={null}
      back={BACK}
      badge={
        <span className="chip gap-1 bg-brand-accent text-brand-fg">
          <Upload className="h-3 w-3" aria-hidden />
          {UPLOADED_BADGE}
        </span>
      }
      compareTo={COMPARE_ENABLED ? compareHref("funds", [uploadCompareId(fund.id)]) : null}
      trace={
        <>
          <p className="flex items-start gap-2 rounded-brand border border-brand-border/50 bg-brand-surface px-4 py-3 text-xs leading-relaxed text-forest-600">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {DETAIL_NOTICE} {DETAIL_NOT_MATCHED}
            </span>
          </p>
          {sheet && <FundTracePanel fundId={fund.id} write={explainUploadedFundTrace} />}
        </>
      }
      provenance={sheet && <Sources fund={fund} sheet={sheet} />}
      after={
        <div className="flex flex-col items-start gap-2 pt-2">
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
      }
    />
  );
}

/** The Document tab's provenance for an uploaded fund: every saved (or
 *  deliberately cleared) figure, grouped, with the line it came from and who
 *  set it. Full width in the tab's grid, like the tile it replaces. */
function Sources({ fund, sheet }: { fund: UploadedFundDetail; sheet: UploadedSheet }) {
  const value = (key: string): FieldValue => {
    if (key === "as_of") return sheet.as_of;
    if (IDENTITY[key]) return (fund[IDENTITY[key]] as FieldValue) ?? null;
    return sheet.figures[key] ?? null;
  };
  const rows = FIELD_NAMES.filter((key) => describeSource(key, sheet.provenance[key]));

  return (
    <section className="as-card col-span-6 flex flex-col gap-3 p-5 sm:p-6">
      <h2 className="text-base font-bold text-brand-primary">{DETAIL_PROVENANCE_TITLE}</h2>
      <p className="text-xs leading-relaxed text-forest-600">{DETAIL_PROVENANCE_UPLOADED}</p>
      <h3 className="pt-1 text-sm font-bold text-brand-primary">{DETAIL_SOURCES_TITLE}</h3>
      <p className="text-xs text-forest-500">{DETAIL_SOURCES_LEAD}</p>
      {GROUPS.map(([group, title]) => {
        const inGroup = rows.filter((key) => FIELD_META[key]?.group === group);
        if (inGroup.length === 0) return null;
        return (
          <div key={group} className="flex flex-col gap-1">
            <h4 className="text-xs font-bold uppercase tracking-[0.06em] text-forest-500">{title}</h4>
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
    </section>
  );
}
