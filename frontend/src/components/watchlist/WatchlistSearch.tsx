import { Search, Plus, Loader2 } from 'lucide-react'
import { type AssetSearchResult } from '../../hooks/useWatchlistData'

interface Props {
  search: string
  setSearch: (val: string) => void
  searchResults: AssetSearchResult[]
  searchLoading: boolean
  onAdd: (result: AssetSearchResult) => void
}

export default function WatchlistSearch({
  search, setSearch, searchResults, searchLoading, onAdd,
}: Props) {
  return (
    <div className="glass-card p-4">
      {/* Search input */}
      <div className="relative">
        {searchLoading
          ? <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg animate-spin" />
          : <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg" />
        }
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search any ticker or company name…"
          className="w-full bg-brand-bg/40 border border-brand-border/50 rounded-full pl-10 pr-10 py-2.5 text-sm text-brand-fg placeholder:text-brand-muted-fg/50 focus:ring-1 focus:ring-brand-primary/40 focus:outline-none transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-muted-fg hover:text-brand-fg text-xs transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Results */}
      {searchResults.length > 0 && (
        <div className="mt-3 space-y-1">
          {searchResults.map(result => (
            <button
              key={result.ticker}
              onClick={() => onAdd(result)}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-brand-border/20 transition-colors text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-surface border border-brand-border flex items-center justify-center text-[10px] font-bold font-mono text-brand-fg shrink-0">
                  {result.ticker.slice(0, 4)}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-brand-fg">{result.ticker}</p>
                  </div>
                  <p className="text-xs text-brand-muted-fg">
                    {result.name}
                    {result.universe ? ` · ${result.universe}` : ''}
                    {result.current_price > 0 ? ` · R ${result.current_price.toFixed(2)}` : ''}
                  </p>
                </div>
              </div>
              <Plus className="w-4 h-4 text-brand-muted-fg group-hover:text-brand-fg transition-colors shrink-0" />
            </button>
          ))}
        </div>
      )}

      {search.length > 0 && !searchLoading && searchResults.length === 0 && (
        <p className="text-xs text-brand-muted-fg mt-3 px-1">
          No assets found for "{search}". Try the exact ticker symbol (e.g. AAPL, NVDA).
        </p>
      )}
    </div>
  )
}