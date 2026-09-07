import { Search } from "lucide-react";
import type { WidgetProps } from "../../../dashboard/layoutSchema";
import { useWatchlist } from "../../../dashboard/DashboardDataContext";
import type { SortOption } from "../../../hooks/useWatchlistData";
import WatchedAssetCard from "../../watchlist/WatchedAssetCard";
import WatchlistSearch from "../../watchlist/WatchlistSearch";
import { WidgetEmpty, WidgetLoading } from "./widgetChrome";

// The watchlist widget, over the one shared feed from DashboardDataContext.

const SORT_LABELS: Record<SortOption, string> = {
  added: "Recently added",
  ticker: "Ticker A to Z",
  universe: "Sector",
};

/**
 * The user's tracked assets, and the search that adds to them.
 *
 * These were two widgets, "Your watchlist" and a separate "Quick add" search.
 * Adding an asset and seeing the list you added it to are one task, and split
 * across two cards the search could sit anywhere on the page relative to the
 * list it feeds — or be missing from a dashboard whose owner placed only the
 * list, leaving them no way to add without going to the watchlist page.
 *
 * Sector and sort are widget settings rather than local state, so they survive a
 * reload the way the rest of the layout does. The page's own controls are
 * reproduced here in miniature rather than reused, because the page renders them
 * in a header bar this widget does not have.
 */
export function WatchlistWidget({
  size,
  settings,
  updateSettings,
}: WidgetProps) {
  // watchedAssets, not the hook's own displayedAssets: that list is sorted and
  // filtered by the watchlist PAGE's controls, and the widget applies its own
  // saved ones below so the two stay independent.
  const {
    watchedAssets,
    loading,
    removing,
    removeFromWatchlist,
    sectors,
    search,
    setSearch,
    searchResults,
    searchLoading,
    addToWatchlist,
  } = useWatchlist();

  const sortBy = (settings.sort as SortOption) ?? "added";
  const sectorFilter = (settings.sector as string) ?? "All";

  // The shared hook owns the sort and filter for the watchlist PAGE. Applying the
  // widget's own saved choices here keeps the two independent: changing the
  // dashboard's sort should not silently reorder the page as well.
  const filtered =
    sectorFilter === "All"
      ? watchedAssets
      : watchedAssets.filter((a) => a.universe === sectorFilter);

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "ticker") return a.ticker.localeCompare(b.ticker);
    if (sortBy === "universe")
      return (a.universe || "").localeCompare(b.universe || "");
    return (b.addedAt || "").localeCompare(a.addedAt || "");
  });

  const columns =
    size === "wide"
      ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
      : size === "medium"
        ? "grid-cols-1 md:grid-cols-2"
        : "grid-cols-1";

  return (
    <div className="space-y-3">
      {/* Above the list, and outside every empty and loading branch below: the
          way out of an empty watchlist is the same control as the way to grow
          a full one, so it is always the first thing in the widget. Panelled
          rather than loose so the search reads as its own act, and the list
          below as the result of it. */}
      <div className="space-y-2 rounded-2xl border border-brand-border/60 bg-brand-bg/55 p-3">
        <div className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-brand-primary" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-primary">
            Add to your watchlist
          </p>
        </div>
        <WatchlistSearch
          search={search}
          setSearch={setSearch}
          searchResults={searchResults}
          searchLoading={searchLoading}
          onAdd={addToWatchlist}
        />
        <p className="text-[11px] leading-relaxed text-brand-muted-fg">
          Anything you add is included in your next analysis run.
        </p>
      </div>

      {loading ? (
        <WidgetLoading rows={3} />
      ) : watchedAssets.length === 0 ? (
        <WidgetEmpty message="Nothing tracked yet. Search above to add your first asset." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* The count in the forest chip, so the widget states what it holds
                in the same voice as every other count on the dashboard. */}
            <span className="chip shrink-0">
              {sorted.length} tracked
            </span>

            {sectors.length > 2
              ? sectors.map((sector) => (
                  <button
                    key={sector}
                    type="button"
                    onClick={() => updateSettings({ sector })}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                      sectorFilter === sector
                        ? "border-brand-primary bg-brand-primary text-white"
                        : "border-brand-border/40 text-brand-muted-fg hover:border-brand-primary/40 hover:text-brand-fg"
                    }`}
                  >
                    {sector}
                  </button>
                ))
              : null}

            <select
              value={sortBy}
              onChange={(e) => updateSettings({ sort: e.target.value })}
              aria-label="Sort watched assets"
              className="ml-auto rounded-full border border-brand-primary/30 bg-brand-primary/5 px-2.5 py-1 text-[11px] font-semibold text-brand-primary transition-colors hover:border-brand-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
            >
              {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
                <option key={opt} value={opt}>
                  {SORT_LABELS[opt]}
                </option>
              ))}
            </select>
          </div>

          {sorted.length === 0 ? (
            <WidgetEmpty
              message={`Nothing tracked in ${sectorFilter}.`}
              action={
                <button
                  type="button"
                  onClick={() => updateSettings({ sector: "All" })}
                  className="text-xs font-semibold text-brand-primary hover:underline"
                >
                  Show all
                </button>
              }
            />
          ) : (
            <div className={`grid gap-4 ${columns}`}>
              {/* No "point the dashboard at this one" button any more: each
                  ticker-scoped widget now owns its own asset, so a card here
                  has no single target to set. Each of those widgets asks for
                  itself instead. */}
              {sorted.map((asset) => (
                <WatchedAssetCard
                  key={asset.id}
                  asset={asset}
                  onRemove={removeFromWatchlist}
                  isRemoving={removing.has(asset.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
