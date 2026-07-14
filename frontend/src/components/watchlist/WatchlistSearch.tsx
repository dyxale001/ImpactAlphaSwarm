import { Search, Plus, Loader2 } from 'lucide-react'
import { type AssetSearchResult } from '../../hooks/useWatchlistData'

interface Props {
  search: string
  setSearch: (val: string) => void
  searchResults: AssetSearchResult[]
  searchLoading: boolean
  onAdd: (assetId: string) => void
}

export default function WatchlistSearch({
  search,
  setSearch,
  searchResults,
  searchLoading,
  onAdd,
}: Props) {
  return (
    <div className="glass-card p-4" style={{ animation: 'slide-up 0.3s ease-out forwards' }}>
      <div className="relative">
        {searchLoading
          ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg animate-spin" />
          : <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg" />
        }
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by ticker or company name…"
          className="w-full bg-brand-bg/40 border border-brand-border/50 rounded-full pl-10 pr-4 py-2.5 text-sm text-brand-fg focus:ring-2 focus:ring-brand-primary/40 focus:outline-none transition-all placeholder:text-brand-muted-fg/50"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-muted-fg hover:text-brand-fg text-xs transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {searchResults.length > 0 && (
        <div className="mt-3 space-y-1">
          {searchResults.map(asset => (
            <button
              key={asset.id}
              onClick={() => onAdd(asset.id)}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-brand-secondary/80 transition-colors text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-brand-secondary border border-brand-border flex items-center justify-center text-xs font-bold font-mono text-brand-fg">
                  {asset.ticker.slice(0, 4)}
                </div>
                <div>
                  <p className="text-sm font-medium text-brand-fg">{asset.name}</p>
                  <p className="text-xs text-brand-muted-fg">
                    {asset.ticker}
                    {asset.universe ? ` · ${asset.universe}` : ''}
                    {asset.current_price > 0 ? ` · R ${asset.current_price.toFixed(2)}` : ''}
                  </p>
                </div>
              </div>
              <Plus className="w-4 h-4 text-brand-muted-fg group-hover:text-brand-fg transition-colors" />
            </button>
          ))}
        </div>
      )}

      {search.length > 0 && !searchLoading && searchResults.length === 0 && (
        <p className="text-xs text-brand-muted-fg mt-3 px-1">No assets found matching "{search}".</p>
      )}
    </div>
  )
}