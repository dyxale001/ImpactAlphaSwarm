import { useState, useEffect } from "react";
import {
  getSentimentHistory,
  type SentimentHistoryResponse,
} from "../services/api/analysis";
import { SOCIAL_HISTORY_DAYS } from "../data/sentimentMethodology";
import { MINUTE, responseCache } from "../utils/responseCache";

// How long to wait before asking again while the backend is walking a ticker's
// history for the first time. The walk is a handful of pages a second apart, so a few
// seconds is usually enough and the retry is cheap: one indexed read.
const SEED_POLL_MS = 6000;
// Give up re-asking after this many attempts. A walk that has not produced anything by
// then has failed, and polling forever would leave a tab quietly hitting the API.
const SEED_POLL_LIMIT = 5;
// Today's point moves as the intraday ticks write to it, so a stored series is asked
// for again in the background once it is this old.
const HISTORY_FRESH_MS = 5 * MINUTE;

// A series still being built is never stored: the next visit should see the finished
// one, not a cached "building history".
function freshFor(res: SentimentHistoryResponse): number {
  return res.seeding ? 0 : HISTORY_FRESH_MS;
}

// One empty list for every empty answer, so callers memoising on `points` do not
// recompute on each render while there is nothing to plot.
const NO_POINTS: SentimentHistoryResponse["points"] = [];

type Answer = {
  key: string;
  res: SentimentHistoryResponse | null;
  seeding: boolean;
  error: string | null;
};

// Fetches the daily social sentiment series for a ticker. Informational only: it
// reads rows the runs already wrote, so it loads independently of the AI run and
// never waits on StockTwits.
//
// Served from the shared response cache (utils/responseCache), so the asset page, its
// news and social pages and the dashboard's sentiment widgets share one request per
// ticker, and a series already read shows at once, refreshed in the background.
//
// When the backend has never walked this ticker it says so and starts a walk in the
// background, having already answered. This hook then re-asks a few times, which is
// what turns "building history" into a chart without the reader reloading the page.
export function useSentimentHistory(
  ticker: string | undefined,
  days = SOCIAL_HISTORY_DAYS,
) {
  const key = ticker ? `sentiment-history:${ticker.toUpperCase()}:${days}` : null;
  const stored = key ? responseCache.get<SentimentHistoryResponse>(key) : undefined;
  // Tagged with its key, like useCachedFetch, so a new ticker never shows the last one.
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (!key || !ticker) return;
    const hit = responseCache.get<SentimentHistoryResponse>(key);
    if (hit?.fresh) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function load(attempt: number) {
      responseCache
        .load(key as string, () => getSentimentHistory(ticker as string, days), freshFor)
        .then((res) => {
          if (cancelled) return;
          // Out of attempts means stop claiming to be building something.
          const seeding = Boolean(res.seeding) && attempt < SEED_POLL_LIMIT;
          setAnswer({ key: key as string, res, seeding, error: null });
          if (seeding) timer = setTimeout(() => load(attempt + 1), SEED_POLL_MS);
        })
        .catch((e) => {
          if (cancelled) return;
          console.error("Error fetching sentiment history:", e);
          if (!hit) {
            setAnswer({
              key: key as string,
              res: null,
              seeding: false,
              error: "Unable to load the sentiment trend.",
            });
          }
        });
    }

    load(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, ticker, days]);

  let points = NO_POINTS;
  let isLoading = false;
  let isSeeding = false;
  let error: string | null = null;
  if (stored) {
    points = stored.value.points ?? NO_POINTS;
  } else if (answer?.key === key) {
    points = answer.res?.points ?? NO_POINTS;
    isSeeding = answer.seeding;
    error = answer.error;
  } else if (key) {
    isLoading = true;
  }

  // A quiet day carries a null score, so a ticker can return a full window of rows
  // while having almost nothing to plot. Callers show the "building history" state
  // off this count, not off points.length.
  const daysWithData = points.filter((p) => p.score !== null).length;

  return { points, daysWithData, isLoading, isSeeding, error };
}
