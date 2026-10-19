import { useId } from "react";
import { AlertTriangle, Check, RotateCcw, X } from "lucide-react";
import { FIELD_META, isChanged, isDecided, labelFor, type FieldState } from "../../../utils/fundUploads";
import { formatRandAmount } from "../../../utils/fundsCopy";
import {
  REVIEW_CHANGED_BADGE,
  REVIEW_CHECK_BADGE,
  REVIEW_CLEAR,
  REVIEW_CLEARED_BADGE,
  REVIEW_CONFIRM,
  REVIEW_CONFIRMED_BADGE,
  REVIEW_FROM_GRAPHIC,
  REVIEW_FROM_PAGE,
  REVIEW_READS_AS,
  REVIEW_REQUIRED,
  REVIEW_SERVER_FLAGGED,
  REVIEW_UNDO,
  VALUE_NO,
  VALUE_YES,
} from "../../../utils/fundUploadsCopy";

const inputClass =
  "h-10 w-full rounded-[12px] border border-forest-900/15 bg-white px-3 text-sm text-forest-900 transition-colors placeholder:text-forest-400 hover:border-forest-900/30 focus:border-forest-700 focus:outline-none disabled:bg-forest-50 disabled:text-forest-400";

/** A rand figure in words at its scale: "R27.9 billion", "R420 million". The
 *  fact sheet prints large sums this way, so a unit read wrongly (millions for
 *  billions) is plain beside the raw number the input holds. */
function readsAs(input: string): string | null {
  const digits = input.replace(/[\s, ]/g, "").replace(/^R/i, "");
  if (!/^\d+(\.\d+)?$/.test(digits)) return null;
  const value = Number(digits);
  if (!Number.isFinite(value) || value < 10_000) return null;
  if (value >= 1_000_000_000) return `R${Number((value / 1_000_000_000).toFixed(1))} billion`;
  if (value >= 1_000_000) return `R${Number((value / 1_000_000).toFixed(1))} million`;
  return formatRandAmount(value);
}

/**
 * One field on the review screen: its value as an input, the line it was read
 * from, and, for a flagged value, why it was flagged and the decisions.
 *
 * A flagged field is a two-column card: what to check on the left (the label,
 * the value and the decision buttons), the evidence on the right (the page, the
 * quoted line and the reason it was flagged), so the two are compared side by
 * side. Its status chip says "Check this" until it is decided, then which
 * decision was made, with a way back. `bare` drops the frame for a field that
 * sits in a shared card with others.
 */
export default function ReviewField({
  state,
  required = false,
  serverError,
  serverFlagged = false,
  categoriesListId,
  bare = false,
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
  bare?: boolean;
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
  const reads = meta?.kind === "rand" ? readsAs(state.input) : null;

  const status = !flagged
    ? null
    : !decided
      ? { label: REVIEW_CHECK_BADGE, tone: "chip-caution", icon: AlertTriangle }
      : cleared
        ? { label: REVIEW_CLEARED_BADGE, tone: "", icon: X }
        : { label: changed ? REVIEW_CHANGED_BADGE : REVIEW_CONFIRMED_BADGE, tone: "chip-up", icon: Check };

  const issues = [...(serverError ? [serverError] : []), ...(serverFlagged ? [REVIEW_SERVER_FLAGGED] : []), ...reasons];
  const warn = flagged || Boolean(serverError) || serverFlagged;
  const evidence = read.quote || issues.length > 0;

  const frame = bare
    ? ""
    : `rounded-[16px] border p-4 ${
        (flagged && !decided) || serverError ? "border-caution/40 bg-caution-bg/40" : "border-forest-900/10 bg-white"
      }`;

  return (
    <div className={`flex flex-col gap-3 ${frame}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-bold text-forest-900">
          {labelFor(state.field)}
          {required && <span className="chip">{REVIEW_REQUIRED}</span>}
        </label>
        {status && (
          <span className={`chip ${status.tone}`}>
            <status.icon className="h-3 w-3" aria-hidden />
            {status.label}
          </span>
        )}
      </div>

      <div className={`grid gap-3 ${!bare && evidence ? "md:grid-cols-2 md:gap-5" : ""}`}>
        <div className="flex flex-col gap-1.5">
          <FieldInput id={id} state={state} disabled={cleared} categoriesListId={categoriesListId} onInput={onInput} />
          {reads && (
            <p className="text-xs font-semibold text-forest-900" aria-live="polite">
              {REVIEW_READS_AS.replace("{value}", reads)}
            </p>
          )}
          {meta?.hint && <p className="text-xs text-brand-muted-fg">{meta.hint}</p>}
        </div>

        {evidence && (
          <div className="flex flex-col gap-2">
            {read.quote && (
              <figure className="m-0 flex flex-col gap-1">
                <figcaption className="text-xs font-semibold text-brand-muted-fg">
                  {read.page ? REVIEW_FROM_PAGE.replace("{page}", String(read.page)) : null}
                  {read.source === "graphic" ? ` · ${REVIEW_FROM_GRAPHIC}` : null}
                </figcaption>
                <blockquote className="m-0 border-l-2 border-lime-500 pl-3 text-sm leading-relaxed text-forest-900">
                  “{read.quote}”
                </blockquote>
              </figure>
            )}
            {issues.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {issues.map((reason) => (
                  <li
                    key={reason}
                    className={`flex items-start gap-1.5 text-xs leading-relaxed ${warn ? "text-caution" : "text-brand-muted-fg"}`}
                  >
                    {warn && <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />}
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {flagged && (
        <div className="flex flex-wrap items-center gap-2">
          {decided ? (
            <button type="button" onClick={onUndo} className="as-btn as-btn-sm as-btn-secondary">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {REVIEW_UNDO}
            </button>
          ) : (
            <>
              <button type="button" onClick={onConfirm} className="as-btn as-btn-sm as-btn-primary">
                <Check className="h-3.5 w-3.5" aria-hidden />
                {REVIEW_CONFIRM}
              </button>
              <button type="button" onClick={onClear} className="as-btn as-btn-sm as-btn-secondary">
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
  const common = { id, disabled, value: state.input };

  if (kind === "longtext") {
    return (
      <textarea
        {...common}
        rows={3}
        className={`${inputClass} h-auto py-2 leading-relaxed`}
        onChange={(e) => onInput(e.target.value)}
      />
    );
  }
  if (kind === "choice" || kind === "yesno") {
    const options: Array<[string, string]> =
      kind === "yesno" ? [["yes", VALUE_YES], ["no", VALUE_NO]] : (meta?.choices ?? []);
    const unknown = state.input && !options.some(([value]) => value === state.input);
    return (
      <select {...common} className="as-select w-full rounded-[12px]" onChange={(e) => onInput(e.target.value)}>
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
  const datePicker = kind === "date" && (state.input === "" || /^\d{4}-\d{2}-\d{2}$/.test(state.input));
  return (
    <input
      {...common}
      className={inputClass}
      type={datePicker ? "date" : "text"}
      inputMode={inputMode}
      list={state.field === "asisa_category" ? categoriesListId : undefined}
      onChange={(e) => onInput(e.target.value)}
    />
  );
}
