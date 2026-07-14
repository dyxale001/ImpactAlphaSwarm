import { useState, useEffect } from "react";
import {
  getWhaleActivity,
  type WhaleTransactionDTO,
} from "../services/api/analysis";

// Fetches insider dealings for a ticker. Informational only — this never feeds
// the recommendation, so it loads independently of the AI run.
export function useWhaleData(ticker: string | undefined) {
  const [transactions, setTransactions] = useState<WhaleTransactionDTO[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
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
        const res = await getWhaleActivity(ticker);
        if (cancelled) return;
        setTransactions(res.transactions ?? []);
        setSource(res.source);
        setFetchedAt(res.fetched_at ?? null);
      } catch (e) {
        if (cancelled) return;
        console.error("Error fetching whale activity:", e);
        setError("Unable to load insider dealings.");
        setTransactions([]);
        setSource(null);
        setFetchedAt(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return { transactions, source, fetchedAt, isLoading, error };
}
