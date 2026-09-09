import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import {
  FILTER_ALL,
  FILTER_CLEAR_ALL,
  FILTER_CLEAR_SEARCH,
  FILTER_MANAGER,
  FILTER_SEARCH_PLACEHOLDER,
  FILTER_TFSA,
  FILTER_VEHICLE,
} from "../../utils/fundsCopy";
import type { CatalogueFilters, CatalogueMeta } from "../../services/api/fundCatalogue";

/** Long enough that a word is typed before the grid moves, short enough that
 *  it does not feel like a page that ignores you. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * What the classification cannot say: a name, a fund type, a manager, a wrapper.
 *
 * The geography and asset-class selects that used to be here are gone. They
 * wrote the same two filters the navigator above writes, which meant two
 * controls could hold different ideas of one value, and this one offered asset
 * classes flattened across every geography — so "South African" plus a class
 * only global funds hold was an assemblable combination that could only ever
 * return nothing. One control per filter, and the nesting is the navigator's.
 *
 * Options come from `meta` rather than from a list in this file, so the page can
 * never offer a filter the catalogue cannot answer.
 *
 * The search commits on a timer. Undebounced, every keystroke replaced the grid
 * with a skeleton, so typing a fund name flashed six placeholder cards per
 * letter. The box holds its own text and reports the committed value, which is
 * why the parent is sent a patch and not a whole filter object: by the time the
 * timer fires the other filters may have moved, and a stale copy of them would
 * quietly undo whatever was clicked while the reader was still typing.
 */
export default function FundFilters({
  meta,
  filters,
  onPatch,
  onClearAll,
}: {
  meta: CatalogueMeta | null;
  filters: CatalogueFilters;
  onPatch: (patch: Partial<CatalogueFilters>) => void;
  onClearAll: () => void;
}) {
  const committed = filters.q ?? "";
  const [text, setText] = useState(committed);

  // Follows an external clear: "Clear all" resets every filter at once, and a
  // search box still holding the old term would then be lying about the grid.
  useEffect(() => {
    setText(committed);
  }, [committed]);

  useEffect(() => {
    if (text === committed) return;
    const timer = window.setTimeout(() => onPatch({ q: text || undefined }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // `onPatch` is deliberately not a dependency: it is rebuilt on every render
    // of the page, and depending on it would restart the timer continuously and
    // never fire.
  }, [text, committed]);

  const anyActive = Object.values(filters).some(
    (value) => value !== undefined && value !== "" && value !== false,
  );

  const selectClass =
    "max-w-full rounded-full border border-brand-border/60 bg-brand-surface px-3.5 py-2 text-xs font-semibold text-brand-secondary transition-colors hover:border-brand-border";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 basis-48">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted-fg" />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={FILTER_SEARCH_PLACEHOLDER}
          aria-label={FILTER_SEARCH_PLACEHOLDER}
          className="w-full rounded-full border border-brand-border/60 bg-brand-surface py-2 pl-9 pr-9 text-xs text-brand-primary transition-colors placeholder:text-brand-muted-fg focus:border-brand-primary/50 focus:outline-none"
        />
        {text && (
          <button
            type="button"
            aria-label={FILTER_CLEAR_SEARCH}
            onClick={() => setText("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted-fg transition-colors hover:text-brand-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <label className="sr-only" htmlFor="funds-vehicle">
        {FILTER_VEHICLE}
      </label>
      <select
        id="funds-vehicle"
        className={selectClass}
        value={filters.vehicle ?? ""}
        onChange={(e) => onPatch({ vehicle: e.target.value || undefined })}
      >
        <option value="">{`${FILTER_VEHICLE}: ${FILTER_ALL}`}</option>
        {(meta?.vehicles ?? []).map((vehicle) => (
          <option key={vehicle.value} value={vehicle.value}>
            {vehicle.label}
          </option>
        ))}
      </select>

      {(meta?.mancos?.length ?? 0) > 0 && (
        <>
          <label className="sr-only" htmlFor="funds-manco">
            {FILTER_MANAGER}
          </label>
          <select
            id="funds-manco"
            className={selectClass}
            value={filters.manco ?? ""}
            onChange={(e) => onPatch({ manco: e.target.value || undefined })}
          >
            <option value="">{`${FILTER_MANAGER}: ${FILTER_ALL}`}</option>
            {(meta?.mancos ?? []).map((manco) => (
              <option key={manco} value={manco}>
                {manco}
              </option>
            ))}
          </select>
        </>
      )}

      <label className="inline-flex items-center gap-2 text-xs font-semibold text-brand-secondary">
        <input
          type="checkbox"
          checked={Boolean(filters.tfsa)}
          onChange={(e) => onPatch({ tfsa: e.target.checked || undefined })}
          className="h-3.5 w-3.5 rounded border-brand-border/60 accent-brand-primary"
        />
        {FILTER_TFSA}
      </label>

      {/* Promised by the filtered-empty copy since that state was written, and
          absent until now: the only way out of a dead combination was to undo
          each control by hand. It clears the navigator's tiers too, which is
          what "all" has to mean or the button is lying. */}
      {anyActive && (
        <button
          type="button"
          onClick={onClearAll}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-bold text-brand-primary transition-colors hover:underline"
        >
          {FILTER_CLEAR_ALL}
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
