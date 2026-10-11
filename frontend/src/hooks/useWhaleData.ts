import { getWhaleActivity, type WhaleTransactionDTO } from "../services/api/analysis";
import { MINUTE } from "../utils/responseCache";
import { useCachedFetch } from "./useCachedFetch";

// The server keeps a ticker's dealings for 48 hours before refetching from Finnhub, so
// half an hour on this side only matters for a page left open for a long time.
const DEALINGS_FRESH_MS = 30 * MINUTE;
// One empty list for every empty answer, so callers memoising on it stay stable.
const NO_TRANSACTIONS: WhaleTransactionDTO[] = [];

// Fetches insider dealings for a ticker. Informational only — this never feeds
// the recommendation, so it loads independently of the AI run. Cached across tab
// switches and widgets (utils/responseCache).
export function useWhaleData(ticker: string | undefined) {
  const { data, isLoading, error } = useCachedFetch(
    ticker ? `insiders:${ticker.toUpperCase()}` : null,
    () => getWhaleActivity(ticker as string),
    () => DEALINGS_FRESH_MS,
    "Unable to load insider dealings.",
  );
  return {
    transactions: data?.transactions ?? NO_TRANSACTIONS,
    source: data?.source ?? null,
    fetchedAt: data?.fetched_at ?? null,
    isLoading,
    error,
  };
}
