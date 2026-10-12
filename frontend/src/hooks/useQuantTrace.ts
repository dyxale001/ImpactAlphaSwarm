import { getQuantTrace } from "../services/api/analysis";
import type { QuantHorizon } from "../data/quantExplainers";
import { MINUTE } from "../utils/responseCache";
import { useCachedFetch } from "./useCachedFetch";

// The server writes one paragraph per (ticker, day, horizon). The key here has no day
// in it, so this is what carries a page left open past midnight onto the new day's
// paragraph: once it lapses the next visit to the tab asks again in the background.
const TRACE_FRESH_MS = 30 * MINUTE;

// Fetches the written paragraph over one ticker's window.
//
// Generation is lazy on the server: the first request for a (ticker, day, horizon) pays
// for a short completion, every request after that is an indexed read. This hook adds
// the other half of that bargain, which is not asking twice. Switching 1M to 6M and back,
// or leaving the Quant tab and coming back, is the ordinary way to read it, and the
// panel unmounts with the tab, so the cache is the shared one (utils/responseCache)
// rather than the panel's own.
//
// A null paragraph is cached like any other answer. It means the window has nothing to
// say or the feature is off, which will still be true on the next switch, and re-asking
// would put a generation attempt behind every visit.
//
// Runs only while `active`, for the same reason the window does: a reader who opened the
// page for the ranking should not cost a completion for a paragraph they never saw.
export function useQuantTrace(
  ticker: string | undefined,
  horizon: QuantHorizon,
  active: boolean,
) {
  const { data, isLoading, error } = useCachedFetch(
    ticker && active ? `quant-trace:${ticker.toUpperCase()}:${horizon}` : null,
    () => getQuantTrace(ticker as string, horizon),
    () => TRACE_FRESH_MS,
    "Unable to load the written summary.",
  );
  return { trace: data, isLoading, error };
}
