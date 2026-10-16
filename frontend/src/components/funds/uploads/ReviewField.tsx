import { useId } from "react";
import { AlertTriangle, Check, RotateCcw, X } from "lucide-react";
import { FIELD_META, isChanged, isDecided, labelFor, type FieldState } from "../../../utils/fundUploads";
import {
  REVIEW_CHANGED_BADGE,
  REVIEW_CLEAR,
  REVIEW_CLEARED_BADGE,
  REVIEW_CONFIRM,
  REVIEW_CONFIRMED_BADGE,
  REVIEW_FROM_GRAPHIC,
  REVIEW_FROM_PAGE,
  REVIEW_REQUIRED,
  REVIEW_SERVER_FLAGGED,
  REVIEW_UNDO,
  VALUE_NO,
  VALUE_YES,
} from "../../../utils/fundUploadsCopy";

const inputClass =
  "min-h-10 w-full rounded-lg border border-brand-border/60 bg-brand-surface px-3 py-2 text-[13px] text-brand-primary transition-colors placeholder:text-forest-400 focus:border-brand-primary/50 focus:outline-none disabled:bg-brand-bg disabled:text-forest-400";

/**
 * One field on the review screen: its value as an input, the line it was read
 * from, and, for a flagged value, why it was flagged and the three decisions.
 *
 * A flagged field is framed in amber until it is decided, then shows which
 * decision was made with a way back. The quote sits directly under the input
 * so the person compares the two without looking elsewhere.
 */
export default function ReviewField({
  state,
  required = false,
  serverError,
  serverFlagged = false,
  categoriesListId,
  onInput,
  onConfirm,
  onClear,
  onUndo,
}: {
  state: FieldState;
  required?: boolean;
  serverError?: string;
  serverFlagged?: boolean;
  categoriesListId?: string;
  onInput: (value: string) => void;
  onConfirm: () => void;
  onClear: () => void;
  onUndo: () => void;
}) {
  const id = useId();
  const meta = FIELD_META[state.field];
  const flagged = state.status === "check";
  const decided = isDecided(state);
  const changed = isChanged(state);
  const cleared = state.decision === "cleared";
  const { read } = state;
  const reasons = state.status === "confirmed" ? [] : read.reasons;

  const badge = !flagged
    ? null
    : cleared
      ? REVIEW_CLEARED_BADGE
      : changed
        ? REVIEW_CHANGED_BADGE
        : state.decision === "confirmed"
          ? REVIEW_CONFIRMED_BADGE
          : null;

  const frame =
    flagged && !decided
      ? "border-warning/60 bg-warning/5"
      : serverError
        ? "border-warning/60"
        : "border-brand-border/50 bg-brand-surface";

  return (
    <div className={`flex flex-col gap-2.5 rounded-brand border p-4 ${frame}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-bold text-brand-primary">
          {labelFor(state.field)}
          {required && (
            <span className="ml-2 rounded-full bg-brand-bg px-2 py-px text-[10px] font-bold uppercase tracking-[0.06em] text-forest-500">
              {REVIEW_REQUIRED}
            </span>
          )}
        </label>
        {badge && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-accent/30 px-2 py-0.5 text-[11px] font-bold text-brand-fg">
            <Check className="h-3 w-3" aria-hidden />
            {badge}
          </span>
        )}
      </div>

      <FieldInput
        id={id}
        state={state}
        disabled={cleared}
        categoriesListId={categoriesListId}
        onInput={onInput}
      />
      {meta?.hint && <p className="text-[11px] text-forest-500">{meta.hint}</p>}

      {read.quote && (
        <figure className="m-0 flex flex-col gap-1">
          <figcaption className="text-[11px] font-semibold text-forest-500">
            {read.page ? REVIEW_FROM_PAGE.replace("{page}", String(read.page)) : null}
            {read.source === "graphic" ? ` · ${REVIEW_FROM_GRAPHIC}` : null}
          </figcaption>
          <blockquote className="m-0 border-l-2 border-brand-accent pl-3 text-xs leading-relaxed text-forest-600">
            “{read.quote}”
          </blockquote>
        </figure>
      )}

      {(reasons.length > 0 || serverFlagged || serverError) && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {[...(serverError ? [serverError] : []), ...(serverFlagged ? [REVIEW_SERVER_FLAGGED] : []), ...reasons].map(
            (reason) => (
              <li
                key={reason}
                className={`flex items-start gap-1.5 text-xs leading-relaxed ${
                  flagged || serverError || serverFlagged ? "text-warning-strong" : "text-forest-500"
                }`}
              >
                {(flagged || serverError || serverFlagged) && (
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                )}
                <span>{reason}</span>
              </li>
            ),
          )}
        </ul>
      )}

      {flagged && (
        <div className="flex flex-wrap items-center gap-2">
          {decided ? (
            <button type="button" onClick={onUndo} className={secondaryButton}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {REVIEW_UNDO}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onConfirm}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-primary px-3.5 py-1.5 text-xs font-bold text-brand-bg transition-colors hover:bg-brand-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                {REVIEW_CONFIRM}
              </button>
              <button type="button" onClick={onClear} className={secondaryButton}>
                <X className="h-3.5 w-3.5" aria-hidden />
                {REVIEW_CLEAR}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const secondaryButton =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-brand-border/60 bg-brand-surface px-3.5 py-1.5 text-xs font-bold text-brand-primary transition-colors hover:border-brand-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

/** The input for a field's kind: a date picker, a choice, a yes/no, a long
 *  passage or a line of text. Numbers stay text, so "1.15%" and "R5 000" can
 *  be typed the way the sheet prints them; the server reads them. */
function FieldInput({
  id,
  state,
  disabled,
  categoriesListId,
  onInput,
}: {
  id: string;
  state: FieldState;
  disabled: boolean;
  categoriesListId?: string;
  onInput: (value: string) => void;
}) {
  const meta = FIELD_META[state.field];
  const kind = meta?.kind ?? "text";
  const common = { id, disabled, value: state.input, className: inputClass };

  if (kind === "longtext") {
    return <textarea {...common} rows={3} onChange={(e) => onInput(e.target.value)} />;
  }
  if (kind === "choice" || kind === "yesno") {
    const options: Array<[string, string]> =
      kind === "yesno" ? [["yes", VALUE_YES], ["no", VALUE_NO]] : (meta?.choices ?? []);
    // A value the model read that is not one of the choices stays visible,
    // so the person sees what they are correcting.
    const unknown = state.input && !options.some(([value]) => value === state.input);
    return (
      <select {...common} onChange={(e) => onInput(e.target.value)}>
        <option value="">—</option>
        {unknown && <option value={state.input}>{state.input}</option>}
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    );
  }
  const inputMode =
    kind === "percent" || kind === "rand" || kind === "cents" || kind === "years" ? "decimal" : undefined;
  // A date picker shows a value it cannot parse as blank. A date the model read
  // but could not type ("August 2026") stays as text, so it is seen and fixed.
  const datePicker = kind === "date" && (state.input === "" || /^\d{4}-\d{2}-\d{2}$/.test(state.input));
  return (
    <input
      {...common}
      type={datePicker ? "date" : "text"}
      inputMode={inputMode}
      list={state.field === "asisa_category" ? categoriesListId : undefined}
      onChange={(e) => onInput(e.target.value)}
    />
  );
}
