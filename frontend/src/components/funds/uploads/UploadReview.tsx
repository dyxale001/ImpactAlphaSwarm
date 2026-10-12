import { useId, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Pencil } from "lucide-react";
import {
  UploadApiError,
  saveUploadedFund,
  type FactSheetReading,
  type SaveResponse,
} from "../../../services/api/fundUploads";
import {
  GROUPS,
  REQUIRED_FIELDS,
  buildSaveValues,
  clearField,
  confirmField,
  formatFieldValue,
  initialReview,
  isChanged,
  labelFor,
  reviewProgress,
  reviewSections,
  setInput,
  undoField,
  FIELD_META,
  type FieldState,
  type ReviewState,
} from "../../../utils/fundUploads";
import {
  REVIEW_CACHED,
  REVIEW_CANCEL,
  REVIEW_CANCEL_CONFIRM,
  REVIEW_CONFIRMED_LEAD,
  REVIEW_CONFIRMED_TITLE,
  REVIEW_DONE,
  REVIEW_EDIT,
  REVIEW_EXISTING,
  REVIEW_EXTRAS_TITLE,
  REVIEW_EYEBROW,
  REVIEW_FLAGGED_LEAD,
  REVIEW_FLAGGED_TITLE,
  REVIEW_FROM_PAGE,
  REVIEW_FUND_HOUSE_HINT,
  REVIEW_FUND_HOUSE_LABEL,
  REVIEW_LEAD,
  REVIEW_MISSING_LEAD,
  REVIEW_MISSING_TITLE,
  REVIEW_SAVE,
  REVIEW_SAVING,
  REVIEW_VEHICLE_ETF,
  REVIEW_VEHICLE_LABEL,
  REVIEW_VEHICLE_UNIT_TRUST,
  REVIEW_VEHICLE_UNSET,
  SAVE_FAILED,
} from "../../../utils/fundUploadsCopy";
import ReviewField from "./ReviewField";

type Vehicle = "unit_trust" | "etf" | "";

/**
 * The review screen: every figure read from the sheet, flagged ones first,
 * and Save disabled until each flagged one has a decision.
 *
 * Three sections in the order the person needs them. What was flagged, with
 * why and the line it came from. What the sheet did not state, which they may
 * fill in. And what was read cleanly, folded away by group but one click from
 * editable, because "read cleanly" is the model's claim and the person may
 * know better.
 *
 * The footer stays on screen and says, in one line, what still stands between
 * the person and Save. If the server refuses anyway (its rules are the same,
 * but it is the one that counts), the fields it names are marked in place.
 */
export default function UploadReview({
  reading,
  categories,
  onSaved,
  onDiscard,
}: {
  reading: FactSheetReading;
  categories: string[];
  onSaved: (result: SaveResponse) => void;
  onDiscard: () => void;
}) {
  const [review, setReview] = useState<ReviewState>(() => initialReview(reading));
  const [vehicle, setVehicle] = useState<Vehicle>("");
  const [fundHouse, setFundHouse] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverPending, setServerPending] = useState<string[]>([]);
  const [showRead, setShowRead] = useState(false);
  const listId = useId();

  const progress = reviewProgress(review);
  const sections = useMemo(() => reviewSections(review), [review]);
  const name = review.fund_name?.input || reading.existing_fund?.name || "";

  const update = (next: ReviewState, field: string) => {
    setReview(next);
    // A field the person has just touched is no longer what the server
    // complained about.
    if (fieldErrors[field]) setFieldErrors(({ [field]: _gone, ...rest }) => rest);
    if (serverPending.includes(field)) setServerPending((p) => p.filter((f) => f !== field));
  };

  const handlers = (field: string) => ({
    onInput: (value: string) => update(setInput(review, field, value), field),
    onConfirm: () => update(confirmField(review, field), field),
    onClear: () => update(clearField(review, field), field),
    onUndo: () => update(undoField(review, field), field),
  });

  const save = async () => {
    if (!progress.canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { values, confirmed } = buildSaveValues(review);
      const result = await saveUploadedFund(
        {
          review_token: reading.review_token,
          values,
          confirmed,
          vehicle: vehicle || null,
          fund_house: fundHouse.trim() || null,
        },
        SAVE_FAILED,
      );
      onSaved(result);
    } catch (e) {
      if (e instanceof UploadApiError) {
        setError(e.message);
        setFieldErrors(e.fieldErrors);
        setServerPending(e.needsReview);
        // A field the server named may be folded away among the clean ones.
        if (Object.keys(e.fieldErrors).some((f) => review[f]?.status === "confirmed")) setShowRead(true);
      } else {
        setError(SAVE_FAILED);
      }
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (window.confirm(REVIEW_CANCEL_CONFIRM)) onDiscard();
  };

  const fieldProps = (state: FieldState) => ({
    state,
    required: REQUIRED_FIELDS.includes(state.field),
    serverError: fieldErrors[state.field],
    serverFlagged: serverPending.includes(state.field),
    categoriesListId: listId,
    ...handlers(state.field),
  });

  return (
    <section className="flex flex-col gap-5" aria-labelledby={`${listId}-title`}>
      <datalist id={listId}>
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <header className="soft-card flex flex-col gap-2 p-5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-lime-700">{REVIEW_EYEBROW}</span>
        <h3 id={`${listId}-title`} className="text-lg font-bold leading-snug text-brand-primary">
          {name || labelFor("fund_name")}
        </h3>
        <p className="max-w-[70ch] text-[13px] leading-relaxed text-forest-600">{REVIEW_LEAD}</p>
        {reading.existing_fund && (
          <p className="flex items-start gap-2 rounded-lg bg-brand-bg px-3 py-2 text-xs leading-relaxed text-forest-600">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {REVIEW_EXISTING.replace("{name}", reading.existing_fund.name ?? name)}
          </p>
        )}
        {reading.cached && <p className="text-[11px] text-forest-500">{REVIEW_CACHED}</p>}
      </header>

      {sections.flagged.length > 0 && (
        <Section title={REVIEW_FLAGGED_TITLE} lead={REVIEW_FLAGGED_LEAD} count={sections.flagged.length} tone="warning">
          {sections.flagged.map((state) => (
            <ReviewField key={state.field} {...fieldProps(state)} />
          ))}
        </Section>
      )}

      {sections.missing.length > 0 && (
        <Section title={REVIEW_MISSING_TITLE} lead={REVIEW_MISSING_LEAD} count={sections.missing.length}>
          {sections.missing.map((state) => (
            <ReviewField key={state.field} {...fieldProps(state)} />
          ))}
        </Section>
      )}

      {sections.confirmed.length > 0 && (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowRead((open) => !open)}
            aria-expanded={showRead}
            className="flex w-full items-center justify-between gap-3 rounded-brand border border-brand-border/50 bg-brand-surface px-4 py-3 text-left"
          >
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 text-[15px] font-bold text-brand-primary">
                <CheckCircle2 className="h-4 w-4 text-lime-700" aria-hidden />
                {REVIEW_CONFIRMED_TITLE}
                <span className="rounded-full bg-forest-50 px-2 py-px text-[11px] font-bold tabular-nums text-forest-500">
                  {sections.confirmed.length}
                </span>
              </span>
              <span className="text-xs text-forest-500">{REVIEW_CONFIRMED_LEAD}</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-forest-500 ${showRead ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {showRead &&
            GROUPS.map(([group, title]) => {
              const inGroup = sections.confirmed.filter((s) => FIELD_META[s.field]?.group === group);
              if (inGroup.length === 0) return null;
              return (
                <div key={group} className="flex flex-col gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-[0.06em] text-forest-500">{title}</h4>
                  {inGroup.map((state) => (
                    <ReadRow key={state.field} {...fieldProps(state)} />
                  ))}
                </div>
              );
            })}
        </section>
      )}

      <Section title={REVIEW_EXTRAS_TITLE}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[13px] font-bold text-brand-primary">
            {REVIEW_VEHICLE_LABEL}
            <select
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value as Vehicle)}
              className="min-h-10 rounded-lg border border-brand-border/60 bg-brand-surface px-3 py-2 text-[13px] font-normal text-brand-primary focus:border-brand-primary/50 focus:outline-none"
            >
              <option value="">{REVIEW_VEHICLE_UNSET}</option>
              <option value="unit_trust">{REVIEW_VEHICLE_UNIT_TRUST}</option>
              <option value="etf">{REVIEW_VEHICLE_ETF}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-bold text-brand-primary">
            {REVIEW_FUND_HOUSE_LABEL}
            <input
              value={fundHouse}
              maxLength={200}
              onChange={(e) => setFundHouse(e.target.value)}
              className="min-h-10 rounded-lg border border-brand-border/60 bg-brand-surface px-3 py-2 text-[13px] font-normal text-brand-primary focus:border-brand-primary/50 focus:outline-none"
            />
            <span className="text-[11px] font-normal text-forest-500">{REVIEW_FUND_HOUSE_HINT}</span>
          </label>
        </div>
      </Section>

      {/* Stays in view while the person works down the list, so the reason
          Save is disabled is never off screen. */}
      <footer className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-brand border border-brand-border/60 bg-brand-surface/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1" aria-live="polite">
          <p
            className={`flex items-center gap-1.5 text-[13px] font-semibold ${
              progress.canSave ? "text-lime-700" : "text-warning-strong"
            }`}
          >
            {progress.canSave ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            )}
            {progress.summary}
          </p>
          {error && (
            <p className="text-xs text-warning-strong" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={discard}
            disabled={saving}
            className="inline-flex min-h-10 items-center rounded-full border border-brand-border/60 bg-brand-surface px-4 py-2 text-[13px] font-bold text-brand-primary transition-colors hover:border-brand-primary/40 disabled:opacity-50"
          >
            {REVIEW_CANCEL}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!progress.canSave || saving}
            className="inline-flex min-h-10 items-center rounded-full bg-brand-accent px-4 py-2 text-[13px] font-bold text-brand-fg transition-transform duration-[120ms] hover:bg-lime-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-forest-50 disabled:text-forest-400 disabled:active:scale-100"
          >
            {saving ? REVIEW_SAVING : REVIEW_SAVE}
          </button>
        </div>
      </footer>
    </section>
  );
}

function Section({
  title,
  lead,
  count,
  tone = "neutral",
  children,
}: {
  title: string;
  lead?: string;
  count?: number;
  tone?: "neutral" | "warning";
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h4 className="flex items-center gap-2 text-[15px] font-bold text-brand-primary">
          {tone === "warning" && <AlertTriangle className="h-4 w-4 text-warning-strong" aria-hidden />}
          {title}
          {count !== undefined && (
            <span
              className={`rounded-full px-2 py-px text-[11px] font-bold tabular-nums ${
                tone === "warning" ? "bg-warning/15 text-warning-strong" : "bg-forest-50 text-forest-500"
              }`}
            >
              {count}
            </span>
          )}
        </h4>
        {lead && <p className="text-xs text-forest-500">{lead}</p>}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** A cleanly read field: the value and its line, with an Edit that turns it
 *  into the full field. Opens by itself if the server objected to it. */
function ReadRow(props: React.ComponentProps<typeof ReviewField>) {
  const [editing, setEditing] = useState(false);
  const { state, serverError } = props;
  if (editing || serverError) {
    return (
      <div className="flex flex-col gap-1.5">
        <ReviewField {...props} />
        {!serverError && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="self-end text-xs font-bold text-brand-primary hover:underline"
          >
            {REVIEW_DONE}
          </button>
        )}
      </div>
    );
  }
  // As read, formatted the way the fund page prints it; or the person's own
  // text once they have changed it.
  const shown = isChanged(state) ? state.input.trim() : formatFieldValue(state.field, state.original);
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-brand-border/40 bg-brand-surface px-3.5 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[11px] text-forest-500">{labelFor(state.field)}</span>
        <span className="break-words text-[13px] font-semibold text-brand-primary">
          {shown || "—"}
        </span>
        {state.read.quote && (
          <span className="text-[11px] leading-relaxed text-forest-500">
            {state.read.page ? `${REVIEW_FROM_PAGE.replace("{page}", String(state.read.page))} · ` : ""}“
            {state.read.quote}”
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-brand-primary hover:underline"
      >
        <Pencil className="h-3 w-3" aria-hidden />
        {REVIEW_EDIT}
      </button>
    </div>
  );
}
