import { useEffect, useRef, useState } from "react";
import {
  getComparisonTrace,
  type ComparisonTraceResponse,
} from "../services/api/compare";
import type { QuantHorizon } from "../data/quantExplainers";

// The written comparison over the picked stocks.
//
// Asked for only once a comparison has actually been made: two or more stocks, and
// the selection has stopped changing for a moment. Someone adding a third stock
// should not pay for a paragraph about the first two on the way.
//
// Cached here by the sorted set, the same key the server uses, so reordering the
// columns or switching horizon and back never re-asks for a paragraph the page has.

const SETTLE_MS = 800;

export function useComparisonTrace(tickers: string[], horizon: QuantHorizon) {
  const [trace, setTrace] = useState<ComparisonTraceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<string, ComparisonTraceResponse>());

  const ordered = tickers.join(",");
  const key = `${[...tickers].sort().join("|")}:${horizon}`;
  const ready = tickers.length >= 2;

  useEffect(() => {
    if (!ready) {
      setTrace(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    const hit = cache.current.get(key);
    if (hit) {
      setTrace(hit);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      getComparisonTrace(ordered.split(","), horizon)
        .then((res) => {
          if (cancelled) return;
          cache.current.set(key, res);
          setTrace(res);
        })
        .catch((e) => {
          if (cancelled) return;
          console.error("Error fetching the comparison:", e);
          setError("Unable to load the written comparison.");
          setTrace(null);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, SETTLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, ordered, horizon, ready]);

  return { trace, isLoading, error };
}
