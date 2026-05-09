import { useState } from "react";
import { Link } from "react-router-dom";
import { MOCK_RECOMMENDATIONS } from "@/data/mockData";
import type { AssetRecommendation } from "@/data/mockData";
import { Plus, X, Search, Eye, TrendingUp, TrendingDown } from "lucide-react";

const ALL_ASSETS: AssetRecommendation[] = [
  ...MOCK_RECOMMENDATIONS,
  {
    ticker: "MSFT",
    name: "Microsoft Corp",
    confidenceScore: 79,
    sentimentScore: 65,
    fundamentalsScore: 88,
    reasoning: "Strong cloud growth with Azure. Fundamentals outpace sentiment.",
    hypeAlert: false,
    allocation: 0,
    price: 415.60,
    change: 1.1,
    category: "Tech Stocks",
  },
  {
    ticker: "TSLA",
    name: "Tesla Inc",
    confidenceScore: 55,
    sentimentScore: 82,
    fundamentalsScore: 40,
    reasoning: "High social buzz but valuation stretched relative to earnings.",
    hypeAlert: true,
    allocation: 0,
    price: 245.20,
    change: -2.3,
    category: "Tech Stocks",
  },
  {
    ticker: "FSLR",
    name: "First Solar Inc",
    confidenceScore: 64,
    sentimentScore: 48,
    fundamentalsScore: 72,
    reasoning: "Solid fundamentals in solar manufacturing. Low social attention.",
    hypeAlert: false,
    allocation: 0,
    price: 178.90,
    change: 0.6,
    category: "Green Energy",
  },
];

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<string[]>(["NVDA", "AAPL", "ENPH"]);
  const [search, setSearch] = useState("");

  const addToWatchlist = (ticker: string) => {
    if (!watchlist.includes(ticker)) {
      setWatchlist((prev) => [...prev, ticker]);
    }
  };

  const removeFromWatchlist = (ticker: string) => {
    setWatchlist((prev) => prev.filter((t) => t !== ticker));
  };

  const watchedAssets = ALL_ASSETS.filter((a) => watchlist.includes(a.ticker));
  const searchResults = search.length > 0
    ? ALL_ASSETS.filter(
        (a) =>
          !watchlist.includes(a.ticker) &&
          (a.ticker.toLowerCase().includes(search.toLowerCase()) ||
            a.name.toLowerCase().includes(search.toLowerCase()))
      )
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Watchlist</h1>
        <p className="text-muted-foreground text-sm mt-1">Track assets you're interested in.</p>
      </div>

      {/* Search to add */}
      <div className="glass-card p-4" style={{ animation: "slide-up 0.3s ease-out forwards" }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets to add..."
            className="w-full bg-secondary/60 border border-border rounded-full pl-10 pr-4 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-ring/50 focus:outline-none"
          />
        </div>

        {searchResults.length > 0 && (
          <div className="mt-3 space-y-1">
            {searchResults.map((asset) => (
              <button
                key={asset.ticker}
                onClick={() => {
                  addToWatchlist(asset.ticker);
                  setSearch("");
                }}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-secondary/80 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-secondary border border-border flex items-center justify-center text-xs font-bold font-mono">
                    {asset.ticker}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{asset.name}</p>
                    <p className="text-xs text-muted-foreground">{asset.category}</p>
                  </div>
                </div>
                <Plus className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {search.length > 0 && searchResults.length === 0 && (
          <p className="text-xs text-muted-foreground mt-3 px-1">No matching assets found.</p>
        )}
      </div>

      {/* Watchlist */}
      {watchedAssets.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Eye className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Your watchlist is empty. Search for assets above to add them.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ animation: "slide-up 0.4s ease-out forwards" }}>
          {watchedAssets.map((asset) => (
            <div key={asset.ticker} className="soft-card p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-background/70 border border-border/60 flex items-center justify-center text-[11px] font-bold font-mono shrink-0">
                {asset.ticker.slice(0, 3)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link to={`/asset/${asset.ticker}`} className="text-sm font-semibold hover:underline truncate">
                    {asset.name}
                  </Link>
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-xs font-mono font-semibold">${asset.price.toFixed(2)}</span>
                  <span className={`chip ${asset.change >= 0 ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"}`}>
                    {asset.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {asset.change >= 0 ? "+" : ""}{asset.change}%
                  </span>
                  <span className={`chip ${
                    asset.confidenceScore >= 70 ? "bg-primary/15 text-primary" :
                    asset.confidenceScore >= 50 ? "bg-warning/15 text-warning" :
                    "bg-muted-foreground/20 text-muted-foreground"
                  }`}>
                    Score {asset.confidenceScore}
                  </span>
                </div>
              </div>
              <button
                onClick={() => removeFromWatchlist(asset.ticker)}
                className="p-2 rounded-full hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Remove from watchlist"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
