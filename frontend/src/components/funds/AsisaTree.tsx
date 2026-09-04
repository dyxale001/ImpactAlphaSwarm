import { BROWSE_LEAD, BROWSE_TITLE } from "../../utils/fundsCopy";
import type { CatalogueFilters, CatalogueMeta } from "../../services/api/fundCatalogue";

/**
 * The classification, as a browsable tree.
 *
 * Shown because the categories are the mechanism, not a filing system: a match
 * is "these are the categories your answers map to, and these are the funds in
 * them whose own risk label fits". A reader who can see the whole tree can see
 * what they were not shown, and why, which is the difference between a filter
 * and a recommendation.
 *
 * Built from the API's own tree, so it can never offer a branch the catalogue
 * cannot answer.
 */
export default function AsisaTree({
  meta,
  filters,
  onSelect,
}: {
  meta: CatalogueMeta | null;
  filters: CatalogueFilters;
  onSelect: (next: CatalogueFilters) => void;
}) {
  if (!meta) return null;

  const selected = (geography: string, assetClass?: string) =>
    filters.geography === geography && (assetClass ? filters.asset_class === assetClass : !filters.asset_class);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-bold text-brand-primary">{BROWSE_TITLE}</h2>
        <p className="text-xs leading-relaxed text-brand-secondary">{BROWSE_LEAD}</p>
      </div>

      <div className="flex flex-col gap-3">
        {Object.entries(meta.tree).map(([geography, classes]) => (
          <div key={geography} className="soft-card p-4">
            <button
              type="button"
              onClick={() =>
                onSelect({
                  ...filters,
                  geography: filters.geography === geography ? undefined : geography,
                  asset_class: undefined,
                })
              }
              className={`text-left text-xs font-bold uppercase tracking-[0.08em] ${
                selected(geography) ? "text-brand-primary" : "text-brand-secondary/80"
              }`}
            >
              {geography}
            </button>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(classes).map(([assetClass, focuses]) => (
                <button
                  key={assetClass}
                  type="button"
                  title={focuses.join(" · ")}
                  onClick={() =>
                    onSelect({
                      ...filters,
                      geography,
                      asset_class: filters.asset_class === assetClass ? undefined : assetClass,
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    selected(geography, assetClass)
                      ? "border-brand-accent bg-brand-accent/15 font-semibold text-brand-primary"
                      : "border-brand-border/60 text-brand-secondary hover:bg-brand-bg"
                  }`}
                >
                  {assetClass}
                  <span className="ml-1 text-brand-secondary/60">{focuses.length}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
