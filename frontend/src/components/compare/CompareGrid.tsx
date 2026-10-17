import { createContext, useContext, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { seriesFor } from "./compareSeries";

// The comparison table, shared by the stock and fund sides so both read the same
// way: a label column, then one column per pick in the order picked.
//
// On a phone the columns become rows. Each measure is its own card with every
// pick's value inside it, so nothing scrolls sideways (the portrait-iPhone rule
// every user page follows since PR #59) and a value is never read without its
// label beside it.
//
// On a wide screen the header row stays pinned while the table scrolls under it:
// with a note under every row the table runs long, and by the RSI rows the reader
// would otherwise lose which column is which stock. The card clips with
// overflow: clip rather than hidden, because hidden makes the card a scroll
// container and the header would pin to the card, which never scrolls.

export interface CompareColumn {
  id: string;
  /** The ticker or fund code, shown in mono like the rest of the app. */
  title: string;
  subtitle?: string | null;
  href?: string;
}

const Columns = createContext<CompareColumn[]>([]);

// The measure, a column per pick, then a narrow column for the row's tag
// ("Same", "Differs most"), so the tags line up rather than trail the labels.
function gridStyle(n: number) {
  return { gridTemplateColumns: `minmax(8rem, 12rem) repeat(${n}, minmax(0, 1fr)) 7rem` };
}

/** The line a column is drawn with on the chart, as a small key. */
export function Swatch({ index }: { index: number }) {
  const s = seriesFor(index);
  return (
    <span
      className="inline-flex h-4 w-6 shrink-0 items-center justify-center rounded bg-brand-primary"
      aria-hidden="true"
    >
      <svg width="16" height="4">
        <line
          x1="1"
          y1="2"
          x2="15"
          y2="2"
          stroke={s.stroke}
          strokeWidth="2.5"
          strokeDasharray={s.dash}
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function CompareGrid({
  columns,
  children,
  className = "",
}: {
  columns: CompareColumn[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <Columns.Provider value={columns}>
      <div className={`as-card overflow-clip ${className}`}>
        {/* Header: wide screens only, pinned below the phone/tablet top bar (h-14),
            which is gone from lg up. On a phone each card names its picks. */}
        <div
          className="hidden sm:grid sticky top-14 lg:top-0 z-10 gap-x-4 items-end px-4 py-3 bg-white border-b border-forest-900/8"
          style={gridStyle(columns.length)}
        >
          <span className="text-xs font-semibold text-brand-muted-fg">Measure</span>
          {columns.map((c, i) => (
            <div key={c.id} className="min-w-0">
              <div className="flex items-center gap-2">
                <Swatch index={i} />
                {c.href ? (
                  <Link
                    to={c.href}
                    className="text-base font-bold text-forest-900 hover:underline truncate"
                  >
                    {c.title}
                  </Link>
                ) : (
                  <span className="text-base font-bold text-forest-900 truncate">{c.title}</span>
                )}
              </div>
              {c.subtitle && (
                <p className="text-xs text-brand-muted-fg truncate mt-0.5">{c.subtitle}</p>
              )}
            </div>
          ))}
          <span aria-hidden="true" />
        </div>
        <div className="divide-y divide-forest-900/8">{children}</div>
      </div>
    </Columns.Provider>
  );
}

export function CompareSection({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2 bg-forest-50">
      <h3 className="text-xs font-bold text-forest-700">{title}</h3>
      {aside && <span className="text-xs text-brand-muted-fg">{aside}</span>}
    </div>
  );
}

/** Tags a row can carry beside its label. Lime for the one row that differs most,
 *  a quiet outline for rows that are alike; neither says which side is preferable. */
export function RowTag({ kind, children }: { kind: "differs" | "alike"; children: ReactNode }) {
  return kind === "differs" ? (
    <span className="chip chip-accent shrink-0">{children}</span>
  ) : (
    <span className="chip chip-line shrink-0">{children}</span>
  );
}

export function CompareRow({
  label,
  tag,
  values,
  note,
  emphasis = false,
}: {
  label: string;
  tag?: ReactNode;
  values: ReactNode[];
  /** One line saying what the row means. Said once, under the values. */
  note?: ReactNode;
  /** The row that differs most: a lime edge, so it is found at a glance. */
  emphasis?: boolean;
}) {
  const columns = useContext(Columns);
  return (
    <div
      className={`px-4 py-3 ${emphasis ? "shadow-[inset_3px_0_0_var(--color-lime-600)]" : ""}`}
    >
      {/* Wide: label, then a value under each column. */}
      <div className="hidden sm:grid gap-x-4 items-start" style={gridStyle(columns.length)}>
        <div className="text-sm font-semibold text-forest-900 pt-0.5">{label}</div>
        {values.map((v, i) => (
          <div key={columns[i]?.id ?? i} className="min-w-0 text-sm font-semibold text-forest-900 tabular-nums">
            {v}
          </div>
        ))}
        <div className="flex justify-end">{tag}</div>
        {note && (
          <p
            className="mt-2 max-w-3xl text-xs leading-relaxed text-brand-muted-fg"
            style={{ gridColumn: `2 / span ${columns.length}` }}
          >
            {note}
          </p>
        )}
      </div>

      {/* Phone: one card per measure, each value beside its pick. */}
      <div className="sm:hidden space-y-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-brand-muted-fg">
          <span>{label}</span>
          {tag}
        </div>
        <dl className="space-y-1.5">
          {values.map((v, i) => (
            <div key={columns[i]?.id ?? i} className="flex items-start justify-between gap-3">
              <dt className="flex items-center gap-2 text-xs font-bold text-forest-900 shrink-0">
                <Swatch index={i} />
                {columns[i]?.title}
              </dt>
              <dd className="min-w-0 text-right text-sm font-semibold text-forest-900 tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        {note && <p className="text-xs leading-relaxed text-brand-muted-fg">{note}</p>}
      </div>
    </div>
  );
}

/** A value with a quiet line under it: "−9.8%" over "14 Jun 2026". */
export function Value({ main, sub }: { main: ReactNode; sub?: ReactNode }) {
  return (
    <span className="flex flex-col">
      <span>{main}</span>
      {sub && <span className="text-xs font-normal text-brand-muted-fg">{sub}</span>}
    </span>
  );
}

export function Missing({ children = "—" }: { children?: ReactNode }) {
  return <span className="font-normal text-brand-muted-fg">{children}</span>;
}
