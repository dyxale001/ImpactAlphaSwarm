import { Link } from "react-router-dom";
import { Pin, TrendingUp } from "lucide-react";
import type { WidgetProps } from "../../../dashboard/layoutSchema";
import { useWatchlist } from "../../../dashboard/DashboardDataContext";
import type { SortOption } from "../../../hooks/useWatchlistData";
import WatchedAssetCard from "../../watchlist/WatchedAssetCard";
import WatchlistSearch from "../../watchlist/WatchlistSearch";
import TopPickRow from "../../watchlist/TopPickRow";
import { WidgetEmpty, WidgetLoading } from "./widgetChrome";

// Widgets over the user's watchlist. All read the one shared feed from
// DashboardDataContext, which is also what lets the pin prompt in widgetChrome
// offer watched tickers as its choices.

const SORT_LABELS: Record<SortOption, string> = {
  added: "Recently added",
  ticker: "Ticker A to Z",
  universe: "Sector",
};

/**
 * The user's tracked assets.
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
  pinnedTicker,
  setPinnedTicker,
}: WidgetProps) {
  // watchedAssets, not the hook's own displayedAssets: that list is sorted and
  // filtered by the watchlist PAGE's controls, and the widget applies its own
  // saved ones below so the two stay independent.
  const { watchedAssets, loading, removing, removeFromWatchlist, sectors } =
    useWatchlist();

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

  if (loading) return <WidgetLoading rows={3} />;
  if (watchedAssets.length === 0) {
    return (
      <WidgetEmpty
        message="Nothing tracked yet. Anything you add to your watchlist is included in your next analysis run."
        action={
          <Link
            to="/watchlist"
            className="text-xs font-semibold text-brand-primary hover:underline"
          >
            Add your first asset
          </Link>
        }
      />
    );
  }

  const columns =
    size === "wide"
      ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
      : size === "medium"
        ? "grid-cols-1 md:grid-cols-2"
        : "grid-cols-1";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {sectors.length > 2
          ? sectors.map((sector) => (
              <button
                key={sector}
                type="button"
                onClick={() => updateSettings({ sector })}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  sectorFilter === sector
                    ? "border-brand-primary/50 bg-brand-primary/10 text-brand-primary"
                    : "border-brand-border/40 text-brand-muted-fg hover:text-brand-fg"
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
          className="ml-auto rounded-full border border-brand-border/40 bg-transparent px-2.5 py-1 text-[11px] text-brand-muted-fg transition-colors hover:text-brand-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
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
          {sorted.map((asset) => (
            <div key={asset.id} className="relative">
              <WatchedAssetCard
                asset={asset}
                onRemove={removeFromWatchlist}
                isRemoving={removing.has(asset.id)}
              />
              {/* Pinning from here is the shortest path there is: the assets a
                  reader wants their sentiment and whale widgets pointed at are
                  almost always ones they already track. */}
              <button
                type="button"
                onClick={() =>
                  setPinnedTicker(
                    pinnedTicker === asset.ticker ? null : asset.ticker,
                  )
                }
                title={
                  pinnedTicker === asset.ticker
                    ? `Unpin ${asset.ticker}`
                    : `Pin ${asset.ticker} to this dashboard`
                }
                aria-pressed={pinnedTicker === asset.ticker}
                className={`absolute left-3 top-3 rounded-full p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${
                  pinnedTicker === asset.ticker
                    ? "bg-brand-primary text-brand-bg"
                    : "text-brand-muted-fg hover:bg-brand-primary/10 hover:text-brand-primary"
                }`}
              >
                <Pin className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Add anything to the watchlist without leaving the dashboard. */
export function WatchlistSearchWidget() {
  const {
    search,
    setSearch,
    searchResults,
    searchLoading,
    addToWatchlist,
  } = useWatchlist();

  return (
    <div className="space-y-2">
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
  );
}

/** The ranked names from the latest run, as rows rather than cards. */
export function WatchlistTopPicksWidget() {
  const { topPicks, loading } = useWatchlist();

  if (loading) return <WidgetLoading rows={3} />;
  if (topPicks.length === 0) {
    return (
      <WidgetEmpty message="No completed run to draw picks from yet." />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-brand-primary" />
        <span className="chip bg-brand-primary/10 text-brand-primary">
          Top {topPicks.length}
        </span>
      </div>
      {topPicks.map((pick, i) => (
        <TopPickRow key={pick.asset_id} pick={pick} index={i} />
      ))}
    </div>
  );
}
