import { useState, useEffect } from "react";
import {
  AlertTriangle,
  Eye,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { useWatchlistData, type SortOption } from "../hooks/useWatchlistData";
import WatchlistSearch from "../components/watchlist/WatchlistSearch";
import WatchedAssetCard from "../components/watchlist/WatchedAssetCard";
import WatchlistSkeleton from "../components/watchlist/WatchlistSkeleton";
import LearnPopover from "../components/learning/LearnPopover";
import { SECTOR_COLOURS } from "../utils/sectorColours";

const SORT_LABELS: Record<SortOption, string> = {
  added: "Recently added",
  ticker: "A to Z",
  universe: "Sector",
};

// ─── Page ──────────────────────────────────────────────────────────────────
export default function WatchlistPage() {
  const {
    watchedAssets,
    displayedAssets,
    loading,
    error,
    search,
    setSearch,
    searchResults,
    searchLoading,
    removing,
    addToWatchlist,
    removeFromWatchlist,
    refreshWatchlist,
    sortBy,
    setSortBy,
    sectorFilter,
    setSectorFilter,
    sectors,
  } = useWatchlistData();

  const [confirmation, setConfirmation] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmation) return;
    const timer = setTimeout(() => setConfirmation(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmation]);

  if (loading && watchedAssets.length === 0) {
    return <WatchlistSkeleton />;
  }

  const hasAssets = watchedAssets.length > 0;

  return (
    <div className="max-w-7xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-16 space-y-6 animate-fade-in-up">
      {/* ── Header ──
          The same title card as the other hub pages: no motif. Watchlist has no
          About dialog, so its lessons sit behind the book button, as on the stock
          and fund pages, beside the refresh. */}
      <div className="hero-card px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="band-eyebrow mb-2">Stock library</p>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-[-0.02em] text-brand-bg lg:text-3xl">
              <Eye className="h-7 w-7 shrink-0 text-brand-accent" />
              Watchlist
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-bg/75">
              Track any stock. Watched stocks are included in your next analysis run.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LearnPopover context="watchlist" onDark />
            <button
              type="button"
              onClick={refreshWatchlist}
              aria-label="Refresh prices"
              title="Refresh prices"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-white/5 text-brand-bg transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Toolbar ──
          One card, as Compare's picker: the search and the sort on top, the sector
          filters under them. */}
      <div className="as-card relative z-20 flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <WatchlistSearch
              search={search}
              setSearch={setSearch}
              searchResults={searchResults}
              searchLoading={searchLoading}
              onAdd={async (result) => {
                await addToWatchlist(result);
                setConfirmation(`${result.ticker} added to your watchlist.`);
              }}
            />
          </div>
          {hasAssets && (
            <div
              className="as-tabs as-tabs-sm grid grid-cols-3 rounded-[16px] md:inline-flex md:shrink-0 md:rounded-full"
              role="group"
              aria-label="Sort your watchlist"
            >
              {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={sortBy === opt}
                  onClick={() => setSortBy(opt)}
                  className="as-tab"
                >
                  {SORT_LABELS[opt]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sector filters, once there is more than one sector to choose between. */}
        {hasAssets && sectors.length > 2 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by sector">
            {sectors.map((sector) => (
              <button
                key={sector}
                type="button"
                onClick={() => setSectorFilter(sector)}
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
        )}
      </div>

      {/* ── Messages ── */}
      {error && (
        <div className="flex items-center gap-2 rounded-[12px] bg-down-bg px-4 py-3 text-sm text-down" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}
      {confirmation && (
        <div className="flex items-center gap-2 rounded-[12px] bg-up-bg px-4 py-3 text-sm font-semibold text-up" role="status">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {confirmation}
        </div>
      )}

      {/* ── Watchlist ── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <div key={n} className="as-card animate-pulse space-y-3 p-5">
              <div className="h-4 w-1/4 rounded bg-forest-50" />
              <div className="h-3 w-1/2 rounded bg-forest-50" />
              <div className="h-11 rounded bg-forest-50" />
            </div>
          ))}
        </div>
      ) : !hasAssets ? (
        <EmptyState
          title="No stocks tracked yet"
          body="Search above for any US stock to add it. Watched stocks are included in your next analysis run."
        />
      ) : displayedAssets.length === 0 ? (
        <EmptyState
          title={`No stocks in ${sectorFilter}`}
          body="Choose another sector, or show all."
          action={
            <button type="button" onClick={() => setSectorFilter("All")} className="as-btn as-btn-sm as-btn-secondary">
              Show all
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {displayedAssets.map((asset) => (
            <WatchedAssetCard
              key={asset.id}
              asset={asset}
              onRemove={async (id) => {
                await removeFromWatchlist(id);
                setConfirmation(`${asset.ticker} removed from your watchlist.`);
              }}
              isRemoving={removing.has(asset.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="as-card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-forest-50 text-forest-700" aria-hidden="true">
        <Eye className="h-5 w-5" />
      </span>
      <p className="text-base font-bold text-forest-900">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-brand-muted-fg">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
