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
          aria-label="Search stocks"
          className="h-10 w-full rounded-full border border-forest-900/15 bg-white pl-9 pr-9 text-sm text-forest-900 transition-colors placeholder:text-forest-400 hover:border-forest-900/30 focus:border-forest-700 focus:outline-none"
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
              No stocks found for "{search}". Try the exact ticker symbol (e.g. AAPL, NVDA).
            </p>
          ) : (
            searchResults.map(result => (
              <button
                key={result.ticker}
                type="button"
                aria-label={`Add ${result.ticker} to your watchlist`}
                onClick={() => onAdd(result)}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-forest-50 transition-colors text-left group"
              >
                <div className="min-w-0">
                    <p className="text-sm font-bold text-forest-900">{result.ticker}</p>
                    <p className="truncate text-xs text-brand-muted-fg">
                      {result.name}
                      {result.universe ? ` · ${result.universe}` : ''}
                      {result.current_price > 0 ? ` · R ${result.current_price.toFixed(2)}` : ''}
                    </p>
                </div>
                <Plus className="w-4 h-4 text-brand-muted-fg group-hover:text-forest-900 transition-colors shrink-0" aria-hidden="true" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
