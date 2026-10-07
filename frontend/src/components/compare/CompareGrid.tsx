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

export interface CompareColumn {
  id: string;
  /** The ticker or fund code, shown in mono like the rest of the app. */
  title: string;
  subtitle?: string | null;
  href?: string;
}

const Columns = createContext<CompareColumn[]>([]);

function gridStyle(n: number) {
  return { gridTemplateColumns: `minmax(8rem, 12rem) repeat(${n}, minmax(0, 1fr))` };
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
      <div className={`soft-card overflow-hidden ${className}`}>
        {/* Header: wide screens only. On a phone each card names its picks. */}
        <div
          className="hidden sm:grid gap-x-4 items-end px-4 py-3 bg-brand-bg/60 border-b border-brand-border/50"
          style={gridStyle(columns.length)}
        >
          <span className="text-[10px] uppercase tracking-widest font-semibold text-brand-muted-fg">
            Measure
          </span>
          {columns.map((c, i) => (
            <div key={c.id} className="min-w-0">
              <div className="flex items-center gap-2">
                <Swatch index={i} />
                {c.href ? (
                  <Link
                    to={c.href}
                    className="font-mono text-base font-bold text-brand-fg hover:text-brand-primary truncate"
                  >
                    {c.title}
                  </Link>
                ) : (
                  <span className="font-mono text-base font-bold text-brand-fg truncate">{c.title}</span>
                )}
              </div>
              {c.subtitle && (
                <p className="text-[11px] text-brand-muted-fg truncate mt-0.5">{c.subtitle}</p>
              )}
            </div>
          ))}
        </div>
        <div className="divide-y divide-brand-border/40">{children}</div>
      </div>
    </Columns.Provider>
  );
}

export function CompareSection({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2 bg-brand-bg/40">
      <h3 className="text-[10px] uppercase tracking-widest font-semibold text-brand-primary">
        {title}
      </h3>
      {aside && <span className="text-[10px] text-brand-muted-fg">{aside}</span>}
    </div>
  );
}

/** Tags a row can carry beside its label. Lime for the one row that differs most,
 *  a quiet outline for rows that are alike; neither says which side is preferable. */
export function RowTag({ kind, children }: { kind: "differs" | "alike"; children: ReactNode }) {
  return kind === "differs" ? (
    <span className="chip shrink-0 bg-brand-accent text-brand-fg">{children}</span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-md border border-dashed border-brand-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-muted-fg">
      {children}
    </span>
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
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-brand-muted-fg pt-0.5">
          <span>{label}</span>
          {tag}
        </div>
        {values.map((v, i) => (
          <div key={columns[i]?.id ?? i} className="min-w-0 text-sm font-semibold text-brand-fg tabular-nums">
            {v}
          </div>
        ))}
        {note && (
          <p
            className="mt-2 max-w-3xl text-[11px] leading-relaxed text-brand-muted-fg"
            style={{ gridColumn: "2 / -1" }}
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
              <dt className="flex items-center gap-2 font-mono text-xs font-bold text-brand-fg shrink-0">
                <Swatch index={i} />
                {columns[i]?.title}
              </dt>
              <dd className="min-w-0 text-right text-sm font-semibold text-brand-fg tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        {note && <p className="text-[11px] leading-relaxed text-brand-muted-fg">{note}</p>}
      </div>
    </div>
  );
}

/** A value with a quiet line under it: "−9.8%" over "14 Jun 2026". */
export function Value({ main, sub }: { main: ReactNode; sub?: ReactNode }) {
  return (
    <span className="flex flex-col">
      <span>{main}</span>
      {sub && <span className="text-[11px] font-normal text-brand-muted-fg">{sub}</span>}
    </span>
  );
}

export function Missing({ children = "—" }: { children?: ReactNode }) {
  return <span className="font-normal text-brand-muted-fg">{children}</span>;
}
