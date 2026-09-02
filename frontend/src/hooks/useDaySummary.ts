import { useState, useEffect, useRef } from "react";
import { getDaySummary, type DaySummaryResponse } from "../services/api/analysis";

// Fetches the written summary for one day of the trend chart.
//
// Generation is lazy on the server: the first request for a day pays for a short
// completion, every request after that is an indexed read. This hook adds the other
// half of that bargain, which is not asking twice. Clicking along a week and back is
// the ordinary way to read this chart, and without a cache here the seventh click
// would re-request the day the first click already has.
//
// Cached in a ref rather than state on purpose. Writing to it must not schedule a
// render, since the render it would schedule is the one that just read from it.
export function useDaySummary(ticker: string | undefined, day: string | null) {
  const [summary, setSummary] = useState<DaySummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<string, DaySummaryResponse>());

  useEffect(() => {
    if (!ticker || !day) {
      setSummary(null);
      setIsLoading(false);
      return;
    }

    const key = `${ticker}:${day}`;
    const hit = cache.current.get(key);
    if (hit) {
      // Synchronously, with no loading state. A day already read must not flash a
      // skeleton on the way back to text it already has.
      setSummary(hit);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getDaySummary(ticker, day)
      .then((res) => {
        if (cancelled) return;
        // A null summary is cached like any other answer. It means the day has nothing
        // to say, which will still be true on the next click, and re-asking would put
        // a generation attempt behind every visit to a quiet day.
        cache.current.set(key, res);
        setSummary(res);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Error fetching day summary:", e);
        setError("Unable to load this day's summary.");
        setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, day]);

  return { summary, isLoading, error };
}
