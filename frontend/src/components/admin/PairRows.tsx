export interface Pair {
  label: string;
  value: string;
}

/**
 * Free-form label/number rows, for the parts of a fact sheet that are a list.
 *
 * Four fields on a snapshot are lists rather than figures — what the fund holds,
 * its top holdings, what it has paid out, and its published returns — and every
 * one of them varies per manager: a property ETF breaks down by REIT type, a
 * balanced fund by asset class, a bond fund by maturity band. So the labels
 * cannot be a fixed set the way the fee fields are.
 *
 * Shared rather than copied because it was about to exist three times. The
 * add-fund form had none of these at all: adding a fund meant saving it,
 * reopening it and recording a SECOND fact sheet just to enter the allocation —
 * which lands a second snapshot row for the same document and defeats the
 * one-save flow the form was built for.
 *
 * `total` is passed in rather than computed here because only some of these
 * should add to 100. An allocation must account for the whole fund — a
 * breakdown summing to 60 reads as a fund holding 40% of nothing — while top
 * holdings are the largest ten of a longer list and a distribution history is
 * not a proportion of anything.
 */
export default function PairRows({
  title,
  note,
  rows,
  onChange,
  labelPlaceholder,
  valuePlaceholder,
  total,
}: {
  title: string;
  note: string;
  rows: Pair[];
  onChange: (rows: Pair[]) => void;
  labelPlaceholder: string;
  valuePlaceholder: string;
  /** Show a running total against 100. Omit where the rows are not a share. */
  total?: boolean;
}) {
  const sum = rows.reduce((carried, row) => carried + (Number(row.value) || 0), 0);
  const wholeFund = sum >= 95 && sum <= 105;

  return (
    <div className="space-y-2 border-t border-brand-border/40 pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold text-brand-primary">{title}</h3>
        {total && rows.length > 0 && (
          <span
            className={`text-[11px] font-semibold ${
              wholeFund ? "text-emerald-700" : "text-amber-700"
            }`}
          >
            {sum.toFixed(1)}% of 100
          </span>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-brand-secondary/70">{note}</p>

      {rows.map((row, index) => (
        <div key={index} className="flex gap-2">
          <input
            value={row.label}
            placeholder={labelPlaceholder}
            onChange={(e) => {
              const next = [...rows];
              next[index] = { ...row, label: e.target.value };
              onChange(next);
            }}
            className="flex-1 rounded-md border border-brand-border/60 px-2.5 py-1.5 text-xs text-brand-primary"
          />
          <input
            value={row.value}
            placeholder={valuePlaceholder}
            onChange={(e) => {
              const next = [...rows];
              next[index] = { ...row, value: e.target.value };
              onChange(next);
            }}
            className="w-24 rounded-md border border-brand-border/60 px-2.5 py-1.5 text-xs text-brand-primary"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            className="px-2 text-xs text-brand-secondary hover:text-brand-primary"
            aria-label="Remove this line"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...rows, { label: "", value: "" }])}
        className="text-[11px] font-semibold text-brand-primary hover:underline"
      >
        Add a line
      </button>
    </div>
  );
}

/** The filled rows as the API wants them, or undefined when there are none. */
export function asObject(rows: Pair[]): Record<string, number> | undefined {
  const filled = rows.filter((row) => row.label.trim() && row.value.trim());
  if (filled.length === 0) return undefined;
  return Object.fromEntries(filled.map((row) => [row.label.trim(), Number(row.value)]));
}
