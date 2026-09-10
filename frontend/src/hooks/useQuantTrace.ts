import { useEffect, useRef, useState } from "react";
import { getQuantTrace, type QuantTraceResponse } from "../services/api/analysis";
import type { QuantHorizon } from "../data/quantExplainers";

// Fetches the written paragraph over one ticker's window.
//
// Generation is lazy on the server: the first request for a (ticker, day, horizon) pays
// for a short completion, every request after that is an indexed read. This hook adds
// the other half of that bargain, which is not asking twice. Switching 1M to 6M and back
// is the ordinary way to read this tab, and without a cache here the third switch would
// re-request the paragraph the first already has.
//
// Cached in a ref rather than state on purpose. Writing to it must not schedule a
// render, since the render it would schedule is the one that just read from it.
//
// Runs only while `active`, for the same reason the window does: a reader who opened the
// page for the ranking should not cost a completion for a paragraph they never saw.
export function useQuantTrace(
  ticker: string | undefined,
  horizon: QuantHorizon,
  active: boolean,
) {
  const [trace, setTrace] = useState<QuantTraceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<string, QuantTraceResponse>());

  useEffect(() => {
    if (!ticker || !active) return;

    const key = `${ticker}:${horizon}`;
    const hit = cache.current.get(key);
    if (hit) {
      // Synchronously, with no loading state. A paragraph already read must not flash a
      // skeleton on the way back to text it already has.
      setTrace(hit);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getQuantTrace(ticker, horizon)
      .then((res) => {
        if (cancelled) return;
        // A null paragraph is cached like any other answer. It means the window has
        // nothing to say or the feature is off, which will still be true on the next
        // switch, and re-asking would put a generation attempt behind every visit.
        cache.current.set(key, res);
        setTrace(res);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Error fetching quant trace:", e);
        setError("Unable to load the written summary.");
        setTrace(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, horizon, active]);

  return { trace, isLoading, error };
}
