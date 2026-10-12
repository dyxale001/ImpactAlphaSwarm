import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Swatch } from "./CompareGrid";
import { MAX_COMPARE } from "../../utils/compareUrl";
import { PICK_FULL } from "../../data/compareCopy";

// The picks, as removable pills in the order chosen, with the search box for the
// next one beside them. Each pill carries its column's swatch, so the pill, the
// chart line and the table column are visibly the same thing.

export interface Pick {
  id: string;
  title: string;
  subtitle?: string | null;
}

export default function ComparePicks({
  picks,
  onRemove,
  search,
}: {
  picks: Pick[];
  onRemove: (id: string) => void;
  /** The search box for this kind. Hidden once three are picked. */
  search: ReactNode;
}) {
  const full = picks.length >= MAX_COMPARE;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {picks.length > 0 && (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Your picks">
          {picks.map((p, i) => (
            <li
              key={p.id}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-brand-border/60 bg-brand-card py-1 pl-1.5 pr-1 shadow-sm"
            >
              <Swatch index={i} />
              <span className="font-mono text-sm font-bold text-brand-fg">{p.title}</span>
              {p.subtitle && (
                <span className="hidden min-w-0 max-w-[12rem] truncate text-xs text-brand-muted-fg md:inline">
                  {p.subtitle}
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                aria-label={`Remove ${p.title}`}
                className="flex h-6 w-6 items-center justify-center rounded-full text-brand-muted-fg transition-colors hover:bg-brand-primary/10 hover:text-brand-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-accent"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {full ? (
        <p className="text-xs text-brand-muted-fg">{PICK_FULL}</p>
      ) : (
        <div className="w-full sm:w-72">{search}</div>
      )}
    </div>
  );
}
