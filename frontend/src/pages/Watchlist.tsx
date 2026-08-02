import { useState } from 'react'
import { Eye, RefreshCw, ArrowUpDown, TrendingUp } from 'lucide-react'
import { useWatchlistData, type SortOption, type TopPick } from '../hooks/useWatchlistData'
import { Link } from 'react-router-dom'
import WatchlistSearch from '../components/watchlist/WatchlistSearch'
import WatchedAssetCard from '../components/watchlist/WatchedAssetCard'
import RadarMotif from '../components/watchlist/RadarMotif'

const SECTOR_DOT: Record<string, string> = {
  'Technology':    'bg-blue-400',
  'Green Energy':  'bg-green-400',
  'Finance':       'bg-amber-400',
  'AI & Robotics': 'bg-purple-400',
  'Healthcare':    'bg-pink-400',
}

// ─── Top pick row — horizontal, spacious, readable ─────────────────────────
function TopPickRow({ pick, index }: { pick: TopPick; index: number }) {
  return (
    <div
      className="soft-card p-5 flex items-center gap-5 hover:border-brand-primary/30 transition-all"
      style={{ animation: `slide-up ${0.3 + index * 0.06}s ease-out forwards` }}
    >
      {/* Rank + ticker */}
      <div className="flex items-center gap-3 w-36 shrink-0">
        <div className="w-7 h-7 rounded-full bg-brand-primary/10 flex items-center justify-center text-[10px] font-bold text-brand-primary">
          {pick.rank}
        </div>
        <div>
          <p className="text-sm font-black font-mono text-brand-fg">{pick.ticker}</p>
          <p className="text-[10px] text-brand-muted-fg truncate max-w-[80px]">{pick.name}</p>
        </div>
      </div>

      {/* Reasoning */}
      <p className="flex-1 text-xs text-brand-muted-fg leading-relaxed line-clamp-2 hidden md:block">
        {pick.reasoning || 'No reasoning available.'}
      </p>

      {/* Scores
      <div className="flex items-center gap-6 shrink-0">
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-wider text-brand-muted-fg font-semibold">Confidence</p>
          <p className={`text-lg font-bold font-mono ${scoreColor(pick.confidenceScore)}`}>{pick.confidenceScore}</p>
        </div>
        <div className="text-center hidden sm:block">
          <p className="text-[9px] uppercase tracking-wider text-brand-muted-fg font-semibold">Sentiment</p>
          <p className={`text-sm font-bold font-mono ${scoreColor(pick.sentimentScore)}`}>{pick.sentimentScore}</p>
        </div>
        <div className="text-center hidden sm:block">
          <p className="text-[9px] uppercase tracking-wider text-brand-muted-fg font-semibold">Quant</p>
          <p className={`text-sm font-bold font-mono ${scoreColor(pick.quantScore)}`}>{pick.quantScore}</p>
        </div>
      </div> */}

      {/* Price + link */}
      <div className="text-right shrink-0">
        {pick.priceAtRun > 0 && (
          <p className="text-xs font-mono text-brand-muted-fg mb-1">R {pick.priceAtRun.toFixed(2)}</p>
        )}
        <Link to={`/asset/${pick.ticker}`}
          className="text-xs text-brand-primary hover:underline font-semibold">
          Analyse →
        </Link>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function WatchlistPage() {
  const {
    topPicks,
    allRanked,
    showAllRanked,
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



  return (
    <div className="max-w-6xl mx-auto pt-10 px-8 pb-16 space-y-10">

      {/* ── Header ──────────────────────────────────────────────────── */}
      {/* Header band. Forest ground with a radar sweep rippling from the
          bottom-right corner — the watchlist as a scanner, each blip a tracked
          contact. Content sits on a relative layer so it clears the SVG. */}
      <div className="hero-card overflow-hidden px-7 pt-8 pb-16">
        <RadarMotif className="h-full" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-accent mb-1">Asset Library</p>
            <h1 className="text-3xl font-bold text-brand-bg flex items-center gap-3">
              <Eye className="w-7 h-7 text-brand-accent" />
              Watchlist
            </h1>
            <p className="text-sm text-brand-bg/75 mt-2 max-w-2xl leading-relaxed">
              Track any asset. Watched assets are included in your next analysis run.
            </p>
          </div>
          <button onClick={refreshWatchlist} title="Refresh"
            className="p-2 rounded-full border border-white/20 text-brand-bg/75 hover:text-brand-bg hover:border-white/40 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Search + Browse ─────────────────────────────────────────── */}
      <div className="space-y-4">
        <WatchlistSearch
          search={search}
          setSearch={setSearch}
          searchResults={searchResults}
          searchLoading={searchLoading}
          onAdd={addToWatchlist}
        />

      </div>

      {/* ── Error ───────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 rounded-lg bg-semantic-danger/10 border border-semantic-danger/20 text-semantic-danger text-sm">
          {error}
        </div>
      )}

      {/* ── From Your Latest Analysis ────────────────────────────────── */}
      {topPicks.length > 0 && (
        <section style={{ animation: 'slide-up 0.35s ease-out forwards' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand-primary" />
              <h2 className="text-sm font-semibold text-brand-fg">From Your Latest Analysis</h2>
              <span className="chip bg-brand-primary/10 text-brand-primary text-[10px]">
                Top {topPicks.length}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {(showAllRanked ? allRanked : topPicks).map((pick, i) => (
              <TopPickRow key={pick.asset_id} pick={pick} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* ── Your Library ─────────────────────────────────────────────── */}
      {(watchedAssets.length > 0 || loading) && (
        <section>
          {/* Section header + controls */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-brand-border/40">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-brand-muted-fg" />
              <h2 className="text-sm font-semibold text-brand-fg">Your Library</h2>
              {watchedAssets.length > 0 && (
                <span className="chip bg-brand-border/30 text-brand-muted-fg text-[10px]">
                  {watchedAssets.length} tracked
                </span>
              )}
            </div>

            {/* Sector + sort controls */}
            {!loading && watchedAssets.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {sectors.length > 2 && sectors.map(sector => (
                  <button key={sector} onClick={() => setSectorFilter(sector)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                      sectorFilter === sector
                        ? 'border-brand-primary/50 bg-brand-primary/10 text-brand-primary'
                        : 'border-brand-border/40 text-brand-muted-fg hover:text-brand-fg'
                    }`}>
                    {sector !== 'All' && SECTOR_DOT[sector] && (
                      <span className={`w-1.5 h-1.5 rounded-full ${SECTOR_DOT[sector]}`} />
                    )}
                    {sector}
                  </button>
                ))}

                <div className="relative">
                  <button onClick={() => setShowSortMenu(m => !m)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-brand-border/40 text-[11px] text-brand-muted-fg hover:text-brand-fg transition-colors">
                    <ArrowUpDown className="w-3 h-3" />
                    {sortLabels[sortBy]}
                  </button>
                  {showSortMenu && (
                    <div className="absolute right-0 top-full mt-1 w-36 bg-brand-bg border border-brand-border rounded-xl shadow-xl z-10 overflow-hidden">
                      {(Object.keys(sortLabels) as SortOption[]).map(opt => (
                        <button key={opt} onClick={() => { setSortBy(opt); setShowSortMenu(false) }}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-brand-border/20 ${
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
          </div>

          {/* Loading skeleton */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(n => (
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

          {/* Empty */}
          {!loading && watchedAssets.length === 0 && (
            <div className="glass-card p-10 text-center flex flex-col items-center gap-2">
              <Eye className="w-7 h-7 text-brand-muted-fg" />
              <p className="text-sm font-medium text-brand-fg">No assets tracked yet</p>
              <p className="text-xs text-brand-muted-fg">Search or browse above to add assets to your library.</p>
            </div>
          )}

          {/* No filter results */}
          {!loading && displayedAssets.length === 0 && watchedAssets.length > 0 && (
            <div className="glass-card p-8 text-center">
              <p className="text-sm text-brand-muted-fg">
                No assets in <span className="text-brand-fg font-semibold">{sectorFilter}</span>.
              </p>
              <button onClick={() => setSectorFilter('All')} className="text-xs text-brand-primary mt-2 hover:underline">
                Show all
              </button>
            </div>
          )}

          {/* Asset grid */}
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
        </section>
      )}

    </div>
  )
}