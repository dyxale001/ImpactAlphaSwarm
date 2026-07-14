import { useState, useMemo } from 'react'
import { Eye, RefreshCw, Flame, Sparkles, TrendingUp, GitCompare,
         RotateCcw, ChevronDown, AlertTriangle, X, ArrowUpDown } from 'lucide-react'
import { useWatchlistData, type SortOption, type WatchlistAsset } from '../hooks/useWatchlistData'
import WatchlistSearch from '../components/watchlist/WatchlistSearch'
import WatchedAssetCard from '../components/watchlist/WatchedAssetCard'
import WatchlistBrowser from '../components/watchlist/WatchlistBrowser'

// ─── Sector colour dots for filter tabs ───────────────────────────────────
const SECTOR_DOT: Record<string, string> = {
  'Technology':    'bg-blue-400',
  'Green Energy':  'bg-green-400',
  'Finance':       'bg-amber-400',
  'AI & Robotics': 'bg-purple-400',
  'Healthcare':    'bg-pink-400',
}

// ─── Compare panel ─────────────────────────────────────────────────────────
function ComparePanel({ assets, onClear }: { assets: WatchlistAsset[]; onClear: () => void }) {
  if (assets.length < 2) return null

  const metrics: { key: keyof WatchlistAsset; label: string }[] = [
    { key: 'confidenceScore', label: 'Confidence' },
    { key: 'sentimentScore',  label: 'Sentiment' },
    { key: 'quantScore',      label: 'Quant' },
  ]

  function winner(key: keyof WatchlistAsset) {
    const vals = assets.map(a => Number(a[key]) || 0)
    const max = Math.max(...vals)
    return vals.map(v => v === max && max > 0)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom duration-300">
      <div className="bg-brand-bg/95 backdrop-blur-lg border-t border-brand-border shadow-2xl mx-auto max-w-7xl">
        <div className="px-8 py-4">
          {/* Panel header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-brand-primary" />
              <p className="text-sm font-semibold text-brand-fg">
                Comparing {assets.length} assets
              </p>
              <span className="text-xs text-brand-muted-fg">— select up to 3</span>
            </div>
            <button onClick={onClear}
              className="flex items-center gap-1.5 text-xs text-brand-muted-fg hover:text-brand-fg transition-colors">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          </div>

          {/* Comparison table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold pb-2 pr-8 w-28">Metric</th>
                  {assets.map(a => (
                    <th key={a.ticker} className="text-sm font-bold text-brand-fg pb-2 pr-8">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono">{a.ticker}</span>
                        {a.isHype && <Flame className="w-3 h-3 text-semantic-warning" />}
                      </div>
                      <p className="text-[10px] text-brand-muted-fg font-normal truncate max-w-[140px]">{a.name}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/30">
                {metrics.map(({ key, label }) => {
                  const wins = winner(key)
                  return (
                    <tr key={key}>
                      <td className="py-2 pr-8 text-[10px] uppercase tracking-wider text-brand-muted-fg font-semibold">{label}</td>
                      {assets.map((a, i) => {
                        const val = a[key]
                        const display = key === 'current_price'
                          ? (Number(val) > 0 ? `R ${Number(val).toFixed(2)}` : '—')
                          : (val !== undefined ? `${val}` : '—')
                        return (
                          <td key={a.ticker} className="py-2 pr-8">
                            <span className={`text-sm font-bold font-mono ${wins[i] ? 'text-brand-accent' : 'text-brand-fg'}`}>
                              {display}
                            </span>
                            {wins[i] && <span className="ml-1 text-[10px] text-brand-accent">↑</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {/* Hype row */}
                <tr>
                  <td className="py-2 pr-8 text-[10px] uppercase tracking-wider text-brand-muted-fg font-semibold">Hype</td>
                  {assets.map(a => (
                    <td key={a.ticker} className="py-2 pr-8">
                      {a.isHype
                        ? <span className="text-xs text-semantic-warning font-semibold flex items-center gap-1"><Flame className="w-3 h-3" /> Flagged</span>
                        : <span className="text-xs text-brand-accent font-semibold">Clean</span>}
                    </td>
                  ))}
                </tr>
                {/* Sector row */}
                <tr>
                  <td className="py-2 pr-8 text-[10px] uppercase tracking-wider text-brand-muted-fg font-semibold">Sector</td>
                  {assets.map(a => (
                    <td key={a.ticker} className="py-2 pr-8">
                      <span className="text-xs text-brand-muted-fg">{a.universe || '—'}</span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────
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
    compareSet,
    compareAssets,
    toggleCompare,
    clearCompare,
    sortBy,
    setSortBy,
    sectorFilter,
    setSectorFilter,
    sectors,
    reanalyse,
    reanalysing,
    daysSinceAnalysis,
    isStale,
    avgConfidence,
    hypeCount,
    assetsWithAICount,
  } = useWatchlistData()

  const [showSortMenu, setShowSortMenu] = useState(false)

  // Map asset_id → watchlist row id so browser can remove by row id
  const watchlistIdByAssetId = useMemo(
    () => Object.fromEntries(watchedAssets.map(a => [a.asset_id, a.id])),
    [watchedAssets]
  )
  const watchedAssetIds = useMemo(
    () => watchedAssets.map(a => a.asset_id),
    [watchedAssets]
  )

  const sortLabels: Record<SortOption, string> = {
    added:      'Recently added',
    confidence: 'Confidence',
    sentiment:  'Sentiment',
    quant:      'Quant score',
    ticker:     'Ticker A–Z',
  }

  return (
    <div className={`space-y-6 max-w-7xl mx-auto pt-10 px-8 pb-32`}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between" style={{ animation: 'slide-up 0.3s ease-out forwards' }}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-primary mb-1">Portfolio Tracker</p>
          <h1 className="text-3xl font-bold tracking-tight text-brand-fg">Watchlist</h1>
          <p className="text-brand-muted-fg text-sm mt-1">
            Track assets, compare signals, and monitor AI insights.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-1">
          <button onClick={refreshWatchlist} title="Refresh"
            className="p-2 rounded-full border border-brand-border text-brand-muted-fg hover:text-brand-fg transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          {watchedAssets.length > 0 && (
            <button
              onClick={reanalyse}
              disabled={reanalysing}
              title="Run fresh analysis including all watchlist assets"
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-brand-primary/10 border border-brand-primary/40 text-brand-primary text-xs font-semibold hover:bg-brand-primary/20 transition-colors disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${reanalysing ? 'animate-spin' : ''}`} />
              {reanalysing ? 'Analysing…' : 'Reanalyse'}
            </button>
          )}
        </div>
      </div>

      {/* ── Staleness banner ───────────────────────────────────────────── */}
      {isStale && !reanalysing && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-semantic-warning/8 border border-semantic-warning/25 animate-in fade-in duration-300">
          <AlertTriangle className="w-4 h-4 text-semantic-warning shrink-0" />
          <p className="text-xs text-semantic-warning font-medium">
            Analysis data is <span className="font-bold">{daysSinceAnalysis} days old</span>. Scores may not reflect current market conditions.
          </p>
          <button onClick={reanalyse}
            className="ml-auto text-xs font-bold text-semantic-warning hover:underline shrink-0">
            Reanalyse now
          </button>
        </div>
      )}

      {/* ── Stats chips ────────────────────────────────────────────────── */}
      {!loading && watchedAssets.length > 0 && (
        <div className="flex flex-wrap gap-2" style={{ animation: 'slide-up 0.35s ease-out forwards' }}>
          <div className="chip bg-brand-border/30 text-brand-muted-fg">
            <Eye className="w-3 h-3" /> {watchedAssets.length} tracked
          </div>
          {daysSinceAnalysis !== null && !isStale && (
            <div className="chip bg-brand-border/30 text-brand-muted-fg">
              Updated {daysSinceAnalysis === 0 ? 'today' : `${daysSinceAnalysis}d ago`}
            </div>
          )}
          {avgConfidence !== null && (
            <div className="chip bg-primary/15 text-primary">
              <TrendingUp className="w-3 h-3" /> Avg confidence {avgConfidence}
            </div>
          )}
          {assetsWithAICount > 0 && (
            <div className="chip bg-brand-accent/10 text-brand-accent">
              <Sparkles className="w-3 h-3" /> {assetsWithAICount} with AI data
            </div>
          )}
          {hypeCount > 0 && (
            <div className="chip bg-semantic-warning/15 text-semantic-warning">
              <Flame className="w-3 h-3" /> {hypeCount} hype {hypeCount === 1 ? 'flag' : 'flags'}
            </div>
          )}
          {compareSet.size > 0 && (
            <div className="chip bg-brand-primary/15 text-brand-primary">
              <GitCompare className="w-3 h-3" /> {compareSet.size} selected to compare
            </div>
          )}
        </div>
      )}

      {/* ── Search ─────────────────────────────────────────────────────── */}
      <WatchlistSearch search={search} setSearch={setSearch}
        searchResults={searchResults} searchLoading={searchLoading} onAdd={addToWatchlist} />

      {/* ── Browse by sector ───────────────────────────────────────────── */}
      <WatchlistBrowser
        watchedAssetIds={watchedAssetIds}
        onAdd={addToWatchlist}
        onRemove={removeFromWatchlist}
        watchlistIdByAssetId={watchlistIdByAssetId}
      />

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 rounded-lg bg-semantic-danger/10 border border-semantic-danger/20 text-semantic-danger text-sm">
          {error}
        </div>
      )}

      {/* ── Sector filter + sort ────────────────────────────────────────── */}
      {!loading && watchedAssets.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Sector filter pills */}
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

          {/* Sort dropdown */}
          <div className="relative">
            <button onClick={() => setShowSortMenu(m => !m)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-brand-border/40 text-xs text-brand-muted-fg hover:text-brand-fg transition-colors">
              <ArrowUpDown className="w-3 h-3" />
              {sortLabels[sortBy]}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-brand-bg border border-brand-border rounded-xl shadow-xl z-10 overflow-hidden">
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

      {/* ── Loading skeleton ───────────────────────────────────────────── */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="soft-card border-l-4 border-l-brand-border/30 p-5 space-y-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-border/30 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-brand-border/30 rounded w-1/3" />
                  <div className="h-2.5 bg-brand-border/20 rounded w-1/2" />
                </div>
              </div>
              <div className="h-8 bg-brand-border/20 rounded" />
              <div className="space-y-2">
                <div className="h-1.5 bg-brand-border/20 rounded w-full" />
                <div className="h-1.5 bg-brand-border/20 rounded w-4/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!loading && watchedAssets.length === 0 && !error && (
        <div className="glass-card p-12 text-center flex flex-col items-center gap-3">
          <Eye className="w-8 h-8 text-brand-muted-fg" />
          <p className="text-sm font-medium text-brand-fg">Your watchlist is empty</p>
          <p className="text-xs text-brand-muted-fg">Search for an asset above to start tracking it.</p>
        </div>
      )}

      {/* ── No results for filter ──────────────────────────────────────── */}
      {!loading && displayedAssets.length === 0 && watchedAssets.length > 0 && (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-brand-muted-fg">No assets in <span className="text-brand-fg font-semibold">{sectorFilter}</span>.</p>
          <button onClick={() => setSectorFilter('All')} className="text-xs text-brand-primary mt-2 hover:underline">
            Show all sectors
          </button>
        </div>
      )}

      {/* ── Compare hint ───────────────────────────────────────────────── */}
      {!loading && watchedAssets.length >= 2 && compareSet.size === 0 && (
        <p className="text-xs text-brand-muted-fg flex items-center gap-1.5">
          <GitCompare className="w-3 h-3" /> Tick the checkbox on cards to compare assets side by side.
        </p>
      )}

      {/* ── Asset grid ─────────────────────────────────────────────────── */}
      {!loading && displayedAssets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedAssets.map(asset => (
            <WatchedAssetCard
              key={asset.id}
              asset={asset}
              onRemove={removeFromWatchlist}
              isRemoving={removing.has(asset.id)}
              isComparing={compareSet.has(asset.ticker)}
              onToggleCompare={toggleCompare}
              compareDisabled={compareSet.size >= 3 && !compareSet.has(asset.ticker)}
            />
          ))}
        </div>
      )}

      {/* ── Compare panel ──────────────────────────────────────────────── */}
      <ComparePanel assets={compareAssets} onClear={clearCompare} />
    </div>
  )
}