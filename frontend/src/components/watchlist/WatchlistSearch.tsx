import { Search, Plus, Loader2, X } from 'lucide-react'
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
  const showPanel = searchResults.length > 0 || (search.length > 0 && !searchLoading)

  return (
    <div className="relative w-full">
      {/* Search input — same recipe as the whale page's CompanySearch */}
      <div className="relative">
        {searchLoading
          ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg animate-spin pointer-events-none" />
          : <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg pointer-events-none" />
        }
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search any ticker or company name…"
          aria-label="Search assets"
          className="w-full rounded-full border border-brand-border/60 bg-brand-card pl-9 pr-9 py-2.5 text-sm text-brand-fg placeholder:text-brand-muted-fg focus:outline-none focus:border-brand-primary/50 transition-colors"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted-fg hover:text-brand-fg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results — floating panel like CompanySearch's dropdown */}
      {showPanel && (
        <div className="absolute z-50 mt-2 w-full rounded-2xl border border-brand-border/60 bg-brand-card shadow-lg overflow-hidden">
          {searchResults.length === 0 ? (
            <p className="px-4 py-3 text-sm text-brand-muted-fg italic">
              No assets found for "{search}". Try the exact ticker symbol (e.g. AAPL, NVDA).
            </p>
          ) : (
            searchResults.map(result => (
              <button
                key={result.ticker}
                onClick={() => onAdd(result)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-brand-primary/10 transition-colors text-left group"
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
            ))
          )}
        </div>
      )}
    </div>
  )
}
