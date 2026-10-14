import { getQuantHistory } from "../services/api/analysis";
import type { QuantHorizon } from "../data/quantExplainers";
import { MINUTE } from "../utils/responseCache";
import { useCachedFetch } from "./useCachedFetch";

// The backend caches a window for the day, so this only decides how soon a page left
// open past midnight asks for the new day's closes.
const WINDOW_FRESH_MS = 30 * MINUTE;

// Fetches one ticker's price and RSI window for a horizon.
//
// Informational only, and independent of the AI run: the backend reads public closes,
// not the recommendation. Cached per (ticker, horizon) in the shared response cache
// (utils/responseCache), so switching 1M to 6M and back, or between dashboard widgets on
// the same asset, does not re-ask for a window already read; the backend caches the
// same key for the day, so a miss here is usually a hit there.
//
// Runs only while `active`. The Quant tab is one of three, and a reader who opened the
// page for the ranking should not cost a yfinance fetch for a chart they never saw.
export function useQuantHistory(
  ticker: string | undefined,
  horizon: QuantHorizon,
  active: boolean,
) {
  // An empty window is cached like any other answer: yfinance had nothing for this
  // ticker over this horizon, and asking again on the next click will not change that.
  // A window the feature is off for is cached for the same reason.
  const { data, isLoading, error } = useCachedFetch(
    ticker && active ? `quant-history:${ticker.toUpperCase()}:${horizon}` : null,
    () => getQuantHistory(ticker as string, horizon),
    () => WINDOW_FRESH_MS,
    "Unable to load the price history.",
  );

  return {
    points: data?.points ?? [],
    facts: data?.facts ?? null,
    currency: data?.currency ?? "",
    displayCurrency: data?.display_currency || data?.currency || "",
    fxRate: data?.fx_rate ?? null,
    converted: data?.converted ?? false,
    exchangeName: data?.exchange_name ?? "",
    // Unknown until the first answer arrives; treated as available so the chart shows
    // its loading state rather than flashing "not enabled" before it knows.
    available: data ? data.available : true,
    isLoading,
    error,
  };
}
