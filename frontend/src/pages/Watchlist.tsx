import { Eye } from "lucide-react";
import { useWatchlistData } from "../hooks/useWatchlistData";
import WatchlistSearch from "../components/watchlist/WatchlistSearch";
import WatchedAssetCard from "../components/watchlist/WatchedAssetCard";

export default function WatchlistPage() {
  const { search, setSearch, searchResults, watchedAssets, addToWatchlist, removeFromWatchlist } = useWatchlistData();

  return (
    <div className="space-y-8 max-w-7xl mx-auto pt-10 px-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-brand-fg">Watchlist</h1>
        <p className="text-brand-muted-fg text-sm mt-1">Track assets you're interested in.</p>
      </div>

      <WatchlistSearch 
        search={search} 
        setSearch={setSearch} 
        searchResults={searchResults} 
        onAdd={addToWatchlist} 
      />

      {watchedAssets.length === 0 ? (
        <div className="glass-card p-8 text-center" style={{ animation: "slide-up 0.4s ease-out forwards" }}>
          <Eye className="w-8 h-8 text-brand-muted-fg mx-auto mb-3" />
          <p className="text-sm text-brand-muted-fg">Your watchlist is empty. Search for assets above to add them.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ animation: "slide-up 0.4s ease-out forwards" }}>
          {watchedAssets.map((asset) => (
            <WatchedAssetCard 
              key={asset.ticker} 
              asset={asset} 
              onRemove={removeFromWatchlist} 
            />
          ))}
        </div>
      )}
    </div>
  );
}