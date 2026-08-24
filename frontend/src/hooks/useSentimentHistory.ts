import { useState, useEffect } from "react";
import {
  getSentimentHistory,
  type SentimentHistoryPoint,
} from "../services/api/analysis";

// Fetches the daily social sentiment series for a ticker. Informational only —
// it reads rollups the nightly run already wrote, so it loads independently of
// the AI run and never waits on StockTwits.
export function useSentimentHistory(ticker: string | undefined, days = 14) {
  const [points, setPoints] = useState<SentimentHistoryPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!ticker) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const res = await getSentimentHistory(ticker, days);
        if (cancelled) return;
        setPoints(res.points ?? []);
      } catch (e) {
        if (cancelled) return;
        console.error("Error fetching sentiment history:", e);
        setError("Unable to load the sentiment trend.");
        setPoints([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [ticker, days]);

  // Days with no chatter carry a null score, so a ticker can return a full
  // fortnight of rows while still having almost nothing to plot. Callers show
  // the "building history" state off this count, not off points.length.
  const daysWithData = points.filter((p) => p.score !== null).length;

  return { points, daysWithData, isLoading, error };
}
