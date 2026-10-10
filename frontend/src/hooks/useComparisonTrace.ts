import { useCallback, useEffect, useRef, useState } from "react";
import {
  explainComparison,
  getSavedComparison,
  type ComparisonTraceResponse,
} from "../services/api/compare";
import type { QuantHorizon } from "../data/quantExplainers";

// The written comparison over the picked stocks: personal, and written on request.
//
// On settling, the page asks whether the reader already has a current paragraph for
// this set and window (free, never a model call). If not, the panel offers the
// button, and `explain` writes one.
//
// Asked only once a comparison has actually been made: two or more stocks, and the
// selection has stopped changing for a moment. Cached here by the sorted set, the
// same key the server uses, so reordering the columns or switching window and back
// never asks again for what the page already has.

const SETTLE_MS = 600;

export function useComparisonTrace(tickers: string[], horizon: QuantHorizon) {
  const [trace, setTrace] = useState<ComparisonTraceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<string, ComparisonTraceResponse>());

  const ordered = tickers.join(",");
  const key = `${[...tickers].sort().join("|")}:${horizon}`;
  const ready = tickers.length >= 2;
  // The key the latest answer belongs to, so a slow reply for an old selection
  // never lands on a new one.
  const current = useRef(key);

  useEffect(() => {
    current.current = key;
    setError(null);
    setIsWriting(false);
    if (!ready) {
      setTrace(null);
      setIsLoading(false);
      return;
    }
    const hit = cache.current.get(key);
    if (hit) {
      setTrace(hit);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setTrace(null);
    setIsLoading(true);
    const timer = setTimeout(() => {
      getSavedComparison(ordered.split(","), horizon)
        .then((res) => {
          if (cancelled) return;
          cache.current.set(key, res);
          setTrace(res);
        })
        .catch((e) => {
          if (cancelled) return;
          // Quiet: with no stored paragraph to show, the button is still the way in.
          console.error("Error reading the saved comparison:", e);
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

  const explain = useCallback(() => {
    if (!ready) return;
    const asked = key;
    setIsWriting(true);
    setError(null);
    explainComparison(ordered.split(","), horizon)
      .then((res) => {
        cache.current.set(asked, res);
        if (current.current !== asked) return;
        setTrace(res);
        if (res.available && !res.trace) {
          setError("A comparison could not be written for these just now. The rows below still explain each difference.");
        }
      })
      .catch((e) => {
        if (current.current !== asked) return;
        console.error("Error writing the comparison:", e);
        setError("Unable to write the comparison. Try again in a moment.");
      })
      .finally(() => {
        if (current.current === asked) setIsWriting(false);
      });
  }, [key, ordered, horizon, ready]);

  return { trace, isLoading, isWriting, error, explain };
}
