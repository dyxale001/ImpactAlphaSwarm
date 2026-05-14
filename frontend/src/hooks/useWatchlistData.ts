import { useState, useMemo } from "react";
import { WATCHLIST_ASSETS } from "../data/mockData";

export function useWatchlistData() {
  const [watchlist, setWatchlist] = useState<string[]>(["NVDA", "AAPL"]);
  const [search, setSearch] = useState("");

  const addToWatchlist = (ticker: string) => {
    if (!watchlist.includes(ticker)) {
      setWatchlist((prev) => [...prev, ticker]);
    }
  };

  const removeFromWatchlist = (ticker: string) => {
    setWatchlist((prev) => prev.filter((t) => t !== ticker));
  };

  const watchedAssets = useMemo(() => {
    return WATCHLIST_ASSETS.filter((a) => watchlist.includes(a.ticker));
  }, [watchlist]);

  const searchResults = useMemo(() => {
    if (search.length === 0) return [];
    
    return WATCHLIST_ASSETS.filter(
      (a) =>
        !watchlist.includes(a.ticker) &&
        (a.ticker.toLowerCase().includes(search.toLowerCase()) ||
         a.name.toLowerCase().includes(search.toLowerCase()))
    );
  }, [search, watchlist]);

  return {
    watchlist,
    search,
    setSearch,
    watchedAssets,
    searchResults,
    addToWatchlist,
    removeFromWatchlist
  };
}