import { useEffect, useRef, useState } from "react";
import {
  getQuantHistory,
  type QuantHistoryResponse,
} from "../services/api/analysis";
import type { QuantHorizon } from "../data/quantExplainers";

// Fetches one ticker's price and RSI window for a horizon.
//
// Informational only, and independent of the AI run: the backend reads public closes,
// not the recommendation. Cached here per (ticker, horizon) for the life of the page,
// so switching 1M to 6M and back does not re-ask for a window the tab already has; the
// backend caches the same key for the day, so a miss here is usually a hit there.
//
// Runs only while `active`. The Quant tab is one of three, and a reader who opened the
// page for the ranking should not cost a yfinance fetch for a chart they never saw.
export function useQuantHistory(
  ticker: string | undefined,
  horizon: QuantHorizon,
  active: boolean,
) {
  const [data, setData] = useState<QuantHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<string, QuantHistoryResponse>());

  useEffect(() => {
    if (!ticker || !active) return;

    const key = `${ticker}:${horizon}`;
    const hit = cache.current.get(key);
    if (hit) {
      setData(hit);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getQuantHistory(ticker, horizon)
      .then((res) => {
        if (cancelled) return;
        // An empty window is cached like any other answer: yfinance had nothing for
        // this ticker over this horizon, and asking again on the next click will not
        // change that. A window the feature is off for is cached for the same reason.
        cache.current.set(key, res);
        setData(res);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Error fetching quant history:", e);
        setError("Unable to load the price history.");
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, horizon, active]);

  return {
    points: data?.points ?? [],
    facts: data?.facts ?? null,
    currency: data?.currency ?? "",
    exchangeName: data?.exchange_name ?? "",
    // Unknown until the first answer arrives; treated as available so the chart shows
    // its loading state rather than flashing "not enabled" before it knows.
    available: data ? data.available : true,
    isLoading,
    error,
  };
}
