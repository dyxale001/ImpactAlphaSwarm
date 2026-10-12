import { getInstitutionalHolders } from "../services/api/analysis";
import { MINUTE } from "../utils/responseCache";
import { useCachedFetch } from "./useCachedFetch";

// 13F data changes once a quarter and the server keeps it for a week, so half an hour
// on this side only matters for a page left open for a long time.
const OWNERSHIP_FRESH_MS = 30 * MINUTE;

// Fetches institutional (13F) ownership for a ticker. Informational only —
// independent of the AI run, like the insider-dealings panel. Cached across tab
// switches and widgets (utils/responseCache).
export function useInstitutionalData(ticker: string | undefined) {
  return useCachedFetch(
    ticker ? `institutions:${ticker.toUpperCase()}` : null,
    () => getInstitutionalHolders(ticker as string),
    () => OWNERSHIP_FRESH_MS,
    "Unable to load institutional ownership.",
  );
}
