/**
 * WatchlistPage — general asset library.
 *
 * Users search for any asset, add it to track, and see live market data
 * (price, 14-day chart). No AI analysis runs here — that stays on the dashboard.
 * Assets added to the watchlist are automatically included in the next dashboard
 * analysis run via the watchlist seed parameter.
 */
import { useState } from 'react'
import { Eye, RefreshCw, ChevronDown, ArrowUpDown } from 'lucide-react'
import { useWatchlistData, type SortOption } from '../hooks/useWatchlistData'
import WatchlistSearch from '../components/watchlist/WatchlistSearch'
import WatchedAssetCard from '../components/watchlist/WatchedAssetCard'
import WatchlistBrowser from '../components/watchlist/WatchlistBrowser'

const SECTOR_DOT: Record<string, string> = {
  'Technology':    'bg-blue-400',
  'Green Energy':  'bg-green-400',
  'Finance':       'bg-amber-400',
  'AI & Robotics': 'bg-purple-400',
  'Healthcare':    'bg-pink-400',
}

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
  } = useWatchlistData()

  const [showSortMenu, setShowSortMenu] = useState(false)

  const sortLabels: Record<SortOption, string> = {
    added:    'Recently added',
    ticker:   'Ticker A–Z',
    universe: 'Sector',
  }

  // WatchlistBrowser needs these for its add/remove callbacks
  const watchedAssetIds = watchedAssets.map(a => a.asset_id).filter(Boolean) as string[]
  const watchlistIdByAssetId = Object.fromEntries(watchedAssets.map(a => [a.asset_id, a.id]))

  return (
    <div className="space-y-6 max-w-7xl mx-auto pt-10 px-8 pb-10">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-primary mb-1">
            Asset Library
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-brand-fg">Watchlist</h1>
          <p className="text-brand-muted-fg text-sm mt-1">
            Track any asset. Assets you add are included in your next dashboard analysis.
          </p>
        </div>
        <button onClick={refreshWatchlist} title="Refresh"
          className="p-2 rounded-full border border-brand-border text-brand-muted-fg hover:text-brand-fg transition-colors mt-1">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Stats */}
      {!loading && watchedAssets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <div className="chip bg-brand-border/30 text-brand-muted-fg">
            <Eye className="w-3 h-3" /> {watchedAssets.length} tracked
          </div>
        </div>
      )}

      {/* Search */}
      <WatchlistSearch
        search={search}
        setSearch={setSearch}
        searchResults={searchResults}
        searchLoading={searchLoading}
        onAdd={addToWatchlist}
      />

      {/* Browse by sector */}
      <WatchlistBrowser
        watchedAssetIds={watchedAssetIds}
        onAdd={(asset) => {
          addToWatchlist({
            ticker:        asset.ticker,
            name:          asset.name,
            current_price: 0,
            universe:      asset.universe,
            asset_id:      asset.id,
            source:        'db',
          })
        }}
        onRemove={removeFromWatchlist}
        watchlistIdByAssetId={watchlistIdByAssetId}
      />

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-semantic-danger/10 border border-semantic-danger/20 text-semantic-danger text-sm">
          {error}
        </div>
      )}

      {/* Sort + filter — only show if there are assets */}
      {!loading && watchedAssets.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Sector tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {sectors.map(sector => (
              <button key={sector} onClick={() => setSectorFilter(sector)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  sectorFilter === sector
                    ? 'border-brand-primary/50 bg-brand-primary/10 text-brand-primary'
                    : 'border-brand-border/40 text-brand-muted-fg hover:border-brand-border/70 hover:text-brand-fg'
                }`}>
                {sector !== 'All' && SECTOR_DOT[sector] && (
                  <span className={`w-1.5 h-1.5 rounded-full ${SECTOR_DOT[sector]}`} />
                )}
                {sector}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="relative">
            <button onClick={() => setShowSortMenu(m => !m)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-brand-border/40 text-xs text-brand-muted-fg hover:text-brand-fg transition-colors">
              <ArrowUpDown className="w-3 h-3" />
              {sortLabels[sortBy]}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-brand-bg border border-brand-border rounded-xl shadow-xl z-10 overflow-hidden">
                {(Object.keys(sortLabels) as SortOption[]).map(opt => (
                  <button key={opt} onClick={() => { setSortBy(opt); setShowSortMenu(false) }}
                    className={`w-full text-left px-4 py-2.5 text-xs transition-colors hover:bg-brand-border/20 ${
                      sortBy === opt ? 'text-brand-primary font-semibold' : 'text-brand-fg'
                    }`}>
                    {sortLabels[opt]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(n => (
            <div key={n} className="soft-card border-l-4 border-l-brand-border/30 p-4 space-y-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-border/30 shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3 bg-brand-border/30 rounded w-1/4" />
                  <div className="h-2.5 bg-brand-border/20 rounded w-1/2" />
                </div>
              </div>
              <div className="h-12 bg-brand-border/20 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && watchedAssets.length === 0 && !error && (
        <div className="glass-card p-12 text-center flex flex-col items-center gap-3">
          <Eye className="w-8 h-8 text-brand-muted-fg" />
          <p className="text-sm font-medium text-brand-fg">Your watchlist is empty</p>
          <p className="text-xs text-brand-muted-fg">Search any ticker or company above to start tracking it.</p>
        </div>
      )}

      {/* No filter results */}
      {!loading && displayedAssets.length === 0 && watchedAssets.length > 0 && (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-brand-muted-fg">No assets in <span className="text-brand-fg font-semibold">{sectorFilter}</span>.</p>
          <button onClick={() => setSectorFilter('All')} className="text-xs text-brand-primary mt-2 hover:underline">
            Show all
          </button>
        </div>
      )}

      {/* Asset grid — 3 columns since cards are simpler now */}
      {!loading && displayedAssets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedAssets.map(asset => (
            <WatchedAssetCard
              key={asset.id}
              asset={asset}
              onRemove={removeFromWatchlist}
              isRemoving={removing.has(asset.id)}
            />
          ))}
        </div>
      )}

      {/* Explain the dashboard relationship */}
      {!loading && watchedAssets.length > 0 && (
        <p className="text-xs text-brand-muted-fg text-center pt-2">
          Assets in your watchlist are automatically included in your next dashboard analysis run.
        </p>
      )}
    </div>
  )
}