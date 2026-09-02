import { useState, useEffect } from "react";
import {
  getSentimentHistory,
  type SentimentHistoryPoint,
} from "../services/api/analysis";
import { SOCIAL_HISTORY_DAYS } from "../data/sentimentMethodology";

// How long to wait before asking again while the backend is walking a ticker's
// history for the first time. The walk is a handful of pages a second apart, so a few
// seconds is usually enough and the retry is cheap: one indexed read.
const SEED_POLL_MS = 6000;
// Give up re-asking after this many attempts. A walk that has not produced anything by
// then has failed, and polling forever would leave a tab quietly hitting the API.
const SEED_POLL_LIMIT = 5;

// Fetches the daily social sentiment series for a ticker. Informational only: it
// reads rows the runs already wrote, so it loads independently of the AI run and
// never waits on StockTwits.
//
// When the backend has never walked this ticker it says so and starts a walk in the
// background, having already answered. This hook then re-asks a few times, which is
// what turns "building history" into a chart without the reader reloading the page.
export function useSentimentHistory(
  ticker: string | undefined,
  days = SOCIAL_HISTORY_DAYS,
) {
  const [points, setPoints] = useState<SentimentHistoryPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load(attempt = 0) {
      if (!ticker) {
        setIsLoading(false);
        return;
      }
      if (attempt === 0) {
        setIsLoading(true);
        setError(null);
      }
      try {
        const res = await getSentimentHistory(ticker, days);
        if (cancelled) return;
        setPoints(res.points ?? []);
        setIsSeeding(Boolean(res.seeding));

        if (res.seeding && attempt < SEED_POLL_LIMIT) {
          timer = setTimeout(() => load(attempt + 1), SEED_POLL_MS);
        } else if (res.seeding) {
          // Out of attempts. Stop claiming to be building something.
          setIsSeeding(false);
        }
      } catch (e) {
        if (cancelled) return;
        console.error("Error fetching sentiment history:", e);
        setError("Unable to load the sentiment trend.");
        setPoints([]);
        setIsSeeding(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ticker, days]);

  // A quiet day carries a null score, so a ticker can return a full window of rows
  // while having almost nothing to plot. Callers show the "building history" state
  // off this count, not off points.length.
  const daysWithData = points.filter((p) => p.score !== null).length;

  return { points, daysWithData, isLoading, isSeeding, error };
}
