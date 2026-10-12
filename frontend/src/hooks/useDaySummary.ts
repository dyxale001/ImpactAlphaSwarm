import { getDayDrivers, type DaySummaryResponse } from "../services/api/analysis";
import { MINUTE } from "../utils/responseCache";
import { useCachedFetch } from "./useCachedFetch";

// How long today's paragraph is served before it is asked for again in the background.
// The server rewrites it as the intraday ticks bring new articles, so this is short.
const TODAY_FRESH_MS = 2 * MINUTE;

// Fetches the generated paragraph for one day of the trend chart, "What's driving the
// sentiment". Kept generic over the request it makes, since the retired day summary
// was served the same way and any future day paragraph will be too.
//
// Generation is lazy on the server: the first request for a day pays for a short
// completion, every request after that is an indexed read. This hook adds the other
// half of that bargain, which is not asking twice for something that cannot change.
//
// A SETTLED paragraph is kept for the visit, because it is final. Today's is kept too,
// so returning to the Sentiment tab shows it at once, but only for a couple of minutes
// before it is asked for again in the background and swapped for the server's latest.
// An empty answer is not kept at all: it can mean a generation that failed or a day
// whose news has not landed yet, and caching it would pin the panel to it.
function freshFor(res: DaySummaryResponse): number {
  if (!res.summary) return 0;
  return res.is_final ? Infinity : TODAY_FRESH_MS;
}

function useDayParagraph(
  kind: string,
  ticker: string | undefined,
  day: string | null,
  fetchParagraph: (ticker: string, day: string) => Promise<DaySummaryResponse>,
  errorMessage: string,
) {
  const { data, isLoading, error } = useCachedFetch(
    ticker && day ? `day-${kind}:${ticker.toUpperCase()}:${day}` : null,
    () => fetchParagraph(ticker as string, day as string),
    freshFor,
    errorMessage,
  );
  return { summary: data, isLoading, error };
}

export function useDayDrivers(ticker: string | undefined, day: string | null) {
  return useDayParagraph(
    "drivers",
    ticker,
    day,
    getDayDrivers,
    "Unable to load what drove this day's sentiment.",
  );
}
