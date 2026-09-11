import { createContext, useContext, type ReactNode } from "react";
import { useLearningSummary } from "../hooks/useLearningSummary";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { useWatchlistData } from "../hooks/useWatchlistData";

// Two feeds that several widgets each want a slice of: the latest run's ranked
// assets, and the user's watchlist.
//
// Both are read once here rather than per widget. Every hook in this app fetches
// on mount with no shared cache, so a dashboard carrying the top pick, the
// ranked feed and the also-scored list would otherwise run the same three-query
// sequence three times over, and the watchlist widgets another two on top. The
// widgets stay self-contained in every other respect; this is only about not
// asking the same question four times.
//
// Ticker-scoped feeds (sentiment, insiders, ownership) are deliberately NOT here.
// They are keyed by the pinned ticker, only a couple are ever mounted at once,
// and hoisting them would mean fetching whale data for a dashboard showing none.

type SignalsValue = ReturnType<typeof useDashboardStats>;
type WatchlistValue = ReturnType<typeof useWatchlistData>;

const SignalsContext = createContext<SignalsValue | null>(null);
const WatchlistContext = createContext<WatchlistValue | null>(null);

const LearningContext = createContext<ReturnType<typeof useLearningSummary> | null>(null);

export function DashboardDataProvider({ children, learningEnabled, learningProgressEnabled }: { children: ReactNode; learningEnabled: boolean; learningProgressEnabled: boolean }) {
  const learning = useLearningSummary(learningEnabled, learningProgressEnabled);
  // The whole ranked feed, not the top five: the also-scored widget shows
  // everything below the shortlist, and a run only scores about thirty tickers.
  const signals = useDashboardStats({ limit: null });
  const watchlist = useWatchlistData();

  return (
    <SignalsContext.Provider value={signals}>
      <WatchlistContext.Provider value={watchlist}>
        <LearningContext.Provider value={learning}>{children}</LearningContext.Provider>
      </WatchlistContext.Provider>
    </SignalsContext.Provider>
  );
}

function useRequired<T>(value: T | null, name: string): T {
  if (value === null) {
    throw new Error(`${name} must be used inside <DashboardDataProvider>`);
  }
  return value;
}

export function useSignals(): SignalsValue {
  return useRequired(useContext(SignalsContext), "useSignals");
}

export function useWatchlist(): WatchlistValue {
  return useRequired(useContext(WatchlistContext), "useWatchlist");
}

export function useDashboardLearning() {
  return useRequired(useContext(LearningContext), "useDashboardLearning");
}
