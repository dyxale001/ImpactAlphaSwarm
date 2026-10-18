import type { WidgetProps } from "../../../dashboard/layoutSchema";
import { useWatchlist } from "../../../dashboard/DashboardDataContext";
import type { SortOption } from "../../../hooks/useWatchlistData";
import WatchedAssetCard from "../../watchlist/WatchedAssetCard";
import WatchlistSearch from "../../watchlist/WatchlistSearch";
import { WidgetEmpty, WidgetHeaderLink, WidgetLoading } from "./widgetChrome";
import { SECTOR_COLOURS } from "../../../utils/sectorColours";

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
 * reload the way the rest of the layout does, which is why the page's toolbar is
 * reproduced here rather than reused.
 */
export function WatchlistWidget({
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

  return (
    <div className="@container space-y-3">
      <WidgetHeaderLink to="/watchlist">Open</WidgetHeaderLink>

      {/* The Watchlist page's toolbar in miniature: the search on top, outside
          every empty and loading branch below (the way out of an empty
          watchlist is the same control as the way to grow a full one), then the
          sort and the sector filters. */}
      <WatchlistSearch
        search={search}
        setSearch={setSearch}
        searchResults={searchResults}
        searchLoading={searchLoading}
        onAdd={addToWatchlist}
      />

      {loading ? (
        <WidgetLoading rows={3} />
      ) : watchedAssets.length === 0 ? (
        <WidgetEmpty message="Nothing tracked yet. Search above to add your first stock." />
      ) : (
        <>
          <div className="flex flex-col gap-2 @2xl:flex-row @2xl:items-center @2xl:justify-between">
            {sectors.length > 2 ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by sector">
                {sectors.map((sector) => (
                  <button
                    key={sector}
                    type="button"
                    onClick={() => updateSettings({ sector })}
                    aria-pressed={sectorFilter === sector}
                    className="as-fchip"
                  >
                    {sector !== "All" && SECTOR_COLOURS[sector] && (
                      <span className={`h-2 w-2 shrink-0 rounded-full ${SECTOR_COLOURS[sector].fill}`} aria-hidden="true" />
                    )}
                    {sector}
                    {sector === "All" && <span className="tabular-nums text-brand-muted-fg">{watchedAssets.length}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <span className="chip w-fit">{sorted.length} tracked</span>
            )}

            <div
              className="as-tabs as-tabs-sm grid grid-cols-3 rounded-[16px] @2xl:inline-flex @2xl:shrink-0 @2xl:rounded-full"
              role="group"
              aria-label="Sort watched stocks"
            >
              {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={sortBy === opt}
                  onClick={() => updateSettings({ sort: opt })}
                  className="as-tab"
                >
                  {SORT_LABELS[opt]}
                </button>
              ))}
            </div>
          </div>

          {sorted.length === 0 ? (
            <WidgetEmpty
              message={`Nothing tracked in ${sectorFilter}.`}
              action={
                <button
                  type="button"
                  onClick={() => updateSettings({ sector: "All" })}
                  className="as-btn as-btn-sm as-btn-secondary"
                >
                  Show all
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
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
