import { useState, useEffect } from "react";
import { getSentimentLastUpdated } from "../services/api/analysis";

// When sentiment was last written, across every ticker.
//
// Fetched once per page visit rather than kept live: unlike the market clock, this
// value only moves when a scheduled job runs, so polling it on a timer would be a
// request that almost always comes back unchanged. A reader reopening the page gets a
// fresh read, which is the cadence that matches how the value actually changes.
export function useSentimentLastUpdated() {
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSentimentLastUpdated()
      .then((res) => {
        if (!cancelled) setUpdatedAt(res.updated_at);
      })
      .catch((e) => {
        console.error("Error fetching sentiment last-updated:", e);
        if (!cancelled) setUpdatedAt(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { updatedAt, isLoading };
}
