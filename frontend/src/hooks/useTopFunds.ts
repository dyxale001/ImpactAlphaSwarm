import { getTopFunds, type FundHolding } from "../services/api/analysis";
import { MINUTE } from "../utils/responseCache";
import { useCachedFetch } from "./useCachedFetch";

// The server rebuilds the aggregation weekly from the institutional cache the nightly
// job warms, so half an hour on this side only matters for a page left open for long.
const FUNDS_FRESH_MS = 30 * MINUTE;
// One empty list for every empty answer, so callers memoising on it stay stable.
const NO_FUNDS: FundHolding[] = [];

// Loads the per-fund holdings aggregation (institutional data inverted across all
// tracked assets), shared by the Top Funds and Notable Investors tabs. Cached across
// tab switches and widgets (utils/responseCache).
export function useTopFunds() {
  const { data, isLoading, error } = useCachedFetch(
    "top-funds",
    getTopFunds,
    () => FUNDS_FRESH_MS,
    "Unable to load fund holdings right now.",
  );
  return { funds: data?.funds ?? NO_FUNDS, isLoading, error };
}
