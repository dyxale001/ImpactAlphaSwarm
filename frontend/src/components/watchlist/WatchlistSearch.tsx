import { Search, Plus } from "lucide-react";
import { type AssetRecommendation } from "../../data/mockData";

interface Props {
  search: string;
  setSearch: (val: string) => void;
  searchResults: AssetRecommendation[];
  onAdd: (ticker: string) => void;
}

export default function WatchlistSearch({ search, setSearch, searchResults, onAdd }: Props) {
  return (
    <div className="glass-card p-4" style={{ animation: "slide-up 0.3s ease-out forwards" }}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search assets to add..."
          className="w-full bg-brand-secondary/60 border border-brand-border rounded-full pl-10 pr-4 py-2.5 text-sm text-brand-fg focus:ring-2 focus:ring-brand-primary/40 focus:outline-none"
        />
      </div>

      {searchResults.length > 0 && (
        <div className="mt-3 space-y-1">
          {searchResults.map((asset) => (
            <button
              key={asset.ticker}
              onClick={() => {
                onAdd(asset.ticker);
                setSearch("");
              }}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-brand-secondary/80 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-brand-secondary border border-brand-border flex items-center justify-center text-xs font-bold font-mono text-brand-fg">
                  {asset.ticker}
                </div>
                <div>
                  <p className="text-sm font-medium text-brand-fg">{asset.name}</p>
                  <p className="text-xs text-brand-muted-fg">{asset.category}</p>
                </div>
              </div>
              <Plus className="w-4 h-4 text-brand-muted-fg" />
            </button>
          ))}
        </div>
      )}

      {search.length > 0 && searchResults.length === 0 && (
        <p className="text-xs text-brand-muted-fg mt-3 px-1">No matching assets found.</p>
      )}
    </div>
  );
}