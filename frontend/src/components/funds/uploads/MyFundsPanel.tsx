import { useState } from "react";
import { AlertTriangle, CheckCircle2, FolderOpen, Lock } from "lucide-react";
import {
  UploadApiError,
  readFactSheet,
  type FactSheetReading,
  type SaveResponse,
} from "../../../services/api/fundUploads";
import { labelFor } from "../../../utils/fundUploads";
import {
  LIST_EMPTY_BODY,
  LIST_EMPTY_TITLE,
  LIST_FAILED_BODY,
  MY_FUNDS_LEAD,
  MY_FUNDS_PRIVATE_NOTE,
  MY_FUNDS_TITLE,
  READ_FAILED,
  SAVED_TITLE,
  SAVED_WITH_NOTES,
} from "../../../utils/fundUploadsCopy";
import FundsNotice from "../FundsNotice";
import FundsSkeleton from "../FundsSkeleton";
import FactSheetDropzone from "./FactSheetDropzone";
import UploadedFundCard from "./UploadedFundCard";
import UploadReview from "./UploadReview";
import type { useUploadedFunds } from "../../../hooks/useFundUploads";

/**
 * The "My funds" tab: upload a fact sheet, review it, and the list of what has
 * been kept.
 *
 * One sheet at a time. While a reading is under review it replaces the upload
 * zone, so there is never a second reading half-checked somewhere else on the
 * page. The Funds page keeps this panel mounted while another tab shows, so a
 * review survives a look at the catalogue.
 */
export default function MyFundsPanel({
  uploads,
  categories,
}: {
  uploads: ReturnType<typeof useUploadedFunds>;
  categories: string[];
}) {
  const [reading, setReading] = useState<FactSheetReading | null>(null);
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SaveResponse | null>(null);

  const read = async (file: File) => {
    setBusy(true);
    setReadError(null);
    setSaved(null);
    try {
      setReading(await readFactSheet(file, READ_FAILED));
    } catch (e) {
      setReadError(e instanceof UploadApiError ? e.message : READ_FAILED);
    } finally {
      setBusy(false);
    }
  };

  const onSaved = (result: SaveResponse) => {
    setReading(null);
    setSaved(result);
    uploads.reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-bold tracking-[-0.01em] text-forest-900">{MY_FUNDS_TITLE}</h2>
        <p className="text-xs leading-relaxed text-brand-muted-fg">{MY_FUNDS_LEAD}</p>
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-brand-muted-fg">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          {MY_FUNDS_PRIVATE_NOTE}
        </p>
      </div>

      {saved && (
        <div className="as-card flex flex-col gap-2 p-4" role="status">
          <p className="flex items-center gap-2 text-sm font-bold text-brand-primary">
            <CheckCircle2 className="h-4 w-4 text-lime-700" aria-hidden />
            {SAVED_TITLE}: {saved.fund.name}
          </p>
          {saved.warnings.length > 0 && (
            <>
              <p className="text-xs text-forest-600">{SAVED_WITH_NOTES}</p>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {saved.warnings.map((w) => (
                  <li key={`${w.field}-${w.message}`} className="flex items-start gap-1.5 text-xs text-warning-strong">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    <span>
                      <span className="font-bold">{labelFor(w.field)}:</span> {w.message}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {reading ? (
        <UploadReview
          // A new reading is a new review, never the old one's state.
          key={reading.review_token}
          reading={reading}
          categories={categories}
          onSaved={onSaved}
          onDiscard={() => setReading(null)}
        />
      ) : (
        <FactSheetDropzone onFile={read} busy={busy} error={readError} />
      )}

      <section className="flex flex-col gap-3">
        {uploads.isLoading && <FundsSkeleton count={2} />}
        {!uploads.isLoading && uploads.error && (
          <FundsNotice icon={AlertTriangle} tone="warning" title={uploads.error} body={LIST_FAILED_BODY} />
        )}
        {!uploads.isLoading && !uploads.error && uploads.funds.length === 0 && !reading && (
          <FundsNotice icon={FolderOpen} title={LIST_EMPTY_TITLE} body={LIST_EMPTY_BODY} />
        )}
        {uploads.funds.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {uploads.funds.map((fund) => (
              <UploadedFundCard key={fund.id} fund={fund} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
