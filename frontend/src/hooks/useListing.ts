import { getListing } from "../services/api/analysis";
import { MINUTE } from "../utils/responseCache";
import { useCachedFetch } from "./useCachedFetch";

// A listing does not move between visits; the backend holds it for a day, so this only
// saves the round trip when the reader comes back to the same asset.
const LISTING_FRESH_MS = 60 * MINUTE;

// The exchange a ticker trades on ("Nasdaq", "NYSE"), or "" while loading or when the
// lookup found nothing. The header leaves the exchange out for "", rather than guessing.
//
// `stored` is assets.exchange (migration 032). When the row has one it is the answer
// and nothing is fetched. The live lookup is only the fallback for a row the nightly
// fill has not reached yet, such as a name discovery added since.
export function useListing(
  ticker: string | undefined,
  stored: string | null | undefined,
) {
  const { data } = useCachedFetch(
    ticker && !stored ? `listing:${ticker.toUpperCase()}` : null,
    () => getListing(ticker as string),
    // A blank answer is stale at once, so the next visit asks again: the backend does
    // not hold a failed lookup either, and Yahoo being down for a minute should not hide
    // the exchange for an hour.
    (value) => (value.exchange_name ? LISTING_FRESH_MS : 0),
    "Unable to load the listing.",
  );
  return stored || (data?.exchange_name ?? "");
}
