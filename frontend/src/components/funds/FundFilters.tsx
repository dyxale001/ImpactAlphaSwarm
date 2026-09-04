import {
  FILTER_ALL,
  FILTER_ASSET_CLASS,
  FILTER_GEOGRAPHY,
  FILTER_MANAGER,
  FILTER_SEARCH_PLACEHOLDER,
  FILTER_TFSA,
  FILTER_VEHICLE,
} from "../../utils/fundsCopy";
import type { CatalogueFilters, CatalogueMeta } from "../../services/api/fundCatalogue";

/**
 * Browse filters, built from the classification the API reports.
 *
 * Options come from `meta` rather than from a list in this file, so the page can
 * never offer a filter the catalogue cannot answer — a filter returning nothing
 * looks like a broken page rather than an empty category.
 */
export default function FundFilters({
  meta,
  filters,
  onChange,
}: {
  meta: CatalogueMeta | null;
  filters: CatalogueFilters;
  onChange: (next: CatalogueFilters) => void;
}) {
  const set = (patch: Partial<CatalogueFilters>) => onChange({ ...filters, ...patch });

  const geographies = meta ? Object.keys(meta.tree) : [];
  const assetClasses = meta
    ? Array.from(new Set(Object.values(meta.tree).flatMap((classes) => Object.keys(classes))))
    : [];

  const selectClass =
    "w-full sm:w-auto max-w-full rounded-md border border-brand-border/60 bg-brand-surface px-3 py-2 text-xs text-brand-primary";

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={filters.q ?? ""}
        onChange={(e) => set({ q: e.target.value || undefined })}
        placeholder={FILTER_SEARCH_PLACEHOLDER}
        aria-label={FILTER_SEARCH_PLACEHOLDER}
        className="w-full rounded-md border border-brand-border/60 bg-brand-surface px-3 py-2 text-sm text-brand-primary"
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="funds-vehicle">
          {FILTER_VEHICLE}
        </label>
        <select
          id="funds-vehicle"
          className={selectClass}
          value={filters.vehicle ?? ""}
          onChange={(e) => set({ vehicle: e.target.value || undefined })}
        >
          <option value="">{`${FILTER_VEHICLE}: ${FILTER_ALL}`}</option>
          {(meta?.vehicles ?? []).map((vehicle) => (
            <option key={vehicle.value} value={vehicle.value}>
              {vehicle.label}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="funds-geography">
          {FILTER_GEOGRAPHY}
        </label>
        <select
          id="funds-geography"
          className={selectClass}
          value={filters.geography ?? ""}
          onChange={(e) => set({ geography: e.target.value || undefined })}
        >
          <option value="">{`${FILTER_GEOGRAPHY}: ${FILTER_ALL}`}</option>
          {geographies.map((geography) => (
            <option key={geography} value={geography}>
              {geography}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="funds-asset-class">
          {FILTER_ASSET_CLASS}
        </label>
        <select
          id="funds-asset-class"
          className={selectClass}
          value={filters.asset_class ?? ""}
          onChange={(e) => set({ asset_class: e.target.value || undefined })}
        >
          <option value="">{`${FILTER_ASSET_CLASS}: ${FILTER_ALL}`}</option>
          {assetClasses.map((assetClass) => (
            <option key={assetClass} value={assetClass}>
              {assetClass}
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
              onChange={(e) => set({ manco: e.target.value || undefined })}
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

        <label className="flex items-center gap-2 text-xs text-brand-secondary">
          <input
            type="checkbox"
            checked={Boolean(filters.tfsa)}
            onChange={(e) => set({ tfsa: e.target.checked || undefined })}
            className="h-3.5 w-3.5 rounded border-brand-border/60"
          />
          {FILTER_TFSA}
        </label>
      </div>
    </div>
  );
}
